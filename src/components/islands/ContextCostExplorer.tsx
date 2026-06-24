import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

// Quadratic-cost explorer for the Context Window lesson. Two coupled views:
//   1. A context-length slider (1K → 128K) driving the N² dot-product count and
//      the N×N attention-matrix memory, with a bar chart that makes the
//      ×4-per-doubling explosion visceral (everything below the top is a sliver).
//   2. Three attention masks on a shared representative grid — dense vs
//      sliding-window vs sparse — so the reader sees what dropping cells buys
//      (cost) and loses (reach). The shaded-cell count IS the cost.

const STEPS_K = [1, 2, 4, 8, 16, 32, 64, 128]; // context length in thousands of tokens
const BYTES_FP16 = 2; // one attention score, half precision

// Headline figures use 1K = 1000 tokens so the ×4 doublings are exact and match
// the round numbers everyone quotes. (With powers of two — 128K = 131,072 — the
// counts run ~7% higher; the quadratic shape is identical.)
const tokens = (kk: number) => kk * 1000;

function fmtCount(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(n >= 1e13 ? 0 : 1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

// Decimal units (÷1000), deliberately matching the worked-example table so the
// same N×N matrix never reads as two different numbers across widget and prose.
function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

// ── Representative attention masks on a G×G grid ──────────────────────────────
// Row i = query, col j = key. Causal: a query only sees j ≤ i. Each pattern
// decides which of those visible cells it actually computes.
const G = 22;
const WINDOW = 4; // sliding-window: how many recent tokens a query keeps
const GLOBAL = 2; // sparse: first few "global" tokens everyone attends to
const STRIDE = 5; // sparse: plus every STRIDE-th token (strided long-range)

type Mask = (i: number, j: number) => boolean;

const PATTERNS: { key: string; label: string; mask: Mask; keeps: string; loses: string }[] = [
  {
    key: 'dense',
    label: 'Dense (full)',
    mask: (i, j) => j <= i,
    keeps: 'every pair — every token can reach every earlier token',
    loses: 'nothing — but pays the full N² in compute and memory',
  },
  {
    key: 'sliding',
    label: 'Sliding window',
    mask: (i, j) => j <= i && i - j < WINDOW,
    keeps: `only the last ${WINDOW} tokens — cost ≈ N·w, linear in N`,
    loses: 'all long-range links — token N can no longer see token 1',
  },
  {
    key: 'sparse',
    label: 'Sparse (global + strided)',
    mask: (i, j) => j <= i && (i - j < WINDOW || j < GLOBAL || j % STRIDE === 0),
    keeps: 'recent + a few global + every Nth token — near-linear',
    loses: 'most pairs — long-range is approximated, not exact',
  },
];

function countCells(mask: Mask): number {
  let c = 0;
  for (let i = 0; i < G; i++) for (let j = 0; j <= i; j++) if (mask(i, j)) c++;
  return c;
}

const DENSE_CELLS = countCells(PATTERNS[0].mask); // = G(G+1)/2

function MaskGrid({ mask, accent }: { mask: Mask; accent: boolean }) {
  // One <svg> of G×G cells; filled = computed, faint = visible-but-skipped.
  const cell = 7;
  const gap = 1;
  const size = G * (cell + gap);
  const rects = [];
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const visible = j <= i;
      const on = visible && mask(i, j);
      rects.push(
        <rect
          key={`${i}-${j}`}
          x={j * (cell + gap)}
          y={i * (cell + gap)}
          width={cell}
          height={cell}
          rx={1}
          fill={
            on
              ? accent
                ? '#6ea8fe'
                : '#5eead4'
              : visible
                ? 'rgba(148,163,184,0.10)'
                : 'transparent'
          }
        />,
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="attention mask">
      {rects}
    </svg>
  );
}

export default function ContextCostExplorer() {
  const [idx, setIdx] = useState(3); // default 8K
  const kk = STEPS_K[idx];
  const n = tokens(kk);

  const dots = n * n; // dot products per layer per head
  const mem = dots * BYTES_FP16; // bytes to hold the N×N fp16 score matrix
  const maxDots = tokens(STEPS_K[STEPS_K.length - 1]) ** 2; // 128K² for bar scaling

  const baseDots = tokens(STEPS_K[0]) ** 2; // 1K²
  const ratio = dots / baseDots;

  const patterns = useMemo(
    () =>
      PATTERNS.map((p) => {
        const cells = countCells(p.mask);
        return { ...p, cells, frac: cells / DENSE_CELLS };
      }),
    [],
  );

  return (
    <div className="font-sans text-sm">
      {/* Context-length slider */}
      <div className="mb-3 flex items-center gap-3">
        <label htmlFor="ctxlen" className="shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          context length
        </label>
        <input
          id="ctxlen"
          type="range"
          min={0}
          max={STEPS_K.length - 1}
          step={1}
          value={idx}
          onChange={(e) => setIdx(parseInt(e.target.value, 10))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="w-16 shrink-0 text-right font-mono text-base font-semibold text-live">
          {kk}K
        </span>
      </div>

      {/* Readouts */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line bg-ink-900/50 px-3 py-2">
          <div className="text-2xs uppercase tracking-wider text-fg-faint">tokens N</div>
          <div className="font-mono text-lg tabular text-fg">{fmtCount(n)}</div>
        </div>
        <div className="rounded-lg border border-line bg-ink-900/50 px-3 py-2">
          <div className="text-2xs uppercase tracking-wider text-fg-faint">dot products (N²)</div>
          <div className="font-mono text-lg tabular text-accent">{fmtCount(dots)}</div>
          <div className="text-2xs text-fg-faint">per layer · per head</div>
        </div>
        <div className="rounded-lg border border-line bg-ink-900/50 px-3 py-2">
          <div className="text-2xs uppercase tracking-wider text-fg-faint">score matrix (fp16)</div>
          <div className="font-mono text-lg tabular text-live">{fmtBytes(mem)}</div>
          <div className="text-2xs text-fg-faint">if materialized</div>
        </div>
      </div>

      {/* Quadratic bar chart across all context lengths */}
      <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
        attention cost at each context length — each bar is N², not N
      </div>
      <div className="mb-1 flex h-28 items-end gap-1.5">
        {STEPS_K.map((s, i) => {
          const v = tokens(s) ** 2;
          const h = Math.max((v / maxDots) * 100, 0.6); // % of the 128K bar
          const sel = i === idx;
          return (
            <button
              key={s}
              onClick={() => setIdx(i)}
              className="group flex h-full flex-1 cursor-pointer flex-col justify-end"
              title={`${s}K → ${fmtCount(v)} dot products`}
            >
              <motion.div
                className="w-full rounded-t"
                style={{ background: sel ? '#6ea8fe' : 'rgba(110,168,254,0.30)' }}
                animate={{ height: `${h}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              />
            </button>
          );
        })}
      </div>
      <div className="mb-1 flex gap-1.5">
        {STEPS_K.map((s, i) => (
          <div
            key={s}
            className={`flex-1 text-center font-mono text-2xs tabular ${
              i === idx ? 'text-accent' : 'text-fg-faint'
            }`}
          >
            {s}K
          </div>
        ))}
      </div>
      <p className="mb-5 text-2xs text-fg-faint">
        Bars are scaled to the 128K bar. Almost everything below it is a sliver: the cost lives
        entirely at the top, because each doubling of N <strong className="text-fg-muted">quadruples</strong>{' '}
        the work. At {kk}K that is{' '}
        <span className="font-mono text-fg-muted">{fmtCount(ratio)}×</span> the 1K baseline.
      </p>

      {/* Attention-pattern comparison */}
      <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
        what sparsity buys — same {G}-token context, three masks
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {patterns.map((p, pi) => (
          <div key={p.key} className="rounded-lg border border-line bg-ink-900/40 p-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-fg">{p.label}</span>
              <span className="font-mono text-2xs tabular text-fg-faint">
                {Math.round(p.frac * 100)}%
              </span>
            </div>
            <MaskGrid mask={p.mask} accent={pi === 0} />
            <div className="mt-2 font-mono text-2xs tabular text-fg-muted">
              {p.cells} / {DENSE_CELLS} cells
            </div>
            <div className="mt-1.5 space-y-1 text-2xs leading-snug">
              <div className="text-fg-muted">
                <span className="text-live">keeps:</span> {p.keeps}
              </div>
              <div className="text-fg-muted">
                <span className="text-accent">loses:</span> {p.loses}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-2xs text-fg-faint">
        Rows are queries, columns are keys; only the lower triangle is causally visible. A filled
        cell is a dot product actually computed. Dense fills the whole triangle (the full N² wall);
        the other two skip cells to scale — and lose the reach those cells carried.
      </p>
    </div>
  );
}
