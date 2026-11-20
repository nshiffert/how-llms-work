import { useEffect, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Slider, Stat, Tok, softmax, useRaf } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: real distillation on five logits.
 * The teacher's logits are fixed. The student is five trainable logits
 * starting at zero. "Train" runs plain gradient descent on
 *   (1 − α) · cross-entropy(hard label) + α · T² · KL(teacher_T ‖ student_T)
 * using the exact gradient (1 − α)(q₁ − y) + α · T · (q_T − p_T).
 * ------------------------------------------------------------------ */

const WORDS = ['dog', 'puppy', 'wolf', 'car', 'table'];
const TEACHER = [8, 4, 3, -1, -2];
const HARD = [1, 0, 0, 0, 0];
const STEPS = 300;
const LR = 1;
const PURPLE = '#a78bfa';

const entropyBits = (p: number[]) => -p.reduce((s, x) => s + (x > 0 ? x * Math.log2(x) : 0), 0);

function losses(z: number[], T: number, alpha: number) {
  const q1 = softmax(z);
  const qT = softmax(z, T);
  const pT = softmax(TEACHER, T);
  const hard = -Math.log(q1[0]);
  const soft = Math.max(0, T * T * pT.reduce((s, p, i) => s + p * Math.log(p / qT[i]), 0));
  return { q1, qT, pT, hard, soft, total: (1 - alpha) * hard + alpha * soft };
}

interface Finished { T: number; alpha: number; ratio: number; ranked: boolean; n: number }

