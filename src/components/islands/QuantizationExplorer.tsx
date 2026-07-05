import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the QLoRA lesson. One precision selector drives three
// linked views of the same trade:
//
//   SNAP: a number line showing every value the chosen format can store. Drag
//   the weight slider and watch the fp32 weight snap to its nearest
//   representable level — the gap between dot and level IS quantization error.
//
//   HISTOGRAM: the same rounding applied to 2,048 normally-distributed weights
//   (a stand-in for one block of a real weight matrix). Fewer levels → wider
//   error spread. The NF4 mode shows the QLoRA paper's trick: put the 16
//   levels at normal-distribution quantiles, dense where weights actually
//   live, and mean error drops ~30% with no extra bits.
//
//   MEMORY: what each format costs for a 7B base model, against a 16 GB
//   consumer GPU budget. Only the 4-bit bars leave room to train.
//
// Everything is deterministic — the "random" weights come from the inverse
// normal CDF over an evenly spaced grid, so every visitor sees the same data.

type Mode = 'fp16' | 'int8' | 'int4' | 'nf4';

const ABSMAX_LINE = 2.0; // absmax of the toy block behind the number line
const N_WEIGHTS = 2048;

// The 16 NF4 levels from the QLoRA paper (bitsandbytes codebook): quantiles of
// N(0,1), rescaled to [-1, 1]. Multiply by a block's absmax to get real values.
const NF4_LEVELS = [
  -1.0, -0.6961928, -0.52507305, -0.39491749, -0.28444138, -0.18477343,
  -0.09105004, 0.0, 0.0795803, 0.1609302, 0.2461123, 0.33791524, 0.44070983,
  0.562617, 0.72295684, 1.0,
];

const MODES: Record<
  Mode,
  { label: string; levels: number; bytes: number; gb7b: number; blurb: string }
> = {
  fp16: { label: 'fp16', levels: 65536, bytes: 2, gb7b: 14, blurb: 'error too small to see at this zoom' },
  int8: { label: 'int8', levels: 256, bytes: 1, gb7b: 7, blurb: '256 evenly spaced levels' },
  int4: { label: 'int4', levels: 16, bytes: 0.5, gb7b: 3.5, blurb: '16 evenly spaced levels' },
  nf4: { label: 'NF4', levels: 16, bytes: 0.5, gb7b: 3.5, blurb: '16 levels at normal quantiles — dense near 0' },
};

// Winitzki's erfinv approximation — plenty accurate for a visualization.
function erfinv(x: number): number {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const t = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
}

// Deterministic standard-normal sample: inverse CDF over an even grid.
function normalWeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.SQRT2 * erfinv(2 * ((i + 0.5) / n) - 1));
}

function quantize(w: number, mode: Mode, absmax: number): number {
  if (mode === 'fp16') return w; // ~2^-11 relative error — treated as exact here
  if (mode === 'nf4') {
    const x = w / absmax;
    let best = NF4_LEVELS[0];
    for (const l of NF4_LEVELS) if (Math.abs(l - x) < Math.abs(best - x)) best = l;
    return best * absmax;
  }
  const maxq = mode === 'int8' ? 127 : 7;
  const scale = absmax / maxq;
  return Math.max(-maxq, Math.min(maxq, Math.round(w / scale))) * scale;
}

// All storable values in [-absmax, absmax] for the level ticks.
function levelValues(mode: Mode, absmax: number): number[] {
  if (mode === 'nf4') return NF4_LEVELS.map((l) => l * absmax);
  const maxq = mode === 'int8' ? 127 : 7;
  const scale = absmax / maxq;
  return Array.from({ length: 2 * maxq + 1 }, (_, i) => (i - maxq) * scale);
}

function fmt(x: number, digits = 3): string {
  return x.toFixed(digits);
}

