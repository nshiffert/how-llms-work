import { useEffect, useState } from 'react';

// Bespoke island for the Catastrophic Forgetting lesson.
//
// A 2-parameter model with two quadratic loss bowls:
//   task A (pretraining)  L_A(w) = ½‖w − a‖²,  a = (0, 0)
//   task B (fine-tune)    L_B(w) = ½‖w − b‖²,  b = (4, 2)
// The weights start at task A's minimum. Three regimes step gradient
// descent (η = 0.3) and draw the walk over the contour map while both
// losses are tracked live:
//
//   FULL FINE-TUNE — descend L_B only. The optimizer never sees L_A, so the
//   weights walk straight to b and task A's loss climbs to ~9.4 of its
//   worst-case 10 by step 10.
//
//   REPLAY — descend (1−m)·L_B + m·L_A. Mixing old-distribution data back in
//   changes the surface being descended: the minimum of the blend sits
//   between the two bowls, so the walk stops at a compromise.
//
//   LORA-STYLE LEASH — train an adapter Δ on L_B with the base w₀ frozen,
//   capping ‖Δ‖ ≤ 1.5 (the low-rank, α/r-scaled detour can only move the
//   function a little). Because the base never moved, the adapter can be
//   unplugged to recover task A exactly — full fine-tuning has no such undo.
//
// Everything is deterministic — no RNG; Play just replays the same steps.

type Mode = 'full' | 'replay' | 'lora';

const A: [number, number] = [0, 0];
const B: [number, number] = [4, 2];
const LR = 0.3;
const LORA_CAP = 1.5;
const MAX_STEPS = 30;

const lossAt = (w: [number, number], c: [number, number]) =>
  0.5 * ((w[0] - c[0]) ** 2 + (w[1] - c[1]) ** 2);

function nextPoint(w: [number, number], mode: Mode, mix: number): [number, number] {
  if (mode === 'full') {
    return [w[0] - LR * (w[0] - B[0]), w[1] - LR * (w[1] - B[1])];
  }
  if (mode === 'replay') {
    const g: [number, number] = [
      (1 - mix) * (w[0] - B[0]) + mix * (w[0] - A[0]),
      (1 - mix) * (w[1] - B[1]) + mix * (w[1] - A[1]),
    ];
    return [w[0] - LR * g[0], w[1] - LR * g[1]];
  }
  // lora: step the adapter Δ = w − w₀ on L_B, then clamp its norm to the cap
  let d: [number, number] = [w[0] - A[0] - LR * (w[0] - B[0]), w[1] - A[1] - LR * (w[1] - B[1])];
  const n = Math.hypot(d[0], d[1]);
  if (n > LORA_CAP) d = [(d[0] * LORA_CAP) / n, (d[1] * LORA_CAP) / n];
  return [A[0] + d[0], A[1] + d[1]];
}

function fmt(x: number): string {
  if (x < 0.005 && x > 0) return x.toFixed(3);
  return x.toFixed(2);
}

// ---- landscape geometry -----------------------------------------------
const W = 560;
const H = 300;
const X_MIN = -1.6;
const X_MAX = 5.8;
const SCALE = W / (X_MAX - X_MIN); // px per weight unit (same for both axes)
const Y_MID = 1.0; // vertical center of view in weight space
const px = (w1: number) => (w1 - X_MIN) * SCALE;
const py = (w2: number) => H / 2 - (w2 - Y_MID) * SCALE;

const CONTOUR_LOSSES = [0.5, 2, 4.5, 8]; // radius = √(2L) → 1, 2, 3, 4

function Contours({ center, color }: { center: [number, number]; color: string }) {
  return (
    <g>
      {CONTOUR_LOSSES.map((L) => (
        <circle
          key={L}
          cx={px(center[0])}
          cy={py(center[1])}
          r={Math.sqrt(2 * L) * SCALE}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity={0.38 - 0.06 * Math.sqrt(2 * L)}
        />
      ))}
    </g>
  );
}

