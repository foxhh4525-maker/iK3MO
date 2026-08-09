import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { requireAdmin, requireFullAdmin } from "./tournament";

const router = Router();

// نحمّل دوال قاعدة البيانات وقت التشغيل (نفس أسلوب tournament.ts) عشان نتفادى
// مشاكل ترتيب البناء (build order) بين حزم الـ workspace.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbModule: any = require("@workspace/db");
const {
  getModerators: dbGetModerators,
  addModerator: dbAddModerator,
  deleteModerator: dbDeleteModerator,
  recordModeratorCheckIn: dbRecordCheckIn,
  resetModeratorAttendance: dbResetAttendance,
} = dbModule;

// ==========================================
// 📡 اتصالات SSE مخصّصة لهذا المسار (منفصلة تماماً عن بث حالة البطولة)
// ==========================================
const clients = new Set<Response>();

async function broadcastModerators() {
  try {
    const list = await dbGetModerators();
    const msg = `data: ${JSON.stringify(list)}\n\n`;
    for (const client of clients) {
      try {
        client.write(msg);
      } catch {
        clients.delete(client);
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to broadcast moderators list");
  }
}

router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  clients.add(res);
  logger.info({ clientCount: clients.size }, "Moderators SSE client connected");

  dbGetModerators()
    .then((list: any) => res.write(`data: ${JSON.stringify(list)}\n\n`))
    .catch(() => {});

  const keepAlive = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
    logger.info({ clientCount: clients.size }, "Moderators SSE client disconnected");
  });
});

// ==========================================
// 📋 قائمة المشرفين (تُقرأ من صفحة "جدول المشرفين" بالأدمن)
// ==========================================
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const list = await dbGetModerators();
    res.json(list);
  } catch (err) {
    logger.error({ err }, "Failed to get moderators");
    res.status(500).json({ error: "فشل جلب قائمة المشرفين" });
  }
});

// ➕ إضافة مشرف جديد للجدول (اسم مستخدم كيك + اسم عرض اختياري)
router.post("/", requireAdmin, requireFullAdmin, async (req: Request, res: Response) => {
  try {
    const { username, displayName } = req.body as { username?: string; displayName?: string };
    if (!username || !username.trim()) {
      res.status(400).json({ error: "اسم المستخدم مطلوب" });
      return;
    }
    const mod = await dbAddModerator(username.trim(), (displayName || username).trim());
    await broadcastModerators();
    res.json(mod);
  } catch (err) {
    logger.error({ err }, "Failed to add moderator");
    res.status(500).json({ error: "فشل إضافة المشرف" });
  }
});

// 🗑️ حذف مشرف نهائياً من الجدول
router.delete("/:id", requireAdmin, requireFullAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "id غير صالح" });
      return;
    }
    const removed = await dbDeleteModerator(id);
    await broadcastModerators();
    res.json(removed || { ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete moderator");
    res.status(500).json({ error: "فشل حذف المشرف" });
  }
});

// 🔄 بدء بث جديد: يفرّغ الخانات الثلاث لكل المشرفين (بدون حذفهم)
router.post("/reset", requireAdmin, requireFullAdmin, async (_req: Request, res: Response) => {
  try {
    const list = await dbResetAttendance();
    await broadcastModerators();
    res.json(list);
  } catch (err) {
    logger.error({ err }, "Failed to reset moderator attendance");
    res.status(500).json({ error: "فشل تصفير الحضور" });
  }
});

// ==========================================
// 💬 نقطة دخول تسجيل الحضور من الشات (Chat Listener)
// ==========================================
// هذا المسار ما يحتاج توكن أدمن — يُستدعى تلقائياً من "المستمع" اللي يراقب
// شات البث (حالياً: مستمع كيك عبر Pusher بواجهة الأدمن، أو أي جسر خارجي آخر
// تربطه لاحقاً مثل بوت TikTok/Kick على السيرفر). بدل ما نثق بأي طلب خارجي،
// نتحقق أولاً إن الاسم المُرسَل موجود فعلاً فـ جدول المشرفين اللي أضافه
// الأدمن يدوياً — فهذا هو "التحقق من رتبة المشرف" الحقيقي هنا: لو الاسم مو
// من ضمن القائمة، الطلب يُتجاهل بصمت (204) ولا يسجَّل أي شيء.
router.post("/chat-event", async (req: Request, res: Response) => {
  try {
    const { username, message, secret } = req.body as { username?: string; message?: string; secret?: string };

    // 🔒 حماية بسيطة اختيارية: لو الأدمن حدد MODERATOR_CHAT_SECRET فـ متغيرات
    // البيئة، أي مستمع خارجي (سيرفري) لازم يرسله عشان نقبل الطلب. مفيد لو
    // المستمع شغّال بسيرفر منفصل بدل متصفح الأدمن (اللي أصلاً محمي بتوكنه).
    const requiredSecret = process.env.MODERATOR_CHAT_SECRET;
    if (requiredSecret && secret !== requiredSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!username || !message) {
      res.status(400).json({ error: "username و message مطلوبين" });
      return;
    }

    // كلمات الحضور المقبولة (تقدر تزيد كلمات أخرى هنا بسهولة)
    const isAttendanceWord = /^(حاضر|متواجد|present|here)$/i.test(message.trim());
    if (!isAttendanceWord) {
      res.status(204).end();
      return;
    }

    const updated = await dbRecordCheckIn(username);
    if (!updated) {
      // الاسم كتب الكلمة بس مو مسجّل بجدول المشرفين — نتجاهل بهدوء
      res.status(204).end();
      return;
    }
    await broadcastModerators();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to process moderator chat event");
    res.status(500).json({ error: "فشل معالجة رسالة الشات" });
  }
});

export default router;