import { BYE, type Match, type TournamentState } from "@/lib/types";
import { rTitle } from "@/lib/tournament";

interface BracketDisplayProps {
  st: TournamentState;
  isAdmin: boolean;
  pickedMatchId: string | null;
  onWin?: (rIdx: number, mIdx: number, side: "a" | "b") => void;
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
    >
      {isBye ? "🟦 بايب" : isEmpty ? "—" : name}
    </div>
  );
}

export default function BracketDisplay({ st, isAdmin, pickedMatchId, onWin }: BracketDisplayProps) {
  const { rounds, cur } = st;
  const total = rounds.length;
  const last = total - 1;

  if (!rounds.length) return null;

  type Col = { side: "left" | "center" | "right"; ri: number; s: number; e: number };
  const cols: Col[] = [];
  for (let r = 0; r < last; r++) {
    const h = Math.floor(rounds[r].length / 2);
    cols.push({ side: "left", ri: r, s: 0, e: h });
  }
  cols.push({ side: "center", ri: last, s: 0, e: rounds[last].length });
  for (let r = last - 1; r >= 0; r--) {
    const h = Math.floor(rounds[r].length / 2);
    cols.push({ side: "right", ri: r, s: h, e: rounds[r].length });
  }

  const lr = rounds[rounds.length - 1];
  const champion = lr.length === 1 && lr[0].winner && lr[0].winner !== BYE ? lr[0].winner : null;

  return (
    <>
      <div className="bracket-scroll">
        <div className="bracket">
          {cols.map((col, ci) => (
            <div key={ci} className={`round r-${col.side}`}>
              <div className="round-title">
                {col.side === "center" ? "🏆 النهائي 🏆" : rTitle(col.ri, total)}
              </div>
              <div className="matches">
                {rounds[col.ri].slice(col.s, col.e).map((match, mi) => {
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
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {champion && (
        <div className="champion">
          <h2>🎉 بطل البطولة 🎉</h2>
          <div className="champ-name">{champion}</div>
          <div className="conf">✨ 🏆 ✨</div>
        </div>
      )}
    </>
  );
}
