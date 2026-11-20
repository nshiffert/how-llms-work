import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Slider, Stat, clamp, useRaf, useSpring } from '../ui/kit';

/* ------------------------------------------------------------------ *
 * Lab: backpropagation through a chain of identical layers.
 * The signal starts at 1 at the loss and is multiplied by one local
 * factor per layer on its way back. Plain layer: factor = f.
 * Residual layer (output = input + 0.1 × layer(input)): factor = 1 + 0.1 f.
 * Every number shown is that product, computed exactly.
 * ------------------------------------------------------------------ */

const BRANCH = 0.1;
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** 0.0687, 4.72 × 10⁻³, 1,478, 2.83 × 10⁸ */
function fmtMag(g: number): string {
  if (g >= 1e4 || g < 1e-3) {
    let e = Math.floor(Math.log10(g));
    let m = g / 10 ** e;
    if (m >= 9.995) { m = 1; e += 1; }
    return `${m.toFixed(2)} × 10${sup(e)}`;
  }
  if (g >= 100) return Math.round(g).toLocaleString('en-US');
  return g.toPrecision(3);
}

/** True when the lab column is phone-width, so the drawing can use a narrower layout instead of scrolling. */
function useNarrow() {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, narrow] as const;
}

function GradientLab({ complete }: LabProps) {
  const [depth, setDepth] = useState(12);
  const [f, setF] = useState(0.8);
  const [res, setRes] = useState(false);
  const [time, setTime] = useState(0);
  useRaf((t) => setTime(t));
  const [boxRef, narrow] = useNarrow();

  const factor = res ? 1 + BRANCH * f : f;
  // grads[l-1] = gradient after passing back through layers L..l
  const grads = useMemo(() => Array.from({ length: depth }, (_, i) => factor ** (depth - i)), [depth, factor]);
  const g1 = grads[0];
  const lg1 = Math.log10(g1);
  const shown = 10 ** useSpring(lg1, 0.2);

  useEffect(() => {
    if (!res && g1 < 1e-3) complete('vanish');
    // Only the smallest such depth counts: one layer fewer must still be at or above 1%.
    if (!res && Math.abs(f - 0.9) < 0.004 && g1 < 0.01 && g1 / f >= 0.01) complete('percent');
    if (!res && g1 > 1000) complete('explode');
    if (res && depth >= 24 && g1 >= 0.1 && g1 <= 10) complete('residual');
  }, [res, f, depth, g1, complete]);

  // ---- geometry ----
  const W = narrow ? 400 : 760;
  const X0 = narrow ? 36 : 46, X1 = narrow ? 356 : 696;
  const LX = narrow ? 380 : 730, LR = narrow ? 14 : 17;
  const cw = (X1 - X0) / depth;
  const gap = Math.min(5, cw * 0.18);
  const cx = (l: number) => X0 + cw * (l - 0.5); // l = 1..depth
  const yBox = 58, hBox = 36, yMid = yBox + hBox / 2;
  const cTop = 142, cH = 168;

  // pulse: travels from the loss (right) to layer 1 (left), then rests
  const TRAVEL = 2.8, REST = 0.7;
  const u = (time % (TRAVEL + REST)) / TRAVEL;
  const travelling = u <= 1;
  const s = depth + 1 - Math.min(1, u) * (depth + 0.5); // position in layer units
  const pulseLog = clamp(depth + 0.5 - s, 0, depth) * Math.log10(factor);
  const pulseX = X0 + cw * (s - 0.5);
  const pulseR = clamp(9 + pulseLog * 2.4, 2, 22);
  const hot = (lg: number) => `color-mix(in srgb, var(--bad) ${Math.round(clamp(lg / 2.5, 0, 1) * 100)}%, var(--hue))`;

  // log chart range: at least 10⁻⁴ .. 10⁴, grows when the product leaves it
  const lo = Math.min(-4, Math.floor(Math.min(lg1, 0)));
  const hi = Math.max(4, Math.ceil(Math.max(lg1, 0)));
  const yLog = (v: number) => cTop + ((hi - v) / (hi - lo)) * cH;
  const step = Math.ceil((hi - lo) / 8);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const labelEvery = depth <= (narrow ? 8 : 12) ? 1 : depth <= 24 ? 4 : 8;
  const state = g1 < 1e-3 ? 'vanish' : g1 > 1000 ? 'explode' : g1 < 0.1 || g1 > 10 ? 'drift' : 'ok';
  const verdict = {
    vanish: 'Vanished. Layer 1 gets under a thousandth of the signal, so its weights barely move.',
    explode: 'Exploded. Layer 1 gets a signal over a thousand times too large, and one update would wreck its weights.',
    drift: g1 < 1 ? 'Shrinking. Early layers learn much more slowly than late ones.' : 'Growing. Early layers get much larger updates than late ones.',
    ok: 'Healthy. Every layer gets a signal of about the same size.',
  }[state];
  const verdictColor = { vanish: 'var(--warn)', explode: 'var(--bad)', drift: 'var(--fg-2)', ok: 'var(--good)' }[state];

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Each layer is</span>
          <Seg
            value={res ? 'res' : 'plain'}
            onChange={(v) => setRes(v === 'res')}
            options={[{ value: 'plain', label: 'plain' }, { value: 'res', label: 'residual (skip path)' }]}
          />
        </div>
        <span className="mono" style={{ fontSize: 13, color: 'var(--fg-2)' }}>
          {res ? <>factor per layer = 1 + {BRANCH} × {f.toFixed(2)} = <strong>{factor.toFixed(3)}</strong></> : <>factor per layer = <strong>{f.toFixed(2)}</strong></>}
        </span>
      </div>

      <div ref={boxRef}>
        <svg className="viz" viewBox={`0 0 ${W} 336`} role="img" aria-label={`Gradient magnitude at each of ${depth} layers, ${fmtMag(g1)} at layer 1`}>
          <defs>
            <filter id="vg-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {!narrow && <text x={X0} y={16} style={{ fill: 'var(--fg-3)' }}>layer 1</text>}
          <text x={(X0 + X1) / 2} y={16} textAnchor="middle" style={{ fill: 'var(--fg-2)' }}>← gradient, ×{factor.toFixed(res ? 3 : 2)} per layer</text>
          {!narrow && <text x={X1} y={16} textAnchor="end" style={{ fill: 'var(--fg-3)' }}>layer {depth}</text>}

          {/* stream line through the chain */}
          <line x1={X0} x2={LX} y1={yMid} y2={yMid} stroke="var(--line-2)" strokeWidth={1.5} />

          {/* skip paths */}
          {grads.map((_, i) => {
            const xl = cx(i + 1) - cw / 2 + gap / 2, xr = cx(i + 1) + cw / 2 - gap / 2;
            return (
              <path
                key={'s' + i}
                d={`M ${xr} ${yBox - 2} C ${xr} ${yBox - 26}, ${xl} ${yBox - 26}, ${xl} ${yBox - 2}`}
                fill="none" stroke="var(--hue)" strokeWidth={depth > 30 ? 1.4 : 2} strokeLinecap="round"
                strokeDasharray="5 4"
                style={{ opacity: res ? 0.9 : 0, transition: 'opacity .35s', animation: res ? 'dash 5s linear infinite' : undefined }}
              />
            );
          })}

          {/* layers: brightness = gradient magnitude on a log scale */}
          {grads.map((g, i) => {
            const lg = Math.log10(g);
            const near = travelling && Math.abs(s - (i + 1)) < 0.75;
            return (
              <rect
                key={'l' + i}
                x={cx(i + 1) - cw / 2 + gap / 2} y={yBox} width={cw - gap} height={hBox} rx={Math.min(7, cw / 3)}
                fill={hot(lg)} fillOpacity={clamp(1 + lg / 3.5, 0.07, 1) * (near ? 1 : 0.8)}
                stroke={near ? '#fff' : i === 0 ? 'var(--fg-2)' : 'var(--line-2)'} strokeWidth={near ? 1.6 : 1}
                style={{ transition: 'fill-opacity .25s, fill .25s' }}
              />
            );
          })}
          {grads.map((_, i) => ((i + 1) % labelEvery === 0 || i === 0 ? (
            <text key={'n' + i} x={cx(i + 1)} y={yBox + hBox + 16} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{i + 1}</text>
          ) : null))}

          {/* loss node */}
          <circle cx={LX} cy={yMid} r={LR} fill="var(--panel-2)" stroke="var(--hue)" strokeWidth={1.5} />
          <text x={LX} y={yMid + 4} textAnchor="middle" style={{ fontSize: narrow ? 10 : 11, fill: '#fff' }}>loss</text>
          <text x={LX} y={yMid + 34} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>= 1</text>

          {/* the travelling gradient pulse */}
          <circle
            cx={pulseX} cy={yMid} r={pulseR} fill={hot(pulseLog)} filter="url(#vg-glow)"
            opacity={travelling ? clamp(1 + pulseLog / 4, 0.3, 1) : Math.max(0, 1 - (u - 1) * 6) * clamp(1 + pulseLog / 4, 0.3, 1)}
          />
          <circle cx={pulseX} cy={yMid} r={Math.max(1.2, pulseR * 0.35)} fill="#fff" opacity={travelling ? 0.95 : 0} />

          {/* log-scale chart, one bar per layer, aligned with the chain */}
          {ticks.map((v) => (
            <g key={'t' + v}>
              <line x1={X0} x2={X1} y1={yLog(v)} y2={yLog(v)} stroke={v === 0 ? 'var(--fg-3)' : 'var(--line)'} strokeWidth={v === 0 ? 1.2 : 1} />
              <text x={X0 - 6} y={yLog(v) + 4} textAnchor="end" style={{ fontSize: 11, fill: v === 0 ? 'var(--fg)' : 'var(--fg-3)' }}>{v === 0 ? '1' : '10' + sup(v)}</text>
            </g>
          ))}
          <line x1={X0} x2={X1} y1={yLog(-3)} y2={yLog(-3)} stroke="var(--warn)" strokeDasharray="4 4" strokeOpacity={0.8} />
          <text x={X1 - 4} y={yLog(-3) + 13} textAnchor="end" style={{ fontSize: 11, fill: 'var(--warn)' }}>÷1000</text>
          <line x1={X0} x2={X1} y1={yLog(3)} y2={yLog(3)} stroke="var(--bad)" strokeDasharray="4 4" strokeOpacity={0.8} />
          <text x={X1 - 4} y={yLog(3) - 5} textAnchor="end" style={{ fontSize: 11, fill: 'var(--bad)' }}>×1000</text>
          {grads.map((g, i) => {
            const lg = Math.log10(g);
            const y0 = yLog(0), y1 = yLog(lg);
            return (
              <rect
                key={'b' + i}
                x={cx(i + 1) - cw / 2 + gap / 2} width={cw - gap} rx={Math.min(3, cw / 4)}
                y={Math.min(y0, y1)} height={Math.max(1.5, Math.abs(y1 - y0))}
                fill={lg > 0 ? 'var(--bad)' : 'var(--hue)'} fillOpacity={i === 0 ? 1 : 0.6}
                style={{ transition: 'y .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1), fill .3s' }}
              />
            );
          })}
          <text x={X0} y={cTop + cH + 20} style={{ fontSize: 11, fill: 'var(--fg-3)' }}>
            {narrow ? 'log scale: each gridline is ×' : 'gradient size at each layer, log scale: each gridline is ×'}{step === 1 ? '10' : '10' + sup(step)}
          </text>
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Slider label="Depth (number of layers)" value={depth} min={4} max={48} onChange={setDepth} />
        <Slider
          label={res ? 'f: factor of the layer’s own path' : 'f: factor each layer multiplies by'}
          value={f} min={0.5} max={1.5} step={0.01} onChange={setF} format={(v) => '×' + v.toFixed(2)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'center' }}>
        <div style={{ border: '1px solid var(--hue-line)', background: 'var(--hue-soft)', borderRadius: 14, padding: '12px 16px' }}>
          <div className="eyebrow">Gradient reaching layer 1</div>
          <div className="mono" style={{ fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 700, color: '#fff', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {factor.toFixed(res ? 3 : 2)}<sup style={{ fontSize: '0.55em' }}>{depth}</sup>
            <span style={{ color: 'var(--fg-3)' }}> = </span>
            <span style={{ color: state === 'explode' ? 'var(--bad)' : state === 'vanish' ? 'var(--warn)' : 'var(--hue)' }}>{fmtMag(shown)}</span>
          </div>
          <div style={{ fontSize: 13.5, color: verdictColor }}>{verdict}</div>
        </div>
        <div className="row">
          <Stat label="factors multiplied" value={depth} />
          <Stat
            label="layer 1 update vs last layer"
            value={g1 < 1 ? `÷ ${fmtMag(grads[depth - 1] / g1)}` : `× ${fmtMag(g1 / grads[depth - 1])}`}
            hot
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'vanishing-gradients',
  hook: {
    prompt: (
      <>
        You train a plain 30-layer network. The last few layers improve quickly. The first few layers barely change at
        all. What is the most likely reason?
      </>
    ),
    options: [
      {
        text: 'The signal reaching an early layer is a product of one factor per later layer, now almost zero',
        correct: true,
        why: 'The signal that tells a weight how to change is multiplied by one number for every layer it passes back through. Thirty numbers a little below 1 multiply to something tiny: 0.8 thirty times is 0.0012.',
      },
      {
        text: 'The early layers have already learned what they need, so there is nothing left to fix',
        why: 'At the start of training every layer is random. The early layers are not finished. They are not receiving a usable signal.',
      },
      {
        text: 'Optimizers apply a smaller learning rate to early layers than to late ones',
        why: 'By default every layer gets the same learning rate. The difference is in the size of the signal that the learning rate is multiplied by.',
      },
      {
        text: 'Errors add up layer by layer, so the early layers are drowned in noise',
        why: 'The signal is multiplied through the layers, not added. Multiplying is what makes it collapse or blow up so fast.',
      },
    ],
    reveal: 'Next you will send that signal backward through a chain of layers and watch what the multiplication does to it.',
  },
  Lab: GradientLab,
  missions: [
    {
      id: 'vanish',
      text: 'With plain layers, make layer 1 receive less than a thousandth of the gradient (below the ÷1000 line).',
      insight: 'A factor only a little under 1 is enough if there are enough layers: 0.8 needs 31 of them, 0.5 needs 10. The first layers are the ones that read the raw input, and they are the ones that stop learning.',
    },
    {
      id: 'percent',
      text: 'Set the factor to ×0.90 with plain layers. Find the smallest depth where layer 1 gets under 1% (0.01).',
      insight: '44 layers: 0.9⁴³ = 0.0108 and 0.9⁴⁴ = 0.0097. Losing just 10% per layer sounds harmless. Compounded 44 times it removes 99% of the signal.',
    },
    {
      id: 'explode',
      text: 'Still with plain layers, make the gradient at layer 1 explode past 1,000.',
      insight: 'The same compounding runs the other way. 1.5 multiplied 18 times is 1,478. An update that large throws the weights far from anywhere useful, and the loss often turns into NaN (not a number).',
    },
    {
      id: 'residual',
      text: 'Set the depth to 24 or more, switch to residual layers, and bring the gradient at layer 1 within 10× of the output’s (between 0.1 and 10).',
      insight: 'Each factor is now 1 + 0.1 × f. The 1 comes from the skip path, which hands the gradient back unchanged, so one route back to layer 1 is never scaled at all. It can still grow: push f and depth up and watch. Small layer contributions and normalisation keep that growth in check.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A <strong>gradient</strong> is a number attached to each weight: how much the loss (the model's error score)
          changes if you nudge that weight. Training moves each weight a small step against its gradient, so a weight
          with a gradient near zero does not learn.
        </p>
        <p>
          Gradients are computed by <strong>backpropagation</strong>: start at the loss and walk backward through the
          layers. Each layer multiplies the signal by its local factor: how much its output moves when its input
          moves. This is the chain rule. The gradient at layer 1 is a product with one factor per layer.
        </p>
        <Callout>
          Plain layers: gradient at layer 1 = <M>{'f^{\\,\\text{depth}}'}</M>. With f = 0.8 and 24 layers: 0.0047.
        </Callout>
        <p>
          Factors below 1 shrink the product toward zero (<strong>vanishing</strong>). Factors above 1 blow it up (
          <strong>exploding</strong>). More depth makes both worse.
        </p>
        <p>
          A <strong>residual connection</strong> changes a layer from <code>output = layer(input)</code> to{' '}
          <code>output = input + layer(input)</code>. Its factor becomes 1 + something. The 1 is an identity path: the
          gradient crosses it unchanged, however many layers there are.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Take 24 plain layers that each multiply the gradient by 0.8. Start with a signal of 1 at the loss and square
          your way down:
        </p>
        <table>
          <thead>
            <tr><th>layers passed</th><th>product</th><th>how</th></tr>
          </thead>
          <tbody>
            <tr><td>2</td><td>0.64</td><td>0.8 × 0.8</td></tr>
            <tr><td>4</td><td>0.4096</td><td>0.64²</td></tr>
            <tr><td>8</td><td>0.1678</td><td>0.4096²</td></tr>
            <tr><td>16</td><td>0.0281</td><td>0.1678²</td></tr>
            <tr><td>24</td><td>0.0047</td><td>0.0281 × 0.1678</td></tr>
          </tbody>
        </table>
        <p>
          A weight update is the learning rate times the gradient. Layer 24 sees a signal of 0.8 and layer 1 sees
          0.0047, so layer 1 moves about 169 times less per step (0.8 ÷ 0.00472). It would need 169 times as many steps
          to learn as much.
        </p>
        <p>
          Now make every layer residual, with the layer's own path contributing a tenth as much as the skip path. The
          factor is 1 + 0.1 × 0.8 = 1.08, and 1.08²⁴ = 6.34. Layer 1 now gets a signal of the same order as the output.
        </p>
        <Code>{`
grad = 1.0                          # signal at the loss
for layer in reversed(layers):      # walk backward
    grad = grad * layer.local_factor
# plain layer:     local_factor = f            -> f ** depth
# residual layer:  local_factor = 1 + 0.1 * f  -> never below 1 here
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The chain rule, written out</h3>
        <p>
          Write <M>{'h_l'}</M> for the output of layer <M>{'l'}</M>. The gradient at the first layer is the gradient at the
          last one times every local derivative in between:
        </p>
        <M block>{String.raw`\frac{\partial L}{\partial h_1} = \frac{\partial L}{\partial h_n}\,\prod_{l=1}^{n-1}\frac{\partial h_{l+1}}{\partial h_l}`}</M>
        <p>
          In a real network each term is a matrix, not one number, and the lab's f stands for how much that matrix
          stretches or shrinks a typical vector. The compounding is the same. With a residual layer{' '}
          <M>{'h_{l+1} = h_l + F(h_l)'}</M> each term is <M>{String.raw`I + \partial F / \partial h_l`}</M>: the identity
          plus a correction. The correction can be negative, so a single factor can still be below 1. What cannot
          happen is the whole signal being forced through every layer's own path: multiply the factors out and one
          term is always the pure skip route, with weight 1.
        </p>
        <h3>Why sigmoid and tanh give factors below 1</h3>
        <p>
          A layer's factor is its weight times the slope of its activation function (the squashing curve applied to
          each number). The slope of a sigmoid is at most 0.25, reached at input 0. At input 2 it is 0.105 and at input
          4 it is 0.018: the curve is flat there, which is called <em>saturation</em>. Ten sigmoid layers at their best
          possible slope give 0.25¹⁰, about one millionth. Tanh peaks at a slope of 1 but falls to 0.07 at input 2.
          ReLU, which passes positive inputs unchanged, has a slope of exactly 1 for them. That is one reason it
          replaced sigmoids inside deep networks.
        </p>
        <h3>Exploding gradients and clipping</h3>
        <p>
          When the product is far above 1, one update can throw the weights so far that the loss becomes infinite.{' '}
          <strong>Gradient clipping</strong> is the standard guard: measure the length of the whole gradient vector,
          and if it is above a threshold (1.0 is common), scale the vector down to that length. The direction is kept
          and only the step size is capped.
        </p>
        <h3>Layer normalisation, and why transformers are deep</h3>
        <p>
          <strong>Layer normalisation</strong> rescales each token's vector to mean 0 and variance 1 before a layer
          reads it. Inputs stay in the range where slopes are healthy, and the layer's contribution stays a predictable
          size at every depth. Current transformers put it inside the branch: <M>{String.raw`h + F(\text{norm}(h))`}</M>,
          which leaves the skip path completely clean. Every transformer block has two such residual steps, one around
          attention and one around the feed-forward layer. GPT-3 stacks 96 blocks. Without the identity path and the
          normalisation, a product of that many factors would not leave a usable signal for the first block.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'A skip path does not stop explosion',
      body: 'A residual factor is 1 plus something, so it can sit above 1 at every layer. In the lab, f = 1.5 with 48 residual layers gives 1.15⁴⁸, about 820. Residuals remove the collapse toward zero. Small initial weights, normalisation and clipping handle the other direction.',
    },
    {
      title: 'Clipping treats the symptom',
      body: 'Clipping shrinks the whole gradient vector to a maximum length, keeping its direction, after the product has already blown up. If it triggers on almost every step, the learning rate or the initial weights are wrong, and training crawls at the clipped speed.',
    },
    {
      title: 'A factor of exactly zero is permanent',
      body: 'A ReLU unit whose input is negative has a slope of 0, so no gradient passes through it. If every training example leaves it negative, it gets no signal to recover and stays off for the rest of training.',
    },
    {
      title: 'The same product appears along a sequence',
      body: 'Older recurrent networks passed information from word to word through one repeated layer, so the gradient between two words 100 steps apart was a product of 100 factors. They forgot long-range context for exactly this reason. Attention connects any two positions in one step.',
    },
  ],
  questions: [
    {
      id: 'vg-1', kind: 'mcq', level: 1,
      prompt: 'In backpropagation, how is the gradient at an early layer obtained from the gradient at the loss?',
      options: [
        { text: 'It is multiplied by one local factor for every layer it passes back through', correct: true, why: 'The chain rule turns a stack of layers into a product of local derivatives, one per layer between the loss and the weight.' },
        { text: 'One local factor is added to it for every layer it passes back through', why: 'Sums grow or shrink in proportion to depth. The real signal is a product, which is why it changes exponentially with depth.' },
        { text: 'It is copied to every layer unchanged, then scaled by the learning rate', why: 'If it were copied unchanged there would be no vanishing or exploding. Each layer rescales it on the way back.' },
        { text: 'It is recomputed from scratch at each layer using only that layer’s inputs', why: 'A layer cannot know how it affected the loss from its inputs alone. It needs the signal handed back from the layers after it.' },
      ],
    },
    {
      id: 'vg-2', kind: 'mcq', level: 1,
      prompt: 'What does a residual connection do to the factor a layer contributes to the gradient product?',
      options: [
        { text: 'It turns the factor f into 1 + (a term from the layer), so an identity path always exists', correct: true, why: 'output = input + layer(input). The derivative of the first term is 1, so the gradient always has a path that passes it back unchanged.' },
        { text: 'It forces the factor to be exactly 1, so the gradient never changes size', why: 'The layer’s own path still contributes. The factor is 1 plus that contribution, and it can be above 1.' },
        { text: 'It divides the factor by the depth, so deeper networks get smaller factors', why: 'Nothing is divided by depth. The change is an added 1 from the skip path.' },
        { text: 'It removes the layer from the backward pass, so fewer factors are multiplied', why: 'Every layer is still in the product. What changes is the size of each factor, not how many there are.' },
      ],
    },
    {
      id: 'vg-3', kind: 'num', level: 2,
      prompt: <>A plain network has 20 layers and each multiplies the gradient by 0.9. What fraction of the gradient reaches layer 1? (Give a decimal.)</>,
      answer: 0.12, tol: 0.01,
      why: <>0.9²⁰. Square repeatedly: 0.9² = 0.81, 0.9⁴ = 0.656, 0.9⁸ = 0.430, 0.9¹⁶ = 0.185. Then 0.9²⁰ = 0.185 × 0.656 = <strong>0.12</strong>. About 12% arrives.</>,
      hint: 'One factor per layer, all multiplied together. Repeated squaring gets you there in a few steps.',
    },
    {
      id: 'vg-4', kind: 'mcq', level: 2,
      prompt: 'The slope of a sigmoid is never more than 0.25. Ignoring the weights, what is the largest possible gradient factor across 10 sigmoid layers?',
      options: [
        { text: 'About one millionth', correct: true, why: '0.25¹⁰ = 0.00000095. Even in the best case the signal is cut by a factor of a million in ten layers.' },
        { text: 'About 0.025', why: 'That is 0.25 ÷ 10. The factors multiply, they are not divided by the number of layers.' },
        { text: 'Exactly 0.25', why: 'That is the factor for one layer. Each of the ten layers applies its own.' },
        { text: 'About 2.5', why: 'That is 0.25 × 10. The factors multiply together, they are not added up.' },
      ],
      hint: 'Multiply the best-case factor by itself once per layer.',
    },
    {
      id: 'vg-5', kind: 'mcq', level: 2,
      prompt: 'A training step produces a gradient vector of length 50. Clipping is set to a maximum length of 1. What is applied to the weights?',
      options: [
        { text: 'The same gradient scaled down to length 1, pointing in the same direction', correct: true, why: 'Clipping multiplies the whole vector by 1 ÷ 50. Every weight still moves in the direction its gradient says, with a capped step.' },
        { text: 'Nothing: the step is skipped because the gradient is too large', why: 'Clipping does not discard the step. It rescales it.' },
        { text: 'Each entry above 1 is set to 1, and the rest are left alone', why: 'That would change the direction of the update. Norm clipping scales the whole vector by one number.' },
        { text: 'The gradient with its largest entries removed', why: 'No entries are removed. All of them are scaled by the same number.' },
      ],
      hint: 'Clipping by length changes one property of the vector and keeps the other.',
    },
    {
      id: 'vg-6', kind: 'num', level: 3,
      prompt: <>A residual network has 1,000 layers and every factor is 1.01. Roughly how many times larger is the gradient at layer 1 than at the output? (ln 1.01 ≈ 0.00995)</>,
      answer: 21000, tol: 2500,
      why: <>1.01¹⁰⁰⁰ = e^(1000 × 0.00995) = e^9.95 ≈ <strong>21,000</strong>. A 1% excess per layer is invisible at depth 10 (×1.1) and ruinous at depth 1,000. The identity path prevents collapse, not growth.</>,
      hint: 'Turn the power into an exponential: a^n = e^(n × ln a).',
    },
    {
      id: 'vg-7', kind: 'mcq', level: 3,
      prompt: 'You delete every skip path from a 96-block transformer and keep everything else. What happens when you train it from scratch?',
      options: [
        { text: 'The early blocks get almost no gradient, or a huge one, and training fails', correct: true, why: 'Without the identity path the gradient is a plain product of about 192 factors. Unless every one is almost exactly 1, the product is near zero or enormous.' },
        { text: 'It trains the same, because layer normalisation alone keeps every factor at 1', why: 'Normalisation keeps activations in range, which helps. It does not guarantee each factor is 1, and across this many layers small deviations compound.' },
        { text: 'It trains faster, because there are fewer paths for the gradient to follow', why: 'The skip paths are the ones that carry the gradient intact. Removing them removes the good route, not the slow one.' },
        { text: 'Only the last block is affected, because it is closest to the loss', why: 'The last block is the one that still gets a clean signal. The damage grows with distance from the loss.' },
      ],
      hint: 'Count the factors between the loss and the first block, then ask what a plain product of that many does.',
    },
    {
      id: 'vg-8', kind: 'mcq', level: 3,
      prompt: 'A residual layer’s own path is initialised so its contribution is exactly zero. What gradient reaches layer 1 of a 100-layer stack at the start of training?',
      options: [
        { text: 'Exactly the gradient at the output: every factor is 1 + 0 = 1', correct: true, why: 'With the branch at zero each layer is the identity, so the product is 1¹⁰⁰ = 1. Starting branches at or near zero is a common way to make very deep stacks trainable from the first step.' },
        { text: 'Zero, because a layer that outputs zero passes no gradient', why: 'The branch outputs zero, but the skip path still carries the gradient with a factor of 1.' },
        { text: 'A value 100 times the output gradient, one unit added per layer', why: 'Factors multiply. One hundred factors of 1 multiply to 1.' },
        { text: 'It is undefined until the branches have been trained for a while', why: 'The product is well defined at every step. At this initialisation it is exactly 1.' },
      ],
      hint: 'Write the factor as 1 + (branch term) and put in the branch term.',
    },
  ],
  takeaways: [
    'A gradient says how much the loss changes when a weight is nudged, and backpropagation computes it as a product of one factor per layer.',
    'Factors below 1 make that product vanish with depth and factors above 1 make it explode: 0.8 over 24 layers leaves 0.0047.',
    'A residual connection makes each factor 1 + something, which gives the gradient an identity path that depth cannot shrink.',
    'Residual paths plus layer normalisation, with clipping as a guard, are what let transformers stack many dozens of blocks.',
  ],
};

export default lesson;
