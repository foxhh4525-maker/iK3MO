import { BYE, type Match, type TournamentState } from "./types";

export function p2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function resolveChampion(rounds: Match[][]): string {
  const finalRound = rounds[rounds.length - 1];
  if (!finalRound?.length) return "";
  const winner = finalRound[0]?.winner;
  return winner && winner !== BYE ? winner : "";
}

export function buildBracket(st: TournamentState): TournamentState {
  const rounds: Match[][] = [];
  let cur = 0;
  const real = [...st.players];
  for (let i = real.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [real[i], real[j]] = [real[j], real[i]];
  }
  const total = st.bSize / 2;
  const byeSet = new Set(
    [...Array(total)]
      .map((_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, st.byeN)
  );
  const r0: Match[] = [];
  let pi = 0;
  for (let m = 0; m < total; m++) {
    if (byeSet.has(m)) {
      const p = real[pi++];
      r0.push({ a: p, b: BYE, winner: p, isBye: true });
    } else {
      r0.push({ a: real[pi++] ?? null, b: real[pi++] ?? null, winner: null, isBye: false });
    }
  }
  rounds.push(r0);
  let prev = r0.length;
  while (prev > 1) {
    const nc = Math.floor(prev / 2);
    rounds.push(Array.from({ length: nc }, () => ({ a: null, b: null, winner: null, isBye: false })));
    prev = nc;
  }
  const newSt = { ...st, rounds, cur, champion: "" };
  return propagate(newSt);
}

export function propagate(st: TournamentState): TournamentState {
  const rounds = st.rounds.map(r => r.map(m => ({ ...m })));
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, i) => {
      if (m.winner && m.winner !== BYE) {
        const nm = rounds[r + 1][Math.floor(i / 2)];
        const sl = i % 2 === 0 ? "a" : "b";
        if (nm[sl] === null || nm[sl] === BYE) nm[sl] = m.winner;
      }
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    rounds.forEach(rnd =>
      rnd.forEach(m => {
        if (m.winner) return;
        if (m.a === BYE && m.b && m.b !== BYE) { m.winner = m.b; m.isBye = true; changed = true; }
        else if (m.b === BYE && m.a && m.a !== BYE) { m.winner = m.a; m.isBye = true; changed = true; }
      })
    );
    if (changed) {
      for (let r = 0; r < rounds.length - 1; r++) {
        rounds[r].forEach((m, i) => {
          if (m.winner && m.winner !== BYE) {
            const nm = rounds[r + 1][Math.floor(i / 2)];
            const sl = i % 2 === 0 ? "a" : "b";
            if (nm[sl] === null || nm[sl] === BYE) nm[sl] = m.winner;
          }
        });
      }
    }
  }
  const champion = resolveChampion(rounds);
  let cur = st.cur;
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i].some(m => !m.winner && m.a && m.a !== BYE && m.b && m.b !== BYE)) {
      cur = i;
      return { ...st, rounds, cur, champion, lastWinner: champion || st.lastWinner, lastGameType: st.gameType || st.lastGameType, lastTournamentName: st.name || st.lastTournamentName };
    }
  }
  cur = Math.max(0, rounds.length - 1);
  return { ...st, rounds, cur, champion, lastWinner: champion || st.lastWinner, lastGameType: st.gameType || st.lastGameType, lastTournamentName: st.name || st.lastTournamentName };
}

export function doWin(st: TournamentState, rIdx: number, mIdx: number, side: "a" | "b"): TournamentState {
  const rounds = st.rounds.map(r => r.map(m => ({ ...m })));
  const match = rounds[rIdx][mIdx];
  match.winner = match[side];
  if (rIdx + 1 < rounds.length) {
    const nm = rounds[rIdx + 1][Math.floor(mIdx / 2)];
    const sl = mIdx % 2 === 0 ? "a" : "b";
    nm[sl] = match.winner;
  }
  return propagate({ ...st, rounds });
}

export function setSize(st: TournamentState, n: number): TournamentState {
  const size = Math.max(2, Math.min(128, n));
  const bSize = p2(size);
  const byeN = bSize - size;
  return { ...st, size, bSize, byeN };
}

export function rTitle(ri: number, total: number): string {
  const rem = total - ri;
  if (rem === 1) return "النهائي 🏆";
  if (rem === 2) return "نصف النهائي";
  if (rem === 3) return "ربع النهائي";
  if (rem === 4) return "دور الـ 16";
  if (rem === 5) return "دور الـ 32";
  if (rem === 6) return "دور الـ 64";
  return `الجولة ${ri + 1}`;
}

export function getOpenMatches(st: TournamentState) {
  const r = st.rounds[st.cur];
  if (!r) return [];
  return r.map((m, i) => ({ m, i })).filter(({ m }) =>
    !m.winner && m.a && m.a !== BYE && m.b && m.b !== BYE
  );
}
