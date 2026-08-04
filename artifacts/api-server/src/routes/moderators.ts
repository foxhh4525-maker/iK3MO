import { Router } from "express";
import { getModeratorSession, setModeratorSessionPeriod, getModeratorAttendance, recordModeratorAttendanceCheckin, resetModeratorAttendance } from "@workspace/db";

const router = Router();

router.get("/attendance", async (req, res) => {
  try {
    const session = await getModeratorSession();
    const list = await getModeratorAttendance();
    res.json({
      activePeriod: session?.activePeriod || "none",
      sessionId: session?.id ?? null,
      list,
    });
  } catch (error) {
    console.error("❌ فشل جلب حضور المشرفين:", error);
    res.status(500).json({ error: "فشل جلب حضور المشرفين" });
  }
});

router.post("/period", async (req, res) => {
  try {
    const { period } = req.body as { period?: "beginning" | "middle" | "ending" | "none" };
    if (!period || !["beginning", "middle", "ending", "none"].includes(period)) {
      return res.status(400).json({ error: "الفترة غير صالحة" });
    }

    const result = await setModeratorSessionPeriod(period);
    return res.json({ success: true, result, activePeriod: period });
  } catch (error) {
    console.error("❌ فشل تغيير فترة حضور المشرفين:", error);
    return res.status(500).json({ error: "فشل تغيير فترة حضور المشرفين" });
  }
});

router.post("/checkin", async (req, res) => {
  try {
    const { moderatorName } = req.body as {
      moderatorName?: string;
    };

    if (!moderatorName) {
      return res.status(400).json({ error: "اسم المشرف مطلوب" });
    }

    const session = await getModeratorSession();
    if (!session || session.activePeriod === "none") {
      return res.status(400).json({ error: "لا توجد فترة نشطة حالياً لتسجيل الحضور" });
    }

    const result = await recordModeratorAttendanceCheckin(moderatorName, session.activePeriod as "beginning" | "middle" | "ending");
    return res.json({ success: true, result, activePeriod: session.activePeriod });
  } catch (error) {
    console.error("❌ فشل تسجيل حضور المشرف:", error);
    return res.status(500).json({ error: "فشل تسجيل حضور المشرف" });
  }
});

router.post("/reset", async (req, res) => {
  try {
    await resetModeratorAttendance();
    return res.json({ success: true });
  } catch (error) {
    console.error("❌ فشل إعادة ضبط حضور المشرفين:", error);
    return res.status(500).json({ error: "فشل إعادة ضبط حضور المشرفين" });
  }
});

export default router;
