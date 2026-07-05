import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the Distillation lesson. A fixed teacher distribution
// over {cat, dog, bird} (0.7 / 0.2 / 0.1) is the target; the student starts
// far off (0.2 / 0.3 / 0.5) and each Step does one true gradient-descent
// update on its logits — dKL/dz = q − p, lr = 1 — so the trace here IS the
// worked example in the prose. A temperature slider softens the teacher
// target (both softmaxes run at T), and a target toggle swaps the soft
// distribution for the one-hot hard label so you can see exactly what signal
// disappears. Changing T or the target resets training.

const TOKENS = ['cat', 'dog', 'bird'];
const TEACHER_RAW = [0.7, 0.2, 0.1];
const TEACHER_LOGITS = TEACHER_RAW.map((p) => Math.log(p));
const STUDENT_INIT_LOGITS = [0.2, 0.3, 0.5].map((p) => Math.log(p));
const EPS = 1e-9;
const MAX_HIST = 200;
const AUTO_PAUSE_KL = 5e-5;

function softmax(z: number[], T: number): number[] {
  const m = Math.max(...z.map((x) => x / T));
  const e = z.map((x) => Math.exp(x / T - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

// KL(p‖q) term by term; a p(i)=0 term contributes exactly 0 (hard-label mode).
function klTerms(p: number[], q: number[]): number[] {
  return p.map((pi, i) => (pi <= EPS ? 0 : pi * Math.log(pi / Math.max(q[i], EPS))));
}

type Mode = 'soft' | 'hard';

type Lab = { z: number[]; hist: number[]; step: number };

function targetFor(mode: Mode, T: number): number[] {
  return mode === 'soft' ? softmax(TEACHER_LOGITS, T) : [1, 0, 0];
}

function initLab(mode: Mode, T: number): Lab {
  const target = targetFor(mode, T);
  const q = softmax(STUDENT_INIT_LOGITS, T);
  const k = klTerms(target, q).reduce((a, b) => a + b, 0);
  return { z: [...STUDENT_INIT_LOGITS], hist: [k], step: 0 };
}

function fmtProb(p: number): string {
  return p < 0.01 ? p.toFixed(3) : p.toFixed(2);
}

function DistBars({
  label,
  labelClass,
  dist,
  fill,
  note,
}: {
  label: string;
  labelClass: string;
  dist: number[];
  fill: string;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={`text-2xs font-medium uppercase tracking-wider ${labelClass}`}>
          {label}
        </span>
        {note && <span className="font-mono text-2xs text-fg-faint">{note}</span>}
      </div>
      <div className="space-y-1.5">
        {dist.map((v, i) => (
          <div key={TOKENS[i]} className="flex items-center gap-2">
            <span className="w-10 shrink-0 font-mono text-xs text-fg-faint">{TOKENS[i]}</span>
            <div className="relative h-5 flex-1 rounded bg-ink-600">
              <motion.div
                className="absolute inset-y-0.5 left-0 rounded-sm"
                style={{ background: fill }}
                animate={{ width: `${v * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
            <span className="tabular w-12 shrink-0 text-right font-mono text-xs text-fg">
              {fmtProb(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DistillationLab() {
  const [T, setT] = useState(1);
  const [mode, setMode] = useState<Mode>('soft');
  const [playing, setPlaying] = useState(false);
  const [lab, setLab] = useState<Lab>(() => initLab('soft', 1));

  // Hard labels are one-hot: temperature has nothing to soften, so pin T=1.
  const Teff = mode === 'hard' ? 1 : T;
  const target = targetFor(mode, Teff);
  const student = softmax(lab.z, Teff);
  const terms = klTerms(target, student);
  const kl = terms.reduce((a, b) => a + b, 0);

  const advance = () =>
    setLab((prev) => {
      const q = softmax(prev.z, Teff);
      const z = prev.z.map((zi, i) => zi - (q[i] - target[i])); // dKL/dz = q − p
      const k = klTerms(target, softmax(z, Teff)).reduce((a, b) => a + b, 0);
      return { z, hist: [...prev.hist.slice(-(MAX_HIST - 1)), k], step: prev.step + 1 };
    });

  const resetTo = (m: Mode, t: number) => {
    setPlaying(false);
    setLab(initLab(m, m === 'hard' ? 1 : t));
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(advance, 350);
    return () => clearInterval(id);
    // Teff/mode changes reset the lab and re-arm the interval with fresh closures.
  }, [playing, Teff, mode]);

  useEffect(() => {
    if (playing && lab.hist[lab.hist.length - 1] < AUTO_PAUSE_KL) setPlaying(false);
  }, [playing, lab]);

  // Sparkline: log scale so the exponential decay reads as a steady slide.
  const hist = lab.hist;
  const lo = 1e-4;
  const hi = Math.max(hist[0], 0.01);
  const pts = hist
    .map((v, i) => {
      const x = hist.length > 1 ? (i / (hist.length - 1)) * 100 : 0;
      const f = (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
      return `${x.toFixed(2)},${(30 - f * 28).toFixed(2)}`;
    })
    .join(' ');

  const klColor = kl < 0.01 ? '#5eead4' : kl < 0.3 ? '#fbbf24' : '#f87171';
  const termScale = Math.max(0.4, ...terms.map((t) => Math.abs(t)));

  return (
    <div className="font-sans text-sm">
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={advance}
            disabled={playing}
            className="rounded border border-line bg-ink-700/60 px-2.5 py-1 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-40"
          >
            step
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded border border-line bg-ink-700/60 px-2.5 py-1 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {playing ? '❚❚ pause' : '▶ train'}
          </button>
          <button
            onClick={() => resetTo(mode, T)}
            className="rounded border border-line bg-ink-700/60 px-2.5 py-1 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            reset
          </button>
          <span className="tabular ml-1 font-mono text-2xs text-fg-faint">
            step {lab.step}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="distill-T" className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
            temperature
          </label>
          <input
            id="distill-T"
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={T}
            disabled={mode === 'hard'}
            onChange={(e) => {
              const t = Number(e.target.value);
              setT(t);
              resetTo(mode, t);
            }}
            className="w-28 accent-[#6ea8fe] disabled:opacity-40"
          />
          <span className="tabular w-10 font-mono text-2xs text-fg-muted">
            T = {T.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">target</span>
          {(['soft', 'hard'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                resetTo(m, T);
              }}
              className={`rounded border px-2 py-0.5 font-mono text-2xs transition-colors ${
                mode === m
                  ? 'border-accent bg-ink-700 text-fg'
                  : 'border-line bg-ink-700/60 text-fg-muted hover:border-accent hover:text-fg'
              }`}
            >
              {m === 'soft' ? 'teacher soft labels' : 'hard label "cat"'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: the two distributions */}
        <div className="space-y-4">
          <DistBars
            label={mode === 'soft' ? 'teacher target' : 'hard-label target'}
            labelClass="text-live"
            dist={target}
            fill="rgba(94,234,212,0.55)"
            note={
              mode === 'soft'
                ? Teff === 1
                  ? 'softmax at T = 1'
                  : `softened: raw is 0.70 / 0.20 / 0.10`
                : 'one-hot — dog and bird are 0'
            }
          />
          <DistBars
            label="student"
            labelClass="text-accent"
            dist={student}
            fill="rgba(110,168,254,0.45)"
            note={`softmax of its logits at T = ${Teff.toFixed(1)}`}
          />
          <p className="text-2xs leading-snug text-fg-faint">
            Each step is one gradient-descent update on the student's three logits:
            <span className="font-mono text-fg-muted"> z ← z − (q − p)</span>. Changing the
            temperature or the target resets training so the runs are comparable.
          </p>
        </div>

        {/* Right: KL breakdown + training curve */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 font-mono text-xs font-medium text-fg">
            KL(target<span className="text-fg-faint">‖</span>student) = Σ p(i)·ln p(i)/q(i)
          </div>

          <div className="space-y-1.5">
            {TOKENS.map((tok, i) => {
              const t = terms[i];
              const w = Math.min(Math.abs(t) / termScale, 1) * 50;
              const zeroed = target[i] <= EPS;
              return (
                <div key={tok} className="flex items-center gap-2 font-mono text-2xs">
                  <span className="w-9 shrink-0 text-fg-faint">{tok}</span>
                  <span className="tabular w-24 shrink-0 text-fg-muted">
                    {zeroed ? '0 · (no term)' : `${fmtProb(target[i])}·ln(${fmtProb(target[i])}/${fmtProb(student[i])})`}
                  </span>
                  <div className="relative h-4 flex-1 rounded bg-ink-600">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                    <motion.div
                      className="absolute inset-y-0.5 rounded-sm"
                      style={{
                        background: t >= 0 ? 'rgba(251,191,36,0.6)' : 'rgba(125,133,144,0.5)',
                      }}
                      animate={
                        t >= 0
                          ? { left: '50%', width: `${w}%` }
                          : { left: `${50 - w}%`, width: `${w}%` }
                      }
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  </div>
                  <span
                    className="tabular w-14 shrink-0 text-right"
                    style={{ color: t >= 0 ? '#fbbf24' : '#7d8590' }}
                  >
                    {t >= 0 ? '+' : ''}
                    {t.toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-line bg-ink-900/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-fg-muted">KL now</span>
              <span
                className="tabular font-mono text-2xl font-semibold"
                style={{ color: klColor }}
              >
                {kl.toFixed(4)}
              </span>
            </div>
            <div className="mt-2">
              <svg
                viewBox="0 0 100 32"
                preserveAspectRatio="none"
                className="h-12 w-full"
                role="img"
                aria-label={`Training curve: KL divergence over ${lab.step} steps, currently ${kl.toFixed(4)} nats`}
              >
                <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(125,133,144,0.35)" strokeWidth="0.5" />
                {hist.length > 1 && (
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="#5eead4"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              <div className="flex justify-between font-mono text-2xs text-fg-faint">
                <span>nats, log scale · floor 10⁻⁴</span>
                <span>{lab.step} steps</span>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {mode === 'hard' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <p className="mt-3 font-mono text-2xs leading-snug" style={{ color: '#fbbf24' }}>
                  The dog and bird terms vanished: a one-hot target carries no signal about the
                  wrong answers. Nothing pulls the student's dog/bird numbers (currently{' '}
                  {fmtProb(student[1])} vs {fmtProb(student[2])}) toward the teacher's 2:1
                  preference — both just get crushed toward 0.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
