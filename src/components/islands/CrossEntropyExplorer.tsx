import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Cross-entropy lesson. The bars are the model's
// predicted next-token distribution over {cat, dog, bird}; exactly one token
// is the ground truth (the one-hot target, y = 1). Drag the true token's bar
// and the loss −ln(p) slides along the curve on the right; drag a wrong
// token's bar and the loss does not move at all — cross-entropy never reads
// where the wrong mass sits. Click a token name to move the ground truth and
// score the same distribution against a different answer.

const TOKENS = ['cat', 'dog', 'bird'];
const LMAX = 7; // −ln(0.001) ≈ 6.91 — top of the plotted range

const PRESETS: { label: string; probs: number[]; note: string }[] = [
  { label: 'confidently right', probs: [0.99, 0.005, 0.005], note: '−ln(0.99) ≈ 0.01' },
  { label: 'decent', probs: [0.7, 0.2, 0.1], note: '−ln(0.7) ≈ 0.36' },
  { label: 'unsure', probs: [0.1, 0.5, 0.4], note: '−ln(0.1) ≈ 2.3' },
  { label: 'confidently wrong', probs: [0.01, 0.5, 0.49], note: '−ln(0.01) ≈ 4.6' },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ---- chart geometry (viewBox units) ----
const W = 360;
const H = 210;
const ML = 40;
const MR = 14;
const MT = 12;
const MB = 32;

const px = (p: number) => ML + clamp(p, 0, 1) * (W - ML - MR);
const py = (l: number) => H - MB - (clamp(l, 0, LMAX) / LMAX) * (H - MT - MB);

// Sample the curve uniformly in LOSS space, not p space — the curve is nearly
// vertical as p → 0, so uniform-in-p sampling would draw visible chords there.
const CURVE_D = (() => {
  const pts: string[] = [];
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const l = LMAX * (1 - i / N) + 0.001 * (i / N);
    const p = Math.exp(-l);
    pts.push(`${i === 0 ? 'M' : 'L'}${px(p).toFixed(1)},${py(l).toFixed(1)}`);
  }
  return pts.join('');
})();

const LADDER: { p: number; label: string }[] = [
  { p: 0.99, label: '0.01' },
  { p: 0.7, label: '0.36' },
  { p: 0.1, label: '2.3' },
  { p: 0.01, label: '4.6' },
];

function fmtPct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 0.1) return '<0.1%';
  if (v < 1) return `${v.toFixed(2)}%`;
  return `${v.toFixed(1)}%`;
}

function fmtLoss(l: number): string {
  return l < 0.1 ? l.toFixed(3) : l.toFixed(2);
}

