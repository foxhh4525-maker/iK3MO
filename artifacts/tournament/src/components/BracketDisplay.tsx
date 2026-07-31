import type { CSSProperties } from "react";
import { BYE, type Match, type TournamentState } from "@/lib/types";
import { rTitle } from "@/lib/tournament";

/* ⚙️ إعداد شكل الشجرة — غيّر السطرين هذي بس:
 *
 * LAYOUT = "linear"  → شجرة باتجاه واحد: الجولة الأولى بأول الصفحة والنهائي
 *                      بآخرها. مع FINAL_SIDE="right" يطلع النهائي على اليمين.
 * LAYOUT = "mirror"  → الشكل القديم: نصف الشجرة يمين ونصفها يسار والنهائي بالنص
 *                      (أقصر بالطول، مناسب لو عدد اللاعبين كبير 32+).
 *
 * FINAL_SIDE يشتغل مع "linear" فقط:
 *   "right" → الجولة الأولى يسار ← والنهائي يمين
 *   "left"  → الجولة الأولى يمين ← والنهائي يسار (الترتيب العربي الطبيعي)
 */
const LAYOUT: "linear" | "mirror" = "linear";
const FINAL_SIDE: "right" | "left" = "right";

interface BracketDisplayProps {
  st: TournamentState;
  isAdmin: boolean;
  pickedMatchId: string | null;
  onWin?: (rIdx: number, mIdx: number, side: "a" | "b") => void;
}

// 🔤 أول حرف من الاسم — يطلع بمربع صغير جنب الاسم عشان الشريحة تبين أوضح
// وأسرع للقراءة على البث.
function initial(name: string): string {
  const clean = name.trim().replace(/^[^\p{L}\p{N}]+/u, "");
  return (clean[0] || name.trim()[0] || "?").toUpperCase();
}

function PlayerRow({
  name, match, side, rIdx, mIdx, cur, isAdmin, onWin, pickedMatchId,
}: {
  name: string | null;
  match: Match;
  side: "a" | "b";
  rIdx: number;
  mIdx: number;
  cur: number;
  isAdmin: boolean;
  onWin?: (rIdx: number, mIdx: number, side: "a" | "b") => void;
  pickedMatchId: string | null;
}) {
  const isBye = name === BYE;
  const isEmpty = !name;
  const isW = !!match.winner && match.winner === name && name !== BYE;
  const isL = !!match.winner && match.winner !== name && !!name && name !== BYE;
  // لو فيه ماتش محدد عشوائياً (إطار أصفر)، ما ينفع الضغط على فوز أي ماتش ثاني غيره
  const isLockedByPick = !!pickedMatchId && pickedMatchId !== `${rIdx}-${mIdx}`;
  const canClick =
    isAdmin &&
    rIdx === cur &&
    !match.winner &&
    name &&
    name !== BYE &&
    match.a &&
    match.a !== BYE &&
    match.b &&
    match.b !== BYE &&
    !isLockedByPick;

  let cls = "player";
  if (isW) cls += " winner";
  else if (isL) cls += " loser";
  if (isBye) cls += " bye-slot";
  else if (isEmpty) cls += " empty";
  else if (!canClick && !isW && !isL) cls += " locked";

  return (
    <div
      className={cls}
      onClick={() => canClick && onWin?.(rIdx, mIdx, side)}
      title={!isBye && !isEmpty && name ? name : undefined}
    >
      <span className="p-badge" aria-hidden="true">
        {isBye ? "◇" : isEmpty ? "?" : initial(name as string)}
      </span>
      <span className="p-name">{isBye ? "بايب" : isEmpty ? "في الانتظار" : name}</span>
      {isW && <span className="p-mark">👑</span>}
    </div>
  );
}

