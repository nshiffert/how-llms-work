import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Softmax lesson. Three draggable score bars feed two
// normalizations rendered side by side — softmax(s/T) vs plain division s/Σs —
// so the reader feels exponentiation amplify score gaps instead of reading
// about it. A temperature slider pre-scales the scores (the live cross-link to
// the Temperature lesson), and the raw e^(s/T) column is shown per row so the
// numbers that motivate the subtract-the-max trick are on screen.

const MIN = -3;
const MAX = 8;
const ZERO_PCT = ((0 - MIN) / (MAX - MIN)) * 100; // where s=0 sits on the track

const LABELS = ['A', 'B', 'C'];

const PRESETS: { label: string; scores: number[]; note: string }[] = [
  { label: '5, 2, 1', scores: [5, 2, 1], note: 'the worked example' },
  { label: '3, 2.5, 2', scores: [3, 2.5, 2], note: 'a close race' },
  { label: '5, 2, −3', scores: [5, 2, -3], note: 'a negative score' },
  { label: '2, 2, 2', scores: [2, 2, 2], note: 'a three-way tie' },
];

function fmtExp(x: number): string {
  if (!Number.isFinite(x)) return 'overflow';
  if (x >= 1e5) return x.toExponential(1).replace('e+', 'e');
  if (x >= 100) return x.toFixed(0);
  if (x >= 1) return x.toFixed(2);
  return x.toFixed(3);
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

function ScoreBar({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    onChange(Math.round((MIN + frac * (MAX - MIN)) * 10) / 10);
  };

  const pct = ((value - MIN) / (MAX - MIN)) * 100;
  const left = Math.min(pct, ZERO_PCT);
  const width = Math.abs(pct - ZERO_PCT);

  return (
    <div className="flex items-center gap-3">
      <span className="w-4 shrink-0 text-right font-mono text-xs text-fg-muted">{label}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`score ${label}`}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
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
          const step = e.shiftKey ? 1 : 0.1;
          let v = value;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step;
          else if (e.key === 'Home') v = MIN;
          else if (e.key === 'End') v = MAX;
          else return;
          e.preventDefault();
          onChange(Math.round(Math.min(Math.max(v, MIN), MAX) * 10) / 10);
        }}
      >
        {/* zero tick */}
        <div
          className="absolute inset-y-0 w-px bg-ink-400"
          style={{ left: `${ZERO_PCT}%` }}
        />
        <motion.div
          className="absolute inset-y-1 rounded-sm"
          style={{ background: 'rgba(110,168,254,0.55)' }}
          animate={{ left: `${left}%`, width: `${width}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
        {/* drag handle */}
        <motion.div
          className="absolute inset-y-0 w-1.5 rounded-full bg-accent"
          animate={{ left: `calc(${pct}% - 3px)` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span className="tabular w-10 shrink-0 text-right font-mono text-sm text-fg">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function OutputRow({
  label,
  frac,
  display,
  winner,
  invalid,
  extra,
}: {
  label: string;
  frac: number; // bar fill 0..1
  display: string;
  winner: boolean;
  invalid?: boolean;
  extra?: string;
}) {
  const w = Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-right font-mono text-2xs text-fg-faint">{label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-600">
        <motion.div
          className="absolute inset-y-0 left-0 rounded"
          style={{
            background: invalid
              ? 'rgba(248,113,113,0.65)'
              : winner
                ? '#5eead4'
                : 'rgba(110,168,254,0.55)',
          }}
          animate={{ width: `${w}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        />
      </div>
      <span
        className={`tabular w-14 shrink-0 text-right font-mono text-xs ${
          invalid ? 'text-[#f87171]' : 'text-fg'
        }`}
      >
        {display}
      </span>
      {extra !== undefined && (
        <span className="tabular hidden w-16 shrink-0 text-right font-mono text-2xs text-fg-faint sm:block">
          {extra}
        </span>
      )}
    </div>
  );
}

