import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Seg, Slider, Stat, useSpring } from '../ui/kit';
import { factor, makeDelta, svd, type Mat } from './lora.math';

/* ------------------------------------------------------------------ *
 * Lab: a real low-rank factorisation you can watch.
 * ΔW is a seeded 16×16 matrix built from rank-1 pieces whose strengths
 * halve each time, plus a little noise. A real SVD (Jacobi rotations,
 * in lora.math.ts) gives the best rank-r pair B, A. The error shown is
 * the Frobenius norm of the actual difference ΔW − B·A.
 * ------------------------------------------------------------------ */

const N = 16;
const NEG = '#f472b6';
const RANKS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
const DIMS = [1024, 2048, 4096, 8192];

const maxAbs = (m: Mat) => Math.max(1e-12, ...m.flat().map(Math.abs));
const commas = (n: number) => Math.round(n).toLocaleString('en-US');
const short = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(n);

/** A heatmap. Green cells are positive, pink negative, brightness is size. */
function Heat({ m, x, y, c, scale }: { m: Mat; x: number; y: number; c: number; scale: number }) {
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform .35s cubic-bezier(.22,1,.36,1)' }}>
      <rect x={-1.5} y={-1.5} width={cols * c + 3} height={rows * c + 3} rx={3} fill="var(--bg, #06070d)" stroke="var(--line-2)" />
      {m.map((row, i) =>
        row.map((v, j) => (
          <rect
            key={i + '-' + j}
            x={j * c + 0.5} y={i * c + 0.5} width={c - 1} height={c - 1} rx={1.5}
            fill={v >= 0 ? 'var(--hue)' : NEG}
            fillOpacity={Math.min(1, Math.abs(v) / scale)}
            style={{ transition: 'fill-opacity .35s' }}
          />
        )),
      )}
    </g>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 620px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function LoraLab({ complete }: LabProps) {
  const narrow = useNarrow();
  const [r, setR] = useState(1);
  const [d, setD] = useState(4096);
  const [ri, setRi] = useState(6);
  const [change, setChange] = useState<{ from: number; to: number } | null>(null);
  const prevRi = useRef(ri);

  const D = useMemo(() => makeDelta(N), []);
  const dec = useMemo(() => svd(D), [D]);
  const errs = useMemo(() => Array.from({ length: N }, (_, k) => factor(D, dec, k + 1).err), [D, dec]);
  const f = useMemo(() => factor(D, dec, r), [D, dec, r]);
  const firstUnder10 = errs.findIndex((e) => e < 0.1) + 1;

  const err = f.err < 1e-9 ? 0 : f.err;
  const errGlide = useSpring(err);
  const toyLora = 2 * N * r;

  const R = RANKS[ri];
  const full = d * d;
  const lora = 2 * d * R;
  const share = lora / full;

  // Missions
  useEffect(() => {
    if (r === N) complete('full');
    if (r !== firstUnder10) return;
    const id = setTimeout(() => complete('ninety'), 500); // must settle on it, not pass through
    return () => clearTimeout(id);
  }, [r, firstUnder10, complete]);

  useEffect(() => {
    const was = prevRi.current;
    prevRi.current = ri;
    if (ri === was) return;
    setChange({ from: RANKS[was], to: RANKS[ri] });
    if (ri === was + 1) complete('double');
  }, [ri, complete]);

  useEffect(() => {
    if (d !== 4096 || R !== 16) return;
    const id = setTimeout(() => complete('onepct'), 500); // must settle on it, not pass through
    return () => clearTimeout(id);
  }, [d, R, complete]);

  // Layout of the equation row
  const c = 10;
  const S = N * c; // 160
  const y0 = 46;
  // Wide: ΔW ≈ B × A = B·A on one row. Narrow: ΔW ≈ B·A on top, B × A underneath.
  const pos = narrow
    ? { D: [8, y0], P: [212, y0], B: [8, 296], A: [212, 296], ops: [['≈', 190, y0 + 88], ['×', 190, 296 + 88]] as const, w: 380, h: 486, cap: 190 }
    : { D: [8, y0], B: [214, y0], A: [420, y0], P: [626, y0], ops: [['≈', 191, y0 + 88], ['×', 397, y0 + 88], ['=', 603, y0 + 88]] as const, w: 794, h: 236, cap: 397 };
  const scaleD = maxAbs(D);
  const sMax = dec.S[0];

  return (
    <div className="lab-grid">
      <Slider label="Rank r (how many columns B has, and how many rows A has)" value={r} min={1} max={N} onChange={setR} />

      <div style={{ overflowX: 'auto' }}>
        <svg className="viz" viewBox={`0 0 ${pos.w} ${pos.h}`} style={{ minWidth: narrow ? 300 : 640 }} role="img" aria-label={`Ideal update compared with the product of B and A at rank ${r}`}>
          {[
            { at: pos.D, t: 'ideal update ΔW', s: '16 × 16 = 256 numbers' },
            { at: pos.B, t: narrow ? 'B · A is made of: B' : 'B', s: `16 × ${r} = ${16 * r} numbers` },
            { at: pos.A, t: 'A', s: `${r} × 16 = ${16 * r} numbers` },
            { at: pos.P, t: 'B · A', s: `rank ${r} · built from ${toyLora}` },
          ].map((h, i) => (
            <g key={i}>
              <text x={h.at[0] + S / 2} y={h.at[1] - 31} textAnchor="middle" style={{ fill: i === 1 || i === 2 ? 'var(--hue)' : 'var(--fg)', fontSize: 13, fontWeight: 600 }}>{h.t}</text>
              <text x={h.at[0] + S / 2} y={h.at[1] - 14} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>{h.s}</text>
            </g>
          ))}
          {pos.ops.map(([op, x, y]) => (
            <text key={op} x={x} y={y} textAnchor="middle" style={{ fill: 'var(--fg-2)', fontSize: 24 }}>{op}</text>
          ))}
          <Heat m={D} x={pos.D[0]} y={pos.D[1]} c={c} scale={scaleD} />
          <Heat m={f.B} x={pos.B[0] + (S - r * c) / 2} y={pos.B[1]} c={c} scale={maxAbs(f.B)} />
          <Heat m={f.A} x={pos.A[0]} y={pos.A[1] + (S - r * c) / 2} c={c} scale={maxAbs(f.A)} />
          <Heat m={f.BA} x={pos.P[0]} y={pos.P[1]} c={c} scale={scaleD} />
          <text x={pos.cap} y={pos.h - 8} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>
            {narrow ? 'green = positive · pink = negative · B, A to scale' : 'green = positive · pink = negative · brighter = larger · B and A are drawn to scale'}
          </text>
        </svg>
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        ΔW here is synthetic: 8 patterns whose strengths halve each time, plus a little noise, so it is low-rank by
        construction. B and A are the best possible rank-r pair, found by SVD, not by training.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>what B · A misses</div>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 14 }}>
            <svg className="viz" viewBox="0 0 136 136" style={{ width: 124, flex: 'none' }} role="img" aria-label="Error heatmap: ideal update minus B times A">
              <Heat m={f.E} x={4} y={4} c={8} scale={scaleD} />
            </svg>
            <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
              <div>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: err < 0.1 ? 'var(--good)' : 'var(--warn)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {(errGlide * 100).toFixed(1)}%
                </div>
                <div className="dim" style={{ fontSize: 12 }}>error = size of (ΔW − B·A) ÷ size of ΔW</div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(1, err / errs[0]) * 100}%`, background: err < 0.1 ? 'var(--good)' : 'var(--warn)', borderRadius: 4, transition: 'width .4s cubic-bezier(.22,1,.36,1), background .3s' }} />
              </div>
              <div className="dim" style={{ fontSize: 12 }}>Same colour scale as ΔW, so it goes dark as the error shrinks.</div>
            </div>
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>strength of each direction in ΔW</div>
          <svg className="viz" viewBox="0 0 340 136" role="img" aria-label="Strength of each of the 16 directions, largest first">
            {dec.S.map((s, k) => {
              const h = Math.max(1.5, (s / sMax) * 100);
              const on = k < r;
              return (
                <g key={k}>
                  <rect x={10 + k * 20} y={112 - h} width={15} height={h} rx={2.5} fill={on ? 'var(--hue)' : 'var(--line-2)'} style={{ transition: 'fill .3s' }} />
                  <text x={17.5 + k * 20} y={127} textAnchor="middle" style={{ fontSize: 9.5, fill: on ? 'var(--hue)' : 'var(--fg-3)' }}>{k + 1}</text>
                </g>
              );
            })}
            <text x={330} y={14} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>lit bars = the {r} kept by B · A</text>
            <text x={330} y={30} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>grey bars = left out</text>
          </svg>
        </div>
      </div>

      <div className="row">
        <Stat label="numbers in ΔW" value="256" />
        <Stat label={`numbers in B and A (2 × 16 × ${r})`} value={toyLora} hot />
        <Stat label="B and A as a share of ΔW" value={((toyLora / 256) * 100).toFixed(1) + '%'} />
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, display: 'grid', gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="eyebrow">the same arithmetic at real size</div>
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>Matrix width d</span>
            <Seg value={d} onChange={setD} options={DIMS.map((v) => ({ value: v, label: String(v) }))} />
          </div>
        </div>
        <Slider label="Rank r" value={ri} min={0} max={RANKS.length - 1} onChange={setRi} format={(i) => String(RANKS[i])} />
        <Bars
          items={[
            { label: 'full d × d', value: full, color: 'var(--fg-3)', text: short(full) },
            { label: 'LoRA 2·d·r', value: lora, text: short(lora) },
          ]}
          max={full}
          labelWidth={88}
        />
        <div className="row">
          <Stat label={`full fine-tune: ${d} × ${d}`} value={commas(full)} />
          <Stat label={`LoRA: 2 × ${d} × ${R}`} value={commas(lora)} hot />
          <Stat label="LoRA ÷ full" value={(share * 100).toFixed(2) + '%'} hot={share < 0.01} />
        </div>
        <div className="dim mono" style={{ fontSize: 12.5, minHeight: 18 }}>
          {change
            ? `last change: r ${change.from} → ${change.to} · LoRA numbers ${commas(2 * d * change.from)} → ${commas(2 * d * change.to)} (×${(change.to / change.from).toFixed(2)})`
            : 'move the rank slider to compare counts'}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'lora',
  hook: {
    prompt: (
      <>
        A weight matrix in a large model is 4,096 × 4,096: about 16.8 million numbers. LoRA at rank 8 trains 65,536
        numbers for that matrix, 0.39% as many. How can so few stand in for a full update?
      </>
    ),
    options: [
      {
        text: 'The change a task needs mostly lies along a few directions, which two thin matrices multiplied together can express',
        correct: true,
        why: 'LoRA bets that the update a fine-tune needs is close to low-rank: a few patterns carry most of it. The bet holds well when the task is near what the model already does. A product of a 4,096 × 8 matrix and an 8 × 4,096 matrix can hold 8 such patterns, and it still touches every entry of the big matrix.',
      },
      {
        text: 'It finds the 0.39% of weights that matter most for the task and trains only those, leaving the rest untouched',
        why: 'That is sparse fine-tuning, a different method. LoRA’s correction changes the effective value of every entry. It is cheap because the entries are tied together by a few shared patterns, not because most are skipped.',
      },
      {
        text: 'It compresses the original 16.8 million weights into a smaller matrix first, then fine-tunes the compressed copy',
        why: 'The original matrix is not compressed or changed at all. It stays at full size and frozen. Only the correction added beside it is small.',
      },
      {
        text: 'It adds a small new layer at the end of the model and trains that, so the big matrices are never involved',
        why: 'That describes training a new output head. LoRA places its correction beside existing matrices inside the model, so it changes what those layers compute.',
      },
    ],
    reveal: 'Next you will factor a real update into two thin matrices and measure exactly how much is lost.',
  },
  Lab: LoraLab,
  missions: [
    {
      id: 'ninety',
      text: 'Find the smallest rank where the error drops under 10%, and leave the slider there.',
      insight: 'Rank 4: the error is 7.9%. B and A together hold 128 numbers and reproduce a 256-number update to within a tenth. The bar chart shows why: the strengths roughly halve at each step (10.0, 5.0, 2.6, 1.2, then 0.7 and below), so what is left after the fourth is only 7.9% of the update’s size.',
    },
    {
      id: 'full',
      text: 'Push the rank to 16, the full size of the matrix.',
      insight: 'The error is exactly zero, and B and A now hold 512 numbers: twice as many as the 256 in ΔW itself. The saving is gone. LoRA only pays off when the rank is far below the matrix width.',
    },
    {
      id: 'onepct',
      text: 'In the lower panel, with d = 4096, find the largest rank that keeps LoRA under 1% of the full count.',
      insight: 'Rank 16: 131,072 numbers against 16,777,216, which is 0.78%. The share is 2r ÷ d, so a wider matrix makes the same rank relatively cheaper.',
    },
    {
      id: 'double',
      text: 'Move the lower rank slider up one step, which doubles r, and read the “last change” line.',
      insight: 'The LoRA count doubles exactly. It is 2·d·r, so it grows in a straight line with r. A full matrix grows with d squared. That difference is the whole saving.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Full fine-tuning changes every number in a weight matrix <M>{'W'}</M>. LoRA (low-rank adaptation) freezes{' '}
          <M>{'W'}</M> and learns a correction made of two thin matrices: <M>{'B'}</M> with <M>{'r'}</M> columns and{' '}
          <M>{'A'}</M> with <M>{'r'}</M> rows. Their product has the same shape as <M>{'W'}</M> but is built from only{' '}
          <M>{'2 \\cdot d \\cdot r'}</M> numbers.
        </p>
        <Callout>
          The layer computes <M>{String.raw`W x + \tfrac{\alpha}{r}\, B A x`}</M>, where <M>{String.raw`\alpha`}</M> is a
          fixed scale you choose before training.
        </Callout>
        <ul>
          <li><M>{'A'}</M> starts as small random numbers. <M>{'B'}</M> starts as all zeros, so <M>{'BA = 0'}</M> and training begins from the unmodified model.</li>
          <li>Only <M>{'A'}</M> and <M>{'B'}</M> receive gradients. <M>{'W'}</M> never changes.</li>
          <li>The rank <M>{'r'}</M> is how many independent patterns the correction can hold. In the lab, 4 of 16 got within 8%.</li>
        </ul>
        <p>
          This works when the update a task needs is approximately low-rank: a few directions carry most of it. The
          lab’s ΔW was built that way. A real task’s update may not be.
        </p>
        <p>
          After training you can add the product into <M>{'W'}</M> once (merging), so inference costs exactly what it
          did before. Or keep <M>{'B'}</M> and <M>{'A'}</M> as a small separate file and swap them per task.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          A rank-1 case small enough to do by hand. <M>{'B'}</M> is one column, <M>{'A'}</M> is one row, and the scale{' '}
          <M>{String.raw`\alpha / r`}</M> is 2 ÷ 1 = 2.
        </p>
        <table>
          <thead>
            <tr><th>piece</th><th>value</th><th>numbers stored</th></tr>
          </thead>
          <tbody>
            <tr><td>B (3 × 1)</td><td>[1, 2, −1] as a column</td><td>3</td></tr>
            <tr><td>A (1 × 3)</td><td>[2, 0, 1]</td><td>3</td></tr>
            <tr><td>B · A (3 × 3)</td><td>[2, 0, 1], [4, 0, 2], [−2, 0, −1]</td><td>9 entries from 6 numbers</td></tr>
          </tbody>
        </table>
        <p>
          Every row of B · A is the same row [2, 0, 1] multiplied by 1, 2 or −1. That is what rank 1 means: one pattern,
          rescaled.
        </p>
        <p>
          Now the forward pass for the input x = [1, 1, 1]. A · x = 2 + 0 + 1 = 3. B times 3 = [3, 6, −3]. Times the
          scale 2 gives [6, 12, −6]. The layer outputs W · x plus that. Nobody ever builds the 3 × 3 product during
          training: the input goes through A, then through B.
        </p>
        <p>
          At real size, with d = 4,096 and r = 8: the full matrix has 4,096 × 4,096 = 16,777,216 numbers. B and A have
          2 × 4,096 × 8 = 65,536. That is 0.39%.
        </p>
        <Code>{`
