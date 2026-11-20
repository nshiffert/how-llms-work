import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Seg, Slider, Stat, useRaf } from '../ui/kit';
import { BLOCK, makeLevels, makeWeights, nearest, quantize, variance, type Scheme } from './qlora.math';

/* ------------------------------------------------------------------ *
 * Lab: real quantization of 4,096 seeded bell-shaped weights.
 * Each block of 64 weights is divided by its largest magnitude (as
 * block-wise quantizers do), then every weight is snapped to the nearest
 * of 2^bits levels. Errors are computed from the actual differences.
 * Memory figures are parameters × bits ÷ 8, nothing more.
 * ------------------------------------------------------------------ */

const BITS = [16, 8, 6, 4, 3, 2];
const ADAPTER_RANKS = [8, 16, 32, 64, 128, 256];
/** Example shapes: total parameters, layer width, layer count. */
const MODELS = {
  '1B': { params: 1e9, d: 2048, layers: 22 },
  '7B': { params: 7e9, d: 4096, layers: 32 },
  '13B': { params: 13e9, d: 5120, layers: 40 },
  '70B': { params: 70e9, d: 8192, layers: 80 },
} as const;
type ModelId = keyof typeof MODELS;

const W = 760;
const X = (v: number) => 380 + v * 350;
const BASE = 170;
const TOP = 130;
const gb = (bytes: number) => bytes / 1e9;
const sci = (x: number) => {
  const [m, e] = x.toExponential(2).split('e');
  return <>{m} × 10<sup style={{ fontSize: '0.65em' }}>{String(Number(e)).replace('-', '−')}</sup></>;
};

/** A sample of weights sliding from where they were stored to the level they snap to, and back. */
function SnapDots({ sample, levels }: { sample: number[]; levels: Float64Array }) {
  const [e, setE] = useState(0);
  useRaf((t) => {
    const ph = (t % 4.4) / 4.4; // rest, slide, hold, slide back
    const k = ph < 0.2 ? 0 : ph < 0.4 ? (ph - 0.2) / 0.2 : ph < 0.8 ? 1 : 1 - (ph - 0.8) / 0.2;
    setE(k * k * (3 - 2 * k));
  });
  const snapped = useMemo(() => sample.map((w) => levels[nearest(levels, w)]), [sample, levels]);
  return (
    <g>
      {sample.map((w, i) => (
        <circle key={i} cx={X(w + (snapped[i] - w) * e)} cy={199 + (i % 3) * 10} r={3} fill="var(--hue)" fillOpacity={0.35 + 0.65 * e} />
      ))}
    </g>
  );
}

