import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the LoRA lesson. One rank slider drives two linked views:
//
//   DECOMPOSITION: the frozen base matrix W (768×768) drawn to scale next to
//   the two trainable LoRA matrices B (768×r) and A (r×768). Dragging r
//   visibly fattens B and A while the live parameter counter tracks 2·d·r
//   against W's d² = 589,824. A "merge" toggle folds B·A into W to show the
//   deploy-time form W′ = W + B·A — same shape as W, zero extra latency.
//
//   COVERAGE: how much of a fine-tune update the top-r directions capture.
//   The teal curve is a toy update whose singular values decay exponentially
//   (σᵢ = e^(−i/8)) — the fast decay observed on real fine-tuning updates.
//   The gray line is a flat-spectrum random matrix, where rank r only ever
//   buys you r/768 of the energy. The gap between the curves IS the reason
//   low rank works.
//
// Everything is deterministic — no RNG, no timers.

const D = 768;
const W_PARAMS = D * D; // 589,824
const RANKS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 384, 768];
const SIDE = 148; // px — the on-screen size of the full 768×768 square

// Fraction of update energy (Σσᵢ²) captured by the top-r singular directions,
// for the toy spectrum σᵢ = e^(−i/8) ⇒ σᵢ² = e^(−i/4), a geometric series.
function energyDecaying(r: number): number {
  return (1 - Math.exp(-r / 4)) / (1 - Math.exp(-D / 4));
}

