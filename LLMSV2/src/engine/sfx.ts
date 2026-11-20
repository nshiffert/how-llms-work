import { getLearner } from './learner';

/** Tiny synthesized UI sounds. No audio files; nothing plays until the first user gesture. */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!getLearner().sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; to?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const peak = opts.gain ?? 0.05;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let lastTick = 0;

export const sfx = {
  tap: () => tone(520, 0.06, { type: 'triangle', gain: 0.03 }),
  /** Throttled tick for sliders; pitch follows the 0..1 value. */
  tick: (v = 0.5) => {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    tone(260 + v * 520, 0.035, { type: 'sine', gain: 0.018 });
  },
  correct: () => {
    tone(660, 0.12, { type: 'triangle' });
    tone(990, 0.2, { type: 'triangle', delay: 0.09 });
  },
  wrong: () => tone(220, 0.22, { type: 'sine', gain: 0.05, to: 150 }),
  mission: () => {
    tone(784, 0.09, { type: 'sine', gain: 0.04 });
    tone(1175, 0.16, { type: 'sine', gain: 0.04, delay: 0.07 });
  },
  complete: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', delay: i * 0.09, gain: 0.045 }));
  },
  whoosh: () => tone(180, 0.25, { type: 'sine', gain: 0.03, to: 520 }),
};