export default function BracketDisplay({ st, isAdmin, pickedMatchId, onWin }: BracketDisplayProps) {
  const { rounds, cur } = st;
  const total = rounds.length;
  const last = total - 1;

  if (!rounds.length) return null;

  // fwd = عمود عادي (الوصلة تطلع منه للأمام) · center = عمود النهائي
  type Col = { side: "fwd" | "center" | "left" | "right"; ri: number; s: number; e: number };
  const cols: Col[] = [];

  if (LAYOUT === "linear") {
    // كل جولة بعمود واحد كامل، والنهائي آخر عمود
    for (let r = 0; r < last; r++) cols.push({ side: "fwd", ri: r, s: 0, e: rounds[r].length });
    cols.push({ side: "center", ri: last, s: 0, e: rounds[last].length });
  } else {
    // الشكل القديم: نصف يمين + النهائي بالنص + نصف يسار
    for (let r = 0; r < last; r++) {
      const h = Math.floor(rounds[r].length / 2);
      cols.push({ side: "left", ri: r, s: 0, e: h });
    }
    cols.push({ side: "center", ri: last, s: 0, e: rounds[last].length });
    for (let r = last - 1; r >= 0; r--) {
      const h = Math.floor(rounds[r].length / 2);
      cols.push({ side: "right", ri: r, s: h, e: rounds[r].length });
    }
  }

  const lr = rounds[rounds.length - 1];
  const champion = lr.length === 1 && lr[0].winner && lr[0].winner !== BYE ? lr[0].winner : null;

  const bracketCls =
    LAYOUT === "linear"
      ? `bracket linear ${FINAL_SIDE === "right" ? "final-right" : "final-left"}`
      : "bracket mirror";

  return (
    <>
      <div className="bracket-scroll">
        <div className={bracketCls}>
          {cols.map((col, ci) => {
            const slice = rounds[col.ri].slice(col.s, col.e);
            // 📐 مفتاح المحاذاة: المسافة بين مباريات كل جولة تتضاعف مع كل دور
            // (‎2^ri‎)، فيصير مركز كل مباراة بالضبط بمنتصف المباراتين اللي
            // قبلها — وهذا اللي يخلي خطوط الربط تطلع شجرة مستقيمة مضبوطة.
            const matchesStyle = { "--k": String(2 ** col.ri) } as CSSProperties;

            return (
              <div key={ci} className={`round r-${col.side}`}>
                {/* 📐 رأس العمود بارتفاع ثابت لكل الجولات (--head-h) والمحتوى
                    مرصوص لأسفله. كذا مركز كل مباراة يبقى بنفس الارتفاع
                    بكل الأعمدة، وظهور اسم الفائز ما ينزّل مباراة النهائي
                    ولا يفكّ خط الربط عن آخر اسمين. */}
                <div className="round-head">
                  {col.side === "center" ? (
                    <>
                      <div className={`final-cup${champion ? " is-won" : ""}`} aria-hidden="true">🏆</div>
                      <div className="round-title">النهائي</div>
                      {champion && (
                        <div className="champ-slot">
                          <div className="champ-banner">
                            <span className="champ-winner">{champion}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="round-title">{rTitle(col.ri, total)}</div>
                  )}
                </div>

                <div className="matches" style={matchesStyle}>
                  {slice.map((match, mi) => {
                    const m = col.s + mi;
                    const ready =
                      col.ri === cur &&
                      !match.winner &&
                      match.a && match.a !== BYE &&
                      match.b && match.b !== BYE;
                    const isPicked = pickedMatchId === `${col.ri}-${m}`;
                    let cls = "match";
                    if (ready) cls += " ready";
                    if (match.winner) cls += " done";
                    if (match.isBye) cls += " bye-match";
                    if (col.side === "center") cls += " final-match";
                    if (isPicked) cls += " picked-match";
                    // خطوط الربط: كل مباراة (غير النهائي) تطلع منها وصلة تجاه
                    // الدور اللي بعده، وأعلى مباراة بكل زوج ترسم الخط العمودي
                    // اللي يجمع الزوج.
                    if (col.side !== "center") {
                      if (slice.length === 1) cls += " solo";
                      else if (m % 2 === 0) cls += " pair-top";
                    }

                    return (
                      <div key={m} className={cls} data-r={col.ri} data-m={m}>
                        <PlayerRow
                          name={match.a}
                          match={match}
                          side="a"
                          rIdx={col.ri}
                          mIdx={m}
                          cur={cur}
                          isAdmin={isAdmin}
                          onWin={onWin}
                          pickedMatchId={pickedMatchId}
                        />
                        <div className="vs-line" aria-hidden="true"><span>VS</span></div>
                        <PlayerRow
                          name={match.b}
                          match={match}
                          side="b"
                          rIdx={col.ri}
                          mIdx={m}
                          cur={cur}
                          isAdmin={isAdmin}
                          onWin={onWin}
                          pickedMatchId={pickedMatchId}
                        />
                        {col.side !== "center" && <span className="conn" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