function energyFlat(r: number): number {
  return r / D;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtPct(x: number): string {
  const v = x * 100;
  if (v >= 99.95 && v <= 100.05) return '100%';
  if (v < 0.1) return '<0.1%';
  if (v > 100) return `${Math.round(v)}%`;
  return `${v.toFixed(v < 10 ? 2 : 1)}%`;
}

function verdict(r: number): { text: string; color: string } {
  if (r <= 16) return { text: 'sweet spot — the update fits, the parameter bill stays tiny', color: '#5eead4' };
  if (r <= 64) return { text: 'diminishing returns — the coverage curve flattened already', color: '#fbbf24' };
  if (r < 384) return { text: 'parameter count ballooning; the extra rank buys almost nothing', color: '#fb923c' };
  if (r === 384) return { text: 'break-even: B·A now holds exactly as many parameters as W itself', color: '#fb923c' };
  return { text: 'B·A has MORE parameters than W — you rebuilt full fine-tuning, worse', color: '#f87171' };
}

function MatrixLabel({ name, dims, params, tone }: { name: string; dims: string; params: string; tone: 'frozen' | 'train' }) {
  return (
    <div className="text-center font-mono text-2xs leading-tight">
      <div className={tone === 'train' ? 'font-semibold text-[#5eead4]' : 'font-semibold text-fg-muted'}>{name}</div>
      <div className="text-fg-faint">{dims}</div>
      <div className="text-fg-faint">{params}</div>
    </div>
  );
}

function Decomposition({ r, merged }: { r: number; merged: boolean }) {
  const thin = Math.max(3, (SIDE * r) / D); // on-screen thickness of the rank-r side
  const loraParams = 2 * D * r;

  return (
    <div className="relative min-h-[15rem] rounded-lg border border-line bg-ink-900/40 p-4">
      <AnimatePresence mode="wait" initial={false}>
        {!merged ? (
          <motion.div
            key="split"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3"
          >
            {/* W — frozen */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex items-center justify-center rounded-sm border border-line"
                style={{ width: SIDE, height: SIDE, background: '#242a33' }}
              >
                <span className="font-mono text-2xs text-fg-faint">frozen 🔒</span>
              </div>
              <MatrixLabel name="W" dims="768 × 768" params="589,824 params" tone="frozen" />
            </div>

            <span className="font-mono text-lg text-fg-muted">+</span>

            {/* B — trainable, 768 × r */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className="rounded-sm border"
                style={{ borderColor: '#5eead4', background: 'rgba(94,234,212,0.22)' }}
                animate={{ width: thin, height: SIDE }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              />
              <MatrixLabel name="B" dims={`768 × ${r}`} params={`${fmtInt(D * r)} params`} tone="train" />
            </div>

            <span className="font-mono text-lg text-fg-muted">·</span>

            {/* A — trainable, r × 768 */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className="rounded-sm border"
                style={{ borderColor: '#5eead4', background: 'rgba(94,234,212,0.22)' }}
                animate={{ width: SIDE, height: thin }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              />
              <MatrixLabel name="A" dims={`${r} × 768`} params={`${fmtInt(D * r)} params`} tone="train" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="merged"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center justify-center gap-2 py-2"
          >
            <div
              className="flex items-center justify-center rounded-sm border"
              style={{
                width: SIDE,
                height: SIDE,
                borderColor: '#5eead4',
                background: 'linear-gradient(135deg, #242a33 55%, rgba(94,234,212,0.25))',
              }}
            >
              <span className="font-mono text-2xs text-fg">W′ = W + B·A</span>
            </div>
            <MatrixLabel name="W′" dims="768 × 768" params="same shape as W" tone="train" />
            <p className="max-w-xs text-center text-2xs leading-snug text-fg-faint">
              Folded once before serving: the {fmtInt(loraParams)}-parameter detour disappears
              into the base matrix. Inference runs the exact same graph as the base model —
              zero extra latency, and unfolding (subtract B·A) gets the base back.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CoverageCurve({ r }: { r: number }) {
  const W = 560;
  const H = 190;
  const padL = 42;
  const padR = 14;
  const padT = 12;
  const padB = 26;
  const logMax = Math.log2(D);

  const x = (rank: number) => padL + (Math.log2(rank) / logMax) * (W - padL - padR);
  const y = (e: number) => padT + (1 - e) * (H - padT - padB);

  const N = 120;
  const pts = Array.from({ length: N + 1 }, (_, i) => Math.pow(2, (i / N) * logMax));
  const pathDecay = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(energyDecaying(p)).toFixed(1)}`).join(' ');
  const pathFlat = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(energyFlat(p)).toFixed(1)}`).join(' ');

  const eD = energyDecaying(r);
  const eF = energyFlat(r);
  // Rank a flat-spectrum matrix would need to match the decaying curve's coverage.
  const flatEquiv = Math.min(D, Math.ceil(eD * D));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Update energy captured versus rank, decaying spectrum versus flat spectrum">
        {/* y gridlines at 0 / 50 / 100% */}
        {[0, 0.5, 1].map((e) => (
          <g key={e}>
            <line x1={padL} x2={W - padR} y1={y(e)} y2={y(e)} stroke="#30363d" strokeWidth="1" strokeDasharray={e === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(e) + 3} textAnchor="end" fontSize="9" fill="#8b949e" fontFamily="monospace">
              {Math.round(e * 100)}%
            </text>
          </g>
        ))}
        {/* x ticks */}
        {[1, 8, 64, 384, 768].map((t) => (
          <text key={t} x={x(t)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#8b949e" fontFamily="monospace">
            r={t}
          </text>
        ))}
        <path d={pathFlat} fill="none" stroke="#8b949e" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={pathDecay} fill="none" stroke="#5eead4" strokeWidth="2" />
        {/* current-rank markers */}
        <line x1={x(r)} x2={x(r)} y1={padT} y2={H - padB} stroke="#6ea8fe" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={x(r)} cy={y(eF)} r="4" fill="#8b949e" />
        <circle cx={x(r)} cy={y(eD)} r="4.5" fill="#5eead4" stroke="#0d1117" strokeWidth="1.5" />
        {/* legend */}
        <g fontFamily="monospace" fontSize="9">
          <line x1={W - 205} x2={W - 185} y1={padT + 6} y2={padT + 6} stroke="#5eead4" strokeWidth="2" />
          <text x={W - 180} y={padT + 9} fill="#c9d1d9">fine-tune update (σᵢ = e^(−i/8))</text>
          <line x1={W - 205} x2={W - 185} y1={padT + 20} y2={padT + 20} stroke="#8b949e" strokeWidth="1.5" strokeDasharray="4 4" />
          <text x={W - 180} y={padT + 23} fill="#8b949e">random matrix (flat spectrum)</text>
        </g>
      </svg>
      <p className="mt-1 text-2xs leading-snug text-fg-muted">
        Rank {r} captures <span className="font-semibold text-[#5eead4]">{fmtPct(eD)}</span> of the
        fast-decaying update using <span className="font-semibold text-fg">{fmtPct((2 * D * r) / W_PARAMS)}</span> of
        W&apos;s parameters. A flat-spectrum matrix would need rank {fmtInt(flatEquiv)} for the same coverage —
        at rank {r} it only reaches {fmtPct(eF)}. Low rank works <em>because</em> the spectrum decays.
      </p>
      <p className="mt-1.5 text-2xs leading-snug text-fg-faint">
        Toy model, disclosed: &quot;energy&quot; is the fraction of Σσᵢ² in the top-r singular directions. The
        e^(−i/8) decay is illustrative of the fast falloff measured on real fine-tuning updates; a random
        dense matrix&apos;s spectrum is essentially flat, so rank r buys exactly r/768 of it.
      </p>
    </div>
  );
}

export default function LoraRankExplorer() {
  const [ri, setRi] = useState(3); // r = 8
  const [merged, setMerged] = useState(false);
  const r = RANKS[ri];

  const loraParams = 2 * D * r;
  const reduction = W_PARAMS / loraParams; // = 384 / r
  const v = verdict(r);

  return (
    <div className="font-sans text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          rank r
          <input
            type="range"
            min={0}
            max={RANKS.length - 1}
            step={1}
            value={ri}
            onChange={(e) => setRi(Number(e.target.value))}
            className="w-44 accent-[#5eead4]"
            aria-label="LoRA rank"
          />
        </label>
        <span className="tabular font-mono text-xs font-semibold text-fg">r = {r}</span>
        <button
          onClick={() => setMerged((m) => !m)}
          aria-pressed={merged}
          className={`rounded border px-2 py-1 font-mono text-2xs transition-colors ${
            merged
              ? 'border-accent/60 bg-accent/15 text-fg'
              : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
          }`}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: merged ? '#5eead4' : '#30363d' }}
          />
          merge for inference
        </button>
      </div>

      <Decomposition r={r} merged={merged} />

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs">
        <div>
          <span className="text-fg-faint">trainable </span>
          <span className="tabular font-semibold text-[#5eead4]">{fmtInt(loraParams)}</span>
          <span className="text-fg-faint"> = 2·768·{r}</span>
        </div>
        <div>
          <span className="text-fg-faint">share of W </span>
          <span className="tabular font-semibold text-fg">{fmtPct(loraParams / W_PARAMS)}</span>
        </div>
        <div>
          <span className="text-fg-faint">reduction </span>
          <span className="tabular font-semibold text-fg">
            {reduction === 1
              ? '1× — break-even'
              : reduction > 1
                ? `${reduction % 1 === 0 ? reduction : reduction.toFixed(1)}× fewer`
                : `${(1 / reduction).toFixed(0)}× MORE`}
          </span>
        </div>
        <div className="w-full text-2xs" style={{ color: v.color }}>
          {v.text}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          how much of the update does rank r capture?
        </div>
        <CoverageCurve r={r} />
      </div>
    </div>
  );
}