function DistillLab({ complete, done }: LabProps) {
  const [T, setT] = useState(1);
  const [alpha, setAlpha] = useState(0.5);
  const [z, setZ] = useState<number[]>([0, 0, 0, 0, 0]);
  const [hist, setHist] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);

  const sim = useRef({ z: [0, 0, 0, 0, 0], hist: [] as number[], runs: 0 });
  const live = useRef({ T, alpha });
  live.current = { T, alpha };

  useRaf(() => {
    const s = sim.current;
    const { T, alpha } = live.current;
    for (let k = 0; k < 2 && s.hist.length < STEPS; k++) {
      const L = losses(s.z, T, alpha);
      s.hist.push(L.total);
      s.z = s.z.map((zi, i) => zi - LR * ((1 - alpha) * (L.q1[i] - HARD[i]) + alpha * T * (L.qT[i] - L.pT[i])));
    }
    setZ(s.z);
    setHist(s.hist.slice());
    if (s.hist.length >= STEPS) {
      setRunning(false);
      const q = softmax(s.z);
      s.runs += 1;
      setFinished({ T, alpha, ratio: q[1] / q[3], ranked: q[0] > q[1] && q[1] > q[2] * 1.2 && q[2] > q[3] * 1.2 && q[3] > q[4] * 1.2, n: s.runs });
      sfx.tap();
    }
  }, running);

  const train = () => {
    sfx.tap();
    sim.current.z = [0, 0, 0, 0, 0];
    sim.current.hist = [];
    setZ(sim.current.z);
    setHist([]);
    setFinished(null);
    setRunning(true);
  };

  const now = losses(z, T, alpha);
  const teacher1 = softmax(TEACHER);
  const teacherRatio = teacher1[1] / teacher1[3];
  const studentRatio = now.q1[1] / now.q1[3];
  const H = entropyBits(now.pT);

  useEffect(() => {
    if (now.pT[1] > 0.1) complete('expose');
  }, [now.pT, complete]);

  useEffect(() => {
    if (!finished) return;
    if (finished.alpha === 0) complete('hard');
    if (finished.alpha === 1 && finished.T >= 2 && finished.ranked) complete('soft');
    if (finished.alpha === 1 && finished.T === 1 && done.has('soft')) complete('collapse');
  }, [finished, done, complete]);

  // Loss plot
  const PW = 340, PH = 150;
  const yMax = Math.max(0.05, hist[0] ?? 1);
  const px = (i: number) => 34 + (i / (STEPS - 1)) * (PW - 44);
  const py = (v: number) => 12 + (1 - Math.min(1, v / yMax)) * (PH - 40);
  const path = hist.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  const bar = (p: number[], color?: string) => WORDS.map((w, i) => ({ label: w, value: p[i], color }));

  return (
    <div className="lab-grid">
      <div className="row" style={{ gap: 4 }}>
        <span className="dim" style={{ fontSize: 13, marginRight: 6 }}>Prompt</span>
        {['She', ' clipped', ' the', ' leash', ' onto', ' her'].map((w, i) => <Tok key={i} i={5}>{w}</Tok>)}
        <Tok color="var(--hue)" active> ___</Tok>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Slider label="Distillation temperature T" value={T} min={1} max={8} step={0.5} onChange={setT} format={(v) => v.toFixed(1)} />
        <Slider label="Soft-target weight α (0 = hard label only)" value={alpha} min={0} max={1} step={0.1} onChange={setAlpha} format={(v) => v.toFixed(1)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--fg-2)' }}>1 · hard label</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>what the dataset says</div>
          <Bars items={bar(HARD, 'var(--fg-3)')} max={1} labelWidth={52} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, color: PURPLE }}>2 · teacher at T = {T.toFixed(1)}</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>softmax(teacher logits ÷ T)</div>
          <Bars items={bar(now.pT, PURPLE)} max={1} labelWidth={52} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>3 · student at T = {T.toFixed(1)}</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>softmax(student logits ÷ T)</div>
          <Bars items={bar(now.qT)} max={1} labelWidth={52} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button className="btn primary" onClick={train} disabled={running}>
            {running ? 'Training…' : 'Train a fresh student'}
          </button>
          <span className="mono dim" style={{ fontSize: 13 }}>step {hist.length} / {STEPS}</span>
        </div>
        <span className="dim" style={{ fontSize: 12.5, maxWidth: '44ch' }}>
          Each run starts the student at five equal logits and takes {STEPS} gradient steps on the loss below.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>loss over training</div>
          <div className="mono dim" style={{ fontSize: 12, marginBottom: 8 }}>loss = (1 − α) · CE + α · (T² · KL)</div>
          <svg className="viz" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Student loss over training steps">
            <line x1={34} y1={PH - 28} x2={PW - 10} y2={PH - 28} stroke="var(--line-2)" />
            <line x1={34} y1={12} x2={34} y2={PH - 28} stroke="var(--line-2)" />
            <text x={30} y={16} textAnchor="end" style={{ fontSize: 10 }}>{yMax.toFixed(1)}</text>
            <text x={30} y={PH - 26} textAnchor="end" style={{ fontSize: 10 }}>0</text>
            <text x={34} y={PH - 12} style={{ fontSize: 10, fill: 'var(--fg-3)' }}>step 0</text>
            <text x={PW - 10} y={PH - 12} textAnchor="end" style={{ fontSize: 10, fill: 'var(--fg-3)' }}>{STEPS}</text>
            {hist.length === 0 && (
              <text x={PW / 2 + 12} y={PH / 2 - 8} textAnchor="middle" style={{ fill: 'var(--fg-3)' }}>press Train to plot the loss</text>
            )}
            {hist.length > 1 && (
              <>
                <path d={path} fill="none" stroke="var(--hue)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={px(hist.length - 1)} cy={py(hist[hist.length - 1])} r={4} fill="var(--hue)" />
              </>
            )}
          </svg>
          <div className="mono dim" style={{ fontSize: 12.5 }}>
            now: {(1 - alpha).toFixed(1)} × {now.hard.toFixed(3)} + {alpha.toFixed(1)} × {Number((T * T).toFixed(2))} × {(now.soft / (T * T)).toFixed(3)} = <span style={{ color: 'var(--fg)' }}>{now.total.toFixed(3)}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="eyebrow">what the student picked up</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Stat label="teacher: puppy ÷ car (at T = 1)" value={teacherRatio.toFixed(0) + '×'} />
            <Stat label="student: puppy ÷ car (at T = 1)" value={(studentRatio >= 100 ? studentRatio.toFixed(0) : studentRatio.toFixed(1)) + '×'} hot />
            <Stat label="entropy of soft targets (max 2.32 bits)" value={H.toFixed(2) + ' bits'} />
            <Stat label="student’s P(dog) at T = 1" value={(now.q1[0] * 100).toFixed(1) + '%'} />
          </div>
          <div className="dim" style={{ fontSize: 12.5 }}>
            A ratio of 1.0× means the student treats “puppy” and “car” as equally wrong.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'distillation',
  hook: {
    prompt: (
      <>
        A large model reads “She clipped the leash onto her ___” and outputs: dog 97.5%, puppy 1.79%, wolf 0.66%, car
        0.012%. You want a small model to learn from it. Which part of that output teaches the small model something
        the correct label “dog” does not?
      </>
    ),
    options: [
      {
        text: 'The small probabilities on wrong answers: “puppy” at about 150 times “car” marks the near misses',
        correct: true,
        why: 'The label only says “dog, and nothing else”. The teacher’s spread over the wrong answers says puppy and wolf are close and car is absurd. That ranking is knowledge about how words relate, and it comes with every single example.',
      },
      {
        text: 'The 97.5% on “dog”: it tells the small model how confident to be, which a plain label cannot express',
        why: 'The label already says “dog” with 100%. Swapping 100 for 97.5 changes almost nothing. The new information is in how the remaining 2.5% is divided.',
      },
      {
        text: 'None of it. Training on the true label is strictly better, because copying a teacher also copies its mistakes',
        why: 'The student does inherit the teacher’s errors, but the label carries far less per example: one right answer and no information about the others. Students trained on a good teacher’s outputs often beat same-size models trained on labels alone.',
      },
      {
        text: 'None of it. What transfers is the large model’s weights, shrunk to fit the small model’s layers',
        why: 'Distillation does not shrink weights. The student is a separate, smaller network trained to reproduce the teacher’s outputs.',
      },
    ],
    reveal: 'Next you will train a tiny student both ways and measure what it learns about the wrong answers.',
  },
  Lab: DistillLab,
  missions: [
    {
      id: 'expose',
      text: 'Raise the temperature T until the teacher gives “puppy” more than 10%.',
      insight: 'At T = 2, “puppy” is at 11.0% and “wolf” at 6.6%. At T = 1 they were 1.8% and 0.7%: present, but too small to produce much gradient. Dividing the logits by T shrinks the gaps between them, so the small probabilities grow while the ranking stays the same.',
    },
    {
      id: 'hard',
      text: 'Set α to 0 (hard label only) and train a fresh student.',
      insight: 'The student gets “dog” right, and puppy ÷ car is exactly 1.0×. All four wrong answers end on the same probability. The label pushed them down equally because it says nothing about which is closer.',
    },
    {
      id: 'soft',
      text: 'Set α to 1 with T at 2 or higher and train again.',
      insight: 'The student’s bars match the teacher’s, and puppy ÷ car lands at about 148×, the teacher’s own ratio. It copied the full ranking dog > puppy > wolf > car > table from one prompt, without ever being told those words are related.',
    },
    {
      id: 'collapse',
      text: 'Keep α at 1, set T back to 1, and train once more.',
      insight: 'The soft targets are now 97.5% “dog”, with 0.19 bits of entropy: almost a hard label. In the same 300 steps the student reaches a ratio near 9× where the teacher says 148×. The information is still there, but the gradient it produces is too small to learn from quickly.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Distillation trains a small model (the <em>student</em>) to reproduce the outputs of a large trained model
          (the <em>teacher</em>). The student is not given the teacher’s weights. It is given the teacher’s answers.
        </p>
        <ol>
          <li>
            <strong>Soft targets.</strong> For each input, the teacher produces a full probability distribution. The
            student is trained to match all of it, measured by KL divergence. The probabilities on wrong answers carry
            the teacher’s sense of what is similar to what, sometimes called dark knowledge.
          </li>
          <li>
            <strong>Temperature.</strong> Both models’ logits are divided by <M>{'T'}</M> before the softmax. This
            raises the small probabilities so they produce usable gradient. You saw “puppy” go from 1.8% to 11.0%.
          </li>
          <li>
            <strong>Mixed loss.</strong> The soft loss is usually combined with ordinary cross-entropy on the true
            label.
          </li>
        </ol>
        <Callout>
          <M>{String.raw`L = (1-\alpha)\,\text{CE}(y,\, q_1) + \alpha\, T^2\, \text{KL}(p_T \,\|\, q_T)`}</M>
        </Callout>
        <p>
          With hard labels only, your student ranked every wrong answer equally. With soft targets it copied the
          teacher’s ranking. The student ends up smaller and cheaper to run, and it is usually no better than its teacher
          on the data used for the transfer.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          The teacher’s logits in the lab are <code>[8, 4, 3, −1, −2]</code> for dog, puppy, wolf, car, table. Here is
          the softmax at two temperatures.
        </p>
        <table>
          <thead>
            <tr><th>token</th><th>logit</th><th>P at T = 1</th><th>logit ÷ 2</th><th>e^(logit ÷ 2)</th><th>P at T = 2</th></tr>
          </thead>
          <tbody>
            <tr><td>dog</td><td>8</td><td>97.54%</td><td>4</td><td>54.60</td><td>80.95%</td></tr>
            <tr><td>puppy</td><td>4</td><td>1.79%</td><td>2</td><td>7.39</td><td>10.96%</td></tr>
            <tr><td>wolf</td><td>3</td><td>0.66%</td><td>1.5</td><td>4.48</td><td>6.65%</td></tr>
            <tr><td>car</td><td>−1</td><td>0.01%</td><td>−0.5</td><td>0.61</td><td>0.90%</td></tr>
            <tr><td>table</td><td>−2</td><td>0.004%</td><td>−1</td><td>0.37</td><td>0.55%</td></tr>
          </tbody>
        </table>
        <p>
          At T = 2 the exponentials sum to 67.45, and 7.39 ÷ 67.45 = 10.96% for “puppy”. The order of the tokens is the
          same at both temperatures. Only the gaps changed.
        </p>
        <p>
          Now one gradient step. The student starts with all logits at 0, so it outputs 20% for each token at any
          temperature. With α = 1, T = 2 and a learning rate of 1, the gradient on each logit is T × (student − teacher):
        </p>
        <ul>
          <li>dog: 2 × (0.20 − 0.8095) = −1.22, so its logit rises by 1.22</li>
          <li>puppy: 2 × (0.20 − 0.1096) = +0.18, so its logit falls by 0.18</li>
          <li>car: 2 × (0.20 − 0.0090) = +0.38, so its logit falls by 0.38</li>
        </ul>
        <p>
          “car” is pushed down about twice as hard as “puppy”. With the hard label, both would get the same push: 0.20 −
          0 = 0.20.
        </p>
        <Code>{`
p_T = softmax(teacher_logits / T)          # soft targets
q_T = softmax(student_logits / T)
q_1 = softmax(student_logits)
loss = (1 - alpha) * cross_entropy(y, q_1) \\
     + alpha * T**2 * kl(p_T, q_T)
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The gradient, and where T² comes from</h3>
        <p>
          The gradient of cross-entropy with respect to the student’s logits is <M>{'q_1 - y'}</M>: prediction minus
          target. For the soft term at temperature <M>{'T'}</M> it is <M>{String.raw`\tfrac{1}{T}(q_T - p_T)`}</M>. The{' '}
          <M>{'1/T'}</M> comes from dividing the logits, and the difference <M>{'q_T - p_T'}</M> itself shrinks roughly
          like <M>{'1/T'}</M> as both distributions flatten. So the soft gradient scales like <M>{'1/T^2'}</M>.
          Multiplying the soft loss by <M>{'T^2'}</M> cancels that, which keeps the two terms comparable when you change{' '}
          <M>{'T'}</M>.
        </p>
        <h3>Why soft targets train faster</h3>
        <p>
          A hard label gives one fact per example: which token was right. A soft target gives a number for every token
          in the vocabulary. The entropy readout shows how spread out the targets are: 0.19 bits at T = 1 against 1.50
          bits at T = 3, out of a possible 2.32. It is a measure of spread, not of useful information: a uniform target
          scores 2.32 and teaches nothing. What helps is that the spread follows the teacher’s ranking, so each example
          constrains every token and not just one.
        </p>
        <h3>Too much temperature</h3>
        <p>
          With the <M>{'T^2'}</M> factor, a high temperature does not starve the gradient: in the lab the student
          matches the teacher at every T from 2 to 8. The usual explanation of the cost concerns real students, which
          are too small to copy everything. At high T the loss weights all logits about equally, so the student spends
          capacity matching the teacher’s very negative logits, which are mostly noise. At T = 8 in the lab, “car” is
          at 11.8% and “puppy” at 22.0%. The lab’s student has one free logit per token, so it cannot show this cost.
          Typical choices are in the low single digits. The student is used at T = 1 after training.
        </p>
        <h3>Distilling language models in practice</h3>
        <p>
          Matching logits requires access to the teacher’s full output distribution, which hosted models usually do not
          expose. The common variant for LLMs is simpler: have the large model generate text, then train the small model
          on that text with ordinary next-token cross-entropy. That is hard-label distillation. Each token carries less
          signal, so it is made up with volume. When logits are available the gains can be large: DistilBERT, trained
          with a soft-target loss among others, is about 40% smaller than BERT and reported keeping about 97% of its
          benchmark score.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'The student inherits the teacher’s limits',
      body: 'The target is the teacher’s output, mistakes and biases included. A student trained only to imitate cannot learn something the teacher gets wrong, and it has less capacity, so it usually lands somewhat below.',
    },
    {
      title: 'It only transfers what the transfer data exercises',
      body: 'The student copies the teacher on the inputs it is shown. Behaviour on kinds of input missing from that data is not transferred, however good the teacher is there.',
    },
    {
      title: 'Temperature needs tuning',
      body: 'At T = 1 a confident teacher’s soft targets are almost a hard label, and the extra signal arrives as tiny gradients. At high T a small student is pushed to match every logit, including the teacher’s noisy, very negative ones. The right value depends on how much smaller the student is.',
    },
    {
      title: 'Text-only distillation throws away most of the signal',
      body: 'Training on a teacher’s generated text gives one sampled token per position, not the distribution behind it. It works, but needs more data than logit matching, and the student also learns the teacher’s sampling quirks and errors as if they were ground truth.',
    },
  ],
  questions: [
    {
      id: 'di-1', kind: 'mcq', level: 1,
      prompt: 'In distillation, what is the student trained to match?',
      options: [
        { text: 'The teacher’s output probability distribution for each input', correct: true, why: 'The student sees the same input and is trained to produce the same distribution over next tokens, wrong answers included.' },
        { text: 'The teacher’s weight matrices, reduced to a smaller size', why: 'Weights are not what the loss compares. The student is trained on the teacher’s outputs.' },
        { text: 'The teacher’s attention patterns, layer by layer', why: 'Some variants add such terms, but the mechanism taught here, and the core of distillation, is matching outputs.' },
        { text: 'The single token the teacher ranks highest, and nothing else', why: 'That would be a hard label made by the teacher. Soft-target distillation uses the full distribution.' },
      ],
    },
    {
      id: 'di-2', kind: 'mcq', level: 1,
      prompt: 'Why are the teacher’s logits divided by a temperature above 1 during distillation?',
      options: [
        { text: 'To enlarge the small probabilities on the wrong answers', correct: true, why: 'Dividing logits by T shrinks the gaps between them. Near-miss tokens rise from fractions of a percent to values the student can learn from, while the ranking is preserved.' },
        { text: 'To make the teacher more accurate on hard inputs', why: 'Temperature does not change which token the teacher ranks first. It only reshapes the distribution.' },
        { text: 'To make the student sample more creatively after training', why: 'The temperature is used only inside the training loss. The student runs at T = 1 afterwards.' },
        { text: 'To change the order in which the teacher ranks the tokens', why: 'Dividing every logit by the same positive number never changes their order.' },
      ],
    },
    {
      id: 'di-3', kind: 'num', level: 2,
      prompt: <>A teacher’s logits for three tokens are <code>[4, 2, 0]</code>. At temperature T = 2, what probability does the second token get? (e ≈ 2.718)</>,
      answer: 0.245, tol: 0.01,
      why: <>Divide by 2: [2, 1, 0]. Exponentiate: 7.39, 2.72, 1. Sum = 11.11. 2.72 ÷ 11.11 = <strong>0.245</strong>. At T = 1 the same token would get only 0.117.</>,
      hint: 'Divide every logit by T first, then do an ordinary softmax.',
    },
    {
      id: 'di-4', kind: 'num', level: 2,
      prompt: <>A student outputs 0.30 for a token. The teacher’s soft target for it is 0.12, at T = 3 with α = 1. Using the lesson’s gradient T × (student − teacher), what is the gradient on that token’s logit?</>,
      answer: 0.54, tol: 0.005,
      why: <>3 × (0.30 − 0.12) = <strong>0.54</strong>. It is positive, so gradient descent lowers that logit: the student was giving the token too much.</>,
      hint: 'Subtract the target from the prediction, then multiply by T.',
    },
    {
      id: 'di-5', kind: 'mcq', level: 2,
      prompt: 'A student starts with equal logits and is trained with hard labels only on one example. How do its probabilities for the wrong tokens compare afterwards?',
      options: [
        { text: 'They are all equal: the label pushes every wrong token the same way', correct: true, why: 'The gradient is prediction minus target, and the target is 0 for every wrong token. Starting equal, they receive identical updates and stay equal. The label has no information to separate them.' },
        { text: 'Related tokens end higher, because the model infers similarity from the label', why: 'There is nothing to infer from. A one-hot label treats “puppy” and “car” identically.' },
        { text: 'They all go to exactly zero after enough steps', why: 'Softmax outputs are never exactly zero. They shrink together but remain equal and positive.' },
        { text: 'They end in random order, depending on the learning rate', why: 'The updates are deterministic and symmetric across wrong tokens, so no order can emerge.' },
      ],
      hint: 'Write the gradient for two different wrong tokens and compare.',
    },
    {
      id: 'di-6', kind: 'mcq', level: 3,
      prompt: 'You raise T from 2 to 6 and remove the T² factor from the loss. What happens to training?',
      options: [
        { text: 'The soft term’s gradient shrinks several times over, so the hard label dominates', correct: true, why: 'Soft gradients scale roughly like 1/T². Going from 2 to 6 multiplies T² by 9; for the lab’s teacher the actual shrink at step 0 is about 7.5 times. Without the T² correction the mix drifts toward plain label training.' },
        { text: 'The soft term’s gradient grows several times over and training becomes unstable', why: 'The direction is reversed. Higher temperature flattens both distributions and makes the uncorrected gradient smaller.' },
        { text: 'Nothing changes, because T² only rescales the reported loss value', why: 'Scaling a loss term scales its gradient. It changes how much that term steers the weights.' },
        { text: 'The student’s ranking of wrong tokens reverses', why: 'Neither T nor the missing factor changes the order of the teacher’s targets, only the size of the push toward them.' },
      ],
      hint: 'How does the size of the soft gradient depend on T? Compare T = 2 with T = 6.',
    },
    {
      id: 'di-7', kind: 'mcq', level: 3,
      prompt: 'You can only call a large model through an API that returns generated text, with no probabilities. How do you distill it?',
      options: [
        { text: 'Generate many outputs and train the small model on that text', correct: true, why: 'Without logits there are no soft targets, so the teacher’s text becomes hard labels. Each token carries less signal than a full distribution, which is compensated with more generated data.' },
        { text: 'It cannot be done: distillation requires the teacher’s full distribution', why: 'Soft targets are the richer signal, but training on teacher-generated text is the common practical form of distillation for LLMs.' },
        { text: 'Estimate the logits by raising the API’s sampling temperature and reading the text', why: 'One sampled token per position does not reveal the distribution it was drawn from. You still end up with hard labels.' },
        { text: 'Copy the teacher’s tokenizer, which carries most of its knowledge', why: 'A tokenizer only splits text into pieces. The knowledge is in the weights, which you can only reach through outputs.' },
      ],
      hint: 'What does a sampled token give you that can serve as a training target?',
    },
    {
      id: 'di-8', kind: 'mcq', level: 3,
      prompt: 'A teacher is wrong on a class of questions. A student is distilled from it with α = 1. What should you expect on those questions?',
      options: [
        { text: 'It reproduces the teacher’s wrong answers: the teacher’s output is its only target', correct: true, why: 'With α = 1 no true labels enter the loss. The student is optimised to imitate, so it inherits the errors. Mixing in hard labels (α below 1) is one way to pull it back toward the truth.' },
        { text: 'The student corrects them, because soft targets contain the right answer at low probability', why: 'The student is trained to match the distribution, not to pick out a low-probability token and promote it.' },
        { text: 'The student answers at random, because wrong targets carry no gradient', why: 'Wrong targets produce gradient like any others. The student learns them faithfully.' },
        { text: 'The student refuses to answer, since it has less capacity than the teacher', why: 'Capacity limits how closely it can imitate. It does not create a new behaviour the teacher never showed.' },
      ],
      hint: 'Look at the loss with α = 1. Where does the true label appear in it?',
    },
  ],
  takeaways: [
    'Distillation trains a small student to match a large teacher’s full output distribution, not just its top answer.',
    'The probabilities on wrong answers carry the teacher’s sense of similarity, and a temperature above 1 makes them large enough to learn from.',
    'The loss mixes hard-label cross-entropy with T² times the KL divergence to the teacher’s soft targets.',
    'The student is cheaper to run, but it inherits its teacher’s errors and only what the transfer data covers; for LLMs the usual variant is training on the teacher’s generated text.',
  ],
};

export default lesson;
