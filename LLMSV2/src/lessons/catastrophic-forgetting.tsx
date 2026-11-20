import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Slider, Stat, useRaf } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: a model with two weights and two tasks.
 * Each task's loss is an explicit tilted quadratic bowl. "Train on B"
 * runs real gradient descent with analytic gradients. The landscape is
 * an illustration (real models have billions of weights); the descent,
 * the losses and every number printed are computed from these bowls.
 * ------------------------------------------------------------------ */

type V = [number, number];
type Mit = 'none' | 'replay' | 'ewc' | 'adapter';

const FLOOR = 0.05; // loss that remains at each task's own minimum
function bowl(c: V, ang: number, steep: number, flat: number) {
  const u: V = [Math.cos(ang), Math.sin(ang)]; // steep direction
  const v: V = [-u[1], u[0]]; // flat direction
  const h00 = steep * u[0] * u[0] + flat * v[0] * v[0];
  const h01 = steep * u[0] * u[1] + flat * v[0] * v[1];
  const h11 = steep * u[1] * u[1] + flat * v[1] * v[1];
  const grad = (w: V): V => {
    const d0 = w[0] - c[0], d1 = w[1] - c[1];
    return [h00 * d0 + h01 * d1, h01 * d0 + h11 * d1];
  };
  const loss = (w: V) => {
    const g = grad(w);
    return FLOOR + 0.5 * ((w[0] - c[0]) * g[0] + (w[1] - c[1]) * g[1]);
  };
  return { c, ang, steep, flat, h00, h01, h11, grad, loss };
}
const A = bowl([-1.3, -0.9], -0.3, 2, 0.04);
const B = bowl([1.5, 0.6], 1.2, 2, 0.08);
const START: V = [A.c[0], A.c[1]];
const STEPS = 60;
const ADIR: V = (() => {
  const n = Math.hypot(0.45, 0.89);
  return [0.45 / n, 0.89 / n] as V;
})();

interface Pt { w: V; a: number; b: number }
/** Gradient descent from A's minimum. Returns the weights and both losses after every step. */
function simulate(mit: Mit, lr: number, steps = STEPS): Pt[] {
  let w: V = [START[0], START[1]];
  const out: Pt[] = [{ w, a: A.loss(w), b: B.loss(w) }];
  for (let i = 0; i < steps; i++) {
    let g = B.grad(w);
    if (mit === 'replay') {
      const ga = A.grad(w);
      g = [g[0] + ga[0], g[1] + ga[1]];
    } else if (mit === 'ewc') {
      // quadratic pull back to the start, one importance per weight (diagonal of A's curvature)
      g = [g[0] + A.h00 * (w[0] - START[0]), g[1] + A.h11 * (w[1] - START[1])];
    } else if (mit === 'adapter') {
      const along = g[0] * ADIR[0] + g[1] * ADIR[1];
      g = [along * ADIR[0], along * ADIR[1]];
    }
    w = [w[0] - lr * g[0], w[1] - lr * g[1]];
    out.push({ w, a: A.loss(w), b: B.loss(w) });
  }
  return out;
}
const lrOf = (e: number) => Math.round(Math.pow(10, e) * 1000) / 1000;
const end = (mit: Mit, lr: number) => simulate(mit, lr)[STEPS];

// Reference runs quoted in the prose (same code path as the lab).
const R_NONE = end('none', 0.1);
const R_SLOW = end('none', 0.01);
const R_MID = end('none', 0.02);
const R_REPLAY = end('replay', 0.1);
const R_EWC = end('ewc', 0.1);
const R_ADP = end('adapter', 0.1);
const A0 = A.loss(START);
const B0 = B.loss(START);
const G0 = B.grad(START);
const W1: V = [START[0] - 0.1 * G0[0], START[1] - 0.1 * G0[1]];
const first10x = simulate('none', 0.1).findIndex((p) => p.a >= 10 * A0);
const f2 = (x: number) => x.toFixed(2).replace('-', '−');
const f3 = (x: number) => x.toFixed(3).replace('-', '−');
const times = (x: number) => (x / A0 >= 10 ? Math.round(x / A0) : (x / A0).toFixed(1)) + '×';

// View
const X0 = -2.6, X1 = 2.8, Y0 = -1.7, Y1 = 1.9;
const SC = 140;
const VW = (X1 - X0) * SC;
const VH = (Y1 - Y0) * SC;
const sx = (x: number) => (x - X0) * SC;
const sy = (y: number) => (Y1 - y) * SC;
const COL_A = '#60a5fa';
const COL_B = '#fbbf24';
const LEVELS = [0.15, 0.6, 1.5, 3, 5];

