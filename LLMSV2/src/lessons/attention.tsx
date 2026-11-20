import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Seg, Slider, Stat, softmax } from '../ui/kit';

/* ------------------------------------------------------------------ *
 * Lab: a real (tiny) attention computation you can read.
 * Every token has a hand-built 4-number key and query. Scores are
 * actual dot products, weights are an actual softmax, and the output
 * is an actual weighted sum. Real models learn these vectors in
 * hundreds of dimensions; four keeps them legible.
 * ------------------------------------------------------------------ */

const FEATS = ['animate', 'place', 'action', 'glue'];
type Variant = 'tired' | 'wide';

const BASE = [
  { w: 'The', k: [0, 0, 0, 1], q: [1, 0.6, 0, 0.6] },
  { w: 'animal', k: [2, 0, 0, 0.2], q: [0.6, 0, 1.6, 0.3] },
  { w: "didn't", k: [0, 0, 1.2, 0.6], q: [0.5, 0, 2, 0] },
  { w: 'cross', k: [0.3, 0.5, 2, 0], q: [1.2, 1.6, 0.4, 0] },
  { w: 'the', k: [0, 0, 0, 1], q: [0.4, 1.4, 0, 0.6] },
  { w: 'street', k: [0, 2, 0, 0.2], q: [0, 0.6, 1.6, 0.2] },
  { w: 'because', k: [0, 0, 0.3, 1.2], q: [0, 0, 1.4, 0.8] },
  { w: 'it', k: [0.8, 0.8, 0, 0.5], q: [0, 0, 0, 0] }, // query set below
  { w: 'was', k: [0, 0, 1, 0.8], q: [1.4, 1.4, 0, 0.2] },
  { w: '', k: [0, 0, 0, 0], q: [0, 0, 0, 0] }, // tired / wide
];
const IT = 7;
const LAST = 9;