function QloraLab({ complete }: LabProps) {
  const [bits, setBits] = useState(8);
  const [scheme, setScheme] = useState<Scheme>('even');
  const [model, setModel] = useState<ModelId>('13B');
  const [ai, setAi] = useState(1);

  const weights = useMemo(() => makeWeights(4096), []);
  const spread = useMemo(() => variance(weights), [weights]);
  const sample = useMemo(() => Array.from({ length: 60 }, (_, i) => weights[i * 67 + 5]), [weights]);
  const hist = useMemo(() => {
    const h = new Array(64).fill(0);
    for (const w of weights) h[Math.min(63, Math.floor((w + 1) * 32))]++;
    return h;
  }, [weights]);
  const histMax = Math.max(...hist);

  const res = useMemo(() => {
    const le = makeLevels(bits, 'even');
    const ln = makeLevels(bits, 'normal');
    return { even: { L: le, ...quantize(weights, le) }, normal: { L: ln, ...quantize(weights, ln) } };
  }, [bits, weights]);
  const cur = res[scheme];
  const n = cur.L.length;
  const countMax = Math.max(...cur.counts);
  const drawLevels = n <= 64;

  const stair = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 480; i++) {
      const x = -1 + i / 240;
      const y = cur.L[nearest(cur.L, x)];
      pts.push(`${(40 + (x + 1) * 120).toFixed(1)},${(195 - (y + 1) * 90).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [cur]);

  // Memory arithmetic
  const m = MODELS[model];
  const rank = ADAPTER_RANKS[ai];
  const base16 = gb((m.params * 16) / 8);
  const baseQ = gb((m.params * bits) / 8);
  const adapterParams = m.layers * 2 * (2 * m.d * rank);
  const adapter = gb((adapterParams * 16) / 8);
  const total = baseQ + adapter;

  useEffect(() => {
    if (bits === 4) complete('four');
    if (bits === 4 && scheme === 'normal') complete('nf');
    if (bits === 2) complete('two');
    if (model === '7B' && bits === 6) complete('fit');
  }, [bits, scheme, model, complete]);

  const diff = (res.normal.mse - res.even.mse) / res.even.mse;
  // Smallest gap between neighbouring levels, against a typical update of 0.00001.
  let gap = Infinity;
  for (let i = 1; i < n; i++) gap = Math.min(gap, cur.L[i] - cur.L[i - 1]);
  const gapRatio = gap / 1e-5;

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Bits per weight</span>
          <Seg value={bits} onChange={setBits} options={BITS.map((b) => ({ value: b, label: String(b) }))} />
        </div>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Levels</span>
          <Seg value={scheme} onChange={setScheme} options={[{ value: 'even', label: 'evenly spaced' }, { value: 'normal', label: 'normal quantiles' }]} />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg className="viz" viewBox={`0 0 ${W} 250`} style={{ minWidth: 600 }} role="img" aria-label={`Histogram of 4,096 weights with ${n} quantization levels`}>
          <text x={30} y={18} style={{ fill: 'var(--fg)', fontSize: 14, fontWeight: 600 }}>
            {bits} bits = {n.toLocaleString('en-US')} levels
          </text>
          <text x={30} y={35} style={{ fill: 'var(--fg-3)', fontSize: 11 }}>grey = the 4,096 stored weights</text>
          <text x={730} y={18} textAnchor="end" style={{ fill: 'var(--hue)', fontSize: 11 }}>
            {drawLevels ? 'green stem = one level · height = share of weights that snap to it' : `${n.toLocaleString('en-US')} levels: too close together to draw`}
          </text>
          {hist.map((h, i) => (
            <rect key={i} x={X(-1 + i / 32) + 0.5} y={BASE - (h / histMax) * TOP} width={350 / 32 - 1} height={(h / histMax) * TOP} fill="var(--fg-3)" fillOpacity={0.3} rx={1.5} />
          ))}
          <line x1={24} x2={736} y1={BASE} y2={BASE} stroke="var(--line-2)" />
          {[-1, -0.5, 0, 0.5, 1].map((v) => (
            <text key={v} x={X(v)} y={185} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--fg-3)' }}>{v}</text>
          ))}
          {drawLevels &&
            Array.from(cur.L).map((lv, k) => {
              const h = Math.max(2, (cur.counts[k] / countMax) * TOP);
              return (
                <g key={k} style={{ transform: `translateX(${X(lv)}px)`, transition: 'transform .45s cubic-bezier(.22,1,.36,1)' }}>
                  <rect x={-1} y={BASE - h} width={2} height={h} fill="var(--hue)" style={{ transition: 'y .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1)' }} />
                  <circle cx={0} cy={BASE - h} r={n <= 16 ? 3.5 : 2} fill="var(--hue)" style={{ transition: 'cy .45s cubic-bezier(.22,1,.36,1)' }} />
                  {n <= 16 && (
                    <text x={0} y={BASE - h - 8} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--fg)' }}>
                      {((cur.counts[k] / weights.length) * 100).toFixed(0)}%
                    </text>
                  )}
                </g>
              );
            })}
          <SnapDots sample={sample} levels={cur.L} />
          <text x={380} y={243} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>
            dots: 60 of the weights sliding to their nearest level and back · the bumps at ±1 are each block’s largest weight
          </text>
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>stored value → snapped value</div>
          <svg className="viz" viewBox="0 0 300 226" role="img" aria-label="Staircase of original value against quantized value">
            <rect x={40} y={15} width={240} height={180} fill="none" stroke="var(--line)" rx={4} />
            <line x1={40} y1={195} x2={280} y2={15} stroke="var(--fg-3)" strokeDasharray="4 4" strokeOpacity={0.7} />
            <polyline points={stair} fill="none" stroke="var(--hue)" strokeWidth={2} strokeLinejoin="round" />
            <text x={160} y={214} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>stored weight (−1 to 1)</text>
            <text x={14} y={105} textAnchor="middle" transform="rotate(-90 14 105)" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>snapped to</text>
            <text x={272} y={186} textAnchor="end" style={{ fontSize: 10.5, fill: 'var(--fg-3)' }}>dashed = no rounding</text>
          </svg>
        </div>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="eyebrow">rounding error at {bits} bits</div>
          <Bars
            items={[
              { label: 'even', value: res.even.mse, text: res.even.mse.toExponential(1), color: scheme === 'even' ? undefined : 'var(--fg-3)' },
              { label: 'quantile', value: res.normal.mse, text: res.normal.mse.toExponential(1), color: scheme === 'normal' ? undefined : 'var(--fg-3)' },
            ]}
            labelWidth={70}
          />
          <div className="row">
            <Stat label="mean squared error (selected)" value={sci(cur.mse)} hot />
            <Stat label="typical error ÷ spread of the weights" value={(Math.sqrt(cur.mse / spread) * 100).toFixed(1) + '%'} />
          </div>
          <div className="dim" style={{ fontSize: 13 }}>
            Normal-quantile levels give{' '}
            <strong style={{ color: diff < 0 ? 'var(--good)' : 'var(--warn)' }}>
              {diff < 0 ? `${Math.abs(diff * 100).toFixed(0)}% less squared error than` : `${(1 + diff).toFixed(1)}× the squared error of`}
            </strong>{' '}
            evenly spaced levels at {bits} bits. Weights are scaled per block of {BLOCK} to fit −1 to 1.
          </div>
          <div className="dim" style={{ fontSize: 13 }}>
            Smallest gap between neighbouring levels: <strong className="mono">{Number(gap.toPrecision(3))}</strong>.{' '}
            {gapRatio >= 2
              ? `A training update of 0.00001 is 1/${Math.round(gapRatio).toLocaleString('en-US')} of that gap, so it almost always rounds back to the same level.`
              : 'A training update of 0.00001 is about the size of that gap.'}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, display: 'grid', gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="eyebrow">memory to hold the weights</div>
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>Base model</span>
            <Seg value={model} onChange={setModel} options={(Object.keys(MODELS) as ModelId[]).map((k) => ({ value: k, label: k }))} />
          </div>
        </div>
        <Slider label="LoRA adapter rank (adapter stays at 16 bits)" value={ai} min={0} max={ADAPTER_RANKS.length - 1} onChange={setAi} format={(i) => String(ADAPTER_RANKS[i])} />
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'base at 16 bits', parts: [{ w: 1, c: 'var(--fg-3)' }], text: base16.toFixed(2) + ' GB' },
            { label: `base at ${bits} bits + adapter`, parts: [{ w: baseQ / base16, c: 'var(--hue)' }, { w: adapter / base16, c: '#a78bfa' }], text: total.toFixed(2) + ' GB' },
          ].map((row) => (
            <div key={row.label} className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 10px', alignItems: 'center', fontSize: 12.5 }}>
              <span style={{ color: 'var(--fg-2)' }}>{row.label}</span>
              <span style={{ textAlign: 'right', color: 'var(--fg)' }}>{row.text}</span>
              <div style={{ gridColumn: '1 / -1', display: 'flex', height: 14, borderRadius: 7, background: 'var(--line)', overflow: 'hidden' }}>
                {row.parts.map((p, i) => (
                  <div key={i} style={{ width: `${p.w * 100}%`, minWidth: 2, background: p.c, transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="row">
          <Stat label={`base: ${model} × 16 bits ÷ 8`} value={base16.toFixed(2) + ' GB'} />
          <Stat label={`base: ${model} × ${bits} bits ÷ 8`} value={baseQ.toFixed(2) + ' GB'} hot />
          <Stat label={`adapter: ${(adapterParams / 1e6).toFixed(1)}M numbers × 16 bits`} value={adapter.toFixed(3) + ' GB'} />
          <Stat label="base shrinks by" value={'×' + (16 / bits).toFixed(1)} />
        </div>
        <div className="dim" style={{ fontSize: 12.5 }}>
          Arithmetic only: parameters × bits ÷ 8, with 1 GB = 10⁹ bytes. Excludes activations, gradients, optimizer state and
          the per-block scale constants. The adapter (purple, drawn at least 2 px wide) assumes rank-{rank} LoRA on two
          matrices in each of {m.layers} layers of width {m.d.toLocaleString('en-US')}. Adapting every linear layer, as the
          QLoRA paper did, makes it several times larger and still small next to the base.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'qlora',
  hook: {
    prompt: (
      <>
        A weight stored in 4 bits can only take 16 different values. A training step wants to change a weight by something
        like 0.00001. How does QLoRA fine-tune a model whose weights are stored in 4 bits?
      </>
    ),
    options: [
      {
        text: 'The 4-bit weights are frozen; the updates go into small LoRA matrices kept at higher precision',
        correct: true,
        why: 'The 4-bit base is read-only. Gradients pass through it to reach the adapter matrices, which are stored at 16 bits or more and can absorb tiny updates. Nothing ever has to nudge a 4-bit number.',
      },
      {
        text: 'Each update is rounded to the nearest of the 16 allowed values, so the weights move one level at a time',
        why: 'Almost every update is far smaller than the gap between levels, so it would round to no change at all. Training directly on 16-level weights stalls.',
      },
      {
        text: 'The model is expanded back to 16 bits for training, then squeezed down to 4 bits again when training ends',
        why: 'Then training would need the full 16-bit memory, which is the cost QLoRA exists to avoid. The base stays stored in 4 bits during training.',
      },
      {
        text: 'It uses a much larger learning rate so that each update is big enough to jump to the next level',
        why: 'Steps the size of a level gap are far too coarse to follow a gradient and training would diverge. QLoRA does not change the 4-bit weights at all.',
      },
    ],
    reveal: 'First see what snapping weights to 16 values actually costs, in error and in memory.',
  },
  Lab: QloraLab,
  missions: [
    {
      id: 'four',
      text: 'Drop to 4 bits and read the memory panel.',
      insight: 'Sixteen levels, and the base takes exactly a quarter of the bytes it took at 16 bits. For the 13B example that is 26 GB down to 6.5 GB. The cost is in the staircase: every weight now sits up to half a step away from where it was. With evenly spaced levels the gap between them is 0.133, about 13,000 times a typical update of 0.00001. That is why QLoRA never updates these weights.',
    },
    {
      id: 'nf',
      text: 'At 4 bits, switch the levels from “evenly spaced” to “normal quantiles” and compare the two error bars.',
      insight: 'Squared error falls from 1.48 × 10⁻³ to 1.26 × 10⁻³, about 15% less, for the same 4 bits. Evenly spaced levels waste values on the tails, where 1% to 2% of the weights live. Quantile levels crowd toward the middle, where the weights are.',
    },
    {
      id: 'two',
      text: 'Go down to 2 bits and watch the error.',
      insight: 'Four levels. Squared error is about 25 times what it was at 4 bits, and a typical weight is off by nearly half the spread of all the weights. Each bit removed halves the number of levels, so error climbs fast while memory only falls in a straight line.',
    },
    {
      id: 'fit',
      text: 'Select the 7B model and find the largest bit width whose base fits under 6 GB.',
      insight: '6 bits: 7 billion × 6 ÷ 8 = 5.25 GB. At 8 bits it is 7 GB. In practice the common choices are 8 and 4, and 4 bits gives 3.5 GB, which leaves room for the activations and gradients this panel does not count.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Quantization stores each weight in fewer bits by snapping it to the nearest value in a small fixed set of
          levels. With 4 bits there are 16 levels. You saw the price as a staircase and a rounding error, and the payoff
          as a quarter of the memory.
        </p>
        <p>QLoRA combines that with LoRA:</p>
        <ol>
          <li>
            <strong>Quantize and freeze.</strong> The base model is stored in 4 bits and never updated.
          </li>
          <li>
            <strong>Train adapters on top.</strong> LoRA matrices <M>{'B'}</M> and <M>{'A'}</M> are added at higher
            precision, 16 or 32 bits. Only they receive updates.
          </li>
          <li>
            <strong>Compute at higher precision.</strong> When a layer runs, its 4-bit weights are converted back to
            16-bit numbers on the fly (dequantized), used, and discarded. Gradients flow through that computation to
            the adapters.
          </li>
        </ol>
        <Callout>
          Each layer computes <M>{String.raw`\text{dequant}(W_{4\text{bit}})\,x + \tfrac{\alpha}{r} B A x`}</M>. Only{' '}
          <M>{'B'}</M> and <M>{'A'}</M> change.
        </Callout>
        <p>
          Two details squeeze out more. The levels are placed at the quantiles of a bell curve, because trained weights
          are bell-shaped (a data type called NF4). And the per-block scale constants are themselves quantized (double
          quantization).
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Snap one block of four weights to 2 bits with evenly spaced levels. The largest magnitude in the block is 0.8,
          so that becomes the block’s scale constant.
        </p>
        <table>
          <thead>
            <tr><th>weight</th><th>÷ 0.8</th><th>nearest of −1, −⅓, ⅓, 1</th><th>× 0.8</th><th>error</th></tr>
          </thead>
          <tbody>
            <tr><td>0.80</td><td>1.000</td><td>1</td><td>0.800</td><td>0.000</td></tr>
            <tr><td>0.10</td><td>0.125</td><td>⅓</td><td>0.267</td><td>0.167</td></tr>
            <tr><td>−0.30</td><td>−0.375</td><td>−⅓</td><td>−0.267</td><td>0.033</td></tr>
            <tr><td>−0.50</td><td>−0.625</td><td>−⅓</td><td>−0.267</td><td>0.233</td></tr>
          </tbody>
        </table>
        <p>
          What gets stored is four 2-bit codes plus the one scale constant 0.8. The mean squared error is (0² + 0.167² +
          0.033² + 0.233²) ÷ 4 = 0.021.
        </p>
        <p>
          Memory for a 7-billion-parameter model: at 16 bits, 7 × 10⁹ × 16 ÷ 8 = 14 GB. At 4 bits, 7 × 10⁹ × 4 ÷ 8 =
          3.5 GB. A rank-16 adapter on two matrices in each of 32 layers of width 4,096 is 32 × 2 × 2 × 4,096 × 16 =
          8,388,608 numbers, which at 16 bits is 0.017 GB. Total: about 3.52 GB before activations and overhead. The QLoRA paper adapted every
          linear layer. On a 7B Llama-shaped model at rank 16 that is about 40 million numbers, 0.08 GB: still tiny next
          to the base.
        </p>
        <Code>{`
W_q = quantize_4bit(W)             # stored once, frozen
A, B = lora_init(r)                # 16-bit, trainable
def layer(x):
    W16 = dequantize(W_q)          # temporary, higher precision
    return W16 @ x + (alpha / r) * (B @ (A @ x))
# backward: gradients reach A and B only
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Where the levels go</h3>
        <p>
          Evenly spaced levels spend as many values on the sparse tails as on the crowded middle. NF4 instead cuts a
          standard bell curve into slices of equal probability and puts one level in each, then rescales to −1 to 1. Real
          NF4 also reserves one level for exactly 0, so its 16 levels are not symmetric. The lab uses the same idea,
          but its levels are symmetric and have no zero level. The gain appears when levels are scarce: at 8 bits in the lab, evenly spaced levels
          have the lower error, because 256 values are enough to cover everything finely.
        </p>
        <h3>Double quantization</h3>
        <p>
          Block-wise quantization keeps one scale constant per block. With a 32-bit constant for every 64 weights, that
          is 32 ÷ 64 = 0.5 extra bits per weight. QLoRA quantizes those constants too, to 8 bits with a second level of
          blocks, bringing the overhead to about 0.127 bits per weight. The saving is about 0.37 bits per weight: roughly
          0.33 GB on a 7-billion-parameter model.
        </p>
        <h3>How gradients get past frozen 4-bit weights</h3>
        <p>
          The dequantized weights are ordinary numbers used in an ordinary matrix multiply, so backpropagation passes
          through them like any constant. The gradient with respect to the layer’s output reaches <M>{'B'}</M> and{' '}
          <M>{'A'}</M>. No gradient is ever applied to the 4-bit codes, so rounding never has to be differentiated.
        </p>
        <h3>The adapters can repair rounding error</h3>
        <p>
          The adapter is trained on the output of the quantized model, so it learns the task and compensates for part
          of the damage quantization did at the same time. This is why a 4-bit base with trained adapters can land close
          to a 16-bit fine-tune even though the base alone is slightly worse.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Each training step is slower than plain LoRA',
      body: 'Every forward pass has to dequantize the 4-bit weights before using them. You trade speed for memory: the model fits on a smaller GPU, and each step takes longer on it.',
    },
    {
      title: 'Rounding costs some quality',
      body: 'A 4-bit base is not the same model as the 16-bit one. The loss is usually small and adapters recover part of it, but it is not zero, and it grows quickly below 4 bits, as the lab showed at 2.',
    },
    {
      title: 'Merging breaks the tidy picture',
      body: 'The adapter was trained against the 4-bit weights. To merge, you must dequantize the base and add the adapter, which gives 16-bit weights that are no longer the quantized base. Quantize the merged result again and the rounding changes, so behaviour shifts slightly from what you trained.',
    },
    {
      title: 'The memory figure is only the weights',
      body: 'Parameters × bits ÷ 8 leaves out activations, gradients for the adapters, optimizer state and framework overhead. With long sequences or large batches these can exceed the 4-bit base itself.',
    },
  ],
  questions: [
    {
      id: 'ql-1', kind: 'mcq', level: 1,
      prompt: 'What does quantizing a weight to 4 bits do to it?',
      options: [
        { text: 'Snaps it to the nearest of 16 fixed levels and stores that choice', correct: true, why: '4 bits can label 2⁴ = 16 values. The weight is replaced by the nearest one, and only the 4-bit label is stored.' },
        { text: 'Keeps its 4 most significant decimal digits and drops the rest', why: 'Bits are not decimal digits. 4 bits give 16 possible values in total, far coarser than four digits.' },
        { text: 'Sets it to zero if it is among the smallest weights in its block', why: 'That is pruning. Quantization keeps every weight and reduces how precisely each is stored.' },
        { text: 'Shares one stored value among 4 neighbouring weights', why: 'Each weight still gets its own code. It is the code that is short, not the number of codes.' },
      ],
    },
    {
      id: 'ql-2', kind: 'mcq', level: 1,
      prompt: 'In QLoRA, what is updated during training?',
      options: [
        { text: 'Only the LoRA matrices, held at higher precision; the 4-bit base is never changed', correct: true, why: 'The quantized base is frozen. Gradients flow through it and are applied only to the adapter matrices B and A.' },
        { text: 'The 4-bit base weights, each moved to a neighbouring level when its gradient is large', why: 'The 4-bit weights receive no updates at all. Level-sized jumps would be far too coarse to train with.' },
        { text: 'Both the 4-bit base and the adapters, at different learning rates', why: 'Only the adapters are trainable. The base is read-only for the whole run.' },
        { text: 'A 16-bit copy of the base, which is quantized again after each step', why: 'No 16-bit copy of the whole base is kept. That would cost the memory the method is meant to save.' },
      ],
    },
    {
      id: 'ql-3', kind: 'num', level: 2,
      prompt: <>A model has 13 billion parameters. How many GB do its weights take at 4 bits each? (1 GB = 10⁹ bytes)</>,
      answer: 6.5, tol: 0.05, unit: 'GB',
      why: <>13 × 10⁹ × 4 bits = 52 × 10⁹ bits. Divide by 8 bits per byte: 6.5 × 10⁹ bytes = <strong>6.5 GB</strong>. At 16 bits it would be 26 GB.</>,
      hint: 'Parameters × bits gives bits. There are 8 bits in a byte.',
    },
    {
      id: 'ql-4', kind: 'num', level: 2,
      prompt: <>You snap weights to 3 bits with evenly spaced levels from −1 to 1. What is the gap between neighbouring levels?</>,
      answer: 0.286, tol: 0.01,
      why: <>3 bits give 2³ = 8 levels, which leave 7 gaps across a range of 2. 2 ÷ 7 = <strong>0.286</strong>. A weight can be off by up to half of that, 0.143.</>,
      hint: 'Count the levels, then count the gaps between them.',
    },
    {
      id: 'ql-5', kind: 'mcq', level: 2,
      prompt: 'Why do normal-quantile levels give less rounding error than evenly spaced ones at 4 bits?',
      options: [
        { text: 'They put more levels near zero, where most of the weights are', correct: true, why: 'Trained weights are bell-shaped. Moving levels from the sparse tails to the crowded middle shortens the snapping distance for the majority, which lowers the average error.' },
        { text: 'They use more than 16 levels by reusing codes across blocks', why: 'The count is still exactly 16. Only the positions of the levels change.' },
        { text: 'They store the rounding error and add it back at run time', why: 'Nothing extra is stored per weight. The error is simply smaller on average because the levels sit where the data is.' },
        { text: 'They remove the outlier weights so the range to cover is smaller', why: 'No weights are removed. The outermost levels still sit at −1 and 1 and cover the whole block.' },
      ],
      hint: 'Compare where the levels sit with where the grey histogram is tall.',
    },
    {
      id: 'ql-6', kind: 'mcq', level: 3,
      prompt: 'After QLoRA training you merge the adapter into the base and quantize the result to 4 bits again. Why can behaviour differ from what you measured during training?',
      options: [
        { text: 'The merged weights round to different levels than the base did', correct: true, why: 'Training used dequantized base weights plus an exact 16-bit adapter. Merging and quantizing again applies fresh rounding to the sum, which changes the weights the adapter was tuned against.' },
        { text: 'Merging discards the adapter, so the model returns to the untuned base', why: 'Merging adds the adapter into the weights. Its effect is kept, then partly disturbed by the new rounding.' },
        { text: 'The adapter was trained in 4 bits and loses precision when merged', why: 'The adapter was the high-precision part throughout. The precision loss comes from quantizing the merged weights.' },
        { text: 'Quantizing twice always doubles the rounding error', why: 'There is no doubling rule. The issue is that the second rounding is applied to different numbers than the first.' },
      ],
      hint: 'Write down what the layer computed in training, then what it computes after merge and re-quantize.',
    },
    {
      id: 'ql-7', kind: 'mcq', level: 3,
      prompt: 'Someone proposes skipping the adapters and training the 4-bit weights directly with ordinary gradient steps. What goes wrong?',
      options: [
        { text: 'A typical update is far smaller than a level gap, so it rounds away', correct: true, why: 'With 16 levels across the range, a step of 0.00001 rounds back to the same level. Almost no update survives, so training stalls.' },
        { text: 'Gradients cannot be computed through a model whose weights are quantized', why: 'They can: the dequantized weights are ordinary numbers in the forward pass. QLoRA relies on exactly that to reach the adapters.' },
        { text: 'The model would need 4 times more memory than at 16 bits', why: 'Memory for the weights would stay at a quarter of 16-bit. The failure is in the updates, not the storage.' },
        { text: 'It works, and is how QLoRA trains the base in practice', why: 'QLoRA never updates the base. All learning goes into the higher-precision adapters.' },
      ],
      hint: 'Compare the size of one update with the distance to the next allowed value.',
    },
    {
      id: 'ql-8', kind: 'mcq', level: 3,
      prompt: 'A 7B model at 4 bits takes 3.5 GB by the lesson’s arithmetic, yet fine-tuning it fails on an 8 GB GPU with long inputs. What is the likely cause?',
      options: [
        { text: 'Activations and adapter gradients take memory the weight arithmetic omits', correct: true, why: 'Parameters × bits ÷ 8 counts stored weights only. Every layer’s activations must be kept for the backward pass, and that grows with sequence length and batch size.' },
        { text: 'The 4-bit weights are expanded to a full 16-bit copy of the model at the start of training', why: 'Dequantization is done per layer as it runs and the result is discarded. No full 16-bit copy is held.' },
        { text: 'The LoRA adapters are larger than the base model once training begins', why: 'A rank-16 adapter here is about 0.017 GB. It is hundreds of times smaller than the base.' },
        { text: 'Double quantization doubles the stored size of the weights', why: 'It shrinks the scale constants. It is a saving of about 0.37 bits per weight, not a cost.' },
      ],
      hint: 'List everything that must sit in GPU memory during a backward pass, not only the weights.',
    },
  ],
  takeaways: [
    'Quantization snaps each weight to the nearest of 2^bits levels: 4 bits means 16 levels and a quarter of the 16-bit memory.',
    'QLoRA freezes a 4-bit base and trains higher-precision LoRA adapters on top; gradients pass through the base but never update it.',
    'Placing levels at the quantiles of a bell curve lowers 4-bit rounding error (about 15% in the lab) because trained weights are bell-shaped.',
    'The costs are slower steps, a small quality loss, and a merged model that is no longer exactly the quantized base.',
  ],
};

export default lesson;