function ProbBar({
  token,
  value,
  isTrue,
  onChange,
  onMakeTrue,
}: {
  token: string;
  value: number;
  isTrue: boolean;
  onChange: (v: number) => void;
  onMakeTrue: () => void;
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
      <button
        onClick={onMakeTrue}
        title="click to make this the true next token"
        className={`w-14 shrink-0 rounded px-1 py-0.5 text-left font-mono text-xs transition-colors ${
          isTrue ? 'text-live' : 'text-fg-faint hover:text-fg'
        }`}
      >
        {token}
        {isTrue ? ' ✓' : ''}
      </button>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`predicted probability of ${token}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Math.round(value * 1000) / 1000}
        className="relative h-7 flex-1 cursor-ew-resize touch-none rounded bg-ink-600 outline-none focus-visible:ring-1 focus-visible:ring-accent"
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
          style={{
            background: isTrue ? 'rgba(94,234,212,0.55)' : 'rgba(110,168,254,0.45)',
          }}
          animate={{ width: `${value * 100}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
        <motion.div
          className="absolute inset-y-0 w-1.5 rounded-full"
          style={{ background: isTrue ? '#5eead4' : '#6ea8fe' }}
          animate={{ left: `calc(${value * 100}% - 3px)` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span className="tabular w-14 shrink-0 text-right font-mono text-xs text-fg">
        {fmtPct(value)}
      </span>
      <span className="tabular w-8 shrink-0 text-right font-mono text-2xs text-fg-faint">
        y={isTrue ? '1' : '0'}
      </span>
    </div>
  );
}

export default function CrossEntropyExplorer() {
  const [probs, setProbs] = useState<number[]>([0.7, 0.2, 0.1]);
  const [trueIdx, setTrueIdx] = useState(0);

  const setProb = (i: number, v: number) => {
    setProbs((prev) => {
      const next = [...prev];
      const others = TOKENS.map((_, j) => j).filter((j) => j !== i);
      if (i === trueIdx) {
        // Dragging the true token: the wrong tokens absorb the remainder in
        // their current proportion, so the whole vector stays a distribution.
        const p = clamp(v, 0.001, 0.998);
        const rem = 1 - p;
        const osum = others.reduce((a, j) => a + prev[j], 0);
        for (const j of others) {
          next[j] = osum > 1e-9 ? (prev[j] / osum) * rem : rem / others.length;
        }
        next[i] = p;
      } else {
        // Dragging a wrong token: mass moves ONLY between the wrong tokens.
        // p(true) is untouched — watch the loss not move.
        const other = others.filter((j) => j !== trueIdx)[0];
        const pool = 1 - prev[trueIdx];
        const p = clamp(v, Math.min(0.0005, pool / 2), Math.max(pool - 0.0005, pool / 2));
        next[i] = p;
        next[other] = pool - p;
      }
      return next;
    });
  };

  const pTrue = probs[trueIdx];
  const loss = -Math.log(pTrue);
  const bits = loss / Math.LN2;
  const lossColor = loss < 0.7 ? '#5eead4' : loss < 2.3 ? '#fbbf24' : '#f87171';

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
              setProbs([...pr.probs]);
              setTrueIdx(0);
            }}
            title={pr.note}
            className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {pr.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: the predicted distribution vs the one-hot target */}
        <div>
          <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            predicted distribution p — drag the bars · y is the one-hot truth
          </div>
          <div className="space-y-1.5">
            {probs.map((p, i) => (
              <ProbBar
                key={TOKENS[i]}
                token={TOKENS[i]}
                value={p}
                isTrue={i === trueIdx}
                onChange={(v) => setProb(i, v)}
                onMakeTrue={() => setTrueIdx(i)}
              />
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-ink-900/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-fg-muted">
                loss = −ln p({TOKENS[trueIdx]}) = −ln(
                {pTrue < 0.0995 ? pTrue.toFixed(3) : pTrue.toFixed(2)})
              </span>
              <motion.span
                key={trueIdx /* re-pop when the truth moves */}
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                className="tabular font-mono text-2xl font-semibold"
                style={{ color: lossColor }}
              >
                {fmtLoss(loss)}
              </motion.span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xs text-fg-faint">
                {fmtLoss(loss)} nats · {fmtLoss(bits)} bits
              </span>
              <span className="font-mono text-2xs tabular text-live">Σp = 1.00</span>
            </div>
          </div>

          <p className="mt-3 text-2xs leading-snug text-fg-faint">
            Now drag <span className="font-mono text-fg-muted">dog</span> or{' '}
            <span className="font-mono text-fg-muted">bird</span>: mass shuffles between the
            wrong answers and the loss does not move — only the true token's probability is
            ever read.
          </p>
        </div>

        {/* Right: the −log curve with the current position marked */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-1 font-mono text-xs font-medium text-fg">
            loss −ln(p) as p(true token) moves
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="negative log loss curve with a marker at the current probability"
          >
            {/* horizontal grid at the ÷10 ladder: 0, 2.3, 4.6, 6.9 */}
            {[0, 2.3, 4.6, 6.9].map((l) => (
              <g key={l}>
                <line
                  x1={ML}
                  x2={W - MR}
                  y1={py(l)}
                  y2={py(l)}
                  stroke="#30363d"
                  strokeWidth={1}
                  strokeDasharray={l === 0 ? undefined : '3 4'}
                />
                <text
                  x={ML - 6}
                  y={py(l) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="#7d8590"
                  fontFamily="ui-monospace, monospace"
                >
                  {l.toFixed(1)}
                </text>
              </g>
            ))}
            {/* x ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <g key={p}>
                <line x1={px(p)} x2={px(p)} y1={H - MB} y2={H - MB + 4} stroke="#30363d" />
                <text
                  x={px(p)}
                  y={H - MB + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#7d8590"
                  fontFamily="ui-monospace, monospace"
                >
                  {p}
                </text>
              </g>
            ))}
            <text x={(ML + W - MR) / 2} y={H - 3} textAnchor="middle" fontSize={9} fill="#7d8590">
              probability on the true token
            </text>

            <path d={CURVE_D} fill="none" stroke="#6ea8fe" strokeWidth={1.8} />

            {/* the ladder: fixed reference points from the lesson */}
            {LADDER.map(({ p, label }) => (
              <g key={p}>
                <circle
                  cx={px(p)}
                  cy={py(-Math.log(p))}
                  r={2.5}
                  fill="#30363d"
                  stroke="#7d8590"
                  strokeWidth={1}
                />
                <text
                  x={p > 0.5 ? px(p) - 6 : px(p) + 6}
                  y={py(-Math.log(p)) - 4}
                  textAnchor={p > 0.5 ? 'end' : 'start'}
                  fontSize={9}
                  fill="#7d8590"
                  fontFamily="ui-monospace, monospace"
                >
                  {label}
                </text>
              </g>
            ))}

            {/* crosshair + marker at the current (p, loss) */}
            <line
              x1={ML}
              y1={py(loss)}
              x2={px(pTrue)}
              y2={py(loss)}
              stroke={lossColor}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <line
              x1={px(pTrue)}
              y1={H - MB}
              x2={px(pTrue)}
              y2={py(loss)}
              stroke={lossColor}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle cx={px(pTrue)} cy={py(loss)} r={5} fill={lossColor} />
          </svg>
          <p className="mt-2 text-2xs leading-snug text-fg-faint">
            The grid lines are the ÷10 ladder: every ÷10 on p adds the same +2.3 to the loss.
            The curve is nearly flat from 0.99 down to 0.7 and nearly vertical below 0.05 —
            drag the true token's bar through both regions and feel the asymmetry.
          </p>
        </div>
      </div>
    </div>
  );
}