W.requires_grad = False            # frozen
A = randn(r, d) * 0.01             # small random
B = zeros(d, r)                    # zero, so B @ A starts at 0
h = W @ x + (alpha / r) * (B @ (A @ x))
# after training, optionally:
W_merged = W + (alpha / r) * (B @ A)
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>What the lab computed</h3>
        <p>
          Any matrix can be written as a sum of rank-1 pieces ordered by strength (the singular value decomposition).
          Keeping the first <M>{'r'}</M> pieces gives the closest rank-<M>{'r'}</M> matrix there is, measured by the
          Frobenius norm: the square root of the sum of squared entries. So the lab showed the best case. Real LoRA never
          sees the ideal update. Gradient descent has to find <M>{'B'}</M> and <M>{'A'}</M> from the training loss, and
          can land somewhere worse.
        </p>
        <h3>Why B is zero and A is random</h3>
        <p>
          The gradient reaching <M>{'B'}</M> is multiplied by <M>{'Ax'}</M>, and the gradient reaching <M>{'A'}</M> is
          multiplied by <M>{'B'}</M>. If both started at zero, both gradients would be zero and nothing would ever
          move. With <M>{'B = 0'}</M> and <M>{'A'}</M> random, the product is zero but <M>{'B'}</M> gets a real gradient
          on the first step.
        </p>
        <h3>What α ÷ r is for</h3>
        <p>
          The scale <M>{String.raw`\alpha / r`}</M> sets how strongly the correction is applied. Dividing by{' '}
          <M>{'r'}</M> keeps the size of the correction roughly steady when you change the rank, so you do not have to
          retune the learning rate each time. Common community settings put <M>{String.raw`\alpha`}</M> at <M>{'r'}</M> or{' '}
          <M>{'2r'}</M>.
        </p>
        <h3>Which matrices get adapters</h3>
        <p>
          The original LoRA work adapted the query and value projection matrices inside attention, typically at rank
          4 or 8, and reported that even ranks of 1 or 2 did well on some tasks. Many setups now adapt every linear layer. The arithmetic for a model with 32 layers of width 4,096 and
          about 7 billion weights: two matrices per layer at rank 8 is 64 × 65,536 = 4,194,304 trained numbers, about
          0.06% of the model. Stored at 16 bits each, that adapter is about 8.4 MB.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'The low-rank assumption fails for tasks far from the base model',
      body: 'A small rank is enough when the task is a nudge: a tone, a format, a narrow domain. Teaching something the base model barely knows, such as a new language, needs an update with many strong directions. A low rank then underfits, and you need a much higher rank or full fine-tuning.',
    },
    {
      title: 'Training still runs the whole model',
      body: 'Every step does a full forward and backward pass through the frozen weights. LoRA cuts the memory for gradients, optimizer state and saved checkpoints. It does not make each step dramatically faster.',
    },
    {
      title: 'The rank is a guess',
      body: 'Nothing tells you the right rank ahead of time. Too low and the adapter cannot fit the task. Too high and you pay for parameters that do nothing, and at half the matrix width you are storing as many numbers as the full matrix.',
    },
    {
      title: 'Freezing W does not stop forgetting while the adapter is on',
      body: 'The layer computes with W plus the correction, so its behaviour on old tasks can still degrade. What LoRA guarantees is recovery: remove the adapter and the original model is back, bit for bit. Once merged, subtracting the adapter only gets you back to within rounding error, so keep the original W if you need it exactly.',
    },
  ],
  questions: [
    {
      id: 'lo-1', kind: 'mcq', level: 1,
      prompt: 'During LoRA training, which numbers receive gradient updates?',
      options: [
        { text: 'Only the two thin matrices A and B, while W stays frozen', correct: true, why: 'W is never updated. The optimizer only changes A and B, whose product is added to what W computes.' },
        { text: 'A small, carefully chosen subset of the entries of W', why: 'No entry of W is updated. LoRA does not select weights; it adds a separate low-rank correction.' },
        { text: 'All of W, but with updates projected down to rank r', why: 'W gets no updates at all. The low-rank structure lives in the added matrices, not in a constraint on W.' },
        { text: 'W in the attention layers, with every other layer frozen', why: 'Attention is where adapters are usually placed, but the attention matrices themselves stay frozen too.' },
      ],
    },
    {
      id: 'lo-2', kind: 'mcq', level: 1,
      prompt: 'Why does B start as all zeros?',
      options: [
        { text: 'So that B · A starts at zero, leaving the model unchanged', correct: true, why: 'Zero times anything is zero, so at step 0 the layer computes W · x and nothing else. Training starts from the unmodified model.' },
        { text: 'So that B needs no memory until it is first updated', why: 'B is stored in full from the start. Zeros take as much room as any other values.' },
        { text: 'So that the gradients reaching B are zero at the start', why: 'The opposite. B gets a real gradient on the first step because A is not zero. That is why A starts random.' },
        { text: 'So that the frozen matrix W is protected from change', why: 'W is protected by being frozen, whatever B holds. The zero start is about the model’s starting behaviour.' },
      ],
    },
    {
      id: 'lo-3', kind: 'num', level: 2,
      prompt: <>A matrix is 2,048 × 2,048. How many numbers does a LoRA adapter of rank 8 train for it?</>,
      answer: 32768, tol: 1,
      why: <>B is 2,048 × 8 and A is 8 × 2,048. Together: 2 × 2,048 × 8 = <strong>32,768</strong>. The full matrix has 4,194,304.</>,
      hint: 'Count the entries of B and of A and add them.',
    },
    {
      id: 'lo-4', kind: 'num', level: 2,
      prompt: <>For a 1,024 × 1,024 matrix and rank 16, LoRA trains what percentage of the numbers that full fine-tuning would?</>,
      answer: 3.125, tol: 0.1, unit: '%',
      why: <>LoRA: 2 × 1,024 × 16 = 32,768. Full: 1,024 × 1,024 = 1,048,576. 32,768 ÷ 1,048,576 = <strong>3.125%</strong>. The shortcut is 2r ÷ d = 32 ÷ 1,024.</>,
      hint: 'Divide 2·d·r by d·d. One d cancels.',
    },
    {
      id: 'lo-5', kind: 'mcq', level: 2,
      prompt: 'At d = 4,096 you raise the rank from 8 to 16. What happens to the number of trained parameters for that matrix?',
      options: [
        { text: 'It doubles, from 65,536 to 131,072', correct: true, why: 'The count is 2·d·r, which is proportional to r. Double r and the count doubles.' },
        { text: 'It quadruples, from 65,536 to 262,144', why: 'That would be growth with r squared. Only a full square matrix grows with the square of its width.' },
        { text: 'It rises by 8 × 8 = 64, to 65,600', why: 'Each extra unit of rank adds a whole column to B and a whole row to A: 2 × 4,096 numbers, not a handful.' },
        { text: 'It stays at 65,536; rank only changes the scale α ÷ r', why: 'Rank sets the shape of B and A, so it sets how many numbers they contain.' },
      ],
      hint: 'Write the formula for the count and see which power of r appears.',
    },
    {
      id: 'lo-6', kind: 'mcq', level: 2,
      prompt: 'You serve one base model to 50 customers, each with their own fine-tune. Why keep the adapters separate instead of merging them?',
      options: [
        { text: 'One shared base plus 50 small adapter files, not 50 full copies', correct: true, why: 'Merging bakes one adapter into W, so each customer would need a full merged copy. Kept separate, the large frozen base is shared and only the small pairs differ.' },
        { text: 'Merged adapters give lower-quality output than unmerged ones', why: 'Merging is exact arithmetic: W plus the product computes the same thing as applying them separately.' },
        { text: 'Unmerged adapters run faster at inference than merged ones', why: 'Unmerged adapters add an extra path through B and A. Merged weights cost exactly what the original model cost.' },
        { text: 'Merging is impossible once B and A have been trained', why: 'Merging is a single matrix addition and can be done at any time after training.' },
      ],
      hint: 'Think about what has to be stored per customer in each case.',
    },
    {
      id: 'lo-7', kind: 'mcq', level: 3,
      prompt: 'Someone initialises both A and B to zero. What happens when training starts?',
      options: [
        { text: 'Neither ever moves: each one’s gradient is scaled by the other, which is zero', correct: true, why: 'The gradient for B is scaled by A · x and the gradient for A is scaled by B. With both at zero, both gradients are zero on every step, so the adapter stays at zero forever.' },
        { text: 'Training works normally, since the model still starts from its original behaviour', why: 'It does start from the original behaviour, but it also stays there. A zero product is needed; two zero factors is one too many.' },
        { text: 'The gradients flow into W instead and it starts to change', why: 'W is frozen. It receives no updates regardless of what A and B hold.' },
        { text: 'The first step produces a division by zero in α ÷ r', why: 'The scale divides by the rank r, a fixed positive integer. The values inside A and B do not enter it.' },
      ],
      hint: 'Each factor’s gradient contains the other factor. Check what that gives at step 0.',
    },
    {
      id: 'lo-8', kind: 'mcq', level: 3,
      prompt: 'A rank-4 adapter trains well for rewriting text in a house style, but fails to teach the same model a language it has barely seen. What is the most likely reason?',
      options: [
        { text: 'The new language needs more strong directions than rank 4 can hold', correct: true, why: 'Style is a nudge to what the model already does, so a few directions suffice. A new language changes much more of what the weights encode, so the needed update is not close to low-rank. Raise the rank a lot or fine-tune fully.' },
        { text: 'The frozen matrix W blocks any information about a new language', why: 'The correction is added to W’s output and can express anything of rank up to r. The limit is the rank, not the freezing.' },
        { text: 'B started at zero, so the adapter could not move far enough', why: 'B leaves zero on the first step. The starting point does not cap how far training can go.' },
        { text: 'Adapters only work on attention matrices, and language lives elsewhere', why: 'Adapters can be attached to any linear layer. Where they sit matters less here than how many directions they have.' },
      ],
      hint: 'Picture the bar chart of direction strengths for each task. Which one falls away quickly?',
    },
  ],
  takeaways: [
    'LoRA freezes W and trains two thin matrices B and A, so the layer computes W·x + (α/r)·B·A·x.',
    'B starts at zero and A starts random, so training begins from the unmodified model and only A and B get gradients.',
    'The adapter holds 2·d·r numbers against d² for the full matrix: 0.39% at d = 4,096 and r = 8.',
    'It works when the needed update is close to low-rank, and it can be merged into W for free inference or kept separate and swapped.',
  ],
};

export default lesson;