function tokens(variant: Variant, masked: boolean) {
  const t = BASE.map((b) => ({ ...b }));
  t[LAST] =
    variant === 'tired'
      ? { w: 'tired', k: [1, 0, 0.6, 0], q: [2, 0, 0.8, 0] }
      : { w: 'wide', k: [0, 1, 0.6, 0], q: [0, 2, 0.8, 0] };
  // "it" has already absorbed the final word in an earlier layer, unless a
  // causal mask stops it from ever seeing that word.
  t[IT].q = masked ? [1.6, 1.6, 0, 0.1] : variant === 'tired' ? [3.4, 0.4, 0, 0.1] : [0.4, 3.4, 0, 0.1];
  return t;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

function AttentionLab({ complete }: LabProps) {
  const [variant, setVariant] = useState<Variant>('tired');
  const [sel, setSel] = useState(1);
  const [scale, setScale] = useState(1);
  const [masked, setMasked] = useState(false);

  const toks = useMemo(() => tokens(variant, masked), [variant, masked]);
  const { scores, weights, out } = useMemo(() => {
    const q = toks[sel].q;
    const scores = toks.map((t) => (dot(q, t.k) / 2) * scale); // √4 = 2
    const visible = toks.map((_, j) => !masked || j <= sel);
    const w = softmax(scores.map((s, j) => (visible[j] ? s : -1e9)));
    const out = FEATS.map((_, f) => toks.reduce((s, t, j) => s + w[j] * t.k[f], 0));
    return { scores, weights: w, out };
  }, [toks, sel, scale, masked]);

  const top = weights.indexOf(Math.max(...weights));

  useEffect(() => {
    if (sel === IT) complete('it');
    if (sel === IT && variant === 'wide' && !masked) complete('swap');
    // Needs the scale slider: "The" under the causal mask is 100% self-attention at any scale.
    if (scale > 1 && !(masked && sel === 0) && Math.max(...weights) >= 0.9) complete('sharp');
    if (sel === IT && masked) complete('mask');
  }, [sel, variant, masked, weights, scale, complete]);

  // Layout
  const W = 760;
  const colW = W / toks.length;
  const cx = (i: number) => colW * (i + 0.5);
  const yTok = 196;

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Last word</span>
          <Seg value={variant} onChange={setVariant} options={[{ value: 'tired', label: 'tired' }, { value: 'wide', label: 'wide' }]} />
        </div>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Can look</span>
          <Seg
            value={masked ? 'left' : 'both'}
            onChange={(v) => setMasked(v === 'left')}
            options={[{ value: 'both', label: 'both ways' }, { value: 'left', label: 'left only (causal)' }]}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg className="viz" viewBox={`0 0 ${W} 250`} style={{ minWidth: 620 }} role="img" aria-label={`Attention from "${toks[sel].w}" to every token`}>
          <defs>
            <filter id="att-glow"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {/* arcs from the selected token to every token it can see */}
          {toks.map((_, j) => {
            const w = weights[j];
            if (w < 0.004) return null;
            if (j === sel) {
              return <circle key={j} cx={cx(j)} cy={yTok - 30} r={10 + w * 22} fill="none" stroke="var(--hue)" strokeWidth={1 + w * 10} strokeOpacity={0.25 + w * 0.75} style={{ transition: 'all .35s cubic-bezier(.22,1,.36,1)' }} />;
            }
            const x1 = cx(sel), x2 = cx(j);
            const h = 40 + Math.abs(x2 - x1) * 0.28;
            return (
              <path
                key={j}
                d={`M ${x1} ${yTok - 18} C ${x1} ${yTok - 18 - h}, ${x2} ${yTok - 18 - h}, ${x2} ${yTok - 18}`}
                fill="none" stroke="var(--hue)" strokeLinecap="round"
                strokeWidth={0.6 + w * 16} strokeOpacity={0.18 + w * 0.82}
                filter={w > 0.25 ? 'url(#att-glow)' : undefined}
                style={{ transition: 'stroke-width .35s cubic-bezier(.22,1,.36,1), stroke-opacity .35s' }}
              />
            );
          })}
          {toks.map((t, j) => {
            const hidden = masked && j > sel;
            const isSel = j === sel;
            return (
              <g key={j} onClick={() => setSel(j)} style={{ cursor: 'pointer' }} opacity={hidden ? 0.28 : 1}>
                <rect
                  x={cx(j) - colW / 2 + 4} y={yTok - 16} width={colW - 8} height={32} rx={9}
                  fill={isSel ? 'var(--hue)' : 'var(--panel-2)'} fillOpacity={isSel ? 1 : 0.9}
                  stroke={isSel ? 'var(--hue)' : j === top ? 'var(--hue)' : 'var(--line-2)'} strokeWidth={j === top && !isSel ? 2 : 1}
                />
                <text x={cx(j)} y={yTok + 5} textAnchor="middle" style={{ fontSize: 14, fill: isSel ? '#05060a' : '#fff', fontWeight: isSel ? 700 : 500 }}>{t.w}</text>
                <text x={cx(j)} y={yTok + 36} textAnchor="middle" style={{ fontSize: 12, fill: hidden ? 'var(--fg-3)' : weights[j] > 0.2 ? 'var(--hue)' : 'var(--fg-3)' }}>
                  {hidden ? 'hidden' : (weights[j] * 100).toFixed(0) + '%'}
                </text>
              </g>
            );
          })}
          <text x={W / 2} y={18} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 12 }}>
            click any word to see where it looks · arc thickness = attention weight
          </text>
        </svg>
      </div>
      <div className="dim" style={{ fontSize: 13 }}>
        Vectors are hand-built for this demo (4 numbers each). The query for “it” is preset as if an earlier layer had
        already read the last word. A real model learns all of them.
      </div>

      <Slider
        label="Score scale (multiplies every score before the softmax)"
        value={scale} min={0.2} max={4} step={0.1} onChange={setScale} format={(v) => '×' + v.toFixed(1)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>1 · score = query · key ÷ √4</div>
          <Bars
            items={toks.map((t, j) => ({ label: t.w, value: Math.max(0, scores[j]), off: masked && j > sel, text: masked && j > sel ? '−∞' : scores[j].toFixed(2) }))}
            max={Math.max(1, ...scores)}
            labelWidth={62}
          />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>2 · weight = softmax(scores)</div>
          <Bars items={toks.map((t, j) => ({ label: t.w, value: weights[j], off: masked && j > sel }))} max={1} labelWidth={62} />
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>3 · new vector for "{toks[sel].w}" = weighted sum of values (in this toy, value = key)</div>
        <div className="row">
          {FEATS.map((f, i) => (
            <Stat key={f} label={f} value={out[i].toFixed(2)} hot={out[i] === Math.max(...out)} />
          ))}
          <span className="dim" style={{ fontSize: 13, maxWidth: '34ch' }}>
            Mostly looked at <strong>{toks[top].w}</strong>, so the result leans toward what "{toks[top].w}" carries.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'attention',
  hook: {
    prompt: (
      <>
        “The animal didn't cross the street because <em>it</em> was tired.” How does a transformer work out what “it”
        refers to?
      </>
    ),
    options: [
      {
        text: '“it” scores every token for relevance and becomes a mix weighted by those scores',
        correct: true,
        why: 'That is attention: score everything, turn the scores into weights, take the weighted mix. Here most of the weight lands on “animal”.',
      },
      {
        text: 'It applies a grammar rule: a pronoun refers to the nearest noun before it',
        why: 'The nearest noun is “street”, which is the wrong answer here. There are no hand-written rules anywhere in the model.',
      },
      {
        text: 'It finds this sentence, or one like it, in its memorized training text',
        why: 'There is no lookup of stored sentences. The model computes a fresh answer from vectors every time.',
      },
      {
        text: 'It does not. Each token is processed on its own and meaning only appears at the output',
        why: 'Tokens exchange information in every layer. Attention is the one place in the network where they do it.',
      },
    ],
    reveal: 'Next you will run that computation yourself, on numbers small enough to read.',
  },
  Lab: AttentionLab,
  missions: [
    {
      id: 'it',
      text: 'Click the word “it” and find where most of its attention goes.',
      insight: 'About 60% goes to “animal”. No rule says “it” means the animal. In a trained model the learned query for “it” has a large dot product with the learned key for “animal”. Here those vectors are hand-built to show the arithmetic.',
    },
    {
      id: 'swap',
      text: 'With “it” selected, switch the last word to “wide”.',
      insight: 'The attention jumps to “street”. One word changed, the query for “it” changed with it (in this demo the new query is preset, as if an earlier layer had read the last word), and the same arithmetic produced a different answer. That is how context changes meaning.',
    },
    {
      id: 'sharp',
      text: 'Raise the score scale until one token gets 90% or more of the attention.',
      insight: 'Softmax exaggerates gaps. Bigger scores mean one winner takes nearly everything, and the mix stops being a mix. This is why real attention divides scores by √d: to keep them in a range where several tokens still contribute.',
    },
    {
      id: 'mask',
      text: 'With “it” selected, switch to “left only (causal)”.',
      insight: 'Now “it” cannot see the word after it, so it never learns whether the sentence ends in “tired” or “wide”, and its attention splits between “animal” and “street”. Text generators always work under this mask: a token can only use what came before.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Attention is how tokens share information. For one token it runs three steps.
        </p>
        <ol>
          <li>
            <strong>Score.</strong> The token produces a <em>query</em> vector (“what I am looking for”). Every token
            produces a <em>key</em> vector (“what I offer”). The score for each pair is their dot product: large when the
            two vectors point the same way.
          </li>
          <li>
            <strong>Normalize.</strong> A softmax turns the scores into weights that are positive and add up to 1.
          </li>
          <li>
            <strong>Mix.</strong> Every token also has a <em>value</em> vector (“what I hand over”). The output is the
            weighted sum of the values. The lab reuses each key as its value. Real models learn them separately.
          </li>
        </ol>
        <Callout>
          The whole operation: <M>{String.raw`\text{output} = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V`}</M>
        </Callout>
        <p>
          Queries, keys and values are each made by multiplying the token's vector by a learned matrix. Training
          adjusted those matrices until useful pairs, such as a pronoun and its noun, ended up with large dot products.
        </p>
        <p>
          Every token does this at once, so one layer computes a full grid of scores. A model runs several copies in
          parallel, called <em>heads</em>, each with its own learned matrices, so one token can look for several things
          at once.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Take “it” from the lab, and to keep it short, only three tokens it can look at. The query for “it” is{' '}
          <code>[3.4, 0.4, 0, 0.1]</code>.
        </p>
        <table>
          <thead>
            <tr><th>token</th><th>key</th><th>q · k</th><th>÷ √4</th><th>e^score</th><th>weight</th></tr>
          </thead>
          <tbody>
            <tr><td>animal</td><td>[2, 0, 0, 0.2]</td><td>6.82</td><td>3.41</td><td>30.3</td><td>0.81</td></tr>
            <tr><td>street</td><td>[0, 2, 0, 0.2]</td><td>0.82</td><td>0.41</td><td>1.51</td><td>0.04</td></tr>
            <tr><td>tired</td><td>[1, 0, 0.6, 0]</td><td>3.40</td><td>1.70</td><td>5.47</td><td>0.15</td></tr>
          </tbody>
        </table>
        <p>
          The dot product for “animal” is 3.4×2 + 0.4×0 + 0×0 + 0.1×0.2 = 6.82. The three exponentials sum to 37.3, and
          each weight is its exponential divided by that sum: 30.3 ÷ 37.3 = 0.81.
        </p>
        <p>
          The output is 0.81 × value(animal) + 0.04 × value(street) + 0.15 × value(tired). In the lab each value is
          the token's key, so that is 0.81 × [2, 0, 0, 0.2] plus the two smaller terms. The vector for “it” now mostly
          carries what “animal” carries.
        </p>
        <Code>{`
scores  = (Q @ K.T) / sqrt(d_k)     # every token against every token
weights = softmax(scores, axis=-1)  # each row sums to 1
output  = weights @ V               # weighted mix of values
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why divide by √d</h3>
        <p>
          A dot product over <M>{'d_k'}</M> dimensions is a sum of <M>{'d_k'}</M> terms, so its spread grows like{' '}
          <M>{String.raw`\sqrt{d_k}`}</M>. Without the divisor, wide models would feed huge scores into the softmax, one
          weight would saturate near 1, and the gradient through the softmax would be close to zero. You produced that
          saturation yourself with the scale slider.
        </p>
        <h3>Many heads</h3>
        <p>
          One softmax gives one distribution, so one head can only express one kind of relation per token. Models run
          several heads in parallel, each with its own query, key and value matrices in a smaller subspace (for example
          12 heads of 64 dimensions in a 768-wide model), and concatenate the results. One head can track the subject of
          a verb while another tracks the previous token.
        </p>
        <h3>The causal mask is just arithmetic</h3>
        <p>
          Masking adds −∞ to the scores of forbidden positions before the softmax. <M>{'e^{-\\infty} = 0'}</M>, so those
          positions get exactly zero weight and the rest renormalize. This is what lets a model train on every position
          of a sequence in one pass without seeing the answers.
        </p>
        <h3>What attention is not</h3>
        <p>
          Attention only moves and mixes information. The actual transformation of each token's vector happens in the
          feed-forward layer that follows, which holds about two thirds of a block's parameters.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'The cost grows with the square of the length',
      body: 'Every token scores every token. 1,000 tokens means 1,000,000 scores per head per layer; 100,000 tokens means 10 billion. This is the main reason long contexts are expensive.',
    },
    {
      title: 'It cannot see word order by itself',
      body: 'Scores depend only on the vectors, not on where the tokens sit. Shuffle the input and, with no mask, each token gets the same output. Position has to be injected separately, which is its own lesson.',
    },
    {
      title: 'Attention maps are not explanations',
      body: 'A large weight shows where information was read from in one head of one layer. It does not show that the token caused the output. Later layers can ignore or overwrite it, and different attention patterns can give the same answer.',
    },
    {
      title: 'Weights must sum to 1, so long contexts dilute',
      body: 'With thousands of tokens competing in one softmax, the share available to any single relevant token shrinks unless its score clearly stands out. Details buried in very long prompts get less weight than the same details in short ones.',
    },
  ],
  questions: [
    {
      id: 'att-1', kind: 'mcq', level: 1,
      prompt: 'Where do attention weights come from?',
      options: [
        { text: 'A softmax over query · key dot products', correct: true, why: 'Query · key gives a score per token; softmax turns the scores into weights that sum to 1.' },
        { text: 'How far apart the tokens sit in the sentence', why: 'Position plays no direct part in the score. A token ten words away can get more weight than its neighbour.' },
        { text: 'A fixed, learned table of which words relate', why: 'Nothing is looked up. The weights are recomputed from the vectors for every input.' },
        { text: 'The dot product between the values of two tokens', why: 'Values are what gets mixed. The weights are decided by queries and keys.' },
      ],
      hint: 'Two of the three vectors decide the weights. The third is what gets mixed.',
    },
    {
      id: 'att-2', kind: 'mcq', level: 1,
      prompt: 'After attention, what is a token’s new vector?',
      options: [
        { text: 'A weighted sum of the value vectors of the tokens it attended to', correct: true, why: 'Weights times values, added up. A token that got 80% of the weight contributes 80% of the result.' },
        { text: 'A copy of the vector of the single highest-scoring token', why: 'That would be a hard pick. Attention is a soft mix: every visible token contributes in proportion to its weight.' },
        { text: 'Its own vector, unchanged, plus a list of attention weights', why: 'The weights are used and thrown away. What moves forward is the mixed vector.' },
        { text: 'The average of all token vectors in the sentence', why: 'An unweighted average would be the same for every token. The weights are what make each token’s mix different.' },
      ],
    },
    {
      id: 'att-3', kind: 'num', level: 2,
      prompt: <>A token’s scores against three tokens are <code>[2, 1, 0]</code>. What attention weight does the first token get? (e ≈ 2.718)</>,
      answer: 0.67, tol: 0.02,
      why: <>e² = 7.39, e¹ = 2.72, e⁰ = 1. Sum = 11.11. 7.39 ÷ 11.11 = <strong>0.67</strong>. A score gap of 1 is a weight ratio of e ≈ 2.7.</>,
      hint: 'Exponentiate each score, then divide the first by the total.',
    },
    {
      id: 'att-4', kind: 'mcq', level: 2,
      prompt: 'A text generator uses a causal mask. In a 6-token prompt, which tokens can token 4 attend to?',
      options: [
        { text: 'Tokens 1 through 4', correct: true, why: 'Itself and everything before it. Later positions get a score of −∞, which softmax turns into exactly zero.' },
        { text: 'Tokens 1 through 3', why: 'A token can attend to itself. Only later positions are blocked.' },
        { text: 'Tokens 5 and 6', why: 'Those are the future. The mask exists to hide them.' },
        { text: 'All six, but later ones get small weights', why: 'The mask is not a penalty. It forces the weight to exactly zero.' },
      ],
      hint: 'The mask hides the future. Decide whether a token counts as its own future.',
    },
    {
      id: 'att-5', kind: 'mcq', level: 2,
      prompt: 'Why do models use several attention heads instead of one bigger one?',
      options: [
        { text: 'Each head has its own softmax, so each can track a different relation', correct: true, why: 'A token may need its subject, its previous token and a matching bracket at once. Separate heads give separate distributions.' },
        { text: 'Splitting the work across heads makes the computation cheaper', why: 'The total width is the same. Heads split the dimensions; they do not reduce the work.' },
        { text: 'Each head looks at a different part of the sentence', why: 'Every head sees every token. They differ in what they learned to look for, not in where they look.' },
        { text: 'The heads vote on each token and the majority weight wins', why: 'There is no vote. The head outputs are concatenated and all pass forward.' },
      ],
      hint: 'Ask how many different things one token can look for with a single set of weights that must sum to 1.',
    },
    {
      id: 'att-6', kind: 'mcq', level: 3,
      prompt: 'A model has no positional information and no causal mask. You shuffle the words of the input. What happens to the output of an attention layer?',
      options: [
        { text: 'Each token gets the same output vector as before, in the new order', correct: true, why: 'Scores depend only on the pair of vectors, so shuffling changes nothing each token computes. Attention alone treats a sentence as a bag of tokens.' },
        { text: 'The outputs change completely because neighbours are different', why: 'Attention has no notion of neighbours. That is why position must be added separately.' },
        { text: 'The outputs are averaged and all tokens become identical', why: 'Each token still has its own query, so each still gets its own mix.' },
        { text: 'The layer fails because the mask no longer lines up', why: 'The question rules out a mask, and without positional information there is nothing to line up. The arithmetic runs the same.' },
      ],
      hint: 'Look at the score formula. Does position appear in it?',
    },
    {
      id: 'att-7', kind: 'mcq', level: 3,
      prompt: 'You remove the ÷√d from a model with 4,096-dimensional keys and train it. What goes wrong first?',
      options: [
        { text: 'Huge scores saturate the softmax, so almost no gradient flows through it', correct: true, why: 'Dot products over many dimensions have a large spread. A saturated softmax is nearly flat, so its gradient is close to zero and the head learns very slowly.' },
        { text: 'The attention weights for a token no longer sum to 1', why: 'Softmax always outputs weights that sum to 1, whatever the size of its inputs.' },
        { text: 'Attention flattens out and becomes uniform across all tokens', why: 'The opposite. Large scores sharpen the distribution; small ones flatten it.' },
        { text: 'The larger scores take more memory and the model runs out', why: 'The divisor is a single scalar. It has no effect on memory or compute.' },
      ],
      hint: 'Think back to the score-scale slider in the lab, and what a nearly one-hot softmax does to learning.',
    },
  ],
  takeaways: [
    'Attention scores every token against every token with a dot product of query and key.',
    'Softmax turns each token’s scores into weights that sum to 1, and the output is the weighted sum of value vectors.',
    'The causal mask sets future positions to exactly zero weight, so a generator only uses what came before.',
    'Attention has no sense of order and its cost grows with the square of the sequence length.',
  ],
};

export default lesson;