export default function SoftmaxExplorer() {
  const [scores, setScores] = useState<number[]>([5, 2, 1]);
  const [temp, setTemp] = useState(1);

  const setScore = (i: number, v: number) =>
    setScores((prev) => prev.map((s, j) => (j === i ? v : s)));

  const t = Math.max(temp, 0.05);

  const { soft, rawExps, lin, linSum, linValid, hasNegative } = useMemo(() => {
    const scaled = scores.map((s) => s / t);
    const m = Math.max(...scaled);
    const shifted = scaled.map((z) => Math.exp(z - m)); // the stable path
    const shiftedSum = shifted.reduce((a, b) => a + b, 0);
    const soft = shifted.map((e) => e / shiftedSum);
    const rawExps = scaled.map((z) => Math.exp(z)); // display only — what naive code computes

    const linSum = scores.reduce((a, b) => a + b, 0);
    const hasNegative = scores.some((s) => s < 0);
    const sumOk = linSum > 1e-9;
    const lin = scores.map((s) => (sumOk ? s / linSum : NaN));
    return { soft, rawExps, lin, linSum, linValid: sumOk && !hasNegative, hasNegative };
  }, [scores, t]);

  const softMax = Math.max(...soft);
  const softTop = soft.filter((p) => p === softMax).length === 1 ? soft.indexOf(softMax) : -1;
  const finiteLin = lin.filter((v) => Number.isFinite(v));
  const linMax = finiteLin.length ? Math.max(...finiteLin) : NaN;
  const linTop =
    finiteLin.length && lin.filter((v) => v === linMax).length === 1 ? lin.indexOf(linMax) : -1;

  return (
    <div className="font-sans text-sm">
      {/* Presets */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          presets
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setScores([...p.scores])}
            title={p.note}
            className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input scores */}
      <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
        input scores s — drag the bars (they can go negative)
      </div>
      <div className="mb-4 space-y-1.5">
        {scores.map((s, i) => (
          <ScoreBar key={LABELS[i]} label={LABELS[i]} value={s} onChange={(v) => setScore(i, v)} />
        ))}
      </div>

      {/* Temperature — feeds the softmax side only */}
      <div className="mb-4 flex items-center gap-3">
        <label
          htmlFor="softmax-temp"
          className="shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint"
        >
          temperature T
        </label>
        <input
          id="softmax-temp"
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          value={temp}
          onChange={(e) => setTemp(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="tabular w-12 shrink-0 text-right font-mono text-sm text-live">
          {temp.toFixed(2)}
        </span>
      </div>

      {/* The two normalizations, side by side */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-medium text-fg">softmax(s / T)</span>
            <span className="font-mono text-2xs tabular text-live">Σ = 1.00</span>
          </div>
          <div className="mb-1 hidden justify-end pr-0 text-2xs text-fg-faint sm:flex">
            <span className="w-16 text-right font-mono">e^(s/T)</span>
          </div>
          <div className="space-y-1.5">
            {soft.map((p, i) => (
              <OutputRow
                key={LABELS[i]}
                label={LABELS[i]}
                frac={p}
                display={fmtPct(p)}
                winner={i === softTop}
                extra={fmtExp(rawExps[i])}
              />
            ))}
          </div>
          <p className="mt-2 text-2xs leading-snug text-fg-faint">
            Always a valid distribution — any real scores, any temperature. The e^(s/T) column is
            what naive code exponentiates; real implementations subtract the max first and get
            identical outputs.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-medium text-fg">s / Σs — plain division</span>
            <span
              className={`font-mono text-2xs tabular ${linValid ? 'text-live' : 'text-[#f87171]'}`}
            >
              {Number.isFinite(lin[0]) ? `Σs = ${linSum.toFixed(1)}` : 'Σs ≤ 0'}
            </span>
          </div>
          <div className="space-y-1.5">
            {lin.map((v, i) => (
              <OutputRow
                key={LABELS[i]}
                label={LABELS[i]}
                frac={Number.isFinite(v) ? v : 0}
                display={fmtPct(v)}
                winner={linValid && i === linTop}
                invalid={!linValid}
              />
            ))}
          </div>
          <p className="mt-2 text-2xs leading-snug text-fg-faint">
            {linValid ? (
              <>Proportional, so much flatter — score gaps are preserved, not amplified.</>
            ) : hasNegative && Number.isFinite(lin[0]) ? (
              <span className="text-[#f87171]">
                A negative score just produced a negative “probability.” Plain division is not a
                distribution — softmax never has this problem.
              </span>
            ) : (
              <span className="text-[#f87171]">
                The scores sum to ≤ 0 — there is nothing to divide by. Softmax still works.
              </span>
            )}
          </p>
        </div>
      </div>

      <p className="mt-3 text-2xs leading-snug text-fg-faint">
        Winner’s share: <span className="font-mono text-fg-muted">{fmtPct(softMax)}</span>{' '}
        under softmax vs{' '}
        <span className="font-mono text-fg-muted">
          {linValid ? fmtPct(linMax) : '—'}
        </span>{' '}
        under plain division. Drag a bar past its neighbors and watch softmax hand the winner
        nearly everything while division barely reacts. Then pull T below 1 (sharper) or above 1
        (flatter) — the Temperature lesson is exactly this slider.
      </p>
    </div>
  );
}
