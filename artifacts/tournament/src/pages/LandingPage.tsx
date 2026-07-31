import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PusherLib from "pusher-js";
import bgImg from "@assets/تصميم بدون عنوان.png";
import { getRecords, getState, getPlayerStats, getLeaderboard, useSSE } from "@/lib/api";
import { type TournamentRecord, type PlayerStats, type PlayerSession, type LeaderboardEntry, levelFromWins, progressWithinLevel, WINS_PER_LEVEL } from "@/lib/types";

// إعدادات شات كيك (نفس المستخدمة بصفحة الأدمن) — عشان نتحقق من هوية اللاعب:
// اللاعب يكتب أمر الربط بشاته الحقيقي، ونحن نسمع الرسالة مباشرة من قناة القناة.
const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_CLUSTER = "us2";
const KICK_CHANNEL = "ik3mo";
const KICK_CHATROOM_ID = 5675989;
const LINK_CODE_TTL_MS = 5 * 60 * 1000; // صلاحية أمر الربط: 5 دقائق ثم يُطلب توليد جديد

// 🟡 مفتاح تخزين "آخر صور شافها المستخدم" — لكل جهاز بشكل مستقل
const SEEN_IMAGES_KEY = "seenCardImages";

// 🏆 عدد المراكز الظاهرة باللوحة (اللي تحتها ما يبانون إلا لو أنت واحد منهم)
const TOP_COUNT = 5;

// 💚 رابط الدعم
const SUPPORT_URL = "https://creators.sa/ik3mo";

function normalizeName(u: string): string {
  return (u || "").normalize("NFKC").trim().toLowerCase();
}
function safeParse(v: string): unknown {
  try { return JSON.parse(v); } catch { return v; }
}
function nestedPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  if (typeof rec.data === "string") return nestedPayload(safeParse(rec.data));
  if (rec.data && typeof rec.data === "object") return nestedPayload(rec.data);
  return rec;
}

// بصمة صور الكرت — أي تغيير بالصورة أو صورة الخلفية يعني "صورة جديدة"
function imageSig(r: { image?: string; image2?: string }): string {
  return `${r.image || ""}|${r.image2 || ""}`;
}


