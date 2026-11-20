import { useEffect, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { sfx } from '../engine/sfx';
import { Callout, Code, M, Slider, Stat, clamp, useSpring } from '../ui/kit';

/* ------------------------------------------------------------------ *
 * Lab: cross-entropy on one prediction, then on a batch.
 * Panel 1: a next-token distribution over five words. Drag any bar;
 * the others rescale so the total stays 1. Loss = −ln p(correct).
 * Panel 2: four examples, average loss, perplexity = e^(average loss).
 * Nothing is simulated: every number is computed from the bars.
 * ------------------------------------------------------------------ */

const WORDS = ['Paris', 'London', 'Lyon', 'Rome', 'the'];
const P0 = 0.3;
const W0 = [0.25, 0.2, 0.15, 0.1].map((x) => x / 0.7); // shares of the wrong mass

const BATCH = [
  { prompt: 'The capital of France is', answer: 'Paris', p: 0.85 },
  { prompt: 'Two plus two equals', answer: 'four', p: 0.6 },
  { prompt: 'She opened the', answer: 'door', p: 0.35 },
  { prompt: 'The password is', answer: 'tulip', p: 0.01 },
];

const nll = (p: number) => -Math.log(p);

function DragBar(props: { label: string; value: number; correct?: boolean; onChange: (v: number) => void; grad: number }) {
  const { label, value, correct, onChange, grad } = props;
  const color = correct ? 'var(--good)' : 'var(--fg-3)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr 48px 60px', gap: 8, alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13 }}>
      <span style={{ textAlign: 'right', color: correct ? 'var(--good)' : 'var(--fg-2)', fontWeight: correct ? 700 : 500 }}>{label}</span>
      <div style={{ position: 'relative', height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.045)', border: correct ? '1px solid color-mix(in srgb, var(--good) 45%, transparent)' : '1px solid transparent' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value * 100}%`, minWidth: 2, borderRadius: 7, background: color, opacity: correct ? 0.9 : 0.55, transition: 'width .12s linear' }} />
        <div style={{ position: 'absolute', top: 3, bottom: 3, width: 5, borderRadius: 3, left: `clamp(0px, calc(${value * 100}% - 2.5px), calc(100% - 5px))`, background: '#fff', boxShadow: `0 0 10px ${correct ? 'var(--good)' : 'rgba(255,255,255,.5)'}`, transition: 'left .12s linear' }} />
        <input
          type="range" min={0} max={1000} step={1} value={Math.round(value * 1000)}
          aria-label={`Probability of ${label}`}
          onChange={(e) => { const v = Number(e.target.value) / 1000; sfx.tick(v); onChange(v); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'ew-resize' }}
        />
      </div>
      <span style={{ textAlign: 'right', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{(value * 100).toFixed(1)}%</span>
      <span style={{ textAlign: 'right', color: grad < 0 ? 'var(--good)' : 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>{(grad < 0 ? '−' : '+') + Math.abs(grad).toFixed(2)}</span>
    </div>
  );
}

function CrossEntropyLab({ complete }: LabProps) {
  const [p, setP] = useState(P0); // probability of the correct word
  const [w, setW] = useState(W0); // how the remaining mass is split among the wrong words
  const [touched, setTouched] = useState<'none' | 'correct' | 'wrong'>('none');
  const baseW = useRef(W0);
  const [batch, setBatch] = useState(BATCH.map((b) => b.p));

  const rest = 1 - p;
  const wrong = w.map((x) => x * rest);
  const loss = nll(p);
  const lossShown = useSpring(loss, 0.25);

  const avg = batch.reduce((s, x) => s + nll(x), 0) / batch.length;
  const ppl = Math.exp(avg);
  const pplShown = useSpring(ppl, 0.2);

  useEffect(() => {
    if (loss < 0.1) complete('low');
    if (loss > 4.6) complete('high');
    const moved = Math.max(...w.map((x, i) => Math.abs(x - baseW.current[i]))) * rest;
    if (touched === 'wrong' && moved > 0 && moved >= Math.min(0.01, 0.4 * rest)) complete('wrong');
    if (Math.abs(ppl - 4) <= 0.15) complete('ppl');
  }, [loss, w, rest, touched, ppl, complete]);

  const dragCorrect = (v: number) => {
    baseW.current = w;
    setTouched('correct');
    setP(clamp(v, 0.001, 0.999));
  };
  const dragWrong = (i: number, v: number) => {
    const share = clamp(v / rest, 0, 1);
    const others = w.reduce((s, x, j) => (j === i ? s : s + x), 0);
    setW(w.map((x, j) => (j === i ? share : others > 1e-9 ? (x / others) * (1 - share) : (1 - share) / (w.length - 1))));
    setTouched('wrong');
  };

  // ---- −ln(p) curve ----
  const CW = 360, CH = 250, L = 40, R = 14, T = 14, B = 34;
  const YMAX = 7;
  const px = (q: number) => L + q * (CW - L - R);
  const py = (y: number) => T + (1 - Math.min(y, YMAX) / YMAX) * (CH - T - B);
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const q = 0.001 * Math.pow(1000, i / 240); // log-spaced so the steep end is smooth
    pts.push(`${px(q).toFixed(1)},${py(nll(q)).toFixed(1)}`);
  }
  const dx = px(p), dy = py(loss);
  // tangent: slope of −ln p is −1/p (in data units), drawn as a short segment through the dot
  const sx = (CW - L - R), sy = (CH - T - B) / YMAX;
  const tvx = sx, tvy = (1 / p) * sy; // screen-space direction for +1 in p
  const tlen = Math.hypot(tvx, tvy);
  const ux = (tvx / tlen) * 34, uy = (tvy / tlen) * 34;
  const lossColor = loss < 0.5 ? 'var(--good)' : loss > 3 ? 'var(--bad)' : 'var(--hue)';

  const tiles = Math.min(100, Math.ceil(ppl - 1e-9));

  return (
    <div className="lab-grid">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div className="eyebrow">1 · One prediction</div>
          <div style={{ fontSize: 15, color: 'var(--fg)' }}>
            <span className="mono">The capital of France is</span>{' '}
            <span className="mono" style={{ color: 'var(--good)', borderBottom: '2px solid var(--good)', padding: '0 4px' }}>Paris</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr 48px 60px', gap: 8, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
            <span />
            <span>probability · drag a bar</span>
            <span style={{ textAlign: 'right' }}>p</span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>p−target</span>
          </div>
          <DragBar label={WORDS[0]} value={p} correct onChange={dragCorrect} grad={p - 1} />
          {wrong.map((v, i) => (
            <DragBar key={i} label={WORDS[i + 1]} value={v} onChange={(x) => dragWrong(i, x)} grad={v} />
          ))}
          <div style={{ fontSize: 13, minHeight: 40, color: touched === 'wrong' ? 'var(--good)' : 'var(--fg-3)' }}>
            {touched === 'wrong'
              ? <>You moved probability between wrong words. The loss stayed at <strong className="mono">{loss.toFixed(3)}</strong>: only the green bar enters it.</>
              : <>Dragging <span style={{ color: 'var(--good)' }}>Paris</span> rescales the other four so the total stays 100%. Dragging a wrong word takes from the other wrong words.</>}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 14, color: 'var(--fg-3)' }}>loss = −ln({p.toFixed(3)}) =</span>
            <span className="mono" style={{ fontSize: 44, lineHeight: 1, fontWeight: 700, color: lossColor, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 24px color-mix(in srgb, ${lossColor} 45%, transparent)`, transition: 'color .3s' }}>
              {lossShown.toFixed(3)}
            </span>
          </div>
          <svg className="viz" viewBox={`0 0 ${CW} ${CH}`} style={{ marginTop: 6 }} role="img" aria-label={`Curve of minus log p, with the current point at p ${p.toFixed(3)}, loss ${loss.toFixed(3)}`}>
            <defs>
              <filter id="ce-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <linearGradient id="ce-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--hue)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--hue)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((y) => (
              <g key={y}>
                <line x1={L} x2={CW - R} y1={py(y)} y2={py(y)} stroke="var(--line)" />
                <text x={L - 7} y={py(y) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{y}</text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((q) => (
              <text key={q} x={px(q)} y={CH - B + 16} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{q * 100}%</text>
            ))}
            <text x={(L + CW - R) / 2} y={CH - 3} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>probability given to the correct word</text>
            {/* the 1% line */}
            <line x1={L} x2={CW - R} y1={py(4.605)} y2={py(4.605)} stroke="var(--bad)" strokeDasharray="4 4" strokeOpacity={0.7} />
            <text x={CW - R} y={py(4.605) - 5} textAnchor="end" style={{ fontSize: 11, fill: 'var(--bad)' }}>p = 1% → 4.61</text>
            <polygon points={`${px(0.001)},${py(0)} ${pts.join(' ')} ${px(1)},${py(0)}`} fill="url(#ce-fill)" />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--hue)" strokeWidth={2.4} strokeLinejoin="round" />
            {/* drop lines */}
            <line x1={dx} x2={dx} y1={dy} y2={py(0)} stroke={lossColor} strokeDasharray="3 3" strokeOpacity={0.7} />
            <line x1={L} x2={dx} y1={dy} y2={dy} stroke={lossColor} strokeDasharray="3 3" strokeOpacity={0.7} />
            {/* tangent */}
            <line x1={dx - ux} y1={dy - uy} x2={dx + ux} y2={dy + uy} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeOpacity={0.85} />
            <circle cx={dx} cy={dy} r={7} fill={lossColor} filter="url(#ce-glow)" />
            <circle cx={dx} cy={dy} r={3} fill="#fff" />
            <text x={clamp(dx + 12, L + 60, CW - R - 4)} y={clamp(dy - 14, T + 10, CH - B - 30)} textAnchor={dx > CW * 0.6 ? 'end' : 'start'} style={{ fontSize: 11, fill: '#fff' }}>
              slope −1/p = −{(1 / p).toFixed(p < 0.1 ? 0 : 1)}
            </text>
          </svg>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div className="eyebrow">2 · A batch of four examples</div>
          {BATCH.map((b, i) => (
            <Slider
              key={i}
              label={<><span className="mono">{b.prompt}</span> <span className="mono" style={{ color: 'var(--good)' }}>{b.answer}</span></>}
              value={batch[i]} min={0.01} max={0.99} step={0.01}
              onChange={(v) => setBatch(batch.map((x, j) => (j === i ? v : x)))}
              format={(v) => `p ${(v * 100).toFixed(0)}% · loss ${nll(v).toFixed(2)}`}
            />
          ))}
        </div>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <div className="row">
            <Stat label="average loss" value={avg.toFixed(3)} />
            <Stat label="perplexity = e^loss" value={pplShown.toFixed(2)} hot />
          </div>
          <div style={{ fontSize: 14, color: 'var(--fg-2)' }}>
            The model is as unsure as if it were choosing among <strong style={{ color: 'var(--hue)' }}>{ppl.toFixed(1)}</strong> equally likely tokens.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} aria-hidden>
            {Array.from({ length: tiles }, (_, i) => {
              const frac = i === tiles - 1 ? ppl - (tiles - 1) : 1;
              return (
                <span
                  key={i}
                  style={{
                    width: tiles > 40 ? 12 : 20, height: tiles > 40 ? 12 : 20, borderRadius: tiles > 40 ? 3 : 5,
                    border: '1px solid var(--hue-line)', background: 'var(--hue)', opacity: 0.2 + 0.7 * clamp(frac, 0, 1),
                    transition: 'opacity .2s',
                  }}
                />
              );
            })}
          </div>
          <div className="dim" style={{ fontSize: 12.5 }}>One square per equally likely choice. A perfect model shows exactly one.</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'cross-entropy',
  hook: {
    prompt: (
      <>
        The correct next word is “Paris”. Model A answers Paris 60%, London 30%, Rome 10%. Model B answers Paris 60%,
        London 20%, Rome 20%. Which model does the training loss penalise more?
      </>
    ),
    options: [
      {
        text: 'Neither. Both get exactly the same loss, because both gave the correct word 60%',
        correct: true,
        why: 'The loss is −ln of the probability given to the correct word and nothing else. Both models gave Paris 0.6, so both score −ln(0.6) = 0.51. How the remaining 40% is split does not enter the number.',
      },
      {
        text: 'Model A, because it put more confidence into a single wrong answer',
        why: 'Confidence in a particular wrong word is not measured. The loss only reads off the probability of the correct word, and that is 60% in both.',
      },
      {
        text: 'Model B, because its mistakes are spread over more probability on Rome',
        why: 'The spread among wrong words is invisible to the loss. Moving 10% from London to Rome leaves Paris at 60% and the loss unchanged.',
      },
      {
        text: 'It depends on whether London or Rome is closer in meaning to Paris',
        why: 'The loss has no notion of closeness. Every word other than the target counts equally as wrong.',
      },
    ],
    reveal: 'Next you will drag those probabilities yourself and watch which movements the loss can see.',
  },
  Lab: CrossEntropyLab,
  missions: [
    {
      id: 'low',
      text: 'In panel 1, raise the probability of “Paris” until the loss is below 0.1.',
      insight: 'You need about 90.5%, because −ln(0.905) = 0.1. On this side the curve is nearly flat: going from 90% to 99% only takes the loss from 0.105 to 0.010. Being right and confident earns almost nothing more.',
    },
    {
      id: 'high',
      text: 'Now lower “Paris” until the loss exceeds 4.6.',
      insight: 'That takes 1% or less. Near zero the curve is a cliff: every 10× cut in probability adds 2.30, so 10% costs 2.30, 1% costs 4.61 and 0.1% costs 6.91. A model that is confidently wrong pays far more than one that is unsure. The slope on the curve is now about −100, and the push on the score for Paris is −0.99, almost its maximum of −1.',
    },
    {
      id: 'wrong',
      text: 'Leave “Paris” alone and drag the bar of any wrong word. Watch the loss.',
      insight: 'The loss did not move. The target says 100% Paris and 0% everything else, so only the probability of Paris is ever read. The model is free to spread its wrong probability any way it likes.',
    },
    {
      id: 'ppl',
      text: 'In panel 2, adjust the four examples until the perplexity is about 4.',
      insight: 'Setting all four to 25% does it exactly: a four-way coin toss. So do many mixtures, because perplexity depends only on the average loss. One confidently wrong answer can cancel several good ones.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Training is a loop: predict, turn the prediction into one number that says how wrong it was (the{' '}
          <strong>loss</strong>), nudge every weight to make that number smaller. For language models the loss is{' '}
          <strong>cross-entropy</strong>.
        </p>
        <Callout>
          loss = −ln(probability the model gave the correct token)
        </Callout>
        <p>
          The target is <em>one-hot</em>: 100% on the token that came next in the training text and 0% on every other,
          so the other probabilities drop out. You saw it: dragging wrong words changed nothing.
        </p>
        <p>
          The log sets the shape. Probability 1 gives loss 0, 0.5 gives 0.69, 0.01 gives 4.61, and the loss rises
          without limit towards 0.
        </p>
        <p>
          The right-hand column in the lab is what training acts on. For each token's score (its <em>logit</em>, the
          number that goes into the softmax), the push is probability minus target: −0.70 for Paris at 30%, +0.25 for
          London. The slope on the curve, −1/p, is the same push measured against the probability.
        </p>
        <p>
          Over a batch, the losses are averaged. <strong>Perplexity</strong> is e raised to that average: the number of
          equally likely tokens the model is choosing between. An even spread over 50,000 tokens scores
          ln(50,000) ≈ 10.8.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          The lab starts with these probabilities for “The capital of France is ___”. The target is 1 for Paris and 0
          elsewhere.
        </p>
        <table>
          <thead>
            <tr><th>token</th><th>p</th><th>target</th><th>target × −ln p</th><th>p − target</th></tr>
          </thead>
          <tbody>
            <tr><td>Paris</td><td>0.30</td><td>1</td><td>1.204</td><td>−0.70</td></tr>
            <tr><td>London</td><td>0.25</td><td>0</td><td>0</td><td>+0.25</td></tr>
            <tr><td>Lyon</td><td>0.20</td><td>0</td><td>0</td><td>+0.20</td></tr>
            <tr><td>Rome</td><td>0.15</td><td>0</td><td>0</td><td>+0.15</td></tr>
            <tr><td>the</td><td>0.10</td><td>0</td><td>0</td><td>+0.10</td></tr>
          </tbody>
        </table>
        <p>
          Add the fourth column: the loss is −ln(0.30) = 1.204. Four of the five rows are multiplied by a target of 0.
        </p>
        <p>
          The last column is the gradient that training acts on: probability minus target, for each token's score. It
          is negative for Paris (raise this score) and positive for the rest (lower these), and the five entries sum to
          zero.
        </p>
        <p>
          The batch panel starts at probabilities 0.85, 0.60, 0.35 and 0.01. The losses are 0.163, 0.511, 1.050 and
          4.605. Their average is 1.582, and e^1.582 = 4.87. The one example at 1% contributes 73% of the total loss.
        </p>
        <Code>{`
probs = softmax(logits)               # one probability per vocabulary token
loss  = -log(probs[correct_token])    # only this entry is read
grad_logits = probs.copy()
grad_logits[correct_token] -= 1       # probabilities minus one-hot target
perplexity = exp(mean(losses))
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The general formula, and why it collapses</h3>
        <p>
          Cross-entropy between a target distribution <M>{'y'}</M> and a prediction <M>{'p'}</M> is
        </p>
        <M block>{String.raw`H(y, p) = -\sum_i y_i \ln p_i`}</M>
        <p>
          With a one-hot target every <M>{'y_i'}</M> is 0 except the correct one, which is 1. The sum has one surviving
          term: <M>{String.raw`-\ln p_{\text{correct}}`}</M>.
        </p>
        <h3>Why a log</h3>
        <p>
          Two reasons. First, the shape: a model that gives the truth 1% is not merely “99% wrong”, it has all but
          ruled out what happened, and −ln charges 4.61 for that against 0.01 for giving it 99%. Second, sequences. The
          probability a model assigns to a whole text is the product of its per-token probabilities, which for a long
          text is a number too small to store. The log turns that product into a sum:{' '}
          <M>{String.raw`\ln(p_1 p_2 \cdots p_n) = \sum_t \ln p_t`}</M>. Minimising the average cross-entropy is the same
          as making the training text as probable as possible under the model.
        </p>
        <h3>The gradient is probabilities minus target</h3>
        <p>
          The model does not output probabilities directly. It outputs scores (logits), and a softmax turns them into
          probabilities. Differentiate the loss through the softmax and the result for each logit is{' '}
          <M>{String.raw`\partial L / \partial z_i = p_i - y_i`}</M>. A correct token at 30% gets a push of −0.70. At 99%
          it gets −0.01. The push is proportional to the error, so there is no saturation problem when the model is
          badly wrong. Note that wrong tokens do get gradients, each equal to its own probability, even though they do
          not appear in the loss value.
        </p>
        <h3>Reference points</h3>
        <p>
          A model that knows nothing and spreads probability evenly over a 50,000-token vocabulary gives the correct
          token 1 ÷ 50,000. Its loss is ln(50,000) ≈ 10.8 and its perplexity is 50,000. With standard initialisation a
          fresh model starts near that. A loss of 3 means a perplexity of about 20. Loss is in <em>nats</em> when the natural
          log is used; divide by ln 2 ≈ 0.693 for bits.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'It is blind to how you are wrong',
      body: 'Every token other than the target counts the same. Predicting “large” when the text said “big” costs as much as predicting “banana”. A low loss means the model matched the exact tokens, not that near-misses were treated kindly.',
    },
    {
      title: 'One confident mistake outweighs many good answers',
      body: 'The penalty has no ceiling as the probability approaches zero. In the lab’s batch, the single example at 1% is 73% of the total loss. Noisy or mislabelled training text gets this outsized weight too.',
    },
    {
      title: 'Low loss is not truth',
      body: 'The loss rewards matching the training text. If the text is wrong, biased or out of date, the lowest-loss model reproduces that. Perplexity measures predictability, not accuracy or usefulness.',
    },
    {
      title: 'Perplexities are not comparable across tokenizers',
      body: 'Perplexity is per token. A model with a different vocabulary splits the same text into a different number of tokens, so its per-token number means something else. Compare only models that share a tokenizer and a test set.',
    },
  ],
  questions: [
    {
      id: 'ce-1', kind: 'mcq', level: 1,
      prompt: 'A model outputs a probability for each of 50,000 tokens. Which of those probabilities enter the cross-entropy loss for one position?',
      options: [
        { text: 'Only the probability given to the correct token', correct: true, why: 'The one-hot target multiplies every other term by zero. The loss is −ln of the correct token’s probability.' },
        { text: 'All 50,000, each adding its own penalty to the total', why: 'Wrong tokens add nothing. The target is 0 for every one of them, so their terms are multiplied by zero.' },
        { text: 'The correct token and the highest-scoring wrong token', why: 'No wrong token appears in the loss, however high its probability. Only the correct one is read.' },
        { text: 'Only the largest probability, whichever token it belongs to', why: 'The loss looks at the token that was right, not the one the model liked best.' },
      ],
    },
    {
      id: 'ce-2', kind: 'mcq', level: 1,
      prompt: 'What does a perplexity of 20 mean?',
      options: [
        { text: 'The model is as unsure as a fair pick among 20 tokens', correct: true, why: 'Perplexity is e raised to the average loss. A uniform choice among 20 tokens has loss ln(20) and perplexity exactly 20.' },
        { text: 'The model gets the next token right 20% of the time', why: 'Perplexity is not an accuracy. It comes from the probabilities the model assigned, not from how often its top pick was right.' },
        { text: 'The average loss per token is 20', why: 'Perplexity is the exponential of the loss. A perplexity of 20 is a loss of about 3.' },
        { text: 'The model considers only its top 20 tokens at each step', why: 'That describes a sampling setting. Perplexity is a measurement of prediction quality over the full vocabulary.' },
      ],
    },
    {
      id: 'ce-3', kind: 'num', level: 2,
      prompt: <>A model gives the correct next token a probability of 0.25. What is the cross-entropy loss, in nats? (ln 2 ≈ 0.693)</>,
      answer: 1.386, tol: 0.01,
      why: <>−ln(0.25) = ln(4) = 2 × ln(2) = 2 × 0.693 = <strong>1.386</strong>. Each halving of the probability adds another 0.693.</>,
      hint: '−ln(1/x) is the same as ln(x).',
    },
    {
      id: 'ce-4', kind: 'num', level: 2,
      prompt: <>Over a test set a model’s average loss is 2.0 nats per token. What is its perplexity? (e ≈ 2.718)</>,
      answer: 7.39, tol: 0.1,
      why: <>Perplexity = e^loss = e² = 2.718 × 2.718 = <strong>7.39</strong>. The model is as unsure as a fair choice among about 7.4 tokens.</>,
      hint: 'Perplexity undoes the log in the loss.',
    },
    {
      id: 'ce-5', kind: 'mcq', level: 2,
      prompt: <>The model’s probabilities for three tokens are <code>[0.7, 0.2, 0.1]</code> and the first token is correct. What is the gradient of the loss with respect to the three scores (logits)?</>,
      options: [
        { text: '[−0.3, +0.2, +0.1]', correct: true, why: 'Probabilities minus the one-hot target [1, 0, 0]. The correct score is pushed up by its shortfall and each wrong score is pushed down by its probability.' },
        { text: '[−0.3, 0, 0]', why: 'Wrong tokens are absent from the loss value but not from the gradient. Lowering their scores raises the correct token’s share.' },
        { text: '[+0.7, +0.2, +0.1]', why: 'That is the probabilities alone. The target has to be subtracted, which makes the correct entry negative.' },
        { text: '[−1.43, 0, 0]', why: '−1/0.7 is the slope with respect to the probability. Through the softmax, the gradient on the scores is p − target.' },
      ],
      hint: 'Write the target as a list of zeros with a single one, then subtract.',
    },
    {
      id: 'ce-6', kind: 'mcq', level: 3,
      prompt: 'On two examples, model A gives the correct token 50% and 50%. Model B gives 99% and 1%. Both average 50%. Which has the lower average loss?',
      options: [
        { text: 'A: about 0.69 against about 2.31 for B', correct: true, why: 'A: −ln(0.5) = 0.693 both times. B: (0.010 + 4.605) ÷ 2 = 2.31. The 1% answer costs far more than the 99% answer saves.' },
        { text: 'B, because it is nearly perfect on one of the two examples', why: 'Going from 50% to 99% saves 0.68. Dropping from 50% to 1% costs 3.91. The log makes the losses lopsided.' },
        { text: 'They tie, because the average probability is the same', why: 'The loss averages −ln(p), not p. The log is steep near zero, so equal average probabilities do not give equal losses.' },
        { text: 'It cannot be known without the probabilities of the wrong tokens', why: 'Wrong-token probabilities never enter the loss. The four numbers given are all that is needed.' },
      ],
      hint: 'Compute −ln for each of the four probabilities, then average per model.',
    },
    {
      id: 'ce-7', kind: 'mcq', level: 3,
      prompt: 'You start training a new model with a 50,000-token vocabulary. At step 0, before any learning, the loss reads 10.8. What does that tell you? (ln 50,000 ≈ 10.8)',
      options: [
        { text: 'Nothing is wrong: that is the loss of a uniform guess', correct: true, why: 'With standard initialisation an untrained model spreads probability almost evenly, giving the correct token about 1/50,000. −ln of that is 10.8. A much higher starting loss would mean it begins confidently wrong.' },
        { text: 'There is a bug: a loss can never be greater than 1', why: 'Probabilities are capped at 1. The loss is −ln(p), which has no upper limit.' },
        { text: 'The model is already getting about 10.8% of tokens right', why: 'The loss is not a percentage. 10.8 nats corresponds to a probability of about 0.002% for the correct token.' },
        { text: 'The learning rate is too high and the model has diverged', why: 'No update has happened at step 0, so the learning rate has had no effect yet.' },
      ],
      hint: 'What probability does a model with no knowledge give each of 50,000 tokens?',
    },
    {
      id: 'ce-8', kind: 'mcq', level: 3,
      prompt: 'Why do language models minimise the sum of −ln(p) over the tokens of a text, in place of maximising the product of the probabilities directly?',
      options: [
        { text: 'It is the same goal: the log turns the product into a sum', correct: true, why: 'ln(p₁p₂…pₙ) = ln p₁ + … + ln pₙ. A product of thousands of probabilities underflows to zero; a sum of logs does not, and each token contributes its own separate term.' },
        { text: 'The two goals differ, and the sum of logs favours shorter texts', why: 'The log is increasing, so whatever maximises the product also maximises its log. The ranking of models is the same.' },
        { text: 'A product cannot be differentiated, so it cannot be trained on', why: 'Products are differentiable. The problem is numerical size, not calculus.' },
        { text: 'The log removes the influence of very unlikely tokens', why: 'The opposite. The log magnifies them: a token at 0.1% adds 6.9 to the sum.' },
      ],
      hint: 'What does a logarithm do to a multiplication?',
    },
  ],
  takeaways: [
    'Training repeats three steps: predict, score the prediction with a loss, nudge the weights to lower the loss.',
    'Cross-entropy loss is −ln of the probability the model gave the correct token; the other probabilities do not enter it.',
    'The log makes confident mistakes cost far more than hesitant ones, and the gradient on the scores is probabilities minus target.',
    'Perplexity is e raised to the average loss: a uniform guess over 50,000 tokens has loss 10.8 and perplexity 50,000.',
  ],
};

export default lesson;
