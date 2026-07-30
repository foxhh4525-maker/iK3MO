let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function osc(
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainStart: number,
  gainEnd: number,
  ac: AudioContext,
  dest: AudioNode
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(frequency, startTime);
  g.gain.setValueAtTime(gainStart, startTime);
  g.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), startTime + duration);
  o.connect(g);
  g.connect(dest);
  o.start(startTime);
  o.stop(startTime + duration);
}

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem("ik3mo_sound") !== "false"; } catch { return true; }
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  try { localStorage.setItem("ik3mo_sound", String(next)); } catch {}
  return next;
}

/** short tick for slot machine rolling */
export function playTick() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    osc(800, "square", ac.currentTime, 0.04, 0.06, 0.001, ac, ac.destination);
  } catch {}
}

/** slot locked in */
export function playLock() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    osc(440, "sine", t, 0.08, 0.18, 0.001, ac, ac.destination);
    osc(660, "sine", t + 0.06, 0.12, 0.22, 0.001, ac, ac.destination);
    osc(880, "sine", t + 0.14, 0.18, 0.28, 0.001, ac, ac.destination);
  } catch {}
}

/** player wins a match */
export function playWin() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const freqs = [523, 659, 784, 1046];
    freqs.forEach((f, i) => {
      osc(f, "sine", t + i * 0.07, 0.22, 0.3, 0.001, ac, ac.destination);
    });
  } catch {}
}

/** champion crowned */
export function playChampion() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const notes = [523, 659, 784, 1046, 1318, 1568];
    notes.forEach((f, i) => {
      osc(f, "sawtooth", t + i * 0.09, 0.35, 0.22, 0.001, ac, ac.destination);
    });
    osc(80, "sine", t, 0.6, 0.45, 0.001, ac, ac.destination);
    osc(80, "sine", t + 0.3, 0.6, 0.35, 0.001, ac, ac.destination);
  } catch {}
}

/** tournament started */
export function playStart() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    osc(220, "sine", t, 0.15, 0.3, 0.001, ac, ac.destination);
    osc(330, "sine", t + 0.1, 0.2, 0.35, 0.001, ac, ac.destination);
    osc(440, "sine", t + 0.22, 0.3, 0.4, 0.001, ac, ac.destination);
    osc(660, "triangle", t + 0.38, 0.35, 0.4, 0.001, ac, ac.destination);
  } catch {}
}

/** error / wrong */
export function playError() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    osc(200, "sawtooth", t, 0.12, 0.2, 0.001, ac, ac.destination);
    osc(150, "sawtooth", t + 0.1, 0.18, 0.2, 0.001, ac, ac.destination);
  } catch {}
}
