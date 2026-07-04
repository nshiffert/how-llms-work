import { useMemo, useState } from 'react';

// Positional-encoding explorer for the Positional Encoding lesson. Three coupled views:
//   1. The sinusoidal matrix as a heatmap (row = position, column = dimension) so the
//      stacked wave bands — fast on the left, glacial on the right — are visible at a glance.
//   2. A two-position comparison: pick two positions, see their encoding vectors overlaid
//      as line graphs and the dot-product similarity. Drag either one and notice the
//      similarity depends ONLY on the offset between them, never on where they sit.
//   3. A four-method panel (sinusoidal / learned / RoPE / ALiBi) driven by one shared
//      position slider that crosses the training-length boundary, so extrapolation
//      behavior is something you watch happen rather than read about.

const D = 32; // model dim for the heatmap / comparison (16 sin·cos pairs)
const N_POS = 64; // heatmap rows
const BASE = 10000;

// PE(pos, 2i) = sin(pos / BASE^(2i/d)) · PE(pos, 2i+1) = cos(pos / BASE^(2i/d))
function peVector(pos: number, d: number = D): number[] {
  const v: number[] = [];
  for (let i = 0; i < d / 2; i++) {
    const div = Math.pow(BASE, (2 * i) / d);
    v.push(Math.sin(pos / div), Math.cos(pos / div));
  }
  return v;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

// Diverging color on the dark surface: +1 → blue, −1 → amber, 0 → transparent.
function cellColor(v: number): string {
  return v >= 0
    ? `rgba(110,168,254,${(v * 0.92).toFixed(3)})`
    : `rgba(245,168,94,${(-v * 0.92).toFixed(3)})`;
}

// Deterministic stand-in for a *learned* position table (must render identically on
// server and client, so no Math.random) — hash each (pos, dim) to a value in [−1, 1].
function learnedValue(pos: number, dim: number): number {
  const x = Math.sin((pos * D + dim) * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// ── View 1: the sinusoidal matrix ─────────────────────────────────────────────
function PeHeatmap({ posA, posB }: { posA: number; posB: number }) {
  const cw = 11;
  const ch = 5;
  const gap = 1;
  const w = D * (cw + gap);
  const h = N_POS * (ch + gap);
  const rows = useMemo(
    () => Array.from({ length: N_POS }, (_, p) => peVector(p)),
    [],
  );
  return (
    <svg
      viewBox={`-30 -14 ${w + 34} ${h + 18}`}
      className="w-full"
      role="img"
      aria-label="sinusoidal positional encoding matrix, position by dimension"
    >
      <text x={-30} y={-5} fill="#6b7689" fontSize={7} fontFamily="monospace">
        pos ↓
      </text>
      <text x={w / 2} y={-5} fill="#6b7689" fontSize={7} fontFamily="monospace" textAnchor="middle">
        dimension 0 … {D - 1} → (frequency drops left to right)
      </text>
      {rows.map((row, p) => (
        <g key={p}>
          {p % 8 === 0 && (
            <text
              x={-6}
              y={p * (ch + gap) + ch}
              fill="#6b7689"
              fontSize={6}
              fontFamily="monospace"
              textAnchor="end"
            >
              {p}
            </text>
          )}
          {row.map((v, d) => (
            <rect
              key={d}
              x={d * (cw + gap)}
              y={p * (ch + gap)}
              width={cw}
              height={ch}
              fill={cellColor(v)}
            />
          ))}
        </g>
      ))}
      {[posA, posB].map((p, i) => (
        <rect
          key={i}
          x={-1.5}
          y={p * (ch + gap) - 0.75}
          width={w + 1.5}
          height={ch + 1.5}
          fill="none"
          stroke={i === 0 ? '#6ea8fe' : '#5eead4'}
          strokeWidth={1.4}
          rx={1.5}
        />
      ))}
    </svg>
  );
}

// ── View 2: two positions, overlaid vectors + similarity ─────────────────────
function VectorLines({ posA, posB }: { posA: number; posB: number }) {
  const w = 340;
  const h = 96;
  const toPts = (vec: number[]) =>
    vec
      .map((v, d) => `${(d / (D - 1)) * w},${h / 2 - v * (h / 2 - 4)}`)
      .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="encoding vectors of the two selected positions">
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#222a37" strokeWidth={1} />
      <polyline points={toPts(peVector(posA))} fill="none" stroke="#6ea8fe" strokeWidth={1.6} />
      <polyline points={toPts(peVector(posB))} fill="none" stroke="#5eead4" strokeWidth={1.6} />
    </svg>
  );
}

function SimilarityCurve({ posA, posB }: { posA: number; posB: number }) {
  // dot(PE(posA), PE(posA + k)) / (D/2) for offsets k — the curve every position shares.
  const w = 340;
  const h = 72;
  const maxK = 63;
  const pts = useMemo(() => {
    const a = peVector(posA);
    return Array.from({ length: maxK + 1 }, (_, k) => {
      const s = dot(a, peVector(posA + k)) / (D / 2);
      return `${(k / maxK) * w},${h - ((s + 1) / 2) * (h - 6) - 3}`;
    }).join(' ');
  }, [posA]);
  const kSel = Math.abs(posB - posA);
  return (
    <svg viewBox={`0 0 ${w} ${h + 10}`} className="w-full" role="img" aria-label="similarity as a function of position offset">
      <line x1={0} y1={h - (0.5 * (h - 6) + 3)} x2={w} y2={h - (0.5 * (h - 6) + 3)} stroke="#222a37" strokeWidth={1} />
      <polyline points={pts} fill="none" stroke="#9aa6b8" strokeWidth={1.4} />
      {kSel <= maxK && (
        <circle
          cx={(kSel / maxK) * w}
          cy={h - ((dot(peVector(posA), peVector(posA + kSel)) / (D / 2) + 1) / 2) * (h - 6) - 3}
          r={3.5}
          fill="#5eead4"
        />
      )}
      <text x={0} y={h + 9} fill="#6b7689" fontSize={7} fontFamily="monospace">
        offset 0
      </text>
      <text x={w} y={h + 9} fill="#6b7689" fontSize={7} fontFamily="monospace" textAnchor="end">
        offset {maxK}
      </text>
    </svg>
  );
}

// ── View 3: four methods crossing the training-length boundary ────────────────
const TRAIN_MAX = 32; // pretend the model was trained on positions 0..31
const P_MAX = 64; // the shared slider goes twice as far

function StripRow({ values }: { values: number[] }) {
  const cw = 9;
  const gap = 1;
  return (
    <svg viewBox={`0 0 ${values.length * (cw + gap)} 14`} className="w-full">
      {values.map((v, i) => (
        <rect key={i} x={i * (cw + gap)} y={0} width={cw} height={14} rx={1} fill={cellColor(v)} />
      ))}
    </svg>
  );
}

function RopeDial({ pos, omega, label }: { pos: number; omega: number; label: string }) {
  const r = 17;
  const ang = pos * omega;
  const x = Math.cos(ang) * r;
  const y = -Math.sin(ang) * r;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg viewBox="-22 -22 44 44" className="h-12 w-12">
        <circle cx={0} cy={0} r={r} fill="none" stroke="#222a37" strokeWidth={1.5} />
        <line x1={0} y1={0} x2={x} y2={y} stroke="#b692f6" strokeWidth={2} strokeLinecap="round" />
        <circle cx={x} cy={y} r={2.4} fill="#b692f6" />
      </svg>
      <span className="font-mono text-2xs text-fg-faint">{label}</span>
    </div>
  );
}

function AlibiRamp({ pos }: { pos: number }) {
  const m = 0.25; // one head's slope
  const slots = 14; // most recent keys shown
  const shown = Math.min(pos + 1, slots);
  return (
    <svg viewBox={`0 0 ${slots * 11} 40`} className="w-full">
      {Array.from({ length: shown }, (_, i) => {
        const dist = shown - 1 - i;
        const bias = -m * (pos - (pos - dist)); // = −m·dist, spelled out
        const hgt = Math.min(-bias * 9, 34);
        return (
          <g key={i}>
            <rect
              x={i * 11}
              y={4}
              width={9}
              height={Math.max(hgt, 0.5)}
              rx={1}
              fill={dist === 0 ? '#5eead4' : 'rgba(245,168,94,0.75)'}
            />
          </g>
        );
      })}
    </svg>
  );
}

const VERDICTS = {
  ok: { text: 'keeps working', cls: 'border-live/40 text-live' },
  bend: { text: 'defined, but misread', cls: 'border-cat-generation/40 text-cat-generation' },
  dead: { text: 'undefined — hard stop', cls: 'border-cat-math/40 text-cat-math' },
};

function MethodCard({
  title,
  acts,
  verdict,
  past,
  children,
  note,
}: {
  title: string;
  acts: string;
  verdict: keyof typeof VERDICTS;
  past: boolean;
  children: React.ReactNode;
  note: string;
}) {
  const v = VERDICTS[verdict];
  return (
    <div className="flex flex-col rounded-lg border border-line bg-ink-900/40 p-3">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-fg">{title}</span>
        {past && (
          <span className={`rounded border px-1.5 py-px font-mono text-2xs ${v.cls}`}>{v.text}</span>
        )}
      </div>
      <div className="mb-2 text-2xs text-fg-faint">acts on: {acts}</div>
      <div className="flex min-h-[3.25rem] flex-1 items-center">{children}</div>
      <div className="mt-2 text-2xs leading-snug text-fg-muted">{note}</div>
    </div>
  );
}

export default function PositionalEncodingExplorer() {
  const [posA, setPosA] = useState(7);
  const [posB, setPosB] = useState(12);
  const [p, setP] = useState(20); // shared slider for the method panel

  const vecA = peVector(posA);
  const vecB = peVector(posB);
  const rawDot = dot(vecA, vecB);
  const sim = rawDot / (D / 2); // ‖PE‖² = D/2, so this is cosine similarity
  const offset = Math.abs(posB - posA);
  const past = p >= TRAIN_MAX;

  return (
    <div className="font-sans text-sm">
      {/* ── 1 · the matrix ── */}
      <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
        the whole encoding at once — {N_POS} positions × {D} dimensions, one row per position
      </div>
      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <PeHeatmap posA={posA} posB={posB} />
          <p className="mt-2 text-2xs leading-snug text-fg-faint">
            <span className="text-accent">blue</span> = positive,{' '}
            <span className="text-cat-generation">amber</span> = negative. Left columns cycle every
            ~6 positions; right columns barely move in 64. Every row is unique, and rows drift apart
            smoothly — that is the entire trick.
          </p>
        </div>

        {/* ── 2 · two-position comparison ── */}
        <div className="flex flex-col rounded-lg border border-line bg-ink-900/40 p-3">
          {(
            [
              ['position A', posA, setPosA, '#6ea8fe'],
              ['position B', posB, setPosB, '#5eead4'],
            ] as const
          ).map(([label, val, set, color]) => (
            <div key={label} className="mb-2 flex items-center gap-2">
              <label className="w-20 shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint">
                {label}
              </label>
              <input
                type="range"
                min={0}
                max={N_POS - 1}
                value={val}
                onChange={(e) => set(parseInt(e.target.value, 10))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500"
                style={{ accentColor: color }}
              />
              <span className="w-8 shrink-0 text-right font-mono text-sm tabular" style={{ color }}>
                {val}
              </span>
            </div>
          ))}
          <VectorLines posA={posA} posB={posB} />
          <div className="my-2 flex items-baseline gap-3 rounded-lg border border-line bg-ink-900/50 px-3 py-2">
            <span className="text-2xs uppercase tracking-wider text-fg-faint">similarity</span>
            <span className="font-mono text-lg tabular text-live">{sim.toFixed(3)}</span>
            <span className="font-mono text-2xs tabular text-fg-faint">
              dot {rawDot.toFixed(2)} · offset {offset}
            </span>
          </div>
          <SimilarityCurve posA={posA} posB={posB} />
          <p className="mt-1 text-2xs leading-snug text-fg-faint">
            The grey curve is similarity vs. offset, recomputed <em>from position A</em>; the dot
            marks the current offset |A−B|. Drag A: the curve is rebuilt from a new starting
            position, yet its shape never changes. Similarity depends only on the gap between two
            positions — relative position falls out of the encoding for free.
          </p>
        </div>
      </div>

      {/* ── 3 · four methods, one slider ── */}
      <div className="mb-2 mt-5 text-2xs font-medium uppercase tracking-wider text-fg-faint">
        what each scheme does at position p — drag past the training length and watch who survives
      </div>
      <div className="mb-3 flex items-center gap-3">
        <label htmlFor="pe-pos" className="shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          position p
        </label>
        <div className="relative flex-1">
          <input
            id="pe-pos"
            type="range"
            min={0}
            max={P_MAX}
            value={p}
            onChange={(e) => setP(parseInt(e.target.value, 10))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
          />
          <div
            className="pointer-events-none absolute -top-1 bottom-0 w-px bg-cat-math/70"
            style={{ left: `${(TRAIN_MAX / P_MAX) * 100}%` }}
            title="training max length"
          />
        </div>
        <span className={`w-24 shrink-0 text-right font-mono text-sm tabular ${past ? 'text-cat-math' : 'text-live'}`}>
          p = {p} {past ? '· past max' : ''}
        </span>
      </div>
      <p className="mb-3 text-2xs text-fg-faint">
        The <span className="text-cat-math">rose line</span> marks the longest position seen in
        training (here {TRAIN_MAX}). Everything to its right is extrapolation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MethodCard
          title="Sinusoidal"
          acts="input embedding (added)"
          verdict="bend"
          past={past}
          note={`The formula produces a valid vector at any p — but the model never learned to read phase combinations past ${TRAIN_MAX}, so quality decays.`}
        >
          <StripRow values={peVector(p, D)} />
        </MethodCard>
        <MethodCard
          title="Learned"
          acts="input embedding (added)"
          verdict="dead"
          past={past}
          note={
            past
              ? `There is no row ${p} in a ${TRAIN_MAX}-row table. Nothing to look up — the model cannot run at this length.`
              : `Row ${p} of a trained ${TRAIN_MAX}-row lookup table. Flexible, but the table ends where training ended.`
          }
        >
          {past ? (
            <div className="w-full rounded border border-dashed border-cat-math/50 px-2 py-2 text-center font-mono text-2xs text-cat-math">
              table[{p}] → index out of range
            </div>
          ) : (
            <StripRow values={Array.from({ length: D }, (_, d) => learnedValue(p, d))} />
          )}
        </MethodCard>
        <MethodCard
          title="RoPE"
          acts="Q and K (rotated)"
          verdict="ok"
          past={past}
          note="Each dimension pair rotates by p·ω. Angles are defined at any p, and Q·K depends only on the angle difference — i.e. relative distance."
        >
          <div className="flex w-full items-center justify-center gap-4">
            <RopeDial pos={p} omega={0.5} label="fast pair" />
            <RopeDial pos={p} omega={0.05} label="slow pair" />
          </div>
        </MethodCard>
        <MethodCard
          title="ALiBi"
          acts="attention scores (bias)"
          verdict="ok"
          past={past}
          note="No position vector at all: subtract slope·distance from every attention score. The penalty just keeps growing — any length works."
        >
          <div className="w-full">
            <AlibiRamp pos={p} />
            <div className="mt-0.5 font-mono text-2xs text-fg-faint">
              bias = −0.25·distance, most recent key highlighted
            </div>
            <div className="mt-1 font-mono text-2xs tabular text-fg-muted">
              farthest key: distance {p} → bias <span className={past ? 'text-live' : ''}>−{(0.25 * p).toFixed(2)}</span>
            </div>
          </div>
        </MethodCard>
      </div>
    </div>
  );
}
