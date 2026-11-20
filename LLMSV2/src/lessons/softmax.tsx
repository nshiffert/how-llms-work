import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Slider, Stat, softmax, tokHue } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: softmax, one stage at a time.
 * Five candidate next words, each with a score the learner sets.
 * Stage 2 is the real e^score, stage 3 is each exponential divided by
 * their sum. Nothing is simulated.
 * ------------------------------------------------------------------ */

const WORDS = ['mat', 'sofa', 'floor', 'roof', 'moon'];
const START = [2, 1, 0.5, 0, -1];
const MIN = -8;
const MAX = 12;

const fmtExp = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v.toFixed(3));
const fmtScore = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);

function SoftmaxLab({ complete }: LabProps) {
  const [scores, setScores] = useState(START);
  const [note, setNote] = useState<{ kind: 'shift' | 'scale'; before: number[]; after: number[] } | null>(null);

  const exps = useMemo(() => scores.map((s) => Math.exp(s)), [scores]);
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = useMemo(() => softmax(scores), [scores]);
  const total = probs.reduce((a, b) => a + b, 0);

  // top two by score
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const [a, b] = order;
  const gap = scores[a] - scores[b];
  const ratio = probs[a] / probs[b];

  const anyTie = scores.some((s, i) => scores.some((t, j) => j > i && Math.abs(s - t) < 1e-9));

  useEffect(() => {
    if (anyTie) complete('tie');
    if (Math.abs(gap - 3) < 1e-9) complete('gap3');
    if (Math.max(...probs) >= 0.9) complete('ninety');
  }, [anyTie, gap, probs, complete]);

  const canShift = Math.max(...scores) + 2 <= MAX;
  const canDouble = Math.max(...scores) * 2 <= MAX && Math.min(...scores) * 2 >= MIN;

  const apply = (kind: 'shift' | 'scale') => {
    sfx.tap();
    const next = scores.map((s) => (kind === 'shift' ? s + 2 : s * 2));
    setNote({ kind, before: probs, after: softmax(next) });
    setScores(next);
    if (kind === 'shift') complete('shift');
  };
  const setOne = (i: number, v: number) => {
    setNote(null);
    setScores((s) => s.map((x, j) => (j === i ? v : x)));
  };

  const maxDelta = note ? Math.max(...note.after.map((p, i) => Math.abs(p - note.before[i]))) : 0;
  const noteTop = note ? note.before.indexOf(Math.max(...note.before)) : 0;

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15 }}>
          <span className="dim">Next word after </span>
          <span className="mono">The cat sat on the ___</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" data-act="shift" disabled={!canShift} onClick={() => apply('shift')}>add 2 to every score</button>
          <button className="btn sm" data-act="double" disabled={!canDouble} onClick={() => apply('scale')}>double every score</button>
          <button className="btn sm ghost" data-act="reset" onClick={() => { sfx.tap(); setNote(null); setScores(START); }}>reset</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>1 · scores (drag)</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {WORDS.map((w, i) => (
              <Slider
                key={w}
                label={<span className="mono" style={{ color: tokHue(i) }}>{w}</span>}
                value={scores[i]} min={MIN} max={MAX} step={0.5}
                onChange={(v) => setOne(i, v)} format={fmtScore}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>2 · exponentiate: e^score</div>
          <Bars items={WORDS.map((w, i) => ({ label: w, value: exps[i], color: tokHue(i) }))} format={fmtExp} labelWidth={44} />
          <div className="dim mono" style={{ fontSize: 12.5, marginTop: 10, textAlign: 'right' }}>
            sum of exponentials = <span style={{ color: 'var(--fg)' }}>{fmtExp(sumExp)}</span>
          </div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>All positive, whatever the sign of the score.</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>3 · divide by the sum</div>
          <Bars items={WORDS.map((w, i) => ({ label: w, value: probs[i], color: tokHue(i) }))} max={1} labelWidth={44} />
          <div className="dim mono" style={{ fontSize: 12.5, marginTop: 10, textAlign: 'right' }}>
            sum of probabilities = <span style={{ color: 'var(--hue)', fontWeight: 700 }}>{total.toFixed(3)}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="eyebrow">the whole distribution · always fills the bar exactly</span>
        </div>
        <div style={{ display: 'flex', height: 38, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line-2)' }} role="img" aria-label="Probabilities as shares of one bar">
          {WORDS.map((w, i) => (
            <div
              key={w}
              style={{
                width: `${probs[i] * 100}%`, background: `color-mix(in srgb, ${tokHue(i)} 62%, #0b0d17)`,
                transition: 'width .45s cubic-bezier(.22,1,.36,1)', display: 'grid', placeItems: 'center',
                overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 12.5, fontFamily: 'var(--mono)', color: '#05060a', fontWeight: 700,
                borderRight: i < WORDS.length - 1 ? '1px solid #05060a' : undefined,
              }}
            >
              {probs[i] > 0.09 ? `${w} ${(probs[i] * 100).toFixed(0)}%` : ''}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>top two · a gap in score is a ratio in probability</div>
        <div className="row">
          <Stat label={`score gap: ${WORDS[a]} − ${WORDS[b]}`} value={gap.toFixed(1)} />
          <Stat label={`probability ratio: ${WORDS[a]} ÷ ${WORDS[b]}`} value={(ratio >= 1000 ? Math.round(ratio).toLocaleString('en-US') : ratio.toFixed(2)) + '×'} hot />
          <Stat label="e^gap" value={(Math.exp(gap) >= 1000 ? Math.round(Math.exp(gap)).toLocaleString('en-US') : Math.exp(gap).toFixed(2)) + '×'} />
        </div>
      </div>

      {note && (
        <Callout>
          {note.kind === 'shift' ? (
            <>
              <strong>Added 2 to every score.</strong> Every exponential grew by e² = {Math.exp(2).toFixed(2)}×, and so did their
              sum, so every fraction is the same as before. Largest change in any probability:{' '}
              <span className="mono">{maxDelta.toFixed(3)}</span>.
            </>
          ) : (
            <>
              <strong>Doubled every score.</strong> Every gap doubled, so every ratio got squared. “{WORDS[noteTop]}” went from{' '}
              <span className="mono">{(note.before[noteTop] * 100).toFixed(1)}%</span> to{' '}
              <span className="mono">{(note.after[noteTop] * 100).toFixed(1)}%</span>.
            </>
          )}
        </Callout>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'softmax',
  hook: {
    prompt: (
      <>
        A model scores two candidate next words: “mat” gets 2 and “sofa” gets 1. Softmax turns the scores into
        probabilities. You then add 100 to both scores, so they are 102 and 101. What happens to the probabilities?
      </>
    ),
    options: [
      {
        text: 'Nothing. Softmax only looks at the gap between scores, and the gap is still 1',
        correct: true,
        why: 'Softmax depends only on the differences between scores. Adding the same number to every score multiplies every exponential by the same factor, and that factor cancels when you divide by the sum. “mat” stays at 73%.',
      },
      {
        text: 'They move close to 50/50, because 102 and 101 differ by only about 1%',
        why: 'That treats the scores as proportions. Softmax never divides one score by another. It uses the difference, which is still 1, so “mat” stays e ≈ 2.7 times as likely.',
      },
      {
        text: '“mat” gets close to 100%, because bigger scores make softmax more confident',
        why: 'Bigger gaps make softmax more confident, not bigger scores. Multiplying the scores would widen the gap. Adding to them does not.',
      },
      {
        text: 'They both rise, since both words now have much stronger scores',
        why: 'Probabilities must add up to 1, so they cannot all rise. A score has no meaning alone, only relative to the other scores in the list.',
      },
    ],
    reveal: 'Next you will set the scores yourself and watch each stage of the calculation respond.',
  },
  Lab: SoftmaxLab,
  missions: [
    {
      id: 'tie',
      text: 'Give two words exactly the same score.',
      insight: 'Equal scores always get equal probabilities, whatever the other scores are. Softmax has no tie-breaker and no memory of which word came first.',
    },
    {
      id: 'gap3',
      text: 'Make the gap between the top two scores exactly 3, then read the ratio.',
      insight: 'The top word is e³ ≈ 20 times as likely as the runner-up. It does not matter whether the scores are 3 and 0 or 5 and 2. A gap in score always becomes a ratio in probability: ratio = e^gap.',
    },
    {
      id: 'shift',
      text: 'Press “add 2 to every score” and compare the probabilities before and after.',
      insight: 'Nothing moved in stage 3. Every exponential grew by e² ≈ 7.39×, the sum grew by the same factor, and the factor cancelled. Scores only mean something relative to each other.',
    },
    {
      id: 'ninety',
      text: 'Get one word to 90% or more. Try “double every score”.',
      insight: 'Dragging one score up or doubling them all does the same thing: it widens the gaps. Doubling doubles every gap, which squares every ratio. The leader pulls away and the rest collapse. Shifting does nothing, scaling changes everything: a later lesson, Temperature, turns that into a dial.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A model does not output probabilities directly. It outputs raw scores, called <em>logits</em>: one number per
          candidate, any size, positive or negative. Softmax converts that list into a probability distribution in two
          steps, and you just ran both.
        </p>
        <ol>
          <li>
            <strong>Exponentiate.</strong> Replace each score <M>{'s'}</M> with <M>{'e^{s}'}</M>, where e ≈ 2.718. Every
            result is positive, even for a negative score.
          </li>
          <li>
            <strong>Normalize.</strong> Divide each result by the sum of all of them. Now they add up to 1.
          </li>
        </ol>
        <Callout>
          <M>{String.raw`p_i = \dfrac{e^{s_i}}{\sum_j e^{s_j}}`}</M>
        </Callout>
        <p>
          Two consequences follow. A <strong>gap</strong> between two scores becomes a <strong>ratio</strong> between
          their probabilities: a gap of 1 means e ≈ 2.7 times as likely, a gap of 3 means about 20 times. And because
          only gaps matter, adding the same number to every score changes nothing, while multiplying every score
          stretches the gaps and sharpens the distribution.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Take the lab's starting scores for “The cat sat on the ___”.
        </p>
        <table>
          <thead>
            <tr><th>word</th><th>score</th><th>e^score</th><th>÷ 13.12</th></tr>
          </thead>
          <tbody>
            <tr><td>mat</td><td>2</td><td>7.389</td><td>0.563</td></tr>
            <tr><td>sofa</td><td>1</td><td>2.718</td><td>0.207</td></tr>
            <tr><td>floor</td><td>0.5</td><td>1.649</td><td>0.126</td></tr>
            <tr><td>roof</td><td>0</td><td>1.000</td><td>0.076</td></tr>
            <tr><td>moon</td><td>−1</td><td>0.368</td><td>0.028</td></tr>
          </tbody>
        </table>
        <p>
          The exponentials sum to 13.12 (13.124 to three places). Each probability is its exponential divided by that sum: 7.389 ÷ 13.12 =
          0.563. The five probabilities add to 1.000.
        </p>
        <p>
          Check the gap rule: “mat” leads “sofa” by 1, and 0.563 ÷ 0.207 = 2.72, which is e. “mat” leads “moon” by 3,
          and 0.563 ÷ 0.028 = 20.1, which is e³.
        </p>
        <Code>{`
def softmax(scores):
    m = max(scores)                       # subtract the max: same answer, no overflow
    exps = [exp(s - m) for s in scores]   # all positive, largest is exactly 1
    total = sum(exps)
    return [e / total for e in exps]      # adds up to 1
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why exponentiate at all</h3>
        <p>
          You could make scores positive in other ways, such as squaring them, but squaring would treat −3 and +3 the
          same. The exponential is always positive, always increasing, and turns addition into multiplication:{' '}
          <M>{'e^{a+b} = e^{a} e^{b}'}</M>. That last property gives the ratio rule,{' '}
          <M>{String.raw`p_i / p_j = e^{s_i - s_j}`}</M>, and the shift rule: adding <M>{'c'}</M> to every score multiplies
          top and bottom of the fraction by <M>{'e^{c}'}</M>.
        </p>
        <h3>Numerical stability</h3>
        <p>
          Scores in real models can be large. <M>{'e^{1000}'}</M> overflows a 64-bit float, which tops out near{' '}
          <M>{'e^{709}'}</M>, and the result is infinity divided by infinity. Because shifting is free, every
          implementation first subtracts the largest score from all of them. The largest exponent becomes 0, the largest
          exponential becomes exactly 1, and nothing can overflow.
        </p>
        <h3>Scaling is a dial</h3>
        <p>
          Multiplying every score by a number above 1 sharpens the distribution. Multiplying by a number below 1
          flattens it toward uniform. Dividing the scores by a chosen constant before the softmax is called{' '}
          <em>temperature</em>, and it has its own lesson. In the limit of very large scale, softmax puts everything on
          the largest score, which is where the name comes from: a soft version of “pick the max”.
        </p>
        <h3>Where it sits in a transformer</h3>
        <p>
          Two places. Inside every attention layer (the next lesson), a softmax turns relevance scores between tokens
          into weights that sum to 1. At the very end of the network, a softmax over one score per vocabulary entry,
          typically tens to hundreds of thousands of entries, gives the probability of each possible next token.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'It never says “none of these”',
      body: 'The outputs always sum to 1, even if every score is terrible. Scores of −50, −51 and −52 give the same confident-looking 67%, 24%, 9% as scores of 2, 1 and 0. A softmax probability is relative to the other options, not a measure of how good the best one is.',
    },
    {
      title: 'Large gaps saturate it',
      body: 'A gap of 10 is a ratio of about 22,000 to 1. Once one score leads by that much, the output is close to a hard pick, and small changes to the scores barely move it. The softmax’s own slope is close to zero there, so anything that has to learn through it, such as an attention head, learns slowly.',
    },
    {
      title: 'Computed naively, it overflows',
      body: 'e^710 is already infinity in 64-bit floats, and 32-bit floats give out near e^89. A softmax written straight from the formula returns NaN on large scores. Subtracting the maximum first is not optional.',
    },
    {
      title: 'Nothing gets exactly zero',
      body: 'Every finite score gets a positive probability. Across a vocabulary of tens or hundreds of thousands of tokens, a long tail of unlikely tokens can add up to a noticeable share. The only way to get an exact zero is a score of −∞, which is how models hide tokens on purpose.',
    },
  ],
  questions: [
    {
      id: 'sm-1', kind: 'mcq', level: 1,
      prompt: 'What are the two steps of softmax, in order?',
      options: [
        { text: 'Raise e to each score, then divide each result by the sum of the results', correct: true, why: 'Exponentiate, then normalize. The first step makes everything positive, the second makes it add up to 1.' },
        { text: 'Divide each score by the sum of the scores, then raise e to each result', why: 'That order breaks on the first step: scores can be negative or sum to zero. And the exponentials at the end would not add up to 1.' },
        { text: 'Subtract the smallest score from each, then divide by the sum', why: 'That is plain rescaling. It would give the lowest score a probability of exactly zero, and gaps would not turn into ratios.' },
        { text: 'Set the largest score to 1 and every other score to 0', why: 'That is a hard max. Softmax keeps every option alive with a positive share.' },
      ],
    },
    {
      id: 'sm-2', kind: 'mcq', level: 1,
      prompt: 'What does the exponential step buy?',
      options: [
        { text: 'It makes every value positive and turns gaps into ratios', correct: true, why: 'e^s is positive for any s, and e^(a−b) = e^a ÷ e^b, so a fixed gap in score is a fixed ratio in probability.' },
        { text: 'It makes the values add up to 1 without any further step', why: 'Exponentials do not sum to 1. The division by their sum does that.' },
        { text: 'It shrinks large scores so they cannot dominate the others', why: 'The opposite: the exponential grows faster than its input, so the largest score dominates more.' },
        { text: 'It removes the negative scores from the list of candidates', why: 'Nothing is removed. A negative score becomes a small positive number, such as e^−1 = 0.37.' },
      ],
    },
    {
      id: 'sm-3', kind: 'num', level: 2,
      prompt: <>Two candidates have scores <code>[2, 0]</code>. What probability does softmax give the first? (e ≈ 2.718)</>,
      answer: 0.88, tol: 0.015,
      why: <>e² = 7.389 and e⁰ = 1. Sum = 8.389. 7.389 ÷ 8.389 = <strong>0.88</strong>. A gap of 2 makes the leader e² ≈ 7.4 times as likely: 0.88 ÷ 0.12 ≈ 7.4.</>,
      hint: 'Exponentiate both scores, then divide the first by the total.',
    },
    {
      id: 'sm-4', kind: 'mcq', level: 2,
      prompt: <>Softmax of <code>[3, 1, 0]</code> gives the first option about 84%. What does softmax of <code>[8, 6, 5]</code> give it?</>,
      options: [
        { text: 'About 84%, because every gap between the scores is the same as before', correct: true, why: 'The second list is the first plus 5. Every exponential is multiplied by e⁵, the sum is too, and the factor cancels.' },
        { text: 'More than 84%, because the leading score is now much larger', why: 'The size of a score means nothing alone. Its lead over the others is still 2 and 3.' },
        { text: 'Less than 84%, because 8, 6 and 5 are proportionally closer', why: 'Softmax does not use proportions between scores. It uses differences, and those are unchanged.' },
        { text: 'It cannot be known without recomputing all three exponentials', why: 'It can. Adding a constant to every score never changes a softmax output.' },
      ],
      hint: 'Compare the gaps between scores in the two lists.',
    },
    {
      id: 'sm-5', kind: 'num', level: 2,
      prompt: <>Token A has a score of 4.5 and token B has 2.5. How many times more likely is A than B after softmax? (e ≈ 2.718)</>,
      answer: 7.39, tol: 0.15, unit: '×',
      why: <>The ratio is e^gap. The gap is 2, and e² = 2.718 × 2.718 = <strong>7.39</strong>. The other scores in the list do not affect this ratio.</>,
      hint: 'Only the gap between the two scores matters. Raise e to it.',
    },
    {
      id: 'sm-6', kind: 'mcq', level: 3,
      prompt: <>You double every score in <code>[2, 1, 0]</code> to get <code>[4, 2, 0]</code>. The top probability was 67%. What is it now?</>,
      options: [
        { text: 'About 87%: the gaps doubled, so the leader pulls further ahead', correct: true, why: 'e⁴ = 54.6, e² = 7.39, e⁰ = 1. Sum = 62.99, and 54.6 ÷ 62.99 = 0.87. Scaling stretches gaps, and gaps are what softmax reads.' },
        { text: 'Still 67%: softmax ignores changes applied to every score', why: 'It ignores adding a constant. Multiplying changes the gaps from 1 to 2, so the output changes.' },
        { text: 'About 33%: larger scores spread the probability more evenly', why: 'Scaling up sharpens. Scaling down, toward zero, is what flattens the distribution.' },
        { text: 'Exactly 100%: doubling pushes the leader to certainty', why: 'No finite score gives exactly 0 or 1. The others shrink but keep a positive share.' },
      ],
      hint: 'Work out the new gaps, then exponentiate.',
    },
    {
      id: 'sm-7', kind: 'mcq', level: 3,
      prompt: <>A naive softmax is given scores <code>[1000, 999]</code> and returns NaN. What is the standard fix, and what does it return?</>,
      options: [
        { text: 'Subtract the max from every score first, giving [0, −1] and the result 73% / 27%', correct: true, why: 'e^1000 overflows to infinity. Shifting by the max is free because softmax only reads gaps, and e⁰ and e^−1 are easy to compute.' },
        { text: 'Divide every score by the max first, giving [1, 0.999] and the result 50% / 50%', why: 'Dividing changes the gaps, so it changes the answer. The true gap is 1, which is not close to a tie.' },
        { text: 'Clip every score to at most 700, giving [700, 700] and the result 50% / 50%', why: 'Clipping avoids the overflow but erases the gap between the two scores, so the answer is wrong.' },
        { text: 'Take the log of every score first, giving about [6.9, 6.9] and nearly 50% / 50%', why: 'Taking logs changes the gaps, and fails outright for negative scores. The answer would be wrong.' },
      ],
      hint: 'Which operation on the scores is guaranteed not to change the output?',
    },
    {
      id: 'sm-8', kind: 'mcq', level: 3,
      prompt: 'A system needs one option to get a probability of exactly zero after softmax. How can it do that?',
      options: [
        { text: 'Set that option’s score to −∞ before the softmax', correct: true, why: 'e^−∞ = 0, and the remaining options renormalize among themselves. Any finite score, however low, leaves a positive share.' },
        { text: 'Give that option the lowest score in the list, whatever its value', why: 'The lowest score still has a positive exponential. It gets a small share, not zero.' },
        { text: 'Set that option’s score to exactly 0 before the softmax', why: 'e⁰ = 1, which is a perfectly ordinary share. A score of zero is not special.' },
        { text: 'Subtract a large constant from every score in the list', why: 'Shifting every score changes nothing at all. The option keeps the same probability.' },
      ],
      hint: 'What input makes e^s equal to exactly zero?',
    },
  ],
  takeaways: [
    'Softmax exponentiates each score and divides by the sum, giving positive numbers that add up to 1.',
    'A gap between two scores becomes a ratio between their probabilities: ratio = e^gap.',
    'Adding a constant to every score changes nothing; multiplying every score sharpens or flattens the distribution.',
    'Transformers use softmax for attention weights and for the final next-token probabilities.',
  ],
};

export default lesson;