export default function LandingPage() {
  const [records, setRecords] = useState<TournamentRecord[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // ── 🟡 تتبّع الصور الجديدة: نخزّن آخر بصمة صور شافها المستخدم لكل لعبة ──
  const [seenImages, setSeenImages] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(SEEN_IMAGES_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });

  // إخفاء العلامة الصفراء لكرت معيّن + حفظ البصمة الجديدة
  const markImageSeen = useCallback((game: string, sig: string) => {
    setSeenImages((prev) => {
      const next = { ...prev, [game]: sig };
      try { localStorage.setItem(SEEN_IMAGES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── جلسة اللاعب المسجّل + إحصائياته (فوزات/لفل لكل لعبة) ──
  const [session, setSession] = useState<PlayerSession | null>(() => {
    try { const raw = localStorage.getItem("playerSession"); return raw ? (JSON.parse(raw) as PlayerSession) : null; } catch { return null; }
  });
  const [stats, setStats] = useState<PlayerStats | null>(null);

  // ── حالة نافذة تسجيل الدخول عبر شات كيك ──
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginStep, setLoginStep] = useState<"enter" | "verify">("enter");
  const [nameInput, setNameInput] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [copied, setCopied] = useState(false);         // تأكيد بصري بعد نسخ الكود
  const [codeExpiresAt, setCodeExpiresAt] = useState(0); // وقت انتهاء الأمر (للعداد التنازلي)
  const [nowTs, setNowTs] = useState(Date.now());

  const pusherRef = useRef<any>(null);
  const chatChannelRef = useRef<any>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStats = useCallback(() => {
    const name = session?.username;
    if (!name) { setStats(null); return; }
    getPlayerStats(name).then((s) => { if (s) setStats(s); }).catch(() => {});
  }, [session]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // ── 🖼️ صورة اللاعب تُجلب مباشرة من بروفايله في كيك (بدون رفع يدوي) ──
  const [kickAvatar, setKickAvatar] = useState<string>("");
  useEffect(() => {
    const name = session?.username;
    if (!name) { setKickAvatar(""); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } });
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setKickAvatar(d?.user?.profile_pic || "");
        }
      } catch {
        /* لو تعذّر الجلب نرجع لأول حرف من الاسم */
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // ── 🏆 ترتيب الفائزين: يجي جاهز من السيرفر ──
  // المصدر جدول player_match_wins: كل ماتش مكسوب داخل أي بطولة = نقطة،
  // ولا يتصفّر مع البطولات الجديدة. أي مشارك يفوز يدخل الترتيب تلقائياً
  // سواء كان حسابه مربوط بالموقع أو لا.
  //
  // نجلب 50 مركز مو 5: الظاهر للجميع هو أول TOP_COUNT فقط، لكن نحتاج
  // القائمة الأطول عشان نحسب مركز اللاعب لو كان خارج الظاهرين.
  // بالجوال اللوحة تنفتح كنافذة بنص الشاشة من أيقونة الكأس بالهيدر.
  const [boardOpen, setBoardOpen] = useState(false);
  const [fullBoard, setFullBoard] = useState<LeaderboardEntry[]>([]);
  const refreshLeaderboard = useCallback(() => {
    getLeaderboard(50).then((rows) => setFullBoard(rows || [])).catch(() => {});
  }, []);

  // ── 🔒 قفل تمرير الصفحة + إغلاق بزر Escape وقت ما تكون اللوحة مفتوحة ──
  // بدون قفل التمرير، الخلفية تتحرك تحت النافذة بالجوال وتطلع تجربة مكسورة.
  useEffect(() => {
    if (!boardOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBoardOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [boardOpen]);

  // أول 5 مراكز فقط هي الظاهرة للجميع
  const topBoard = useMemo(() => fullBoard.slice(0, TOP_COUNT), [fullBoard]);

  // ── 📍 مركزك أنت (يظهر فقط لو حسابك مربوط) ──
  // لو مركزك ضمن أول 5 نضيّي سطرك بالقائمة، ولو تحتهم نعرض سطر مستقل
  // فيه رقم مركزك الحقيقي (مثلاً: 7) واسمك ونقاطك.
  const myStanding = useMemo(() => {
    const me = normalizeName(session?.username || "");
    if (!me) return null;
    const idx = fullBoard.findIndex((e) => normalizeName(e.username) === me);
    if (idx === -1) return { rank: 0, wins: 0, username: session!.username, inTop: false };
    return { rank: idx + 1, wins: fullBoard[idx].wins, username: fullBoard[idx].username, inTop: idx < TOP_COUNT };
  }, [fullBoard, session]);

  // ── حالة البطولة الحية (لتلوين نقطة زر "مشاهدة البطولة") ──
  // phase: "setup" = لا توجد بطولة جارية، "tournament" = البطولة جارية الآن.
  // joinDeadline: وقت انتهاء نافذة الانضمام لو الأدمن فتحها (null يعني مغلقة).
  const [liveTournamentPhase, setLiveTournamentPhase] = useState<"setup" | "tournament">("setup");
  const [liveJoinDeadline, setLiveJoinDeadline] = useState<number | null>(null);
  // نبضة كل ثانية عشان ننتبه لانتهاء مهلة نافذة الانضمام حتى بدون رسالة SSE جديدة
  const [, setDotTick] = useState(0);
  useEffect(() => {
    if (!liveJoinDeadline) return;
    const id = setInterval(() => setDotTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [liveJoinDeadline]);

  useEffect(() => {
    getRecords().then(setRecords).catch(() => {});
    refreshLeaderboard();
    getState().then((s) => {
      setLiveTournamentPhase(s?.phase || "setup");
      setLiveJoinDeadline(s?.joinDeadline ?? null);
    }).catch(() => {});
  }, [refreshLeaderboard]);

  // تحديث لحظي: أي تعديل من الأدمن (يستدعي broadcast بالخادم) يوصل عبر SSE،
  // فنعيد جلب السجل + إحصائيات اللاعب فوراً (الفوزات تتغيّر عند تحديد فائز جديد).
  // ⚠️ وهذا كمان اللي يخلّي العلامة الصفراء تطلع لحظياً بمجرد ما الأدمن يرفع صورة جديدة،
  //    وكمان اللي يحدّث لوحة الترتيب (السيرفر يبث بعد كل ماتش).
  useSSE((data) => {
    getRecords().then(setRecords).catch(() => {});
    refreshStats();
    refreshLeaderboard();
    setLiveTournamentPhase(data?.phase || "setup");
    setLiveJoinDeadline(data?.joinDeadline ?? null);
  });

  // ⏱️ هل نافذة الانضمام مفتوحة فعلاً الآن (فيه مهلة ولسا ما خلصت)؟
  const isJoinWindowOpen = !!liveJoinDeadline && liveJoinDeadline > Date.now();
  // 🔴 أحمر: ما فيه بطولة جارية ولا نافذة انضمام مفتوحة
  // 🟢 أخضر: الأدمن فتح باب الانضمام الآن
  // ⚪ أبيض (الوضع الطبيعي): البطولة جارية فعلاً
  const watchDotStatus: "red" | "green" | "white" =
    isJoinWindowOpen ? "green" : liveTournamentPhase === "tournament" ? "white" : "red";
  // فيه شي يستاهل الدخول له؟ (بطولة جارية أو باب انضمام مفتوح)
  // لو لا → زر المشاهدة يصير مطفي وما ينضغط.
  const isTournamentLive = watchDotStatus !== "red";

  // إيقاف الاستماع لشات كيك وتنظيف المؤقّت
  const teardownVerify = useCallback(() => {
    if (chatChannelRef.current) {
      try {
        chatChannelRef.current.unbind_all();
        if (pusherRef.current) pusherRef.current.unsubscribe(chatChannelRef.current.name);
      } catch { /* ignore */ }
      chatChannelRef.current = null;
    }
    if (expireTimerRef.current) { clearTimeout(expireTimerRef.current); expireTimerRef.current = null; }
  }, []);

  useEffect(() => () => teardownVerify(), [teardownVerify]);

  // عدّاد تنازلي لصلاحية أمر الربط — يشتغل فقط وقت انتظار الرسالة
  useEffect(() => {
    if (!loginOpen || loginStep !== "verify") return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [loginOpen, loginStep]);

  function genCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function openLogin() {
    setLoginOpen(true);
    setLoginStep("enter");
    setNameInput("");
    setLinkCode("");
    setVerifyMsg("");
    setCopied(false);
  }

  // رجوع لخطوة كتابة الاسم (نوقف الاستماع عشان ما يبقى اشتراك معلّق)
  function backToEnter() {
    teardownVerify();
    setCopied(false);
    setVerifyMsg("");
    setLoginStep("enter");
  }

  // نسخ الكود مع تأكيد بصري لمدة ثانيتين
  function copyCmd() {
    const text = `!ربط ${linkCode}`;
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => {});
  }

  function closeLogin() {
    setLoginOpen(false);
    teardownVerify();
  }

  function onVerified(user: string) {
    const sess: PlayerSession = { username: user };
    try { localStorage.setItem("playerSession", JSON.stringify(sess)); } catch { /* ignore */ }
    setSession(sess);
    setLoginOpen(false);
    teardownVerify();
    getPlayerStats(user).then((s) => { if (s) setStats(s); }).catch(() => {});
  }

  function logout() {
    try { localStorage.removeItem("playerSession"); } catch { /* ignore */ }
    setSession(null);
    setStats(null);
  }

  function connectVerify(name: string, code: string) {
    teardownVerify();
    const target = normalizeName(name);
    try {
      if (!pusherRef.current) {
        pusherRef.current = new PusherLib(KICK_PUSHER_KEY, { cluster: KICK_PUSHER_CLUSTER, forceTLS: true });
      }
      const channel = pusherRef.current.subscribe(`chatrooms.${KICK_CHATROOM_ID}.v2`);
      chatChannelRef.current = channel;
      const handler = (rawData: unknown) => {
        const payload = typeof rawData === "string" ? safeParse(rawData) : rawData;
        const normalized = nestedPayload(payload);
        const content = String((normalized?.content as unknown) ?? (normalized?.message as unknown) ?? (normalized?.text as unknown) ?? "").trim();
        const sender = (normalized?.sender as Record<string, unknown> | undefined) ?? (normalized?.user as Record<string, unknown> | undefined) ?? normalized;
        const user = String((sender?.username as unknown) ?? (sender?.name as unknown) ?? "").trim();
        if (!content || !user) return;
        if (normalizeName(user) !== target) return;
        if (!/(!ربط|!link|!رابط)/i.test(content)) return;
        if (!content.toLowerCase().includes(code.toLowerCase())) return;
        onVerified(user);
      };
      channel.bind("App\\Events\\ChatMessageEvent", handler);
      channel.bind("ChatMessageEvent", handler);
      channel.bind("App\\Events\\ChatMessageEventV2", handler);
    } catch {
      setVerifyMsg("تعذّر الاتصال بشات كيك — جرّب مرة ثانية بعد شوي.");
    }
  }

  function startVerify() {
    const name = nameInput.trim();
    if (!name) return;
    const code = genCode();
    setLinkCode(code);
    setCopied(false);
    setVerifyMsg("");
    setCodeExpiresAt(Date.now() + LINK_CODE_TTL_MS);
    setNowTs(Date.now());
    setLoginStep("verify");
    connectVerify(name, code);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    // انتهى الوقت؟ نولّد كود جديد تلقائياً بدل ما نطلب من المستخدم يضغط زر.
    // startVerify تعيد ضبط المؤقّت بنفسها، فالتجديد يستمر ما دامت النافذة مفتوحة،
    // ويتوقف تلقائياً عند الإغلاق لأن closeLogin تنادي teardownVerify.
    expireTimerRef.current = setTimeout(() => {
      startVerify();
    }, LINK_CODE_TTL_MS);
  }

  // الكروت ديناميكية: كل سجل غير مخفي = كرت واحد، وكرت محذوف من الأدمن
  // يختفي كامل من هنا تلقائيًا (بدون خانة فاضية مكانه).
  const slots = useMemo(() => {
    return records
      .filter((r) => !r.isHidden)
      .map((r) => {
        const sig = imageSig(r);
        return {
          game: r.tournamentName,
          name: r.displayName || r.tournamentName,
          winner: r.winnerName || "",
          image: r.image || "",
          image2: r.image2 || "",
          sig,
          // 🟡 فيه صورة، ومختلفة عن آخر بصمة شافها المستخدم = صورة جديدة
          isNewImage: !!(r.image || r.image2) && seenImages[r.tournamentName] !== sig,
          empty: false,
        };
      });
  }, [records, seenImages]);

  const rankIcon = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1));

  // الوقت المتبقي لصلاحية أمر الربط بصيغة m:ss
  const secondsLeft = Math.max(0, Math.ceil((codeExpiresAt - nowTs) / 1000));
  const codeTimer = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  // ── زر مشاهدة البطولة ──
  // معرّف مرة وحدة ويتعرض بمكانين: داخل الهيدر (ديسكتوب) وفوق الكروت (جوال).
  // اللي مخفي منهم بـ display:none ما يدخل شجرة الوصولية أصلاً، فما فيه تكرار فعلي.
  const watchBtn = isTournamentLive ? (
    <a className="lp-watch-btn" href="/live" aria-label="مشاهدة البطولة">
      <span
        className={`lp-watch-dot dot-${watchDotStatus}`}
        title={watchDotStatus === "green" ? "باب الانضمام مفتوح الآن" : "البطولة جارية الآن"}
      />
      مشاهدة البطولة
    </a>
  ) : (
    <span
      className="lp-watch-btn is-off"
      role="link"
      aria-disabled="true"
      title="لا توجد بطولة جارية حالياً"
    >
      <span className="lp-watch-dot dot-red" />
      لا توجد بطولة حالياً
    </span>
  );

  return (
    <>
      <style>{`
        @keyframes rgbShift {
          0%{color:#ff0040;text-shadow:0 0 8px rgba(255,0,64,.7)}
          16%{color:#ff8c00;text-shadow:0 0 8px rgba(255,140,0,.7)}
          33%{color:#ffd700;text-shadow:0 0 8px rgba(255,215,0,.7)}
          50%{color:#00e676;text-shadow:0 0 8px rgba(0,230,118,.7)}
          66%{color:#00b0ff;text-shadow:0 0 8px rgba(0,176,255,.7)}
          83%{color:#7c4dff;text-shadow:0 0 8px rgba(124,77,255,.7)}
          100%{color:#ff0040;text-shadow:0 0 8px rgba(255,0,64,.7)}
        }
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes enterDown{
          from{opacity:0;transform:translateY(-18px)}
          to{opacity:1;transform:translateY(0)}
        }
        @keyframes enterUp{
          from{opacity:0;transform:translateY(28px)}
          to{opacity:1;transform:translateY(0)}
        }
        @keyframes enterScale{
          0%{opacity:0;transform:scale(.55) rotate(-8deg)}
          60%{opacity:1;transform:scale(1.08) rotate(2deg)}
          100%{opacity:1;transform:scale(1) rotate(0)}
        }
        @keyframes enterCard{
          from{opacity:0;transform:translateY(36px) scale(.92)}
          to{opacity:1;transform:translateY(0) scale(1)}
        }
        @keyframes sheenSweep{
          0%{transform:translateX(-120%) skewX(-20deg)}
          100%{transform:translateX(220%) skewX(-20deg)}
        }
        @keyframes mascotGlow{
          0%,100%{filter:drop-shadow(0 0 18px rgba(41,182,246,.55))}
          50%{filter:drop-shadow(0 0 30px rgba(41,182,246,.85))}
        }
        @keyframes bgReveal{
          0%{opacity:0;filter:blur(28px) brightness(1.5);transform:scale(1.1)}
          55%{opacity:1;filter:blur(8px) brightness(1.25);transform:scale(1.04)}
          100%{opacity:1;filter:blur(0) brightness(1);transform:scale(1)}
        }
        @keyframes bgFlash{
          0%{opacity:.6}
          100%{opacity:0}
        }

        *{box-sizing:border-box}
        .lp-page{
          min-height:100vh;width:100%;
          color:#fff;font-family:Cairo, sans-serif;
          padding:clamp(14px,4vw,28px) clamp(12px,4vw,20px) clamp(30px,8vw,60px);
          position:relative;overflow-x:hidden;
        }
        .lp-bg{
          position:fixed;inset:0;z-index:0;
          background:url(${bgImg}) center/cover no-repeat fixed;
          transform-origin:center center;
          animation:bgReveal 1.9s cubic-bezier(.22,1,.36,1) both;
        }
        .lp-bg::after{
          content:"";position:absolute;inset:0;
          background:radial-gradient(ellipse 65% 45% at 50% 32%, rgba(255,255,255,.95), transparent 62%);
          animation:bgFlash 1.5s ease-out both;
          pointer-events:none;
        }

        /* ===== الهيدر ===== */
        /* direction:ltr على الحاوية فقط — يضمن إن أول عنصر يطلع يسار وآخر عنصر
           يمين مهما كان اتجاه الصفحة. المجموعات جوّاها ترجع rtl عشان ترتيب
           العناصر والنصوص العربية يظل طبيعي زي ما كان. */
        .lp-nav{
          width:100%;margin:0 0 8px;
          display:flex;align-items:center;justify-content:space-between;
          gap:clamp(10px,2.5vw,18px);
          direction:ltr;
          position:relative;z-index:2;
          animation:enterDown .7s cubic-bezier(.22,1,.36,1) both;
        }
        /* ⬅️ زاوية اليسار: تسجيل الدخول / شريحة اللاعب */
        .lp-nav-left{
          direction:rtl;
          display:flex;align-items:center;flex-shrink:0;min-width:0;
        }
        /* ➡️ زاوية اليمين: الأيقونات + زر البطولة (ديسكتوب) */
        .lp-nav-right{
          direction:rtl;
          display:flex;align-items:center;
          gap:clamp(9px,2.2vw,15px);flex-wrap:wrap;row-gap:10px;
        }
        .lp-nav-icon{
          width:clamp(28px,7vw,34px);height:clamp(28px,7vw,34px);border-radius:50%;display:flex;align-items:center;justify-content:center;
          color:#e6f3ff;opacity:.85;transition:opacity .2s ease, transform .2s ease;flex-shrink:0;
        }
        .lp-nav-icon:hover{opacity:1;transform:translateY(-2px)}
        .lp-nav-icon svg{width:clamp(16px,4.5vw,20px);height:clamp(16px,4.5vw,20px)}
        .lp-ikemo-btn{
          display:flex;align-items:center;gap:8px;padding:8px 18px;border-radius:999px;
          border:1px solid rgba(41,182,246,.45);background:rgba(41,182,246,.1);
          font-weight:800;font-size:.85rem;color:#eaf6ff;letter-spacing:.5px;text-decoration:none;
          box-shadow:0 0 18px rgba(41,182,246,.25);
        }
        .lp-nav-sep{width:1px;height:26px;background:rgba(255,255,255,.18);margin:0 2px}

        /* ===== 💚 أيقونة الدعم (جنب كيك) ===== */
        .lp-support-btn{
          color:#4ade80;opacity:1;
          animation:supportGlow 2.2s ease-in-out infinite;
        }
        .lp-support-btn:hover{transform:translateY(-2px) scale(1.08)}
        @keyframes supportGlow{
          0%,100%{filter:drop-shadow(0 0 5px rgba(74,222,128,.45))}
          50%{filter:drop-shadow(0 0 14px rgba(74,222,128,.9))}
        }
        @media (prefers-reduced-motion: reduce){
          .lp-support-btn{animation:none;filter:drop-shadow(0 0 8px rgba(74,222,128,.6))}
        }

        /* ===== 🏆 زر الأكثر انتصاراً (جوال فقط) ===== */
        /* قبل: أيقونة رمادية باهتة بنفس شكل بقية الأيقونات فما كانت تبان إنها زر.
           الحين: زر دائري بلمسة ذهبية + كأس واضح + حلقة توهّج خفيفة. */
        .lp-board-toggle{
          display:none;align-items:center;justify-content:center;
          position:relative;flex-shrink:0;padding:0;cursor:pointer;
          width:38px;height:38px;border-radius:50%;
          color:#ffd76a;
          background:linear-gradient(180deg,rgba(255,196,0,.24),rgba(255,150,0,.07));
          border:1px solid rgba(255,196,0,.5);
          box-shadow:0 4px 14px rgba(0,0,0,.35), 0 0 16px rgba(255,196,0,.18), inset 0 1px 0 rgba(255,255,255,.2);
          transition:transform .18s ease, filter .18s ease, box-shadow .18s ease;
        }
        .lp-board-toggle svg{
          width:21px;height:21px;
          filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));
        }
        .lp-board-toggle:hover{filter:brightness(1.1)}
        .lp-board-toggle:active{transform:scale(.92)}
        .lp-board-toggle:focus-visible{outline:2px solid #ffd54a;outline-offset:3px}
        /* حلقة نبض خفيفة تلفت الانتباه بدون إزعاج */
        .lp-board-toggle::after{
          content:"";position:absolute;inset:-2px;border-radius:50%;
          border:1.5px solid rgba(255,196,0,.6);pointer-events:none;
          animation:boardPing 2.6s ease-out infinite;
        }
        @keyframes boardPing{
          0%{transform:scale(.94);opacity:.7}
          60%,100%{transform:scale(1.35);opacity:0}
        }
        @media (prefers-reduced-motion: reduce){
          .lp-board-toggle::after{animation:none;opacity:0}
        }

        /* ===== 🏆 لوحة الترتيب ===== */
        /* .lp-board = حاوية التموضع فقط | .lp-board-inner = الكرت نفسه.
           الفصل هذا هو اللي يخلّي النسخة الجوال تتوسّط بـ flex بدل
           translate(-50%,-50%) — الطريقة القديمة كانت تعطي تموضع غلط
           وضبابية بالنص مع بعض المتصفحات. */
        .lp-board{
          position:absolute;z-index:6;
          top:clamp(78px,11vh,104px);
          right:clamp(12px,4vw,20px);
          width:min(252px, calc(100vw - 28px));
          animation:enterDown .8s cubic-bezier(.22,1,.36,1) .3s both;
        }
        .lp-board-inner{
          position:relative;
          background:linear-gradient(180deg,rgba(16,32,60,.93),rgba(6,13,26,.95));
          border:1px solid rgba(255,196,0,.28);border-radius:16px;
          box-shadow:0 18px 44px rgba(0,0,0,.55),0 0 26px rgba(255,196,0,.1);
          backdrop-filter:blur(6px);
          padding:12px 12px 11px;
        }
        .lp-board-title{
          display:flex;align-items:center;justify-content:center;gap:6px;
          font-weight:900;font-size:.92rem;color:#ffd54a;
          text-shadow:0 0 10px rgba(255,196,0,.35);
        }
        .lp-board-note{
          text-align:center;font-size:.63rem;font-weight:700;color:rgba(255,255,255,.4);
          margin:3px 0 10px;line-height:1.5;
        }
        .lp-board-empty{text-align:center;font-size:.78rem;color:rgba(255,255,255,.5);font-weight:700;padding:10px 0}
        .lp-board-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
        .lp-board-row{
          display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:10px;
          background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);
          transition:transform .18s ease, border-color .18s ease;
        }
        .lp-board-row:hover{transform:translateX(-3px)}
        .lp-board-row.rank-1{background:linear-gradient(90deg,rgba(255,196,0,.18),rgba(255,196,0,.04));border-color:rgba(255,196,0,.38)}
        .lp-board-row.rank-2{background:linear-gradient(90deg,rgba(203,213,225,.15),rgba(203,213,225,.03));border-color:rgba(203,213,225,.3)}
        .lp-board-row.rank-3{background:linear-gradient(90deg,rgba(205,127,50,.17),rgba(205,127,50,.03));border-color:rgba(205,127,50,.34)}
        /* 🔵 سطرك أنت — يتضيّى عشان تلقاه بسرعة */
        .lp-board-row.is-me{
          border-color:rgba(41,182,246,.7);
          box-shadow:0 0 0 1px rgba(41,182,246,.35), inset 0 0 16px rgba(41,182,246,.22);
        }
        .lp-board-rank{
          flex-shrink:0;width:24px;text-align:center;font-weight:900;font-size:.95rem;line-height:1;color:#eaf6ff;
        }
        .lp-board-name{
          flex:1;font-weight:800;font-size:.82rem;color:#eaf6ff;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;
        }
        .lp-board-pts{
          flex-shrink:0;font-weight:900;font-size:.7rem;color:#ffd54a;
          background:rgba(255,196,0,.1);border-radius:999px;padding:2px 8px;
        }
        .lp-board-row.is-me .lp-board-pts{color:#7fd4ff;background:rgba(41,182,246,.14)}
        /* فاصل قبل سطر "مركزك" لما تكون تحت أول 5 */
        .lp-board-gap{
          text-align:center;color:rgba(255,255,255,.28);font-weight:900;
          letter-spacing:3px;font-size:.7rem;line-height:1;margin:5px 0 3px;
        }
        .lp-board-mine{margin-top:5px}
        .lp-board-hint{
          margin-top:9px;text-align:center;font-size:.63rem;font-weight:700;
          color:rgba(255,255,255,.38);line-height:1.6;
        }
        .lp-board-hint b{color:#7fd4ff;font-weight:900}

        /* زر إغلاق اللوحة + الطبقة السوداء خلفها: للجوال فقط */
        .lp-board-close{display:none}
        .lp-board-backdrop{display:none}

        /* ===== 📱 الجوال: اللوحة تصير نافذة بنص الشاشة =====
           التوسيط صار بـ flex على حاوية fixed inset:0 — أدق طريقة وما تتأثر
           بارتفاع المحتوى ولا بشريط المتصفح المتغيّر. */
        @media (max-width:640px){
          .lp-board-toggle{display:flex}

          .lp-board-backdrop{
            display:block;position:fixed;inset:0;z-index:1090;
            background:rgba(2,6,14,.62);
            backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px);
            animation:fadeIn .22s ease-out;
          }
          .lp-board{
            position:fixed;inset:0;width:auto;z-index:1100;margin:0;animation:none;
            display:flex;align-items:center;justify-content:center;
            padding:20px 16px;
            opacity:0;pointer-events:none;
            transition:opacity .22s ease;
          }
          .lp-board.is-open{opacity:1;pointer-events:auto}

          .lp-board-inner{
            width:100%;max-width:330px;
            max-height:calc(100vh - 110px);
            max-height:calc(100dvh - 110px);
            overflow-y:auto;overscroll-behavior:contain;
            -webkit-overflow-scrolling:touch;
            padding:18px 14px 15px;border-radius:20px;
            transform:scale(.92);opacity:0;
            transition:transform .28s cubic-bezier(.22,1,.36,1), opacity .22s ease;
          }
          .lp-board.is-open .lp-board-inner{transform:scale(1);opacity:1}

          .lp-board-close{
            display:flex;align-items:center;justify-content:center;
            position:absolute;top:10px;left:10px;
            width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
            background:rgba(255,255,255,.1);color:#fff;font-size:14px;line-height:1;
          }
          .lp-board-title{font-size:1rem}
          .lp-board-row{padding:9px 10px;gap:9px}
          .lp-board-name{font-size:.82rem}
        }

        /* ===== الكروت ===== */
        .lp-grid{
          position:absolute;top:56.5%;left:0;right:0;
          max-width:1400px;margin:0 auto;display:flex;flex-wrap:wrap;
          justify-content:center;align-items:stretch;z-index:2;
          gap:clamp(10px,2.5vw,16px);
          padding:0 clamp(8px,3vw,20px);
        }
        .lp-card-wrap{
          position:relative;
          flex:0 1 220px;
          max-width:220px;
          opacity:0;
          animation:enterCard .7s cubic-bezier(.22,1,.36,1) forwards;
          animation-delay:calc(.8s + var(--card-i, 0) * .09s);
        }
        @media (max-width: 900px){
          .lp-card-wrap{flex-basis:calc(33.333% - 11px);max-width:calc(33.333% - 11px)}
        }
        /* ===== 📱 الجوال: تخطيط انسيابي بدل المطلق =====
           الخلل الأصلي: .lp-grid كان position:absolute عند top:64%. العناصر
           المطلقة ما تضيف أي طول للصفحة، فالكروت كانت تطلع تحت حدود الشاشة
           بدون إمكانية تمرير — تنقص كلياً على الجوال. هنا نرجّعه لسير الصفحة
           الطبيعي فيصير كل شي مرتب وقابل للتمرير. */
        @media (max-width: 640px){
          .lp-page{
            min-height:100vh;min-height:100dvh;
            background:#040914;
            padding-bottom:34px;
          }
          /* الخلفية تصير منطقة "هيرو" أعلى الصفحة فقط.
             background-attachment:fixed متقطّعة/متعطّلة على iOS Safari.
             top هنا ينزّلها تحت الهيدر: كذا أزرار تسجيل الدخول والأيقونات
             تقعد على خلفية داكنة صافية بدل ما تكون فوق الصورة. */
          .lp-bg{
            position:absolute;
            inset:0 0 auto 0;
            top:clamp(56px,8.5vh,80px);
            height:min(48vh,400px);
            background-attachment:scroll;
            background-position:center 20%;
          }
          /* تدرّجان: واحد يذوّب حافة الصورة العليا مع الهيدر،
             والثاني ينهيها بنعومة من تحت بدل قطع حاد */
          .lp-bg::before{
            content:"";position:absolute;inset:0;
            background:
              linear-gradient(180deg,#040914,transparent 15%),
              linear-gradient(180deg,transparent 56%,#040914 100%);
            pointer-events:none;
          }

          /* الهيدر: تسجيل الدخول يسار، الأيقونات يمين — بصف واحد ثابت */
          .lp-nav{margin-bottom:0;gap:8px}
          .lp-nav-right{gap:7px;row-gap:7px;flex-wrap:nowrap}
          .lp-nav-sep{display:none}
          .lp-nav-icon{width:34px;height:34px}
          .lp-nav-icon svg{width:18px;height:18px}

          /* زر البطولة ينزل من الهيدر ويستقر فوق الكروت مباشرة */
          .lp-watch-desktop{display:none}
          /* موضع الزر = الأكبر بين قيمتين:
             1) تحت صورة الهيرو بمسافة ثابتة (min(48vh,400px) هو نفس ارتفاعها)
             2) 74vh من أسفل الهيدر
             فيضمن إنه ينزل لأسفل الشاشة تقريباً على أي جهاز، وما يطلع فوق
             الصورة أبداً. الكروت تجي تحته فتحتاج تمرير عشان تشوفها. */
          .lp-watch-row{
            display:flex;justify-content:center;
            position:relative;z-index:3;
            margin-top:max(calc(min(48vh,400px) + clamp(24px,6vw,48px)), 56vh);
          }
          .lp-watch-btn{padding:10px 20px;font-size:.82rem;gap:8px}

          /* الكروت تنزل تحت زر البطولة */
          .lp-grid{
            position:static;top:auto;
            margin-top:clamp(44px,12vw,72px);
            padding:0;
            gap:9px;
          }

          /* تسجيل الدخول: أيقونة دائرية فقط، بدون نص */
          .lp-login-btn{
            width:38px;height:38px;padding:0;border-radius:50%;
            justify-content:center;gap:0;
          }
          .lp-login-text{display:none}
          .lp-login-btn svg{width:18px;height:18px;opacity:1}
          /* 👤 بالجوال: أيقونة الخروج وحدها — بدون صورة البروفايل وبدون الاسم */
          .lp-user-avatar{display:none}
          .lp-user-chip{padding:0;gap:0;border:none;background:none;box-shadow:none}
          .lp-logout-btn{width:34px;height:34px;background:rgba(255,255,255,.1)}
          .lp-logout-btn svg{width:17px;height:17px}

          /* اسم اللعبة كان يتقصّ على كرت بعرض ~160px */
          .lp-card-head{font-size:clamp(.88rem,3.6vw,1.12rem);max-width:96%}
          .lp-card{min-height:178px}
          .lp-card-spotlight{padding:26px 9px 14px;gap:8px}
          .lp-card-winner{font-size:.92rem}
          .lp-trophy{font-size:1.25rem}
          .lp-card-level{padding:7px 9px 9px}
          .lp-level-badge{font-size:.74rem}
          .lp-level-next{font-size:.6rem}
        }
        @media (max-width: 520px){
          .lp-card-wrap{flex-basis:calc(50% - 8px);max-width:calc(50% - 8px)}
        }
        /* قبل: 100% (كرت واحد بالصف) = كرت ضخم وتمرير طويل بلا داعي.
           كرتين بالصف أفضل حتى على أصغر شاشة. */
        @media (max-width: 360px){
          .lp-card-wrap{flex-basis:calc(50% - 5px);max-width:calc(50% - 5px)}
        }
        .lp-card-wrap.is-empty{opacity:.55}

        /* ===== 🟡 علامة "صورة جديدة" بالزاوية اليمين فوق ===== */
        /* داخل .lp-card عشان ترتفع وتكبر مع الكرت بحركة الهوفر */
        .lp-new-badge{
          position:absolute;top:4px;right:4px;z-index:7;
          width:30px;height:30px;border-radius:50%;cursor:pointer;padding:0;
          border:2.5px solid rgba(255,255,255,.95);
          background:radial-gradient(circle at 32% 28%,#fff2a8,#ffc400 55%,#ff8f00);
          display:flex;align-items:center;justify-content:center;
          color:#4a2600;font-weight:900;font-size:1.05rem;line-height:1;font-family:Cairo,sans-serif;
          animation:newBob 1.4s ease-in-out infinite;
          transition:filter .18s ease;
        }
        /* حلقة تتوسّع وتختفي — تلفت النظر من بعيد */
        .lp-new-badge::after{
          content:"";position:absolute;inset:-3px;border-radius:50%;
          border:2px solid rgba(255,196,0,.9);pointer-events:none;
          animation:newPing 1.4s ease-out infinite;
        }
        /* الهوفر يسرّع النطّ بدل ما يوقفه (transform محجوز للأنيميشن) */
        .lp-new-badge:hover{filter:brightness(1.12);animation-duration:.6s}
        .lp-new-badge:focus-visible{outline:2px solid #fff;outline-offset:3px}
        @keyframes newBob{
          0%,100%{transform:translateY(0) scale(1) rotate(0deg);box-shadow:0 0 12px rgba(255,196,0,.7),0 3px 10px rgba(0,0,0,.55)}
          25%{transform:translateY(-5px) scale(1.1) rotate(-9deg)}
          50%{transform:translateY(0) scale(1) rotate(0deg);box-shadow:0 0 26px rgba(255,196,0,1),0 3px 10px rgba(0,0,0,.55)}
          75%{transform:translateY(-3px) scale(1.06) rotate(9deg)}
        }
        @keyframes newPing{
          0%{transform:scale(.9);opacity:.9}
          70%,100%{transform:scale(1.5);opacity:0}
        }
        @media (prefers-reduced-motion: reduce){
          .lp-new-badge{animation:none;transform:none;box-shadow:0 0 16px rgba(255,196,0,.9),0 3px 10px rgba(0,0,0,.55)}
          .lp-new-badge::after{animation:none;opacity:0}
        }

        .lp-card{
          background:linear-gradient(180deg, rgba(15,30,58,.9), rgba(6,13,26,.92));
          background-size:cover;background-position:center;
          border:1px solid rgba(41,182,246,.22);
          border-radius:18px;overflow:hidden;
          box-shadow:0 14px 34px rgba(0,0,0,.4);
          transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
          display:flex;flex-direction:column;min-height:clamp(190px,32vw,270px);
          width:100%;
          position:relative;
        }
        .lp-card::before{
          content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
          background:linear-gradient(180deg, rgba(6,10,22,.35) 0%, rgba(5,9,20,.55) 45%, rgba(4,7,16,.92) 100%);
        }
        .lp-card::after{
          content:"";position:absolute;inset:0;pointer-events:none;z-index:1;
          background:linear-gradient(100deg,transparent 40%,rgba(255,255,255,.16) 50%,transparent 60%);
          transform:translateX(-120%) skewX(-20deg);
          animation:sheenSweep 1.1s ease-out forwards;
          animation-delay:calc(1.05s + var(--card-i, 0) * .09s);
        }
        /* حاوية تلفّ اسم اللعبة + الكرت مع بعض.
           الحركة صارت عليها بدل الكرت وحده، عشان الاسم يرتفع ويكبر معه.
           ما نقدر نحط الاسم جوّا .lp-card لأن overflow:hidden يقص نصفه العلوي،
           وما نقدر نحط الحركة على .lp-card-wrap لأن أنيميشن الدخول
           (enterCard + forwards) يثبّت transform ويتغلّب على أي قيمة هوفر. */
        .lp-card-inner{
          position:relative;width:100%;
          transition:transform .2s ease;
        }
        @media (hover:hover){
          .lp-card-wrap:hover{z-index:5}
          .lp-card-wrap:hover .lp-card-inner{transform:translateY(-4px) scale(1.1)}
          .lp-card-wrap:hover .lp-card{box-shadow:0 20px 44px rgba(41,182,246,.18);border-color:rgba(255,255,255,.75)}
        }

        .lp-card-head{
          position:absolute;top:0;left:50%;transform:translate(-50%,-50%);
          z-index:3;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;
          text-align:center;font-weight:900;
          font-size:clamp(1.05rem,2.6vw,1.5rem);color:#fff;letter-spacing:.3px;
          text-shadow:0 2px 10px rgba(0,0,0,.9), 0 0 18px rgba(0,0,0,.7);
        }

        .lp-card-spotlight{
          position:relative;z-index:2;
          flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:12px;padding:32px 14px 20px;
        }
        .lp-card-winner-group{display:flex;flex-direction:column;align-items:center;gap:2px}

        .image-modal{position:fixed;inset:0;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(4px);animation:fadeIn .3s ease-out}
        .image-modal-content{position:relative;max-width:90vw;max-height:90vh;display:flex;align-items:center;justify-content:center}
        .image-modal-img{width:100%;height:100%;object-fit:contain;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.8)}
        .image-modal-close{position:absolute;top:20px;right:20px;background:rgba(255,255,255,.1);border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease;z-index:1001}
        .image-modal-close:hover{background:rgba(255,255,255,.2);transform:scale(1.1)}

        .lp-card-winner{
          text-align:center;font-weight:900;
          font-size:clamp(.95rem,2.1vw,1.25rem);
          display:flex;align-items:center;justify-content:center;
        }
        .lp-card-winner.is-empty{color:rgba(255,255,255,.35);font-weight:700;font-size:.75rem}
        .lp-trophy{
          font-size:1.5rem;line-height:1;
          animation:trophyFloat 2.6s ease-in-out infinite;
        }
        @keyframes trophyFloat{
          0%,100%{transform:translateY(0) rotate(-2deg)}
          50%{transform:translateY(-5px) rotate(2deg)}
        }
        .rgb-name{
          font-weight:900;color:#7fd4ff;
          text-shadow:0 0 12px rgba(41,182,246,.75), 0 0 2px rgba(41,182,246,.5);
          letter-spacing:.2px;
          display:inline-block;
          transition:transform .3s cubic-bezier(.22,1,.36,1);
        }

        /* ===== 🎉 أجواء احتفالية عند التأشير على الكرت =====
           ملاحظة: @keyframes rgbShift كان معرّفاً بأعلى الملف ومهجوراً بلا استخدام
           — يمرّ على 6 ألوان مع توهّج مطابق، فهو بالضبط اللي نحتاجه هنا. */
        .lp-card-winner-group{position:relative}
        /* شرارتان تطلعان من جانبي الاسم */
        .lp-card-winner-group::before,
        .lp-card-winner-group::after{
          content:"✦";
          position:absolute;top:38%;
          font-size:.85rem;color:#ffd54a;
          opacity:0;pointer-events:none;
          text-shadow:0 0 10px rgba(255,196,0,.95);
        }
        .lp-card-winner-group::before{left:-4px}
        .lp-card-winner-group::after{right:-4px}

        @media (hover:hover){
          /* الاسم يتلوّن ويكبر */
          .lp-card-wrap:hover .rgb-name{
            animation:rgbShift 2.4s linear infinite;
            transform:scale(1.08);
          }
          /* الكأس ينطّ أسرع */
          .lp-card-wrap:hover .lp-trophy{animation-duration:.85s}
          /* الشرارات تتطاير */
          .lp-card-wrap:hover .lp-card-winner-group::before{animation:sparkLeft 1.15s ease-out infinite}
          .lp-card-wrap:hover .lp-card-winner-group::after{animation:sparkRight 1.15s ease-out infinite .3s}
          /* لمعة ذهبية خفيفة تمر على الكرت */
          .lp-card-wrap:hover .lp-card::after{animation:sheenSweep 1.4s ease-out infinite .1s}
        }

        @keyframes sparkLeft{
          0%{opacity:0;transform:translate(0,0) scale(.4) rotate(0deg)}
          30%{opacity:1}
          100%{opacity:0;transform:translate(-15px,-20px) scale(1.25) rotate(120deg)}
        }
        @keyframes sparkRight{
          0%{opacity:0;transform:translate(0,0) scale(.4) rotate(0deg)}
          30%{opacity:1}
          100%{opacity:0;transform:translate(15px,-20px) scale(1.25) rotate(-120deg)}
        }

        /* من يفضّل حركة أقل: نبقي التكبير فقط ونلغي التلوين والشرارات */
        @media (prefers-reduced-motion: reduce){
          .lp-card-wrap:hover .rgb-name{animation:none}
          .lp-card-wrap:hover .lp-card-winner-group::before,
          .lp-card-wrap:hover .lp-card-winner-group::after{animation:none;opacity:0}
          .lp-card-wrap:hover .lp-card::after{animation:none}
        }

        .lp-card-main{flex:1}

        /* ===== زر مشاهدة البطولة ===== */
        /* يتعرض بمكانين حسب المقاس: داخل الهيدر (ديسكتوب) أو فوق الكروت (جوال) */
        .lp-watch-desktop{display:flex;align-items:center;direction:rtl}
        .lp-watch-row{display:none;direction:rtl}
        .lp-watch-btn{
          display:flex;align-items:center;gap:9px;padding:clamp(8px,2vw,10px) clamp(16px,4vw,24px);border-radius:999px;
          background:linear-gradient(135deg,#39c4ff 0%,#1976e6 55%,#0d4fb0 100%);
          color:#fff;font-weight:800;font-size:clamp(.78rem,2vw,.88rem);letter-spacing:.2px;
          text-decoration:none;white-space:nowrap;
          border:1px solid rgba(255,255,255,.22);
          box-shadow:0 6px 18px rgba(25,118,230,.4), inset 0 1px 0 rgba(255,255,255,.25);
          transition:transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }
        .lp-watch-btn:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(25,118,230,.55), inset 0 1px 0 rgba(255,255,255,.3);filter:brightness(1.06)}
        .lp-watch-btn:active{transform:translateY(0)}
        /* 🚫 ما فيه بطولة جارية: الزر مطفي وما ينضغط */
        .lp-watch-btn.is-off{
          background:linear-gradient(135deg,rgba(90,102,120,.55),rgba(52,62,78,.6));
          border-color:rgba(255,255,255,.1);
          color:rgba(255,255,255,.5);
          box-shadow:none;
          cursor:not-allowed;
          user-select:none;
        }
        .lp-watch-btn.is-off:hover,
        .lp-watch-btn.is-off:active{transform:none;filter:none;box-shadow:none}
        .lp-watch-btn.is-off .lp-watch-dot{animation:none;opacity:.85}
        .lp-watch-dot{width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 8px #fff,0 0 2px #fff;
          animation:fadeIn 1.2s ease-in-out infinite alternate;flex-shrink:0}
        /* 🔴 ما فيه بطولة جارية الآن */
        .lp-watch-dot.dot-red{background:#ff4444;box-shadow:0 0 8px #ff4444,0 0 2px #ff4444}
        /* 🟢 الأدمن فتح باب الانضمام الآن */
        .lp-watch-dot.dot-green{background:#22c55e;box-shadow:0 0 8px #22c55e,0 0 2px #22c55e}
        /* ⚪ البطولة جارية فعلاً (الوضع الافتراضي) */
        .lp-watch-dot.dot-white{background:#fff;box-shadow:0 0 8px #fff,0 0 2px #fff}

        /* ===== زر تسجيل الدخول + شريحة اللاعب (زاوية اليسار) ===== */
        /* ستايل زجاجي هادي — عشان الأزرق المصمت يظل حصري لزر مشاهدة البطولة */
        .lp-login-btn{
          display:inline-flex;align-items:center;gap:8px;
          padding:clamp(7px,2vw,9px) clamp(15px,4vw,19px);border-radius:999px;cursor:pointer;
          font-family:Cairo,sans-serif;font-weight:900;
          font-size:clamp(.76rem,2vw,.85rem);letter-spacing:.2px;color:#eaf6ff;
          background:linear-gradient(180deg,rgba(41,182,246,.16),rgba(41,182,246,.05));
          border:1px solid rgba(120,212,255,.42);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 4px 14px rgba(0,0,0,.3);
          transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
        }
        .lp-login-btn svg{opacity:.85;flex-shrink:0}
        .lp-login-btn:hover{
          transform:translateY(-2px);border-color:#7fd4ff;
          background:linear-gradient(180deg,rgba(41,182,246,.28),rgba(41,182,246,.1));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.2), 0 0 20px rgba(41,182,246,.32);
        }
        .lp-user-chip{
          display:inline-flex;align-items:center;gap:9px;padding:5px 7px;border-radius:999px;
          border:1px solid rgba(120,212,255,.4);
          background:linear-gradient(180deg,rgba(41,182,246,.16),rgba(41,182,246,.05));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 4px 14px rgba(0,0,0,.3);
          font-weight:800;font-size:clamp(.76rem,2vw,.84rem);color:#eaf6ff;max-width:min(58vw,300px);
        }
        .lp-user-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .lp-user-avatar{
          width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(135deg,#39c4ff,#0d4fb0);color:#fff;font-weight:900;font-size:.82rem;flex-shrink:0;
          overflow:hidden;box-shadow:0 0 0 2px rgba(41,182,246,.3);
        }
        .lp-user-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
        .lp-logout-btn{
          width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;
          background:rgba(255,255,255,.08);color:#ffb4b4;line-height:1;
          display:flex;align-items:center;justify-content:center;transition:background .2s ease, color .2s ease;
        }
        .lp-logout-btn svg{width:14px;height:14px}
        .lp-logout-btn:hover{background:rgba(255,80,80,.25);color:#fff}


        /* ===== لفل + شريط التقدّم تحت كل كرت (للمسجّلين فقط) ===== */
        .lp-card-level{
          position:relative;z-index:2;margin-top:auto;
          padding:9px 12px 11px;
          background:linear-gradient(180deg,rgba(4,10,22,.35),rgba(4,10,22,.75));
          border-top:1px solid rgba(41,182,246,.25);
        }
        .lp-level-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
        .lp-level-badge{
          display:inline-flex;align-items:center;gap:5px;font-weight:900;font-size:.82rem;color:#7fd4ff;
          text-shadow:0 0 8px rgba(41,182,246,.45);
        }
        .lp-level-wins{font-size:.68rem;font-weight:700;color:rgba(255,255,255,.55)}
        .lp-level-track{
          position:relative;height:8px;border-radius:999px;overflow:hidden;
          background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.1);
        }
        .lp-level-fill{
          position:absolute;inset:0 auto 0 0;border-radius:999px;
          background:linear-gradient(90deg,#1976e6,#39c4ff);
          box-shadow:0 0 10px rgba(41,182,246,.6);
          transition:width .5s cubic-bezier(.22,1,.36,1);
        }
        .lp-level-next{margin-top:5px;font-size:.64rem;font-weight:700;color:rgba(255,255,255,.5);text-align:center}

        /* ===== نافذة تسجيل الدخول ===== */
        .lp-modal{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:1200;backdrop-filter:blur(6px);animation:fadeIn .25s ease-out;padding:clamp(12px,4vw,20px);overflow-y:auto}
        .lp-modal-card{
          width:100%;max-width:440px;overflow-y:auto;border-radius:22px;position:relative;
          max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);
          background:linear-gradient(180deg,rgba(16,32,60,.98),rgba(6,13,26,.99));
          border:1px solid rgba(41,182,246,.32);
          box-shadow:0 30px 70px rgba(0,0,0,.7),0 0 40px rgba(41,182,246,.14);
          padding:clamp(20px,5vw,26px) clamp(16px,5vw,24px) clamp(16px,5vw,24px);
          animation:enterCard .45s cubic-bezier(.22,1,.36,1) both;
        }
        .lp-modal-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.08);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s ease}
        .lp-modal-close:hover{background:rgba(255,255,255,.18)}
        /* أيقونة دائرية فوق العنوان */
        .lp-modal-icon{
          width:54px;height:54px;border-radius:50%;margin:2px auto 13px;
          display:flex;align-items:center;justify-content:center;font-size:1.5rem;
          background:radial-gradient(circle at 32% 28%,rgba(120,212,255,.32),rgba(41,182,246,.1));
          border:1px solid rgba(120,212,255,.4);
          box-shadow:0 0 26px rgba(41,182,246,.25), inset 0 1px 0 rgba(255,255,255,.16);
        }
        /* شعار كيك كبير بدون أي دائرة خلفه */
        .lp-modal-logo{
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 14px;color:#53fc18;
        }
        .lp-modal-logo svg{
          width:clamp(52px,14vw,64px);height:clamp(52px,14vw,64px);
          filter:drop-shadow(0 0 20px rgba(83,252,24,.45));
        }
        .lp-modal-title{font-weight:900;font-size:clamp(1.15rem,4vw,1.35rem);color:#fff;text-align:center;margin-bottom:6px}
        /* لما ما فيه سطر وصف تحت العنوان نحتاج مسافة أكبر */
        .lp-modal-title.solo{margin-bottom:18px}
        .lp-modal-sub{font-size:.82rem;color:rgba(255,255,255,.62);text-align:center;margin-bottom:20px;line-height:1.8}
        .lp-modal-sub b{color:#7fd4ff;font-weight:900}
        .lp-modal-label{font-size:.8rem;font-weight:800;color:#7fd4ff;margin-bottom:8px;display:block}

        /* حقل الاسم — واضح ومرتفع مع خانة أيقونة مفصولة */
        .lp-input-wrap{
          /* direction:ltr ضروري: الصفحة كلها rtl، فبدونها خانة الـ @
             (أول عنصر) تطلع على اليمين بدل اليسار. */
          direction:ltr;
          display:flex;align-items:center;border-radius:16px;overflow:hidden;
          background:rgba(255,255,255,.09);
          border:1.5px solid rgba(120,212,255,.4);
          box-shadow:inset 0 2px 10px rgba(0,0,0,.35);
          transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .lp-input-wrap:focus-within{
          border-color:#39c4ff;background:rgba(255,255,255,.13);
          box-shadow:0 0 0 4px rgba(41,182,246,.18), inset 0 2px 10px rgba(0,0,0,.28);
        }
        .lp-input-at{
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          width:48px;height:54px;
          color:#7fd4ff;font-weight:900;font-size:1.2rem;line-height:1;
          background:rgba(41,182,246,.16);
          border-right:1px solid rgba(120,212,255,.3);
        }
        .lp-modal-input{
          flex:1;min-width:0;height:54px;padding:0 14px;border:none;background:none;outline:none;
          font-size:1.05rem;font-weight:800;color:#fff;font-family:Cairo,sans-serif;
          direction:ltr;text-align:left;
        }
        .lp-modal-input::placeholder{color:rgba(255,255,255,.3);font-weight:700}

        .lp-modal-btn{
          display:block;width:100%;margin-top:16px;padding:13px;border-radius:14px;border:none;cursor:pointer;
          background:linear-gradient(135deg,#39c4ff,#1976e6);color:#fff;font-weight:900;font-size:.95rem;
          text-align:center;text-decoration:none;
          box-shadow:0 8px 22px rgba(25,118,230,.35), inset 0 1px 0 rgba(255,255,255,.25);
          font-family:Cairo,sans-serif;transition:filter .2s ease,transform .2s ease,box-shadow .2s ease;
        }
        .lp-modal-btn:hover{filter:brightness(1.07);transform:translateY(-2px);box-shadow:0 12px 28px rgba(25,118,230,.5), inset 0 1px 0 rgba(255,255,255,.3)}
        .lp-modal-btn:disabled{opacity:.45;cursor:default;transform:none;filter:none;box-shadow:none}
        /* زر ثانوي شفاف */
        .lp-modal-btn.ghost{
          background:transparent;border:1px solid rgba(120,212,255,.42);color:#bde8ff;box-shadow:none;
        }
        .lp-modal-btn.ghost:hover{background:rgba(41,182,246,.12);box-shadow:none}

        /* صندوق أمر الربط — أهم عنصر بالنافذة */
        .lp-cmd-label{
          display:flex;align-items:center;gap:8px;
          font-size:.82rem;font-weight:900;color:#fff;margin-bottom:9px;
        }
        .lp-cmd-label span{
          width:23px;height:23px;border-radius:50%;flex-shrink:0;
          background:linear-gradient(135deg,rgba(41,182,246,.4),rgba(41,182,246,.14));
          border:1px solid rgba(120,212,255,.5);color:#bde8ff;font-size:.74rem;
          display:flex;align-items:center;justify-content:center;
        }
        /* بدون إطار ولا خلفية — خانات الأحرف وزر النسخ يكفون بذاتهم */
        .lp-cmd-card{padding:2px 0 0}
        .lp-cmd-row{
          display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;
          /* rtl هنا يخلي !ربط يجي يمين (طبيعي للعربي) والكود يساره */
          direction:rtl;margin-bottom:14px;
        }
        .lp-cmd-word{
          font-family:Cairo,sans-serif;font-weight:900;
          font-size:clamp(1.3rem,6vw,1.65rem);color:#fff;
          text-shadow:0 2px 10px rgba(0,0,0,.55);
        }
        /* ltr داخل الخانات عشان أحرف الكود تبقى بترتيبها الصحيح */
        .lp-cmd-chars{display:flex;gap:6px;direction:ltr}
        /* كل حرف بخانة مستقلة — أوضح بكثير للقراءة والكتابة اليدوية */
        .lp-cmd-char{
          width:clamp(34px,9vw,42px);height:clamp(43px,11vw,51px);border-radius:11px;
          display:flex;align-items:center;justify-content:center;
          font-family:'Courier New',monospace;font-weight:900;
          font-size:clamp(1.25rem,6vw,1.55rem);color:#ffd54a;
          background:linear-gradient(180deg,rgba(255,196,0,.2),rgba(255,196,0,.05));
          border:1.5px solid rgba(255,196,0,.45);
          box-shadow:0 0 16px rgba(255,196,0,.16), inset 0 1px 0 rgba(255,255,255,.16);
          text-shadow:0 0 12px rgba(255,196,0,.55);
        }
        .lp-cmd-copy{
          display:flex;align-items:center;justify-content:center;gap:8px;
          width:100%;padding:13px;border-radius:13px;cursor:pointer;border:none;
          font-family:Cairo,sans-serif;font-weight:900;font-size:.92rem;
          color:#062a45;background:linear-gradient(135deg,#8fe8ff,#39c4ff);
          box-shadow:0 6px 18px rgba(41,182,246,.35), inset 0 1px 0 rgba(255,255,255,.4);
          transition:transform .18s ease, filter .18s ease, box-shadow .18s ease;
        }
        .lp-cmd-copy:hover{transform:translateY(-2px);filter:brightness(1.05)}
        .lp-cmd-copy.is-done{
          background:linear-gradient(135deg,#a7f3c0,#22c55e);color:#052e16;
          box-shadow:0 6px 18px rgba(34,197,94,.35), inset 0 1px 0 rgba(255,255,255,.4);
        }

        /* زر فتح قناة كيك — بلون كيك الأخضر عشان يبان ويرتبط بالمنصة */
        .lp-kick-btn{
          display:flex;align-items:center;justify-content:center;gap:9px;
          width:100%;padding:14px;border-radius:14px;text-decoration:none;
          font-family:Cairo,sans-serif;font-weight:900;font-size:.95rem;color:#0a1a06;
          background:linear-gradient(135deg,#84ff5c,#53fc18);
          border:1px solid rgba(255,255,255,.25);
          box-shadow:0 8px 24px rgba(83,252,24,.28), inset 0 1px 0 rgba(255,255,255,.4);
          transition:transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }
        .lp-kick-btn:hover{
          transform:translateY(-2px);filter:brightness(1.05);
          box-shadow:0 12px 30px rgba(83,252,24,.45), inset 0 1px 0 rgba(255,255,255,.45);
        }
        .lp-kick-btn svg{width:18px;height:18px;flex-shrink:0}

        /* شريط الانتظار + العداد التنازلي */
        .lp-wait{
          display:flex;align-items:center;justify-content:center;gap:9px;
          margin-top:16px;
          font-size:.8rem;font-weight:800;color:#9fddff;
        }
        .lp-wait-timer{
          font-family:'Courier New',monospace;font-weight:900;font-size:.76rem;direction:ltr;
          color:#ffd54a;background:rgba(255,196,0,.1);border-radius:999px;padding:2px 9px;
        }

        /* زر الرجوع بزاوية فوق يسار — مقابل الاكس على اليمين */
        .lp-modal-back{
          position:absolute;top:14px;left:14px;z-index:2;
          display:flex;align-items:center;gap:3px;
          padding:7px 11px;border-radius:999px;cursor:pointer;
          background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);
          color:rgba(255,255,255,.6);font-size:.72rem;font-weight:800;font-family:Cairo,sans-serif;
          transition:background .18s ease, color .18s ease;
        }
        .lp-modal-back:hover{background:rgba(255,255,255,.16);color:#fff}
        .lp-modal-note{
          margin-top:14px;text-align:center;font-size:.72rem;font-weight:700;
          color:rgba(255,255,255,.38);line-height:1.7;
        }
        .lp-modal-note b{color:#7fd4ff;font-weight:900}
        .lp-modal-err{margin-top:12px;font-size:.82rem;color:#ffb4b4;text-align:center;font-weight:800}

        /* ═══════════ 📱 تصحيحات الجوال — لازم تبقى بآخر الملف ═══════════
           السبب: قواعد مثل .lp-watch-row و .lp-user-avatar و .lp-user-chip
           معرّفة بأسفل الملف (أسطر 930+) بعد بلوك الجوال (سطر 670).
           الـ media query ما تزيد الأولوية (specificity) — فعند التساوي تفوز
           القاعدة الأخيرة بالملف. يعني كل إعدادات الجوال فوق كانت تنلغي!
           هذا اللي خلّى صورة الحساب تظل ظاهرة، وزر البطولة يختفي (display:none)
           فتطلع الكروت ملتصقة بالهيدر. حطّ التصحيحات هنا يضمن تطبيقها. */
        @media (max-width:640px){
          /* 👤 بعد تسجيل الدخول: أيقونة الخروج فقط — بدون صورة ولا اسم */
          .lp-user-avatar{display:none}
          .lp-user-name{display:none}
          .lp-user-chip{
            padding:0;gap:0;max-width:none;
            border:none;background:none;box-shadow:none;
          }
          .lp-logout-btn{width:34px;height:34px;background:rgba(255,255,255,.12)}
          .lp-logout-btn svg{width:17px;height:17px}

          /* قبل تسجيل الدخول: أيقونة دائرية بدون كلمة */
          .lp-login-btn{
            width:38px;height:38px;padding:0;border-radius:50%;
            justify-content:center;gap:0;
          }
          .lp-login-text{display:none}
          .lp-login-btn svg{width:18px;height:18px;opacity:1}

          /* زر البطولة يطلع من الهيدر وينزل لأسفل الشاشة، والكروت تحته.
             74vh هو الرقم الوحيد اللي يتحكم بالمسافة — كبّره تنزل أكثر. */
          .lp-watch-desktop{display:none}
          .lp-watch-row{
            display:flex;justify-content:center;
            position:relative;z-index:3;
            margin-top:max(calc(min(15vh,400px) + clamp(24px,6vw,48px)), 56vh);
          }
          .lp-grid{
            position:static;top:auto;
            margin-top:clamp(23px,5vw,32px);
            padding:0;gap:9px;
          }
        }

        /* ═══════════ 💻 تخطيط البي سي ═══════════
           كل الأزرار (سوشل + دعم + البطولة + الحساب) بمجموعة وحدة على اليسار،
           ولوحة "الأكثر انتصار" مرفوعة لزاوية اليمين العليا.
           محصور بـ min-width:641px فما يمسّ الجوال إطلاقاً. */
        @media (min-width:641px){
          .lp-nav{
            justify-content:flex-start;
            max-width:calc(100% - 285px);   /* ما يزاحم اللوحة اللي باليمين */
          }
          /* ترتيب العرض: الأيقونات وزر البطولة أولاً، وبعدهم الحساب */
          .lp-nav-right{order:1}
          .lp-nav-left{order:2}
          /* اللوحة ترتفع لزاوية اليمين العليا بدل ما تكون تحت صف الهيدر */
          .lp-board{top:clamp(24px,2.6vh,32px)}
        }

      `}</style>

      <div className="lp-page">
        <div className="lp-bg" />

        {/* ===== الهيدر: تسجيل الدخول (زاوية اليسار) + الأيقونات وزر البطولة (زاوية اليمين) ===== */}
        <nav className="lp-nav">
          {/* ⬅️ يسار */}
          <div className="lp-nav-left">
            {session ? (
              <div className="lp-user-chip">
                <span className="lp-user-avatar">
                  {kickAvatar ? (
                    <img
                      src={kickAvatar}
                      alt={session.username}
                      referrerPolicy="no-referrer"
                      // لو صورة كيك ما تحمّلت، نرجع لأول حرف من الاسم
                      onError={() => setKickAvatar("")}
                    />
                  ) : (
                    session.username.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="lp-user-name">{session.username}</span>
                <button className="lp-logout-btn" onClick={logout} title="تسجيل الخروج" aria-label="تسجيل الخروج">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button className="lp-login-btn" onClick={openLogin}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>
                <span className="lp-login-text">تسجيل دخول</span>
              </button>
            )}
          </div>

          {/* ➡️ يمين */}
          <div className="lp-nav-right">
            {/* 🏆 الأكثر انتصاراً — يظهر بالجوال فقط ويفتح اللوحة بنص الشاشة */}
            <button
              className="lp-board-toggle"
              onClick={() => setBoardOpen(true)}
              aria-label="الأكثر انتصاراً"
              aria-haspopup="dialog"
              aria-expanded={boardOpen}
              title="الأكثر انتصاراً"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3.5h10V9a5 5 0 0 1-10 0V3.5Z" />
                <path d="M7 5.5H4.6a.6.6 0 0 0-.6.6v.8A3.6 3.6 0 0 0 7.6 10.5" />
                <path d="M17 5.5h2.4a.6.6 0 0 1 .6.6v.8a3.6 3.6 0 0 1-3.6 3.6" />
                <path d="M12 14v3" />
                <path d="M9.6 17h4.8l.8 3.5H8.8l.8-3.5Z" />
              </svg>
            </button>

            <a className="lp-nav-icon" href="https://discord.gg/ArYbJ9McA" target="_blank" rel="noopener noreferrer" aria-label="ديسكورد">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.24.5a14.6 14.6 0 0 1 4.3 1.7 16.5 16.5 0 0 0-14.9 0 14 14 0 0 1 4.3-1.7L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1 9 .3 13.6.6 18a20 20 0 0 0 6 3l1-1.6a12.7 12.7 0 0 1-1.9-.9l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.7 12.7 0 0 1-1.9.9l1 1.6a20 20 0 0 0 6-3c.4-5-.7-9.6-3.5-13.6ZM8.7 15.2c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm6.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z"/></svg>
            </a>
            <a className="lp-nav-icon" href="https://kick.com/ik3mo" target="_blank" rel="noopener noreferrer" aria-label="كيك">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h5v6.3L12 2h6l-6.6 8L18.5 22h-6.2l-4-6-1.3 1.5V22H2V2Z"/></svg>
            </a>

            {/* 💚 زر الدعم — جنب أيقونة كيك مباشرة */}
            <a
              className="lp-nav-icon lp-support-btn"
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ادعم القناة"
              title="ادعم القناة 💚"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M15.5 8.5H10.6a2.1 2.1 0 0 0 0 4.2h2.8a2.1 2.1 0 0 1 0 4.2H8.5" />
                <path d="M12 6.2v1.6M12 16.9v1.6" />
              </svg>
            </a>

            <span className="lp-nav-sep" />

            {/* زر البطولة — بالهيدر على الديسكتوب فقط */}
            <div className="lp-watch-desktop">{watchBtn}</div>
          </div>
        </nav>

        {/* ===== 🏆 لوحة الترتيب ===== */}
        {/* ديسكتوب: ظاهرة دائماً بزاوية اليمين تحت الهيدر.
            جوال: نافذة بنص الشاشة تنفتح من أيقونة الكأس.
            أول 5 مراكز للجميع، واللي تحتهم ما يبانون — إلا لو حسابك مربوط
            فيطلع لك سطر مستقل فيه رقم مركزك الحقيقي (7 مثلاً). */}
        {boardOpen && <div className="lp-board-backdrop" onClick={() => setBoardOpen(false)} />}

        <aside
          className={`lp-board${boardOpen ? " is-open" : ""}`}
          aria-label="ترتيب الفائزين"
          onClick={() => setBoardOpen(false)}
        >
          {/* stopPropagation عشان الضغط جوّا الكرت ما يقفل النافذة */}
          <div className="lp-board-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lp-board-close" onClick={() => setBoardOpen(false)} aria-label="إغلاق">✕</button>
            <div className="lp-board-title">الاكثر انتصار 🥇</div>
            <div className="lp-board-note">تحسب نقاط الفوز عند الانتصار في اي قيم داخل البطولة</div>

            {fullBoard.length === 0 ? (
              <div className="lp-board-empty">لا يوجد فائزون بعد</div>
            ) : (
              <>
                <ol className="lp-board-list">
                  {topBoard.map((entry, i) => {
                    const isMe = !!myStanding && myStanding.inTop && myStanding.rank === i + 1;
                    return (
                      <li key={entry.username + i} className={`lp-board-row rank-${i + 1}${isMe ? " is-me" : ""}`}>
                        <span className="lp-board-rank">{rankIcon(i)}</span>
                        <span className="lp-board-name">{entry.username}{isMe ? " (أنت)" : ""}</span>
                        <span className="lp-board-pts">{entry.wins} نقطة</span>
                      </li>
                    );
                  })}
                </ol>

                {/* 📍 سطر مركزك — يطلع فقط لو حسابك مربوط وأنت خارج أول 5 */}
                {myStanding && !myStanding.inTop && (
                  <>
                    <div className="lp-board-gap">•••</div>
                    <div className="lp-board-row is-me lp-board-mine">
                      <span className="lp-board-rank">{myStanding.rank > 0 ? myStanding.rank : "—"}</span>
                      <span className="lp-board-name">{myStanding.username} (أنت)</span>
                      <span className="lp-board-pts">{myStanding.wins} نقطة</span>
                    </div>
                  </>
                )}
              </>
            )}

            {/* تلميح لغير المربوطين: الربط يخليك تشوف مركزك بالضبط */}
            {!session && fullBoard.length > 0 && (
              <div className="lp-board-hint">
                عشان يظهر المركز الخاص بك يلزم <b>تسجيل دخول</b>
              </div>
            )}
          </div>
        </aside>

        {/* ===== زر البطولة — فوق الكروت بالجوال ===== */}
        <div className="lp-watch-row">{watchBtn}</div>

        {/* ===== كروت الأبطال ===== */}
        <div className="lp-grid">
          {slots.map((slot, i) => (
            <div key={i} className={`lp-card-wrap${slot.empty ? " is-empty" : ""}`} style={{ ["--card-i" as any]: i }}>
              <div className="lp-card-inner">
              {/* 🟡 علامة صفراء بالزاوية تطلع لما الأدمن ينزّل صورة جديدة — تختفي بالضغط عليها.
                  موضوعة في .lp-card-inner مو جوّا .lp-card: الكرت عنده overflow:hidden
                  اللي كان يقص حلقة النبض عند الزاوية. الحاوية هي اللي تتحرك بالهوفر
                  فالعلامة تمشي وتكبر معها بالضبط زي ما كانت. */}
              {slot.isNewImage && (
                <button
                  className="lp-new-badge"
                  title="فيه صورة جديدة — اضغط للإخفاء"
                  aria-label={`صورة جديدة في ${slot.name}`}
                  onClick={(e) => { e.stopPropagation(); markImageSeen(slot.game, slot.sig); }}
                >!</button>
              )}

              <div className="lp-card-head">{slot.name || "—"}</div>

              <div
                className="lp-card"
                style={{
                  cursor: slot.image ? "pointer" : "default",
                  ...(slot.image2 ? { backgroundImage: `url(${slot.image2})` } : {}),
                }}
                onClick={() => {
                  // فتح الصورة يعتبر مشاهدة كمان — تختفي العلامة تلقائياً
                  if (slot.isNewImage) markImageSeen(slot.game, slot.sig);
                  if (slot.image) setSelectedImage(slot.image);
                }}
              >
                <div className="lp-card-spotlight">
                  <div className="lp-card-winner-group">
                    {slot.winner && <span className="lp-trophy">🏆</span>}
                    <div className={`lp-card-winner${slot.winner ? "" : " is-empty"}`}>
                      {slot.winner ? <span className="rgb-name">{slot.winner}</span> : slot.empty ? "" : "— لا يوجد فائز —"}
                    </div>
                  </div>
                </div>

                {/* لفل اللاعب المسجّل + شريط التقدّم — يظهر فقط بعد تسجيل الدخول */}
                {session && (() => {
                  const wins = stats?.wins?.[slot.game] ?? 0;
                  const level = levelFromWins(wins);
                  const inLevel = progressWithinLevel(wins);
                  const pct = (inLevel / WINS_PER_LEVEL) * 100;
                  const toNext = WINS_PER_LEVEL - inLevel;
                  return (
                    <div className="lp-card-level" onClick={(e) => e.stopPropagation()}>
                      <div className="lp-level-row">
                        <span className="lp-level-badge">⭐ المستوى {level}</span>
                        <span className="lp-level-wins">{wins} فوز</span>
                      </div>
                      <div className="lp-level-track">
                        <div className="lp-level-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="lp-level-next">
                        {toNext === WINS_PER_LEVEL && inLevel === 0
                          ? `تحتاج ${WINS_PER_LEVEL} فوزات للمستوى ${level + 1}`
                          : `باقي ${toNext} للمستوى ${level + 1}`}
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>
            </div>
          ))}
        </div>

      </div>

      {selectedImage && (
        <div className="image-modal" onClick={() => setSelectedImage(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <img className="image-modal-img" src={selectedImage} alt="Tournament" />
            <button className="image-modal-close" onClick={() => setSelectedImage(null)} aria-label="Close image">✕</button>
          </div>
        </div>
      )}

      {/* ===== نافذة تسجيل الدخول عبر شات كيك ===== */}
      {loginOpen && (
        <div className="lp-modal" onClick={closeLogin}>
          <div className="lp-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="lp-modal-close" onClick={closeLogin} aria-label="إغلاق">✕</button>

            {loginStep === "enter" ? (
              <>
                <div className="lp-modal-logo">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h5v6.3L12 2h6l-6.6 8L18.5 22h-6.2l-4-6-1.3 1.5V22H2V2Z"/></svg>
                </div>
                <div className="lp-modal-title solo">تسجيل الدخول</div>

                <label className="lp-modal-label">اسم حسابك في كيك</label>
                <div className="lp-input-wrap">
                  <span className="lp-input-at">@</span>
                  <input
                    className="lp-modal-input"
                    type="text"
                    placeholder="ik3mo"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") startVerify(); }}
                    autoFocus
                  />
                </div>

                <button className="lp-modal-btn" disabled={!nameInput.trim()} onClick={startVerify}>
                  التالي ⟵
                </button>
              </>
            ) : (
              <>
                <button className="lp-modal-back" onClick={backToEnter} aria-label="تغيير الاسم">
                  ‹ تغيير الاسم
                </button>

                <div className="lp-modal-icon">🔗</div>
                <div className="lp-modal-title">باقي خطوة وحدة</div>
                <div className="lp-modal-sub">
                  انسخ الكود وأرسله في شات <b>{KICK_CHANNEL}</b>
                </div>

                {/* الكود — أوضح وأكبر عنصر بالنافذة */}
                <div className="lp-cmd-label"><span>1</span> انسخ الكود</div>
                <div className="lp-cmd-card">
                  <div className="lp-cmd-row">
                    <span className="lp-cmd-word">!ربط</span>
                    <span className="lp-cmd-chars">
                      {linkCode.split("").map((ch, i) => (
                        <span className="lp-cmd-char" key={i}>{ch}</span>
                      ))}
                    </span>
                  </div>
                  <button
                    className={`lp-cmd-copy${copied ? " is-done" : ""}`}
                    onClick={copyCmd}
                    aria-label="انسخ الكود"
                  >{copied ? "✓ تم النسخ" : "انسخ الكود"}</button>
                </div>

                <div className="lp-cmd-label" style={{ marginTop: 18 }}><span>2</span> ارسل الكود في الشات</div>
                <a className="lp-kick-btn" href={`https://kick.com/${KICK_CHANNEL}`} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h5v6.3L12 2h6l-6.6 8L18.5 22h-6.2l-4-6-1.3 1.5V22H2V2Z"/></svg>
                  فتح الشات داخل الكيك ↗
                </a>

                <div className="lp-wait">
                  <span className="lp-wait-timer">{codeTimer}</span>
                </div>

                <div className="lp-modal-note">
                  أرسله من حساب <b>@{nameInput.trim()}</b>
                </div>

                {verifyMsg && <div className="lp-modal-err">{verifyMsg}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