function SnapLine({ mode, w }: { mode: Mode; w: number }) {
  const W = 560;
  const H = 96;
  const padX = 18;
  const yLine = 58;
  const x = (v: number) => padX + ((v + ABSMAX_LINE) / (2 * ABSMAX_LINE)) * (W - 2 * padX);

  const snapped = quantize(w, mode, ABSMAX_LINE);
  const err = w - snapped;
  const ticks = mode === 'fp16' ? [] : levelValues(mode, ABSMAX_LINE);

  return (
    <div className="rounded-lg border border-line bg-ink-900/40 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Number line of storable values with the weight snapping to its nearest level">
        <line x1={padX} x2={W - padX} y1={yLine} y2={yLine} stroke="#30363d" strokeWidth="1.5" />
        {ticks.map((t, i) => (
          <line key={i} x1={x(t)} x2={x(t)} y1={yLine - 7} y2={yLine + 7} stroke="#8b949e" strokeWidth={mode === 'int8' ? 0.6 : 1.5} />
        ))}
        {[-2, -1, 0, 1, 2].map((t) => (
          <text key={t} x={x(t)} y={yLine + 24} textAnchor="middle" fontSize="9" fill="#8b949e" fontFamily="monospace">
            {t.toFixed(0)}
          </text>
        ))}
        {mode === 'fp16' && (
          <text x={W / 2} y={yLine - 16} textAnchor="middle" fontSize="10" fill="#8b949e" fontFamily="monospace">
            65,536 levels — spacing ≈ 0.001 here, too dense to draw
          </text>
        )}
        {/* error bracket between fp32 weight and its stored value */}
        {mode !== 'fp16' && Math.abs(err) > 1e-9 && (
          <line x1={x(w)} x2={x(snapped)} y1={yLine - 26} y2={yLine - 26} stroke="#fbbf24" strokeWidth="2" />
        )}
        {/* the fp32 weight (blue, where you put it) */}
        <line x1={x(w)} x2={x(w)} y1={yLine - 30} y2={yLine} stroke="#6ea8fe" strokeWidth="1" strokeDasharray="2 2" />
        <circle cx={x(w)} cy={yLine - 30} r="4.5" fill="#6ea8fe" />
        {/* the stored value (teal, snaps) */}
        <motion.g animate={{ x: x(snapped) }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
          <circle cx={0} cy={yLine} r="5.5" fill="#5eead4" stroke="#0d1117" strokeWidth="1.5" />
        </motion.g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs">
        <span><span className="text-[#6ea8fe]">●</span> <span className="text-fg-faint">fp32 weight</span> <span className="tabular text-fg">{fmt(w)}</span></span>
        <span><span className="text-[#5eead4]">●</span> <span className="text-fg-faint">stored as</span> <span className="tabular text-fg">{fmt(quantize(w, mode, ABSMAX_LINE))}</span></span>
        <span><span className="text-[#fbbf24]">—</span> <span className="text-fg-faint">error</span> <span className="tabular font-semibold text-[#fbbf24]">{fmt(Math.abs(err), 4)}</span></span>
      </div>
    </div>
  );
}

function ErrorHistogram({ mode }: { mode: Mode }) {
  const { bins, meanAbs, maxAbs } = useMemo(() => {
    const ws = normalWeights(N_WEIGHTS);
    const absmax = Math.max(...ws.map(Math.abs));
    const errs = ws.map((w) => w - quantize(w, mode, absmax));
    const RANGE = 0.5; // fixed across modes so widths compare honestly
    const NB = 41;
    const b = new Array(NB).fill(0);
    for (const e of errs) {
      const i = Math.max(0, Math.min(NB - 1, Math.floor(((e + RANGE) / (2 * RANGE)) * NB)));
      b[i] += 1;
    }
    return {
      bins: b,
      meanAbs: errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length,
      maxAbs: Math.max(...errs.map(Math.abs)),
    };
  }, [mode]);

  const W = 270;
  const H = 130;
  const padB = 16;
  const peak = Math.max(...bins, 1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Histogram of quantization errors across 2048 weights">
        {bins.map((c, i) => {
          const bw = W / bins.length;
          const h = c === 0 ? 0 : Math.max(1.5, (c / peak) * (H - padB - 8));
          return <rect key={i} x={i * bw + 0.5} y={H - padB - h} width={bw - 1} height={h} fill="#fbbf24" opacity={0.85} />;
        })}
        <line x1={W / 2} x2={W / 2} y1={4} y2={H - padB} stroke="#30363d" strokeWidth="1" strokeDasharray="2 3" />
        {[-0.5, 0, 0.5].map((t) => (
          <text key={t} x={(t + 0.5) * W} y={H - 4} textAnchor={t === -0.5 ? 'start' : t === 0.5 ? 'end' : 'middle'} fontSize="8.5" fill="#8b949e" fontFamily="monospace">
            {t === 0 ? '0' : t.toFixed(1)}
          </text>
        ))}
      </svg>
      <p className="mt-1 font-mono text-2xs text-fg-muted">
        mean |error| <span className="tabular font-semibold text-[#fbbf24]">{fmt(meanAbs, 4)}</span>
        <span className="text-fg-faint"> · worst {fmt(maxAbs, 3)} · weights ~N(0,1)</span>
      </p>
    </div>
  );
}

function MemoryBars({ mode }: { mode: Mode }) {
  const GPU = 16;
  const MAXGB = 28;
  const rows: { key: string; label: string; gb: number; active: boolean }[] = [
    { key: 'fp32', label: 'fp32 · 4 B', gb: 28, active: false },
    { key: 'fp16', label: 'fp16 · 2 B', gb: 14, active: mode === 'fp16' },
    { key: 'int8', label: 'int8 · 1 B', gb: 7, active: mode === 'int8' },
    { key: 'int4', label: '4-bit · 0.5 B', gb: 3.5, active: mode === 'int4' || mode === 'nf4' },
  ];
  return (
    <div>
      <div className="relative flex flex-col gap-1.5 pt-1">
        {/* 16 GB GPU budget line */}
        <div
          className="absolute bottom-0 top-0 border-l border-dashed border-[#f87171]/70"
          style={{ left: `${(GPU / MAXGB) * 100}%` }}
          aria-hidden="true"
        />
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className={`w-20 shrink-0 font-mono text-2xs ${r.active ? 'font-semibold text-fg' : 'text-fg-faint'}`}>{r.label}</span>
            <div className="relative h-4 flex-1">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ background: r.active ? '#5eead4' : '#39424e', opacity: r.active ? 0.9 : 0.8 }}
                animate={{ width: `${(r.gb / MAXGB) * 100}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              />
              {/* adapter sliver rides on top of the base bar */}
              <div
                className="absolute inset-y-0 w-[3px] rounded-sm bg-[#6ea8fe]"
                style={{ left: `calc(${(r.gb / MAXGB) * 100}% + 1px)` }}
                title="LoRA adapters + their optimizer state ≈ 0.08 GB"
              />
              <span className={`absolute top-1/2 -translate-y-1/2 font-mono text-2xs ${r.gb >= GPU ? 'right-1 text-ink-900' : ''} ${r.gb < GPU ? 'text-fg-muted' : ''}`} style={r.gb < GPU ? { left: `calc(${(r.gb / MAXGB) * 100}% + 8px)` } : undefined}>
                {r.gb} GB
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 font-mono text-2xs text-fg-faint">
        7B frozen base · <span className="text-[#6ea8fe]">▎</span>adapters + optimizer ≈ 0.08 GB ·{' '}
        <span className="text-[#f87171]">┆</span> 16 GB consumer GPU
      </p>
    </div>
  );
}

export default function QuantizationExplorer() {
  const [mode, setMode] = useState<Mode>('int4');
  const [w, setW] = useState(0.42);
  const m = MODES[mode];

  return (
    <div className="font-sans text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex overflow-hidden rounded border border-line font-mono text-2xs" role="group" aria-label="Storage format">
          {(Object.keys(MODES) as Mode[]).map((k) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              aria-pressed={mode === k}
              className={`px-2.5 py-1 transition-colors ${
                mode === k ? 'bg-accent/15 font-semibold text-fg' : 'bg-ink-700/60 text-fg-faint hover:text-fg-muted'
              }`}
            >
              {MODES[k].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          weight
          <input
            type="range"
            min={-2}
            max={2}
            step={0.01}
            value={w}
            onChange={(e) => setW(Number(e.target.value))}
            className="w-40 accent-[#6ea8fe]"
            aria-label="fp32 weight value"
          />
        </label>
        <span className="font-mono text-2xs text-fg-faint">{m.blurb}</span>
      </div>

      <SnapLine mode={mode} w={w} />

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs">
        <div>
          <span className="text-fg-faint">levels </span>
          <span className="tabular font-semibold text-fg">{m.levels.toLocaleString('en-US')}</span>
        </div>
        <div>
          <span className="text-fg-faint">bytes/param </span>
          <span className="tabular font-semibold text-fg">{m.bytes}</span>
        </div>
        <div>
          <span className="text-fg-faint">7B base </span>
          <span className="tabular font-semibold text-[#5eead4]">{m.gb7b} GB</span>
        </div>
        <div>
          <span className="text-fg-faint">fits 16 GB GPU? </span>
          <span className={`font-semibold ${m.gb7b <= 7 ? 'text-[#5eead4]' : 'text-[#f87171]'}`}>
            {m.gb7b === 14 ? 'no room to train' : m.gb7b === 7 ? 'barely' : 'yes, with room to train'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            error across 2,048 weights
          </div>
          <ErrorHistogram mode={mode} />
        </div>
        <div>
          <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            memory for a 7B frozen base
          </div>
          <MemoryBars mode={mode} />
        </div>
      </div>
    </div>
  );
}
