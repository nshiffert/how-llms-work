import { useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Vanishing Gradients lesson. Two views of the same
// disease — a multiplicative chain of sub-1 factors:
//
//   DEPTH: a 20-layer stack. Each bar is the gradient magnitude reaching that
//   layer during backprop (log scale). Controls pick the activation (its
//   derivative sets the per-layer factor), toggle residual connections (the
//   1 + f' identity path), and toggle layer norm (keeps pre-activations in
//   the responsive zone). Watch sigmoid + no fixes die by layer 10; flip
//   residuals on and the signal reaches layer 1 nearly intact.
//
//   DISTANCE: the same chain through *time*. A dependency 50 tokens back
//   costs an RNN 49 sequential hops (0.9^49 ≈ 0.006); attention crosses it
//   in one hop (0.9). Slider sets the distance.
//
// The per-layer model is deterministic (no RNG) and documented inline:
// factor = |W_k| · act'  without residuals, or |1 + branch'| with them.

const LAYERS = 20;

// Fixed per-layer weight gains |W_k| — pseudo-random but hardcoded, with
// geometric mean ≈ 1 so ReLU (act' = 1) neither dies nor explodes by design.
const GAIN = [
  1.062, 0.961, 1.02, 0.905, 1.116, 0.97, 1.051, 0.923, 1.0, 1.073, 0.951,
  1.03, 0.905, 1.094, 0.98, 1.041, 0.932, 1.062, 0.961, 0.99,
];

// Sign of each layer's residual-branch derivative — mixed, half and half,
// the way real Jacobian entries come out.
const SIGN = [1, -1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, -1, 1, -1, 1, -1, -1];

type Act = 'sigmoid' | 'tanh' | 'relu';

// Activation derivative in the regime layer norm keeps you in (near the
// responsive zone) vs. where activations drift without it (saturated /
// partly dead). sigmoid'(0) = 0.25, sigmoid'(±2) ≈ 0.105; tanh'(0.5) ≈ 0.79,
// tanh'(1) = 0.42; ReLU' = 1 when active, ~10% dead units without norm.
const ACT_DERIV: Record<Act, { ln: number; noLn: number }> = {
  sigmoid: { ln: 0.25, noLn: 0.105 },
  tanh: { ln: 0.79, noLn: 0.42 },
  relu: { ln: 1.0, noLn: 0.9 },
};

const ACT_LABEL: Record<Act, string> = {
  sigmoid: "sigmoid — σ′ ≤ 0.25",
  tanh: "tanh — near-0 slope ≈ 0.8",
  relu: "ReLU — slope = 1 active",
};

// Gradient magnitude reaching each layer, walking backward from the loss.
// Returns g[0] = layer 1 (deepest from the loss) … g[19] = layer 20.
function depthGradients(act: Act, residual: boolean, layerNorm: boolean): number[] {
  const d = layerNorm ? ACT_DERIV[act].ln : ACT_DERIV[act].noLn;
  const g = new Array<number>(LAYERS);
  let acc = 1.0; // gradient at the loss
  for (let k = LAYERS - 1; k >= 0; k--) {
    let factor: number;
    if (residual) {
      // y = x + f(x) → dy/dx = 1 + f'. Layer norm keeps branch output small
      // (scale 0.12); without it the branch swings harder and the residual
      // stream drifts upward (scale 0.35 plus a positive drift term).
      const branch = SIGN[k] * GAIN[k] * d * (layerNorm ? 0.12 : 0.35);
      const drift = layerNorm ? 0 : 0.12 * d;
      factor = Math.abs(1 + branch + drift);
    } else {
      factor = GAIN[k] * d;
    }
    acc *= factor;
    g[k] = acc;
  }
  return g;
}

const LOG_MIN = -13;
const LOG_MAX = 2;

function heightPct(g: number): number {
  const t = (Math.log10(Math.max(g, 1e-14)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.min(Math.max(t, 0.015), 1) * 100;
}

function barColor(g: number): string {
  if (g >= 10) return '#fb923c'; // exploding side
  if (g >= 0.1) return '#5eead4'; // healthy
  if (g >= 1e-4) return '#fbbf24'; // fading
  return '#f87171'; // dead
}

function fmtMag(g: number): string {
  if (g === 0) return '0';
  if (g >= 0.01) return g.toFixed(2);
  return g.toExponential(1).replace('e-', 'e−');
}

function verdict(g1: number): { text: string; color: string } {
  if (g1 < 1e-6) return { text: 'dead — layer 1 has stopped learning', color: '#f87171' };
  if (g1 < 0.03) return { text: 'faint — layer 1 learns orders of magnitude slower', color: '#fbbf24' };
  if (g1 <= 30) return { text: 'healthy — every layer gets a usable signal', color: '#5eead4' };
  return { text: 'exploding — updates blow past the weights; clipping time', color: '#fb923c' };
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded border px-2 py-1 font-mono text-2xs transition-colors ${
        on
          ? 'border-accent/60 bg-accent/15 text-fg'
          : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
      }`}
    >
      <span
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{ background: on ? '#5eead4' : '#30363d' }}
      />
      {children}
    </button>
  );
}

function DepthView() {
  const [act, setAct] = useState<Act>('sigmoid');
  const [residual, setResidual] = useState(false);
  const [layerNorm, setLayerNorm] = useState(false);

  const g = depthGradients(act, residual, layerNorm);
  const v = verdict(g[0]);
  const d = layerNorm ? ACT_DERIV[act].ln : ACT_DERIV[act].noLn;

  // Remount the bars when settings change so the backward sweep replays.
  const settingsKey = `${act}-${residual}-${layerNorm}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="activation function">
          <span className="mr-1 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            activation
          </span>
          {(['sigmoid', 'tanh', 'relu'] as Act[]).map((a) => (
            <button
              key={a}
              onClick={() => setAct(a)}
              aria-pressed={act === a}
              className={`rounded border px-2 py-1 font-mono text-2xs transition-colors ${
                act === a
                  ? 'border-accent/60 bg-accent/15 text-fg'
                  : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
              }`}
            >
              {a === 'relu' ? 'ReLU' : a}
            </button>
          ))}
        </div>
        <Toggle on={residual} onClick={() => setResidual((r) => !r)}>
          residual connections
        </Toggle>
        <Toggle on={layerNorm} onClick={() => setLayerNorm((l) => !l)}>
          layer norm
        </Toggle>
      </div>

      {/* Bars: layer 1 on the left, loss on the right — gradient flows right → left */}
      <div className="relative h-44 rounded-lg border border-line bg-ink-900/40 px-2 pt-2">
        {/* healthy band 0.1 … 10 */}
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            bottom: `${heightPct(0.1)}%`,
            height: `${heightPct(10) - heightPct(0.1)}%`,
            background: 'rgba(94,234,212,0.06)',
          }}
        />
        {/* g = 1 line */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
          style={{ bottom: `${heightPct(1)}%` }}
        >
          <span className="absolute right-1 -top-4 font-mono text-2xs text-fg-faint">
            |g| = 1
          </span>
        </div>

        <div key={settingsKey} className="flex h-full items-end gap-[3px]">
          {g.map((val, i) => (
            <motion.div
              key={i}
              className="min-w-0 flex-1 rounded-t-sm"
              style={{ background: barColor(val) }}
              initial={{ height: '1.5%', opacity: 0.4 }}
              animate={{ height: `${heightPct(val)}%`, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 220,
                damping: 28,
                delay: (LAYERS - 1 - i) * 0.045, // sweep from the loss backward
              }}
              title={`layer ${i + 1}: |g| ≈ ${fmtMag(val)}`}
            />
          ))}
          {/* the loss end: gradient starts at 1.0 */}
          <motion.div
            className="min-w-0 flex-1 rounded-t-sm"
            style={{ background: '#6ea8fe' }}
            initial={{ height: '1.5%' }}
            animate={{ height: `${heightPct(1)}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            title="loss: |g| = 1.0"
          />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-2xs text-fg-faint">
        <span>layer 1</span>
        <span>layer 10</span>
        <span className="flex items-center gap-1">
          layer 20
          <span
            className="ml-2 inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: '#6ea8fe' }}
            aria-hidden="true"
          />
          loss, |g| = 1.0
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line bg-ink-900/60 p-3">
        <div className="font-mono text-2xs text-fg-muted">
          per-layer factor ≈{' '}
          {residual ? (
            <span className="text-fg">1 + branch′ · {(layerNorm ? 0.12 * d : 0.47 * d).toFixed(2)}</span>
          ) : (
            <span className="text-fg">|W| · {d.toFixed(2)}</span>
          )}
          <span className="ml-2 text-fg-faint">({ACT_LABEL[act]}{layerNorm ? '' : ', drifting into saturation'})</span>
        </div>
        <div className="font-mono text-xs">
          <span className="text-fg-faint">reaching layer 1: </span>
          <span className="tabular font-semibold" style={{ color: v.color }}>
            {fmtMag(g[0])}
          </span>
          <span className="ml-2 text-2xs" style={{ color: v.color }}>
            {v.text}
          </span>
        </div>
      </div>
    </div>
  );
}

function DistanceView() {
  const [dist, setDist] = useState(50);
  const HOP = 0.9; // survival factor per multiplicative hop

  const rnn = Math.pow(HOP, dist - 1);
  const attn = HOP;

  const rows = [
    {
      label: 'RNN — sequential chain',
      hops: dist - 1,
      value: rnn,
      note: `0.9^${dist - 1}`,
    },
    {
      label: 'attention — direct edge',
      hops: 1,
      value: attn,
      note: '0.9¹',
    },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          dependency distance
          <input
            type="range"
            min={2}
            max={200}
            value={dist}
            onChange={(e) => setDist(Number(e.target.value))}
            className="w-40 accent-[#6ea8fe]"
            aria-label="dependency distance in tokens"
          />
        </label>
        <span className="font-mono text-xs text-fg">
          {dist} tokens back
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((r) => {
          const w = Math.max(heightPct(r.value), 1.5);
          return (
            <div key={r.label}>
              <div className="mb-1 flex items-baseline justify-between font-mono text-2xs">
                <span className="text-fg-muted">{r.label}</span>
                <span className="text-fg-faint">
                  {r.hops} multiplicative hop{r.hops === 1 ? '' : 's'} · {r.note}
                </span>
              </div>
              <div className="relative h-6 rounded bg-ink-600">
                <motion.div
                  className="absolute inset-y-0.5 left-0.5 rounded-sm"
                  style={{ background: barColor(r.value) }}
                  animate={{ width: `${w}%` }}
                  transition={{ type: 'spring', stiffness: 250, damping: 30 }}
                />
                <span className="tabular absolute right-2 top-1/2 -translate-y-1/2 font-mono text-2xs text-fg">
                  {fmtMag(r.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-2xs leading-snug text-fg-faint">
        Same log scale as the depth view. The RNN pays one sub-1 factor per token of
        distance because information has to be handed step by step through the hidden
        state; attention scores every pair directly, so the path from any token to any
        other is one hop regardless of distance. Drag to 200 and watch the chain hit
        {' '}{fmtMag(Math.pow(HOP, 199))} while the direct edge stays at 0.90.
      </p>
    </div>
  );
}

export default function GradientFlowExplorer() {
  const [view, setView] = useState<'depth' | 'distance'>('depth');

  return (
    <div className="font-sans text-sm">
      <div className="mb-3 flex items-center gap-1" role="tablist" aria-label="view">
        {(
          [
            ['depth', '20 layers deep'],
            ['distance', 'through the sequence'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`rounded border px-2.5 py-1 font-mono text-2xs transition-colors ${
              view === id
                ? 'border-accent/60 bg-accent/15 text-fg'
                : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'depth' ? <DepthView /> : <DistanceView />}
    </div>
  );
}