function LossChart({ path }: { path: [number, number][] }) {
  const CW = 560;
  const CH = 120;
  const padL = 34;
  const padR = 10;
  const padT = 8;
  const padB = 18;
  const maxLoss = 10.5;
  const x = (t: number) => padL + (t / MAX_STEPS) * (CW - padL - padR);
  const y = (l: number) => padT + (1 - l / maxLoss) * (CH - padT - padB);
  const line = (c: [number, number]) =>
    path.map((w, t) => `${t === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(lossAt(w, c)).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" role="img" aria-label="Task A and task B loss per gradient step">
      {[0, 5, 10].map((l) => (
        <g key={l}>
          <line x1={padL} x2={CW - padR} y1={y(l)} y2={y(l)} stroke="#30363d" strokeWidth="1" strokeDasharray={l === 0 ? undefined : '3 4'} />
          <text x={padL - 5} y={y(l) + 3} textAnchor="end" fontSize="9" fill="#8b949e" fontFamily="monospace">{l}</text>
        </g>
      ))}
      {[0, 10, 20, 30].map((t) => (
        <text key={t} x={x(t)} y={CH - 4} textAnchor="middle" fontSize="9" fill="#8b949e" fontFamily="monospace">{t}</text>
      ))}
      <path d={line(A)} fill="none" stroke="#6ea8fe" strokeWidth="2" />
      <path d={line(B)} fill="none" stroke="#fbbf24" strokeWidth="2" />
      <g fontFamily="monospace" fontSize="9">
        <line x1={CW - 190} x2={CW - 172} y1={padT + 4} y2={padT + 4} stroke="#6ea8fe" strokeWidth="2" />
        <text x={CW - 167} y={padT + 7} fill="#c9d1d9">task A loss (old knowledge)</text>
        <line x1={CW - 190} x2={CW - 172} y1={padT + 17} y2={padT + 17} stroke="#fbbf24" strokeWidth="2" />
        <text x={CW - 167} y={padT + 20} fill="#8b949e">task B loss (fine-tune target)</text>
      </g>
    </svg>
  );
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'full', label: 'full fine-tune' },
  { id: 'replay', label: 'replay (mix old data)' },
  { id: 'lora', label: 'LoRA-style leash' },
];

function verdict(mode: Mode, step: number, lA: number, lB: number, unplugged: boolean): { text: string; color: string } {
  if (unplugged) {
    return {
      text: 'adapter unplugged — the frozen base is bit-for-bit the pretrained model, task A loss back to 0.00',
      color: '#5eead4',
    };
  }
  if (step === 0) {
    return { text: "you're at task A's minimum (loss 0). Step or Play to start fine-tuning toward task B", color: '#8b949e' };
  }
  if (mode === 'full') {
    if (lA > 8) return { text: `task B mastered (${fmt(lB)}) — task A destroyed (${fmt(lA)} of worst-case 10). Nothing constrained the walk`, color: '#f87171' };
    if (lA > 4) return { text: 'task B loss falling fast — and task A loss climbing just as fast. The optimizer never sees task A', color: '#fb923c' };
    return { text: 'the weights have left task A’s basin and are heading straight for task B’s minimum', color: '#fbbf24' };
  }
  if (mode === 'replay') {
    if (step >= 12) return { text: `settled at a compromise between the bowls — both losses held moderate (A ${fmt(lA)}, B ${fmt(lB)})`, color: '#5eead4' };
    return { text: 'descending the blended surface — its minimum sits between the two bowls, not at task B’s', color: '#fbbf24' };
  }
  if (step >= 6) return { text: `the ‖Δ‖ ≤ 1.5 leash is taut: task A held at ${fmt(lA)} while task B improved 10 → ${fmt(lB)}. Unplug to get A back exactly`, color: '#5eead4' };
  return { text: 'training the adapter on task B — the base weights underneath are frozen', color: '#fbbf24' };
}

export default function ForgettingLandscape() {
  const [mode, setMode] = useState<Mode>('full');
  const [mix, setMix] = useState(0.5);
  const [path, setPath] = useState<[number, number][]>([A]);
  const [playing, setPlaying] = useState(false);
  const [unplugged, setUnplugged] = useState(false);

  const step = path.length - 1;
  const done = step >= MAX_STEPS;
  const wLive = path[path.length - 1];
  const w = unplugged ? A : wLive; // unplugging shows the frozen base
  const lA = lossAt(w, A);
  const lB = lossAt(w, B);

  const advance = () =>
    setPath((p) => (p.length - 1 >= MAX_STEPS ? p : [...p, nextPoint(p[p.length - 1], mode, mix)]));

  useEffect(() => {
    if (!playing) return;
    if (done) {
      setPlaying(false);
      return;
    }
    const id = setInterval(advance, 350);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, done, mode, mix]);

  const reset = (m: Mode = mode) => {
    setMode(m);
    setPath([A]);
    setPlaying(false);
    setUnplugged(false);
  };

  const v = verdict(mode, step, lA, lB, unplugged);

  return (
    <div className="font-sans text-sm">
      {/* mode picker + transport */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => reset(m.id)}
            aria-pressed={mode === m.id}
            className={`rounded border px-2 py-1 font-mono text-2xs transition-colors ${
              mode === m.id
                ? 'border-accent/60 bg-accent/15 text-fg'
                : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={advance}
          disabled={done || unplugged}
          className="rounded border border-line bg-ink-700/60 px-2 py-1 font-mono text-2xs text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          step
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={done || unplugged}
          className="rounded border border-line bg-ink-700/60 px-2 py-1 font-mono text-2xs text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          {playing ? 'pause' : 'play'}
        </button>
        <button
          onClick={() => reset()}
          className="rounded border border-line bg-ink-700/60 px-2 py-1 font-mono text-2xs text-fg-faint transition-colors hover:text-fg-muted"
        >
          reset
        </button>
        {mode === 'lora' && (
          <button
            onClick={() => {
              if (!unplugged) setPlaying(false); // unplugging pauses a running fine-tune
              setUnplugged(!unplugged);
            }}
            aria-pressed={unplugged}
            disabled={step === 0}
            className={`rounded border px-2 py-1 font-mono text-2xs transition-colors disabled:opacity-40 ${
              unplugged
                ? 'border-[#5eead4]/60 bg-[#5eead4]/15 text-fg'
                : 'border-line bg-ink-700/60 text-fg-faint hover:text-fg-muted'
            }`}
          >
            {unplugged ? 're-plug adapter' : 'unplug adapter'}
          </button>
        )}
      </div>

      {mode === 'replay' && (
        <label className="mb-3 flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          replay share m
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.1}
            value={mix}
            onChange={(e) => {
              setMix(Number(e.target.value));
              setPath([A]);
              setPlaying(false);
            }}
            className="w-44 accent-[#5eead4]"
            aria-label="Replay share of old-task data"
          />
          <span className="font-mono text-xs font-semibold normal-case text-fg">
            {Math.round(mix * 100)}% task A · {Math.round((1 - mix) * 100)}% task B
          </span>
        </label>
      )}

      {/* landscape */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Two-bowl loss landscape with the gradient-descent path of the weights">
          <Contours center={A} color="#6ea8fe" />
          <Contours center={B} color="#fbbf24" />

          {/* minima markers */}
          <circle cx={px(A[0])} cy={py(A[1])} r="4" fill="#6ea8fe" />
          <text x={px(A[0]) + 8} y={py(A[1]) - 8} fontSize="10" fill="#6ea8fe" fontFamily="monospace">
            task A minimum (pretrained)
          </text>
          <circle cx={px(B[0])} cy={py(B[1])} r="4" fill="#fbbf24" />
          <text x={px(B[0]) - 8} y={py(B[1]) - 10} fontSize="10" fill="#fbbf24" fontFamily="monospace" textAnchor="end">
            task B minimum (fine-tune target)
          </text>

          {/* LoRA leash radius */}
          {mode === 'lora' && (
            <circle
              cx={px(A[0])}
              cy={py(A[1])}
              r={LORA_CAP * SCALE}
              fill="none"
              stroke="#5eead4"
              strokeWidth="1"
              strokeDasharray="5 4"
              opacity="0.7"
            />
          )}

          {/* walked path */}
          <path
            d={path.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#5eead4"
            strokeWidth="1.5"
            opacity={unplugged ? 0.3 : 0.9}
          />
          {path.map((p, i) => (
            <circle key={i} cx={px(p[0])} cy={py(p[1])} r="2" fill="#5eead4" opacity={unplugged ? 0.3 : 0.75} />
          ))}

          {/* current weights */}
          <circle cx={px(w[0])} cy={py(w[1])} r="5.5" fill="#5eead4" stroke="#0d1117" strokeWidth="2" />
          {unplugged && (
            <line
              x1={px(A[0])}
              y1={py(A[1])}
              x2={px(wLive[0])}
              y2={py(wLive[1])}
              stroke="#5eead4"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* readouts */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs">
        <div>
          <span className="text-fg-faint">step </span>
          <span className="tabular font-semibold text-fg">{step}</span>
          <span className="text-fg-faint"> / {MAX_STEPS}</span>
        </div>
        <div>
          <span className="text-fg-faint">task A loss </span>
          <span className="tabular font-semibold text-[#6ea8fe]">{fmt(lA)}</span>
        </div>
        <div>
          <span className="text-fg-faint">task B loss </span>
          <span className="tabular font-semibold text-[#fbbf24]">{fmt(lB)}</span>
        </div>
        <div>
          <span className="text-fg-faint">w = </span>
          <span className="tabular text-fg-muted">({w[0].toFixed(2)}, {w[1].toFixed(2)})</span>
        </div>
        <div className="w-full text-2xs" style={{ color: v.color }}>
          {v.text}
        </div>
      </div>

      <p className="mt-1.5 text-2xs leading-snug text-fg-faint">
        Toy model, disclosed: two isotropic quadratic bowls (L = ½‖w − c‖², minima at (0,0) and (4,2)),
        gradient descent with η = 0.3. In a real network, task B has many low-loss solutions and some sit
        close to the pretrained weights — so a leashed method gives up far less task-B quality than this
        2-parameter cartoon suggests. What transfers exactly: the optimizer descends only the loss you
        hand it, and every mitigation is some way of keeping w near the pretrained point.
      </p>
    </div>
  );
}
