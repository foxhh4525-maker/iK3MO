import { useEffect, useMemo, useState } from "react";
import { defaultState, type TournamentState } from "@/lib/types";
import { getState, useSSE } from "@/lib/api";
import BracketDisplay from "@/components/BracketDisplay";

// 🌳 صفحة "شجرة البطولة فقط" — بدون شات، بدون سايدبار، بدون أي أدوات تحكم:
// بس شجرة البطولة، متمركزة بنص الصفحة.
//
// ثلاثة أوضاع للخلفية، وتقدر تبدّل بينها بزر جوّا الصفحة (تحت يمين/شمال) أو
// من الرابط مباشرة:
// 1) داكنة  → /bracket                  خلفية داكنة أنيقة (للمعاينة بمتصفح عادي).
// 2) شفافة  → /bracket?transparent=1    شفافة بالكامل، لمصدر متصفح (Browser Source)
//    بـ OBS/Streamlabs. المتصفح العادي ما يعرض شفافية حقيقية فيطلع أبيض — طبيعي.
// 3) خضراء  → /bracket?green=1          شاشة خضراء (Chroma Key)، لو تلتقط النافذة
//    عادي (Window Capture) وتحط فلتر Color Key بـ OBS.
//
// 🔒 زر التبديل شفافيته 6% وما يبين إلا لما تحرّك عليه الماوس، فما يظهر بالبث.
// ولو تبغى تخفيه نهائياً حط ‎?clean=1‎ بالرابط. الاختيار يُحفظ بالمتصفح
// (localStorage) فيرجع نفس الوضع لما تفتح الصفحة مرة ثانية.
const CHROMA_GREEN = "#00ff00";
const STORE_KEY = "ik3mo.bracketBg";

type Mode = "dark" | "transparent" | "green";

const MODES: { id: Mode; label: string }[] = [
  { id: "dark", label: "داكنة" },
  { id: "green", label: "خضراء" },
  { id: "transparent", label: "شفافة" },
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

  // الرابط له الأولوية على المحفوظ: لو فتحت ‎?green=1‎ يشتغل أخضر مباشرة.
  const urlMode = useMemo<Mode | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("green") === "1") return "green";
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
      if (saved === "dark" || saved === "green" || saved === "transparent") return saved;
    } catch { /* ignore */ }
    return "dark";
  });

  const pickMode = (next: Mode) => {
    setMode(next);
    try { localStorage.setItem(STORE_KEY, next); } catch { /* ignore */ }
  };

  const pageBackground =
    mode === "transparent" ? "transparent" : mode === "green" ? CHROMA_GREEN : "#060d1a";

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
      // 🎨 بوضع الشاشة الخضراء نضيف كلاس ‎green-mode‎ — وهو يخلي الشجرة بخلفيات
      // صلبة بدون شفافية ولا بلور ولا توهّج (التوهّج يخرب الـ Chroma Key)،
      // ويكبّر الخط عشان الأسماء تبين واضحة وقت تكون الشجرة على عرض الشاشة.
      className={mode === "green" ? "bracket-page green-mode" : "bracket-page"}
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
        // 🟢 قبل بدء البطولة: لو الأدمن فعّل "إظهار من بدري" نعرض بوابة
        // الانضمام على الشاشة الخضراء — عدّاد + أمر !دخول + عدد المنضمين.
        st.greenEarly ? (
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
        ) : (
          mode === "dark" && (
            <p style={{ opacity: 0.5, fontSize: "0.9rem", color: "var(--text)" }}>
              ⏳ ما فيه شجرة بطولة الآن — البطولة لسا ما بدأت
            </p>
          )
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
