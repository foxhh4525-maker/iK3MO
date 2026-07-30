import { useEffect, useMemo, useState } from "react";
import { defaultState, type TournamentState } from "@/lib/types";
import { useSSE } from "@/lib/api";
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
  useSSE((data) => setSt(data));

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
        mode === "dark" && (
          <p style={{ opacity: 0.5, fontSize: "0.9rem", color: "var(--text)" }}>
            ⏳ ما فيه شجرة بطولة الآن — البطولة لسا ما بدأت
          </p>
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
