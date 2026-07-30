import { useMemo, useRef, useState } from "react";

// 🎡 عجلة الأسماء — نفس فكرة wheelofnames.com: تكتب/تجيب أسماء، العجلة تنقسم
// لقطاعات ملوّنة بعدد الأسماء، تدور بفيزياء تباطؤ واقعية (سرعة عالية تتباطأ
// تدريجيًا)، وتوقف على اسم عشوائي واحد يحدده المؤشر الثابت فوق. مفيدة للأدمن
// عشان يختار بشكل عشوائي وعادل (مين يبدأ، مين يلعب مين، سحب على جائزة... إلخ)
// بدون ما يحتاج موقع خارجي.

const PALETTE = [
  "#f59e0b", "#8b5cf6", "#0ea5e9", "#22c55e",
  "#ef4444", "#ec4899", "#14b8a6", "#64748b",
];

interface NameWheelProps {
  initialNames: string[];
  onClose: () => void;
}

interface ConfettiPiece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  rotate: number;
}

export default function NameWheel({ initialNames, onClose }: NameWheelProps) {
  const [names, setNames] = useState<string[]>(() => Array.from(new Set(initialNames.filter(Boolean))));
  const [rawText, setRawText] = useState(() => names.join("\n"));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [removeAfterSpin, setRemoveAfterSpin] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const n = names.length;
  const sliceAngle = n > 0 ? 360 / n : 0;

  // 🎨 نبني تدرّج مخروطي (conic-gradient) يقسّم الدائرة لقطاعات بعدد الأسماء
  const wheelBackground = useMemo(() => {
    if (n === 0) return "#1a2233";
    if (n === 1) return PALETTE[0];
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
      const color = PALETTE[i % PALETTE.length];
      stops.push(`${color} ${i * sliceAngle}deg ${(i + 1) * sliceAngle}deg`);
    }
    return `conic-gradient(${stops.join(",")})`;
  }, [n, sliceAngle]);

  function applyText(value: string) {
    setRawText(value);
  }

  function commitText() {
    const list = Array.from(
      new Set(
        rawText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    setNames(list);
  }

  function loadFromJoined() {
    const list = Array.from(new Set(initialNames.filter(Boolean)));
    setNames(list);
    setRawText(list.join("\n"));
  }

  function clearAll() {
    setNames([]);
    setRawText("");
  }

  function spin() {
    if (spinning || n < 2) return;
    setWinner(null);
    setConfetti([]);
    const idx = Math.floor(Math.random() * n);
    const targetCenter = (idx + 0.5) * sliceAngle; // زاوية مركز القطاع بالنسبة لأعلى الدائرة (المؤشر)
    const neededMod = (360 - targetCenter) % 360; // كم درجة نلف عشان هذا القطاع يوصل تحت المؤشر
    const extraSpins = 5 + Math.floor(Math.random() * 4); // 5-8 لفات كاملة زيادة، عشان التأثير البصري
    const base = rotation - (rotation % 360);
    const newRotation = base + extraSpins * 360 + neededMod;
    const duration = 4200 + Math.floor(Math.random() * 900);

    setSpinning(true);
    setRotation(newRotation);

    if (spinTimeout.current) clearTimeout(spinTimeout.current);
    spinTimeout.current = setTimeout(() => {
      setSpinning(false);
      const pickedName = names[idx];
      setWinner(pickedName);
      launchConfetti();
      if (removeAfterSpin) {
        setNames((prev) => prev.filter((_, i) => i !== idx));
        setRawText(names.filter((_, i) => i !== idx).join("\n"));
      }
    }, duration);
  }

  function launchConfetti() {
    const pieces: ConfettiPiece[] = Array.from({ length: 46 }, (_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 100,
      color: PALETTE[i % PALETTE.length],
      delay: Math.random() * 0.3,
      duration: 1.6 + Math.random() * 1.1,
      rotate: Math.random() * 360,
    }));
    setConfetti(pieces);
    setTimeout(() => setConfetti([]), 3000);
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}
    >
      <style>{`
        @keyframes wheelConfettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
        }
        @keyframes wheelWinnerPop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .wheel-confetti-piece{
          position:absolute; top:0; width:9px; height:14px; border-radius:2px;
          animation-name: wheelConfettiFall; animation-timing-function: ease-in; animation-fill-mode: forwards;
          pointer-events:none;
        }
        .wheel-name-list::-webkit-scrollbar{width:5px}
        .wheel-name-list::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel, #12161f)",
          borderRadius: "20px",
          padding: "22px",
          width: "100%",
          maxWidth: "780px",
          border: "1px solid rgba(255,255,255,0.14)",
          display: "flex",
          flexWrap: "wrap",
          gap: "22px",
          position: "relative",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          aria-label="إغلاق"
          style={{ position: "absolute", top: "14px", left: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "10px", width: "32px", height: "32px", color: "#fff", cursor: "pointer", fontSize: "1rem" }}
        >✕</button>

        {/* ===== العجلة نفسها ===== */}
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", position: "relative" }}>
          <div style={{ fontWeight: 900, fontSize: "1.15rem", color: "var(--gold)" }}>🎡 عجلة الأسماء</div>

          <div style={{ position: "relative", width: "290px", height: "290px" }}>
            {/* المؤشر الثابت فوق العجلة */}
            <div
              style={{
                position: "absolute", top: "-6px", left: "50%", transform: "translateX(-50%)",
                width: 0, height: 0, zIndex: 5,
                borderLeft: "14px solid transparent", borderRight: "14px solid transparent",
                borderTop: "22px solid var(--gold)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            />
            <div
              style={{
                width: "290px", height: "290px", borderRadius: "50%",
                background: wheelBackground,
                border: "6px solid rgba(255,255,255,0.14)",
                boxShadow: "0 0 0 3px rgba(41,182,246,0.35), 0 18px 40px rgba(0,0,0,0.45)",
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? "transform 4.6s cubic-bezier(0.17,0.67,0.14,1)" : "none",
                position: "relative",
              }}
            >
              {names.map((name, i) => {
                const mid = (i + 0.5) * sliceAngle;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute", top: "50%", left: "50%",
                      width: "50%", height: 0,
                      transform: `rotate(${mid}deg)`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute", left: "78px", top: "-8px",
                        color: "#fff", fontWeight: 800, fontSize: "0.7rem",
                        textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                        maxWidth: "62px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      {name}
                    </span>
                  </div>
                );
              })}
              {n === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.8rem", textAlign: "center", padding: "20px" }}>
                  ضيف أسماء عشان تقدر تدوّر العجلة
                </div>
              )}
            </div>

            {/* 🎊 كونفيتي بسيط عند ظهور الفائز */}
            {confetti.map((p) => (
              <div
                key={p.id}
                className="wheel-confetti-piece"
                style={{
                  left: `${p.left}%`,
                  background: p.color,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  transform: `rotate(${p.rotate}deg)`,
                }}
              />
            ))}
          </div>

          <button
            className="btn btn-primary"
            disabled={spinning || n < 2}
            onClick={spin}
            style={{ padding: "10px 32px", fontSize: "0.95rem", opacity: spinning || n < 2 ? 0.5 : 1, cursor: spinning || n < 2 ? "not-allowed" : "pointer" }}
          >
            {spinning ? "⏳ جاري الدوران..." : "🎡 دوّر العجلة"}
          </button>

          {winner && !spinning && (
            <div
              style={{
                animation: "wheelWinnerPop 0.4s ease-out",
                background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,215,0,0.05))",
                border: "1px solid rgba(255,215,0,0.5)",
                borderRadius: "14px",
                padding: "12px 22px",
                textAlign: "center",
                minWidth: "220px",
              }}
            >
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "4px" }}>🏆 الفائز بالعجلة</div>
              <div style={{ fontWeight: 900, fontSize: "1.2rem", color: "var(--gold)" }}>{winner}</div>
            </div>
          )}

          {n < 2 && (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center" }}>
              لازم اسمين على الأقل عشان تدوّر العجلة
            </p>
          )}
        </div>

        {/* ===== إدارة قائمة الأسماء ===== */}
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "10px", minWidth: "240px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>📋 الأسماء ({n})</span>
            <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: "0.75rem" }} onClick={loadFromJoined} title="يجيب قائمة اللاعبين المنضمين حاليًا بالبطولة">
              🔄 من اللاعبين المنضمين
            </button>
          </div>

          <textarea
            className="n-input wheel-name-list"
            style={{ width: "100%", minHeight: "170px", resize: "vertical", fontFamily: "inherit", padding: "10px", lineHeight: 1.6 }}
            placeholder={"اكتب اسم بكل سطر...\nمثال:\nأحمد\nسارة\nخالد"}
            value={rawText}
            onChange={(e) => applyText(e.target.value)}
            onBlur={commitText}
          />

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-ghost" style={{ flex: 1, padding: "8px", fontSize: "0.8rem" }} onClick={commitText}>✅ تحديث القائمة</button>
            <button className="btn btn-ghost" style={{ flex: 1, padding: "8px", fontSize: "0.8rem" }} onClick={clearAll}>🧹 مسح الكل</button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--muted)", cursor: "pointer", marginTop: "4px" }}>
            <input type="checkbox" checked={removeAfterSpin} onChange={(e) => setRemoveAfterSpin(e.target.checked)} />
            إزالة الفائز من العجلة بعد كل دورة (سحب بدون تكرار)
          </label>
        </div>
      </div>
    </div>
  );
}