const MITS: { value: Mit; label: string; note: string }[] = [
  { value: 'none', label: 'none', note: 'Plain fine-tuning: descend on task B’s loss only.' },
  { value: 'replay', label: 'replay old data', note: 'Mix task A’s data back in: descend on loss B + loss A.' },
  { value: 'ewc', label: 'penalty (EWC-style)', note: 'No old data at fine-tuning time. Add a penalty for moving each weight away from its start, larger for the weight task A is more sensitive to. The sensitivities were measured on A’s data before it was put away.' },
  { value: 'adapter', label: 'freeze + adapter', note: 'Freeze both base weights. Train one new number that moves the model along the dashed line only.' },
];
const MIT_NAME: Record<Mit, string> = { none: 'none', replay: 'replay', ewc: 'penalty', adapter: 'adapter' };

interface Run { id: number; mit: Mit; lr: number; pts: Pt[] }

function ForgettingLab({ complete }: LabProps) {
  const [mit, setMit] = useState<Mit>('none');
  const [lrExp, setLrExp] = useState(-1);
  const [run, setRun] = useState<Run | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hist, setHist] = useState<Run[]>([]);
  const [detached, setDetached] = useState(false);
  const nextId = useRef(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lr = lrOf(lrExp);

  // Heat map: each task's valley glows in its own colour. Drawn once.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    const img = ctx.createImageData(w, h);
    const ca = [96, 165, 250], cb = [251, 191, 36];
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const p: V = [X0 + ((px + 0.5) / w) * (X1 - X0), Y1 - ((py + 0.5) / h) * (Y1 - Y0)];
        const ga = Math.exp(-(A.loss(p) - FLOOR) / 1.1) * 0.62;
        const gb = Math.exp(-(B.loss(p) - FLOOR) / 1.1) * 0.62;
        const o = (py * w + px) * 4;
        img.data[o] = Math.min(255, 9 + ga * ca[0] + gb * cb[0]);
        img.data[o + 1] = Math.min(255, 11 + ga * ca[1] + gb * cb[1]);
        img.data[o + 2] = Math.min(255, 20 + ga * ca[2] + gb * cb[2]);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  useRaf((_, dt) => setIdx((i) => Math.min(STEPS, i + dt * 26)), playing);

  const finished = !!run && idx >= STEPS;
  useEffect(() => {
    if (!playing || !run || idx < STEPS) return;
    setPlaying(false);
    setHist((hs) => [...hs.filter((r) => r.id !== run.id), run].slice(-5));
    const e = run.pts[STEPS];
    if (run.mit === 'none' && e.a >= 10 * A0) complete('forget');
    if (run.mit === 'replay' && e.a < 0.5 && e.b < 0.5) complete('replay');
    if (run.mit === 'ewc') complete('penalty');
    if (run.mit === 'none' && run.lr <= 0.01) complete('slow');
  }, [playing, run, idx, complete]);

  const reset = () => { setRun(null); setIdx(0); setPlaying(false); setDetached(false); };
  const train = () => {
    sfx.tap();
    setRun({ id: nextId.current++, mit, lr, pts: simulate(mit, lr) });
    setIdx(0);
    setDetached(false);
    setPlaying(true);
  };

  // Current (interpolated) weights; losses are evaluated at them.
  const cur: V = useMemo(() => {
    if (!run || detached) return START;
    const i0 = Math.min(STEPS - 1, Math.floor(idx));
    const f = Math.min(1, idx - i0);
    const p = run.pts[i0].w, q = run.pts[i0 + 1].w;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  }, [run, idx, detached]);
  const la = A.loss(cur);
  const lb = B.loss(cur);
  const shown = run ? Math.min(STEPS, Math.floor(idx)) : 0;
  const trail = run ? [...run.pts.slice(0, shown + 1).map((p) => p.w), ...(detached ? [] : [cur])] : [];

  // Loss chart
  const CW = 380, CH = 200, cl = 36, cr = 12, ct = 14, cbm = 26;
  const YLO = Math.log10(0.03), YHI = Math.log10(9);
  const cx = (s: number) => cl + (s / STEPS) * (CW - cl - cr);
  const cy = (v: number) => ct + (1 - (Math.log10(Math.max(0.03, Math.min(v, 9))) - YLO) / (YHI - YLO)) * (CH - ct - cbm);
  const linePts = (key: 'a' | 'b') => {
    if (!run) return '';
    const pts = run.pts.slice(0, shown + 1).map((p, i) => `${cx(i)},${cy(p[key])}`);
    if (!finished) pts.push(`${cx(idx)},${cy(key === 'a' ? A.loss(cur) : B.loss(cur))}`);
    return pts.join(' ');
  };
  const note = MITS.find((m) => m.value === mit)!.note;
  const ease = 'cubic-bezier(.22,1,.36,1)';

  return (
    <div className="lab-grid">
      <style>{`
        @keyframes cf-pulse { 0%,100% { r: 13; opacity: .5 } 50% { r: 19; opacity: .12 } }
        @keyframes cf-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
      `}</style>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Mitigation</span>
          <Seg value={mit} onChange={(v) => { setMit(v); reset(); }} options={MITS.map((m) => ({ value: m.value, label: m.label }))} />
        </div>
        <div className="row">
          <button className="btn primary" disabled={playing} onClick={train}>{finished ? 'Train on B again' : 'Train on B'}</button>
          <button className="btn sm" disabled={!run && hist.length === 0} onClick={() => { sfx.tap(); reset(); setHist([]); }}>Reset</button>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 13.5, marginTop: -6, minHeight: 22 }}>{note}</div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ position: 'relative', minWidth: 560, aspectRatio: `${VW} / ${VH}`, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' }}>
          <canvas ref={canvasRef} width={378} height={252} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <svg className="viz" viewBox={`0 0 ${VW} ${VH}`} style={{ position: 'absolute', inset: 0, height: '100%' }} role="img" aria-label="Two-weight loss landscape for task A and task B with the current weights">
            {/* contours: level sets of each bowl are ellipses */}
            {[{ t: A, col: COL_A }, { t: B, col: COL_B }].map(({ t, col }) =>
              LEVELS.map((lv) => (
                <ellipse
                  key={col + lv}
                  cx={sx(t.c[0])} cy={sy(t.c[1])}
                  rx={Math.sqrt((2 * lv) / t.steep) * SC} ry={Math.sqrt((2 * lv) / t.flat) * SC}
                  transform={`rotate(${(-t.ang * 180) / Math.PI} ${sx(t.c[0])} ${sy(t.c[1])})`}
                  fill="none" stroke={col} strokeOpacity={0.28} strokeWidth={1}
                />
              )),
            )}
            <text x={sx(A.c[0]) - 14} y={sy(A.c[1]) + 34} textAnchor="end" style={{ fill: COL_A, fontSize: 14, fontWeight: 700 }}>task A valley</text>
            <text x={sx(A.c[0]) - 14} y={sy(A.c[1]) + 51} textAnchor="end" style={{ fill: COL_A, fontSize: 11.5, opacity: 0.85 }}>the original ability</text>
            <text x={sx(B.c[0]) + 6} y={sy(B.c[1]) + 40} style={{ fill: COL_B, fontSize: 14, fontWeight: 700 }}>task B valley</text>
            <text x={sx(B.c[0]) + 6} y={sy(B.c[1]) + 57} style={{ fill: COL_B, fontSize: 11.5, opacity: 0.85 }}>the new task</text>
            <circle cx={sx(B.c[0])} cy={sy(B.c[1])} r={3.5} fill={COL_B} />
            <text x={VW - 10} y={VH - 10} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>weight 1 →</text>
            <text x={12} y={18} style={{ fill: 'var(--fg-3)', fontSize: 11 }}>↑ weight 2</text>

            {/* adapter line */}
            {mit === 'adapter' && (
              <line
                x1={sx(START[0] - ADIR[0] * 4)} y1={sy(START[1] - ADIR[1] * 4)} x2={sx(START[0] + ADIR[0] * 4)} y2={sy(START[1] + ADIR[1] * 4)}
                stroke="#fff" strokeOpacity={0.55} strokeWidth={1.3} strokeDasharray="6 6"
              />
            )}

            {/* earlier runs */}
            {hist.filter((r) => r.id !== run?.id).map((r) => (
              <polyline key={r.id} points={r.pts.map((p) => `${sx(p.w[0])},${sy(p.w[1])}`).join(' ')} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.4} strokeDasharray="3 4" />
            ))}
            {hist.map((r, i) => {
              const e = r.pts[STEPS].w;
              const isCur = r.id === run?.id;
              return (
                <g key={r.id} opacity={isCur ? 1 : 0.8}>
                  <circle cx={sx(e[0])} cy={sy(e[1])} r={3} fill="#fff" />
                  <circle cx={sx(e[0]) + 15} cy={sy(e[1]) - 15} r={9} fill="var(--bg-2)" stroke={isCur ? 'var(--hue)' : '#fff'} strokeOpacity={isCur ? 1 : 0.6} strokeWidth={1.4} />
                  <text x={sx(e[0]) + 15} y={sy(e[1]) - 11} textAnchor="middle" style={{ fontSize: 11, fill: '#fff', fontWeight: 700 }}>{i + 1}</text>
                </g>
              );
            })}

            {/* current run */}
            {trail.length > 1 && (
              <polyline points={trail.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill="none" stroke="var(--hue)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {/* start marker */}
            <circle cx={sx(START[0])} cy={sy(START[1])} r={5} fill="none" stroke="#fff" strokeWidth={1.6} />
            <text x={sx(START[0]) + 12} y={sy(START[1]) - 10} style={{ fill: '#fff', fontSize: 11.5 }}>start: trained on A</text>
            {/* the model */}
            <circle cx={sx(cur[0])} cy={sy(cur[1])} r={13} fill="var(--hue)" style={{ animation: 'cf-pulse 1.8s ease-in-out infinite' }} />
            <circle cx={sx(cur[0])} cy={sy(cur[1])} r={7} fill="var(--hue)" stroke="#05060a" strokeWidth={2} />
          </svg>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        Illustration: a model with two weights. Real models have billions. Brighter = lower loss for that task. The dot is
        the model. The descent and the losses are computed, {STEPS} steps per run.
      </div>

      <Slider
        label="Learning rate (size of each step)"
        value={lrExp} min={-2} max={-0.4} step={0.05}
        onChange={(v) => { setLrExp(v); reset(); }}
        format={(v) => lrOf(v).toFixed(lrOf(v) < 0.1 ? 3 : 2)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="eyebrow">Loss over training steps</span>
            <span className="mono dim" style={{ fontSize: 12 }}>step {shown} / {STEPS}</span>
          </div>
          <div className="row mono" style={{ fontSize: 12, gap: 14, marginBottom: 2 }}>
            <span style={{ color: COL_A }}>● loss A (old task)</span>
            <span style={{ color: COL_B }}>● loss B (new task)</span>
            <span className="dim">log scale</span>
          </div>
          <svg className="viz" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Loss on task A and task B over training steps">
            {[0.05, 0.5, 5].map((g) => (
              <g key={g}>
                <line x1={cl} x2={CW - cr} y1={cy(g)} y2={cy(g)} stroke="var(--line)" />
                <text x={cl - 7} y={cy(g) + 4} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>{g}</text>
              </g>
            ))}
            <text x={CW - cr} y={CH - 6} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>steps →</text>
            <line x1={cl} x2={CW - cr} y1={cy(10 * A0)} y2={cy(10 * A0)} stroke={COL_A} strokeOpacity={0.5} strokeDasharray="4 4" />
            <polyline points={linePts('b')} fill="none" stroke={COL_B} strokeWidth={2.4} strokeLinejoin="round" />
            <polyline points={linePts('a')} fill="none" stroke={COL_A} strokeWidth={2.4} strokeLinejoin="round" />
            <circle cx={cx(run ? Math.min(idx, STEPS) : 0)} cy={cy(lb)} r={4.5} fill={COL_B} />
            <circle cx={cx(run ? Math.min(idx, STEPS) : 0)} cy={cy(la)} r={4.5} fill={COL_A} />
            <text x={CW - cr - 4} y={cy(10 * A0) + 13} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 10.5 }}>10× loss A at start</text>
          </svg>
          <div className="row" style={{ marginTop: 10 }}>
            <Stat label={<>loss A · {la / A0 < 1.05 ? 'as trained' : <em style={{ fontStyle: 'normal', color: la / A0 >= 10 ? 'var(--bad)' : undefined }}>{times(la)} the start</em>}</>} value={<em style={{ color: COL_A, fontStyle: 'normal' }}>{la.toFixed(2)}</em>} />
            <Stat label="loss B" value={<em style={{ color: COL_B, fontStyle: 'normal' }}>{lb.toFixed(2)}</em>} />
          </div>
          {mit === 'adapter' && finished && (
            <div className="row" style={{ marginTop: 10, animation: `cf-in .4s ${ease}` }}>
              <span className="dim" style={{ fontSize: 13 }}>Adapter</span>
              <Seg value={detached ? 'off' : 'on'} onChange={(v) => setDetached(v === 'off')} options={[{ value: 'on', label: 'attached' }, { value: 'off', label: 'removed' }]} />
              <span className="dim" style={{ fontSize: 12.5, flexBasis: '100%' }}>
                The base weights never moved. Remove the adapter and the model is back at the start.
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Finished runs</div>
          {hist.length === 0 ? (
            <div className="dim" style={{ fontSize: 13.5 }}>
              Press <strong>Train on B</strong>. Each finished run is listed here and its end point is numbered on the map,
              so you can compare mitigations and learning rates. Try “freeze + adapter” too, then remove it.
            </div>
          ) : (
            <div className="mono" style={{ display: 'grid', gap: 6, fontSize: 12.5 }}>
              <div className="dim" style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px 86px 44px', gap: 8, fontSize: 11.5 }}>
                <span>#</span><span>mitigation</span><span style={{ textAlign: 'right' }}>lr</span><span style={{ textAlign: 'right' }}>loss A</span><span style={{ textAlign: 'right' }}>loss B</span>
              </div>
              {hist.map((r, i) => {
                const e = r.pts[STEPS];
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px 86px 44px', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', animation: `cf-in .4s ${ease}`, color: r.id === run?.id ? '#fff' : 'var(--fg-2)' }}>
                    <span style={{ color: r.id === run?.id ? 'var(--hue)' : undefined, fontWeight: 700 }}>{i + 1}</span>
                    <span>{MIT_NAME[r.mit]}</span>
                    <span style={{ textAlign: 'right' }}>{r.lr}</span>
                    <span style={{ textAlign: 'right', color: e.a >= 10 * A0 ? 'var(--bad)' : COL_A }}>{e.a.toFixed(2)} <span style={{ opacity: 0.7 }}>({times(e.a)})</span></span>
                    <span style={{ textAlign: 'right', color: COL_B }}>{e.b.toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="dim" style={{ fontSize: 12, fontFamily: 'var(--body)' }}>
                Both losses start from: A {A0.toFixed(2)}, B {B0.toFixed(2)}. The multiplier is loss A against its starting value.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'catastrophic-forgetting',
  hook: {
    prompt: (
      <>
        Fine-tuning means continuing the training of an already trained model on new data. You fine-tune a general model
        on legal contracts only. Nothing is deleted. What happens to its ability to do everything else?
      </>
    ),
    options: [
      {
        text: 'It can degrade badly in a short run: the new loss only rewards the new task',
        correct: true,
        why: 'Every update is chosen to lower the loss on the new data. That loss contains no term for the old abilities, and both live in the same weights, so the updates are free to overwrite what the old tasks needed.',
      },
      {
        text: 'It is unchanged: the new knowledge is written into capacity the model was not using',
        why: 'There are no spare slots. Knowledge is spread across shared weights, and gradient descent changes whichever weights lower the new loss, used or not.',
      },
      {
        text: 'It fades slowly over a very long time, the way an unused human skill does',
        why: 'The damage is done by weight updates, not by time or disuse. A short run at a normal learning rate can be enough, which is why it is called catastrophic.',
      },
      {
        text: 'It improves, because more training always adds to what the model knows',
        why: 'Training does not add. It moves the weights toward whatever the current data rewards. If the old tasks are not in the data, nothing holds the weights where those tasks needed them.',
      },
    ],
    reveal: 'Next you will fine-tune a two-weight model on a new task and watch what happens to the old one.',
  },
  Lab: ForgettingLab,
  missions: [
    {
      id: 'forget',
      text: 'With mitigation “none” and the default learning rate, press Train on B. Watch loss A rise to 10 times its start or more.',
      insight: (
        <>
          Loss B fell from {f2(B0)} to {f2(R_NONE.b)}. Loss A went from {f2(A0)} to {f2(R_NONE.a)}: {times(R_NONE.a)}. It
          passed 10× by step {first10x} of {STEPS}. Nothing in the gradient pointed back toward A’s valley, so the dot
          walked straight out of it.
        </>
      ),
    },
    {
      id: 'replay',
      text: 'Choose “replay old data” and train. End with both losses below 0.5.',
      insight: (
        <>
          The dot stops where the two valleys overlap: loss A {f2(R_REPLAY.a)}, loss B {f2(R_REPLAY.b)}. Neither is at its
          own minimum, and both are low. A set of weights that serves both tasks existed all along. Plain fine-tuning had
          no reason to stop there, because its loss never mentioned A.
        </>
      ),
    },
    {
      id: 'penalty',
      text: 'Choose “penalty (EWC-style)” and train. Compare where the dot ends with the replay run.',
      insight: (
        <>
          It ends near the replay point but not on it: loss A {f2(R_EWC.a)}, loss B {f2(R_EWC.b)}, each close to double
          replay’s. The penalty needs no old data during fine-tuning, only one importance number per weight computed from
          A’s data beforehand, and that is a rough summary of a tilted valley. The pull back to the start also limits how far B can be learned.
        </>
      ),
    },
    {
      id: 'slow',
      text: 'Go back to “none”, drag the learning rate all the way down to 0.010, and train. Compare with your first run.',
      insight: (
        <>
          At 0.01, loss A ends at {f2(R_SLOW.a)} ({times(R_SLOW.a)}) instead of {f2(R_NONE.a)}. But loss B only reaches{' '}
          {f2(R_SLOW.b)} instead of {f2(R_NONE.b)}. Smaller or fewer steps move the weights less, which forgets less and
          learns less. There is a good stopping point in between: at 0.02 this lab ends at A {f2(R_MID.a)}, B{' '}
          {f2(R_MID.b)}. You can only find it if you are measuring loss A, and the fine-tuning loss never does.
        </>
      ),
    },
  ],
  explain: {
    core: (
      <>
        <p>
          <strong>Fine-tuning</strong> is continuing the training of a trained model on new data. Each step computes the
          gradient of the loss on the new data and moves every weight downhill.
        </p>
        <p>
          That loss measures task B only. Nothing in it mentions task A. And the model does not keep A and B in separate
          places: both are encoded in the same shared weights. So the weights leave the region where A worked, and A’s
          loss climbs. In the lab it rose {times(R_NONE.a)} in {STEPS} steps.
        </p>
        <p>
          It is called <strong>catastrophic</strong> because it is fast and large, not a slow fade. Old abilities can
          collapse early in a run while the new loss still looks healthy.
        </p>
        <p>Every mitigation gives the weights a reason to stay near where A worked:</p>
        <ul>
          <li><strong>Replay</strong>: mix old data into the new, so the loss includes A.</li>
          <li><strong>Penalty</strong>: charge for moving weights that mattered to A.</li>
          <li><strong>Smaller, fewer steps</strong>: move less overall.</li>
          <li><strong>Freeze</strong> most weights and train a small add-on you can take off again.</li>
        </ul>
        <Callout>
          The two-weight landscape is an illustration. Real models have billions of weights, but the cause is the same.
        </Callout>
      </>
    ),
    worked: (
      <>
        <p>
          One step of plain fine-tuning in the lab, with learning rate 0.1. The model starts at A’s minimum,{' '}
          <code>w = [{f2(START[0])}, {f2(START[1])}]</code>.
        </p>
        <table>
          <thead>
            <tr><th /><th>weight 1</th><th>weight 2</th><th>loss A</th><th>loss B</th></tr>
          </thead>
          <tbody>
            <tr><td>start</td><td>{f2(START[0])}</td><td>{f2(START[1])}</td><td>{f3(A0)}</td><td>{f3(B0)}</td></tr>
            <tr><td>gradient of loss B</td><td>{f3(G0[0])}</td><td>{f3(G0[1])}</td><td /><td /></tr>
            <tr><td>step = −0.1 × gradient</td><td>{f3(-0.1 * G0[0])}</td><td>{f3(-0.1 * G0[1])}</td><td /><td /></tr>
            <tr><td>after 1 step</td><td>{f3(W1[0])}</td><td>{f3(W1[1])}</td><td>{f3(A.loss(W1))}</td><td>{f3(B.loss(W1))}</td></tr>
          </tbody>
        </table>
        <p>
          One step lowered loss B from {f2(B0)} to {f2(B.loss(W1))} and raised loss A from {f3(A0)} to {f3(A.loss(W1))}.
          The gradient of loss A at the start is zero, because the model sits at A’s minimum. A has no say in the first
          step at all. With replay, A’s gradient is added, and it grows as the weights move away, pulling harder the
          further they go.
        </p>
        <Code>{`
for step in range(60):
    g = grad_B(w)                        # plain fine-tuning: B only
    if replay:  g += grad_A(w)           # needs task A's data
    if penalty: g += importance * (w - w_start)   # needs only a summary of A
    if adapter: g = project(g, adapter_direction) # base weights frozen
    w = w - lr * g
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The penalty, written out</h3>
        <p>
          Elastic weight consolidation (EWC) adds a quadratic penalty anchored at the old weights{' '}
          <M>{'\\theta^{*}'}</M>:
        </p>
        <M block>{String.raw`L(\theta) = L_B(\theta) + \frac{\lambda}{2} \sum_i F_i \,(\theta_i - \theta^{*}_i)^2`}</M>
        <p>
          <M>{'F_i'}</M> measures how sensitive task A’s loss is to weight <M>{'i'}</M> (the diagonal of the Fisher
          information, estimated from A’s data before it is put away). Weights A depends on get a stiff spring. Weights it
          ignores stay free. The lab uses <M>{'\\lambda = 1'}</M> and the curvature of A’s bowl along each weight. One
          number per weight cannot describe a tilted valley, which is why the penalty run ended at loss A {f2(R_EWC.a)}{' '}
          where replay reached {f2(R_REPLAY.a)}.
        </p>
        <h3>Why mitigation is possible at all</h3>
        <p>
          The lab’s valleys overlap because each task is insensitive along one direction. Large models have many more
          weights than any one task needs, so the set of weights that do task A well is a large region, not a point.
          Replay and penalties work by steering toward the part of that region where B is also good. When two tasks truly
          conflict, no such overlap exists and something has to give.
        </p>
        <h3>Freezing, adapters and LoRA</h3>
        <p>
          Select “freeze + adapter” in the lab, train, then switch the adapter to “removed”. The run moves the model
          along one fixed line: one trainable number in place of two. Attached, it gave
          loss A {f2(R_ADP.a)} and loss B {f2(R_ADP.b)}. Removed, loss A is back to exactly {f2(A0)}, because the base
          weights were never written to. Limiting what can move limits the damage, and keeping the change separate makes
          it reversible. This is one benefit of parameter-efficient methods such as LoRA, whose main purpose is cost. It is the next lesson.
          In the lab the line is fixed in advance; LoRA also learns which directions to use.
        </p>
        <h3>What practitioners do</h3>
        <p>
          The common recipe combines several of these: a learning rate usually below the one used in pre-training, few passes
          over the data, some general data mixed in with the task data, and often frozen base weights with an adapter.
          They also keep an evaluation set for the old abilities, because the fine-tuning loss alone cannot show
          forgetting.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Replay needs the old data',
      body: 'You often do not have it: the base model’s training set is private, too large, or covers abilities you cannot list. Mixing in a small general dataset protects only what that dataset exercises, and it adds training cost.',
    },
    {
      title: 'Penalties and small steps cap what B can learn',
      body: `Anything that holds the weights near the start also holds them away from B’s best solution. In the lab the penalty left loss B at ${f2(R_EWC.b)} where plain fine-tuning reached ${f2(R_NONE.b)}, and a learning rate of 0.01 left it at ${f2(R_SLOW.b)}. A middle setting can be a good trade (0.02 ended at A ${f2(R_MID.a)}, B ${f2(R_MID.b)}), but you only find it by measuring loss A.`,
    },
    {
      title: 'The training loss does not show it',
      body: 'The loss curve you watch during fine-tuning is loss B, and it goes down smoothly while the old abilities collapse. Forgetting is only visible if you separately test the old tasks, and you can only test the ones you thought to include.',
    },
    {
      title: 'An attached adapter can still change old behaviour',
      body: `Freezing the base makes the change small and removable. It does not make the adapted model identical on old tasks: in the lab loss A was ${f2(R_ADP.a)} with the adapter attached, against ${f2(A0)} without it.`,
    },
  ],
  questions: [
    {
      id: 'cf-1', kind: 'mcq', level: 1,
      prompt: 'Why does fine-tuning on task B damage performance on task A?',
      options: [
        { text: 'B’s loss says nothing about A, and both tasks sit in the same weights', correct: true, why: 'Gradient descent moves the weights wherever B’s loss falls fastest. No term in that loss rewards staying where A worked, and the weights are shared.' },
        { text: 'The model runs out of capacity and must delete old knowledge to make room', why: 'Nothing is deleted to make room. Forgetting happens even when weights serving both tasks exist, as the replay run showed.' },
        { text: 'Task B’s data contradicts task A’s data, so the model has to choose', why: 'No contradiction is needed. Unrelated tasks interfere just as well, because the cause is that B’s loss is silent about A.' },
        { text: 'The learning rate decays during fine-tuning, which weakens old memories', why: 'Learning rate decay makes steps smaller, which reduces forgetting if anything. The damage comes from the direction of the steps.' },
      ],
    },
    {
      id: 'cf-2', kind: 'mcq', level: 1,
      prompt: 'What makes forgetting “catastrophic” rather than ordinary?',
      options: [
        { text: 'It is fast and large: abilities can collapse in a short run', correct: true, why: `In the lab, loss A passed 10 times its starting value by step ${first10x}. The name refers to the speed and size of the drop.` },
        { text: 'It is permanent: the old abilities can never be trained back', why: 'They can be retrained with the old data. The name is about how abruptly they are lost, not about recovery.' },
        { text: 'It destroys the new task as well as the old one', why: 'The new task is learned well. That is what makes the problem easy to miss.' },
        { text: 'It only happens when training crashes or diverges', why: 'It happens in perfectly healthy runs, while the training loss falls smoothly.' },
      ],
    },
    {
      id: 'cf-3', kind: 'num', level: 2,
      prompt: <>A one-weight model has task A loss <code>0.05 + 2·(w − 1)²</code> and sits at <code>w = 1</code>. Fine-tuning on task B moves it to <code>w = 2.5</code>. What is its loss on task A now?</>,
      answer: 4.55, tol: 0.02,
      why: <>w moved 1.5 away from A’s minimum. 1.5² = 2.25, times 2 is 4.5, plus the 0.05 floor: <strong>4.55</strong>. That is 91 times the starting loss of 0.05.</>,
      hint: 'Put the new weight into A’s loss. B does not appear in the calculation.',
    },
    {
      id: 'cf-4', kind: 'mcq', level: 2,
      prompt: 'You download an open-weights model and want to fine-tune it on your support tickets. You have no access to the data it was originally trained on. Which mitigation is off the table in its exact form?',
      options: [
        { text: 'Replay, because it needs examples of the original tasks to mix into training', correct: true, why: 'Replay puts the old loss back into the objective, and that requires old data. The usual substitute is a general-purpose public dataset, which only protects what it happens to cover.' },
        { text: 'A lower learning rate, because the right value depends on the original data', why: 'The learning rate is a setting of your own run. It needs no old data.' },
        { text: 'Freezing the base weights and training an adapter, because adapters need the original data', why: 'Freezing needs nothing from the old training set. It is the mitigation that asks least.' },
        { text: 'Training for fewer steps, because the step count is fixed by the original run', why: 'You choose how long your fine-tuning run lasts. Fewer steps move the weights less.' },
      ],
      hint: 'Which mitigation works by putting the old task back into the loss?',
    },
    {
      id: 'cf-5', kind: 'mcq', level: 2,
      prompt: 'In a penalty method, the penalty strength λ is set extremely high. What is the result?',
      options: [
        { text: 'The weights barely move, so task A is preserved and task B is barely learned', correct: true, why: 'A very stiff spring pins every important weight at its old value. The penalty protects A exactly as much as it restricts B.' },
        { text: 'Both tasks end up learned perfectly, because a strong penalty finds the overlap', why: 'A penalty steers toward overlap only at moderate strength. At extreme strength it simply forbids movement.' },
        { text: 'Task B is learned faster, because the penalty adds to the gradient', why: 'The added gradient points back toward the start, against the direction B wants.' },
        { text: 'Task A is forgotten faster, because the total loss is larger', why: 'The size of the loss is irrelevant. Its gradient now points overwhelmingly back to the old weights.' },
      ],
      hint: 'Think of the penalty as a spring tied to the starting weights. Make the spring very stiff.',
    },
    {
      id: 'cf-6', kind: 'mcq', level: 3,
      prompt: 'A team freezes a base model, trains a small adapter on task B, and ships both. Later they remove the adapter. How does the model now perform on task A?',
      options: [
        { text: 'Exactly as before fine-tuning: the base weights were never changed', correct: true, why: 'All of the learning went into the adapter. Without it, the computation is the original model’s, bit for bit. That reversibility is something full fine-tuning cannot offer.' },
        { text: 'Somewhat worse than before, because training always leaves traces in the base', why: 'Frozen weights receive no updates. There is nothing in the base for training to have left a trace in.' },
        { text: 'Better than before, because it keeps part of what it learned from task B', why: 'Everything learned about B is in the adapter. Removing it removes all of it.' },
        { text: 'It no longer runs, because the base was reshaped to fit the adapter', why: 'An adapter adds a correction beside the base. The base is untouched and runs alone as it always did.' },
      ],
      hint: 'Ask which numbers were allowed to change during training.',
    },
    {
      id: 'cf-7', kind: 'mcq', level: 3,
      prompt: 'After fine-tuning, the training loss on task B has fallen smoothly to a low value. What does that tell you about the model’s older abilities?',
      options: [
        { text: 'Nothing: that loss measures B only. Old tasks need their own test', correct: true, why: `In the lab, at the default rate, loss B fell smoothly in every run, including the one where loss A rose ${times(R_NONE.a)}. The curve you train on cannot show what it does not measure.` },
        { text: 'They are intact, because a smooth curve means training was stable', why: 'Stable descent on B is exactly what carries the weights out of A’s valley. Stability and forgetting are compatible.' },
        { text: 'They are gone, because a low loss on B means the weights moved far', why: 'Not necessarily. The replay run also reached a low loss on B while keeping A. You cannot tell which case you are in from B alone.' },
        { text: 'They improved, because a lower loss means a better model overall', why: 'The loss is lower on B. “Overall” would need measurements on everything else, and there are none.' },
      ],
      hint: 'Check which task the plotted loss is computed on.',
    },
    {
      id: 'cf-8', kind: 'mcq', level: 3,
      prompt: 'You cut the learning rate by 10 times and keep the number of steps the same. Forgetting drops sharply. What is the catch?',
      options: [
        { text: 'The weights also travel less far toward B’s solution, so B is learned less well', correct: true, why: `Movement is what causes both effects. In the lab, a rate of 0.01 held loss A to ${f2(R_SLOW.a)} and left loss B at ${f2(R_SLOW.b)}, against ${f2(R_NONE.b)} at the default rate.` },
        { text: 'There is none: a small enough learning rate learns B fully and forgets nothing', why: 'With the same number of steps, smaller steps cover less distance. Run long enough to learn B fully and the weights end in the same place, with the same forgetting.' },
        { text: 'Training becomes unstable and the loss on B starts to oscillate', why: 'Instability comes from learning rates that are too high. Low rates are slow and smooth.' },
        { text: 'The model forgets task B instead, because small steps favour old tasks', why: 'Nothing favours the old task. The model has just moved less, in a direction still chosen by B alone.' },
      ],
      hint: 'The same thing that causes forgetting also causes learning. What is it?',
    },
  ],
  takeaways: [
    'Fine-tuning continues training on new data, and the new loss contains nothing about the old tasks.',
    'Old and new abilities share the same weights, so moving them for task B can quickly wreck task A: that speed and size is why it is called catastrophic.',
    'Replay, penalties, small or few steps, and freezing all work by keeping the weights near where the old task worked, and each costs something: old data, or how well B is learned.',
    'Freezing the base and training a small separate adapter limits the change and makes it removable, which is one benefit of parameter-efficient fine-tuning.',
  ],
};

export default lesson;
