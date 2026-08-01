import { useEffect, useMemo, useState } from "react";
import { defaultState, type TournamentState } from "@/lib/types";
import { getState, useSSE } from "@/lib/api";
import BracketDisplay from "@/components/BracketDisplay";

// 🌳 صفحة "شجرة البطولة فقط" — بدون شات ولا سايدبار ولا أدوات تحكم.
//
// 📺 مصمّمة لـ OBS: الصفحة **بدون خلفية** افتراضياً، فتنحط كمصدر متصفح
// (Browser Source) فوق الفيديو مباشرة وتظهر الشجرة وحدها بدون أي مستطيل
// خلفها — ما تحتاج فلتر Chroma Key ولا شاشة خضراء.
//
// الوضعان:
// 1) شفافة → /bracket              (الافتراضي — لـ OBS)
// 2) داكنة → /bracket?dark=1       (للمعاينة بمتصفح عادي فقط، لأن المتصفح
//    ما يعرض الشفافية فتطلع بيضاء)
//
// 🔒 زر التبديل شفافيته 6% وما يبين إلا لما تحرّك عليه الماوس، فما يظهر
// بالبث. ولو تبغى تخفيه نهائياً حط ‎?clean=1‎ بالرابط.

const STORE_KEY = "ik3mo.bracketBg";

type Mode = "transparent" | "dark";

const MODES: { id: Mode; label: string }[] = [
  { id: "transparent", label: "شفافة" },
  { id: "dark", label: "داكنة" },
];

export default function BracketOnlyPage() {
  const [st, setSt] = useState<TournamentState>(defaultState());
  // 🔄 جلب الحالة مرة عند الفتح — SSE يبث عند الاتصال، لكن لو تأخر أو
  // انقطع (Render cold start / إعادة تشغيل الخادم / إغلاق مصدر OBS وفتحه)
  // تظل الصفحة على الحالة الافتراضية وتقول "البطولة لسا ما بدأت" وهي بادية.
  // هذا الطلب المباشر يضمن الحالة الصحيحة فوراً.
  useEffect(() => {
    getState().then((s) => { if (s) setSt(s); }).catch(() => {});
  }, []);

  useSSE((data) => setSt(data));

  // ⏱️ نبضة كل ثانية عشان عدّاد البوابة يتحدّث
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!st.joinDeadline) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [st.joinDeadline]);

  // المدة الكلية للبوابة — تُلتقط أول ما تُفتح، لحساب نسبة الحلقة
  const [joinTotal, setJoinTotal] = useState(0);
  useEffect(() => {
    if (!st.joinDeadline) { setJoinTotal(0); return; }
    setJoinTotal(Math.max(1, Math.ceil((st.joinDeadline - Date.now()) / 1000)));
  }, [st.joinDeadline]);

  const secsLeft = st.joinDeadline ? Math.max(0, Math.ceil((st.joinDeadline - Date.now()) / 1000)) : 0;
  const gateOpen = !!st.joinDeadline && secsLeft > 0;

  // الرابط له الأولوية على المحفوظ: ‎?dark=1‎ للمعاينة، ‎?transparent=1‎ للشفافة.
  const urlMode = useMemo<Mode | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("transparent") === "1") return "transparent";
      if (params.get("dark") === "1") return "dark";
    } catch { /* ignore */ }
    return null;
  }, []);

  const hideSwitch = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("clean") === "1";
    } catch { return false; }
  }, []);

  const [mode, setMode] = useState<Mode>(() => {
    if (urlMode) return urlMode;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved === "dark" || saved === "transparent") return saved;
    } catch { /* ignore */ }
    return "transparent";   // الافتراضي: بدون خلفية (جاهزة لـ OBS)
  });

  const pickMode = (next: Mode) => {
    setMode(next);
    try { localStorage.setItem(STORE_KEY, next); } catch { /* ignore */ }
  };

  const pageBackground = mode === "transparent" ? "transparent" : "#060d1a";

  // نطبّق خلفية الصفحة (body/html) حسب الوضع، وهو بهذي الصفحة بس، ونرجّعها
  // لما نطلع منها.
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = pageBackground;
    document.documentElement.style.background = pageBackground;
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, [pageBackground]);

  return (
    <div
      // 📺 وضع OBS دايماً: خلفيات صلبة بدون شفافية ولا بلور وخط أكبر — عشان
      // الشجرة تُقرأ بوضوح فوق أي فيديو لما تنحط كمصدر متصفح بخلفية شفافة.
      className="bracket-page obs-mode"
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: pageBackground,
        padding: "20px",
      }}
    >
            {st.phase === "setup" ? (
        // 🟢 قبل بدء البطولة: نعرض بوابة الانضمام دايماً — عدّاد + أمر دخول
        // + المشاركين. ما فيه أي تفعيل يدوي، الصفحة جاهزة للبث من بدري.
        (
          <div className={`gate${st.entryLog.length > 0 ? " has-players" : ""}${!st.joinDeadline ? "" : !gateOpen ? " is-closed" : secsLeft <= 10 ? " is-hot" : ""}`}>
            {st.name && <div className="gate-title">🏆 {st.name}</div>}

            {st.joinDeadline ? (
              <>
                <div className="gate-ring" style={{ ["--p" as any]: joinTotal ? Math.max(0, secsLeft / joinTotal) : 0 }}>
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle className="gate-track" cx="60" cy="60" r="52" />
                    <circle className="gate-bar" cx="60" cy="60" r="52" />
                  </svg>
                  <div className="gate-face">
                    <div className="gate-time">
                      {gateOpen
                        ? `${String(Math.floor(secsLeft / 60)).padStart(2, "0")}:${String(secsLeft % 60).padStart(2, "0")}`
                        : "00:00"}
                    </div>
                    <div className="gate-unit">{gateOpen ? "متبقي" : "انتهى"}</div>
                  </div>
                </div>
                <div className="gate-status">
                  <span className="gate-dot" />
                  {gateOpen ? "باب الانضمام مفتوح" : "باب الانضمام مقفل"}
                </div>
                {gateOpen && <div className="gate-hint">اكتب <b>!دخول</b> بالشات عشان تنضم</div>}
              </>
            ) : (
              <>
                <div className="gate-wait" aria-hidden="true"><i /><i /><i /></div>
                <div className="gate-status"><span className="gate-dot" />في انتظار بدء البطولة</div>
              </>
            )}

            {st.entryLog.length > 0 && (
              <>
                <div className="gate-count">👥 المنضمين <span>{st.entryLog.length}</span></div>
                {/* 👥 المشاركين — نفس الشاشة تنتقل تلقائياً: انتظار ← بوابة
                    مفتوحة مع المشاركين ← الشجرة، بمصدر جرين سكرين واحد. */}
                <div className="gate-players">
                  {st.entryLog.map((e, i) => (
                    <div className="gate-player" key={i} style={{ animationDelay: `${Math.min(i, 20) * 0.035}s` }}>
                      <span className="gate-avatar">
                        {e.avatar
                          ? <img src={e.avatar} alt={e.user} referrerPolicy="no-referrer" />
                          : e.user.charAt(0).toUpperCase()}
                      </span>
                      <span className="gate-pname">{e.user}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      ) : (
        <BracketDisplay st={st} isAdmin={false} pickedMatchId={st.pickedMatchId ?? null} />
      )}

      {!hideSwitch && (
        <div className="bg-switch" title="وضع الخلفية — يظهر لما تحرّك عليه الماوس فقط">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => pickMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
