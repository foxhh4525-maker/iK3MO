import { WINNER_THEMES, type Winner } from "@/lib/types";

interface Props {
  winners: Winner[];
  title?: string;
  onView?: (winner: Winner) => void;
  onDelete?: (winner: Winner) => void;
  onEdit?: (winner: Winner) => void; // يفتح لوحة تخصيص الفائز (أدمن فقط)
}

function themeFor(key?: string) {
  return WINNER_THEMES.find(t => t.key === key) || WINNER_THEMES[0];
}

export default function WinnerHistoryBar({ winners, title = "الفائزون السابقون", onView, onDelete, onEdit }: Props) {
  const safeWinners = winners || [];

  return (
    <div style={{ marginBottom: "18px", borderRadius: "22px", padding: "16px 18px", background: "rgba(0,0,0,0.58)", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 16px 40px rgba(0,0,0,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>{safeWinners.length} سجل</div>
      </div>

      {safeWinners.length ? (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {safeWinners.slice(0, 6).map((winner, idx) => {
            const theme = themeFor(winner.color);
            const clickable = !!onView && !!winner.archiveId;
            return (
              <div
                key={`${winner.name}-${winner.date}-${idx}`}
                onClick={() => clickable && onView && onView(winner)}
                style={{
                  borderRadius: "18px",
                  padding: "14px",
                  background: theme.gradient,
                  boxShadow: `0 12px 30px ${theme.glow}`,
                  cursor: clickable ? "pointer" : "default",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", inset: "-16px auto auto -16px", width: "110px", height: "110px", borderRadius: "50%", background: "rgba(255,255,255,0.14)", filter: "blur(4px)" }} />

                {(onDelete || onEdit) && (
                  <div style={{ position: "absolute", top: "8px", left: "8px", display: "flex", gap: "6px", zIndex: 2 }}>
                    {onEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(winner); }}
                        title="تخصيص"
                        style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >🎨</button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(winner); }}
                        title="حذف"
                        style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.35)", color: "#fecaca", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >✕</button>
                    )}
                  </div>
                )}

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
                      {winner.emoji || "🏆"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: "1.02rem", color: "#fff" }}>{winner.name}</div>
                      {winner.badgeText && (
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.22)", display: "inline-block", padding: "2px 8px", borderRadius: "999px", marginTop: "2px" }}>
                          {winner.badgeText}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.84rem", color: "rgba(255,255,255,0.92)", marginBottom: "2px" }}>{winner.tournamentName || "بطولة"}</div>
                  <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)" }}>{winner.gameType || "بطولة عامة"}</div>
                  {clickable && (
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.75)", marginTop: "8px" }}>اضغط لعرض جدول البطولة كامل ↗</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>لا يوجد فائزون سابقون بعد.</div>
      )}
    </div>
  );
}
