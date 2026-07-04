import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the KL Divergence lesson. Two distributions over
// {cat, dog, bird}: P (teal) and Q (blue), both draggable. The right panel
// computes the active direction term by term — weight × log-ratio — and sums
// it. The flip button swaps the direction of the SAME two distributions and
// the number changes: that is the asymmetry the lesson is about. Presets
// include a Q that starves an event P allows (watch one term dominate and
// head toward ∞) and a bimodal P (flip to see mode-covering vs mode-seeking).

const TOKENS = ['cat', 'dog', 'bird'];
const PMIN = 0.001; // hard floor: at exactly 0 a term is ±∞
const PMAX = 0.998;

type Dist = number[];

const PRESETS: { label: string; p: Dist; q: Dist; note: string }[] = [
  {
    label: 'teacher vs student',
    p: [0.7, 0.2, 0.1],
    q: [0.5, 0.3, 0.2],
    note: 'the worked example: KL(P‖Q) ≈ 0.085, KL(Q‖P) ≈ 0.092',
  },
  {
    label: 'identical',
    p: [0.7, 0.2, 0.1],
    q: [0.7, 0.2, 0.1],
    note: 'P = Q → every log-ratio is 0 → KL = 0 in both directions',
  },
  {
    label: 'Q starves bird',
    p: [0.7, 0.2, 0.1],
    q: [0.849, 0.15, 0.001],
    note: 'Q puts ~0 on an event P allows — the bird term dominates and grows without bound',
  },
  {
    label: 'two modes',
    p: [0.495, 0.01, 0.495],
    q: [0.98, 0.01, 0.01],
    note: 'bimodal P, single-mode Q: KL(P‖Q) ≈ 1.59 but KL(Q‖P) ≈ 0.63 — flip it',
  },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function fmtProb(p: number): string {
  if (p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}

function fmtKl(v: number): string {
  return v.toFixed(3);
}

function ProbBar({
  token,
  value,
  color,
  fill,
  ariaDist,
  onChange,
}: {
  token: string;
  value: number;
  color: string;
  fill: string;
  ariaDist: string;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange(clamp((clientX - r.left) / r.width, 0, 1));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 font-mono text-xs text-fg-faint">{token}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${ariaDist} probability of ${token}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Math.round(value * 1000) / 1000}
        className="relative h-6 flex-1 cursor-ew-resize touch-none rounded bg-ink-600 outline-none focus-visible:ring-1 focus-visible:ring-accent"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) setFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01;
          let v = value;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step;
          else if (e.key === 'Home') v = 0;
          else if (e.key === 'End') v = 1;
          else return;
          e.preventDefault();
          onChange(clamp(v, 0, 1));
        }}
      >
        <motion.div
          className="absolute inset-y-1 left-0 rounded-sm"
          style={{ background: fill }}
          animate={{ width: `${value * 100}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
        <motion.div
          className="absolute inset-y-0 w-1.5 rounded-full"
          style={{ background: color }}
          animate={{ left: `calc(${value * 100}% - 3px)` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span className="tabular w-12 shrink-0 text-right font-mono text-xs text-fg">
        {fmtProb(value)}
      </span>
    </div>
  );
}

export default function KLDivergenceExplorer() {
  const [p, setP] = useState<Dist>([0.7, 0.2, 0.1]);
  const [q, setQ] = useState<Dist>([0.5, 0.3, 0.2]);
  const [flipped, setFlipped] = useState(false); // false → KL(P‖Q), true → KL(Q‖P)

  // Drag one entry; the other two absorb the remainder in proportion, so the
  // vector stays a distribution. Floor at PMIN — exactly 0 makes a term ±∞.
  // The floor can add a sliver of mass, so normalize the whole vector at the
  // end; the dragged value moves by at most ~0.2% and every entry stays ≥ ~PMIN.
  const makeSetter =
    (set: Dispatch<SetStateAction<Dist>>) => (i: number, v: number) => {
      set((prev) => {
        const next = [...prev];
        const others = prev.map((_, j) => j).filter((j) => j !== i);
        next[i] = clamp(v, PMIN, PMAX);
        const rem = 1 - next[i];
        const osum = others.reduce((a, j) => a + prev[j], 0);
        for (const j of others) {
          next[j] = Math.max(PMIN, osum > 1e-9 ? (prev[j] / osum) * rem : rem / others.length);
        }
        const total = next.reduce((a, b) => a + b, 0);
        return next.map((x) => x / total);
      });
    };

  const setPProb = makeSetter(setP);
  const setQProb = makeSetter(setQ);

  // Active direction: A does the weighting, B is the code being judged.
  const [A, B, aName, bName] = flipped
    ? [q, p, 'Q', 'P']
    : [p, q, 'P', 'Q'];

  const terms = A.map((a, i) => a * Math.log(a / B[i]));
  const total = terms.reduce((s, t) => s + t, 0);
  const other = B.reduce((s, b, i) => s + b * Math.log(b / A[i]), 0);

  const totalColor = total < 0.1 ? '#5eead4' : total < 1 ? '#fbbf24' : '#f87171';
  const termScale = Math.max(0.4, ...terms.map((t) => Math.abs(t)));
  // A term is "blowing up" when the code distribution B starves an event the
  // weighting distribution A still visits.
  const starving = terms.findIndex((t, i) => B[i] <= 0.002 && A[i] >= 0.05);

  return (
    <div className="font-sans text-sm">
      {/* Presets */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          presets
        </span>
        {PRESETS.map((pr) => (
          <button
            key={pr.label}
            onClick={() => {
              setP([...pr.p]);
              setQ([...pr.q]);
            }}
            title={pr.note}
            className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {pr.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: the two distributions */}
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-live">
                P — drag the bars
              </span>
              <span className="font-mono text-2xs text-fg-faint">
                {flipped ? 'the code being judged' : 'weights the average'}
              </span>
            </div>
            <div className="space-y-1.5">
              {p.map((v, i) => (
                <ProbBar
                  key={TOKENS[i]}
                  token={TOKENS[i]}
                  value={v}
                  color="#5eead4"
                  fill="rgba(94,234,212,0.55)"
                  ariaDist="P"
                  onChange={(nv) => setPProb(i, nv)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-accent">
                Q — drag the bars
              </span>
              <span className="font-mono text-2xs text-fg-faint">
                {flipped ? 'weights the average' : 'the code being judged'}
              </span>
            </div>
            <div className="space-y-1.5">
              {q.map((v, i) => (
                <ProbBar
                  key={TOKENS[i]}
                  token={TOKENS[i]}
                  value={v}
                  color="#6ea8fe"
                  fill="rgba(110,168,254,0.45)"
                  ariaDist="Q"
                  onChange={(nv) => setQProb(i, nv)}
                />
              ))}
            </div>
          </div>

          <p className="text-2xs leading-snug text-fg-faint">
            Bars are floored at {PMIN} — at exactly 0 the starved term is +∞. Drag{' '}
            <span className="font-mono text-fg-muted">Q(bird)</span> to the floor while{' '}
            <span className="font-mono text-fg-muted">P(bird)</span> stays up and watch its
            term take over the sum.
          </p>
        </div>

        {/* Right: term-by-term breakdown of the active direction */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-medium text-fg">
              KL({aName}
              <span className="text-fg-faint">‖</span>
              {bName}) = Σ {aName}(i)·ln {aName}(i)/{bName}(i)
            </span>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="rounded border border-line bg-ink-700/60 px-2 py-1 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
              title="swap which distribution weights the average"
            >
              ⇄ flip direction
            </button>
          </div>

          <div className="space-y-1.5">
            {TOKENS.map((tok, i) => {
              const t = terms[i];
              const w = clamp(Math.abs(t) / termScale, 0.01, 1) * 50;
              return (
                <div key={tok} className="flex items-center gap-2 font-mono text-2xs">
                  <span className="w-9 shrink-0 text-fg-faint">{tok}</span>
                  <span className="tabular w-24 shrink-0 text-fg-muted">
                    {fmtProb(A[i])}·ln({fmtProb(A[i])}/{fmtProb(B[i])})
                  </span>
                  {/* signed bar, zero at center */}
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
              <span className="font-mono text-xs text-fg-muted">
                KL({aName}‖{bName})
              </span>
              <motion.span
                key={`${flipped}`}
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                className="tabular font-mono text-2xl font-semibold"
                style={{ color: totalColor }}
              >
                {fmtKl(total)}
              </motion.span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xs text-fg-faint">
                nats · other direction: KL({bName}‖{aName}) = {fmtKl(other)}
              </span>
              <span className="font-mono text-2xs tabular text-fg-faint">
                Δ = {Math.abs(total - other).toFixed(3)}
              </span>
            </div>
            <AnimatePresence>
              {starving >= 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="mt-2 font-mono text-2xs leading-snug" style={{ color: '#f87171' }}>
                    {bName}({TOKENS[starving]}) is at the floor while {aName}(
                    {TOKENS[starving]}) = {A[starving].toFixed(2)} — this term → +∞ as{' '}
                    {bName}({TOKENS[starving]}) → 0.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-3 space-y-1 text-2xs leading-snug text-fg-faint">
            <p>
              <span className="font-semibold text-fg-muted">Who uses which direction:</span>
            </p>
            <p>
              <span className="font-mono text-fg-muted">KL(teacher‖student)</span> —
              distillation: the teacher weights, the student is punished for starving
              tokens the teacher rates probable.
            </p>
            <p>
              <span className="font-mono text-fg-muted">KL(policy‖base)</span> — the
              RLHF/DPO drift penalty: weighted by where the fine-tuned policy actually
              puts its mass.
            </p>
            <p>
              <span className="font-mono text-fg-muted">KL(posterior‖prior)</span> — the
              VAE regularizer pulling the encoder's latent toward the prior.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
