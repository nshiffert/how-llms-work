import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Slider, Stat, useRaf } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: the attention grid at any length, and a window that overflows.
 * All counts are exact arithmetic (n², n(n+1)/2). The grid drawing is
 * capped at 64 × 64 squares; the caption says what one square stands
 * for when n is larger than that.
 * ------------------------------------------------------------------ */

const CAP = 64;
const BASE_N = 1024;

function words(x: number): string {
  if (x < 1e6) return x.toLocaleString('en-US', { maximumFractionDigits: x >= 100 ? 0 : 2 });
  const [div, name] = x >= 1e12 ? [1e12, 'trillion'] : x >= 1e9 ? [1e9, 'billion'] : [1e6, 'million'];
  return `${Number((x / div).toPrecision(3))} ${name}`;
}
function bytes(x: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let u = 0;
  while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
  return `${Number(x.toPrecision(3))} ${units[u]}`;
}
const pairs = (n: number, causal: boolean) => (causal ? (n * (n + 1)) / 2 : n * n);
const times = (r: number) => (r >= 1 ? `${words(Number(r.toPrecision(4)))}×` : `1/${words(Math.round(1 / r))}`);

function Grid({ n, causal }: { n: number; causal: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const now = useRef(0);
  const born = useRef(0);
  useEffect(() => { born.current = now.current; }, [n, causal]);

  useRaf((t) => {
    now.current = t;
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const hue = getComputedStyle(cv).getPropertyValue('--hue').trim() || '#a78bfa';
    const S = cv.width;
    const G = Math.min(n, CAP);
    const cell = S / G;
    const gap = G <= 8 ? 6 : G <= 16 ? 4 : G <= 32 ? 2.5 : 1.5;
    const prog = Math.min(1, (t - born.current) / 0.55);
    const scan = (t * Math.max(3, G / 5)) % G; // the row currently "reading"
    const tail = Math.max(2, G / 7);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = hue;
    for (let r = 0; r < G; r++) {
      const behind = (scan - r + G) % G;
      const glow = behind < tail ? 1 - behind / tail : 0;
      for (let c = 0; c < G; c++) {
        if ((r + c) / Math.max(1, 2 * G - 2) > prog) continue; // sweep in from the corner
        const on = !causal || c <= r;
        ctx.globalAlpha = on ? 0.26 + 0.7 * glow : 0.045;
        ctx.fillRect(c * cell + gap / 2, r * cell + gap / 2, cell - gap, cell - gap);
      }
    }
    ctx.globalAlpha = 1;
  });

  return (
    <canvas
      ref={ref} width={640} height={640} role="img"
      aria-label={`Attention grid for ${n} tokens`}
      style={{ width: '100%', maxWidth: 330, aspectRatio: '1', display: 'block', margin: '0 auto', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg, #06070d)' }}
    />
  );
}

/* ---------------- conversation flowing through a fixed window ---------------- */

const WINDOW = 800;
const SIZES = [150, 220, 120, 260, 180, 240, 140, 200, 160, 230, 130, 210];
const MAX_TURNS = 12;

function windowState(count: number) {
  let first = count;
  let used = 0;
  while (first > 0 && used + SIZES[first - 1] <= WINDOW) { used += SIZES[first - 1]; first--; }
  return { first, used }; // turns with index >= first are still visible
}

function Conversation({ onPickDropped }: { onPickDropped: () => void }) {
  const [count, setCount] = useState(2);
  const [picked, setPicked] = useState<number | null>(null);
  const { first, used } = windowState(count);
  let processed = 0;
  for (let c = 1; c <= count; c++) processed += windowState(c).used;

  const dropped = SIZES.slice(0, first).map((_, i) => i).slice(-6);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">a conversation in an {WINDOW}-token window</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm primary" data-act="send" disabled={count >= MAX_TURNS} onClick={() => { sfx.tap(); setCount(count + 1); }}>
            send turn {Math.min(count + 1, MAX_TURNS)}
          </button>
          <button className="btn sm ghost" onClick={() => { sfx.tap(); setCount(2); setPicked(null); }}>reset</button>
        </div>
      </div>

      <div className="row" style={{ minHeight: 40, gap: 6 }}>
        <span className="mono" style={{ fontSize: 12, color: first > 0 ? 'var(--bad)' : 'var(--fg-3)' }}>
          {first > 0 ? `dropped (${first}):` : 'nothing dropped yet'}
        </span>
        {dropped.map((i) => (
          <motion.button
            key={i} layoutId={`cw-turn-${i}`} data-turn={i + 1} data-gone="1"
            onClick={() => { sfx.tap(); setPicked(i); onPickDropped(); }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            className="mono"
            style={{
              width: 40, height: 34, borderRadius: 9, fontSize: 13, fontWeight: 700, color: 'var(--fg-3)',
              textDecoration: 'line-through', background: 'var(--panel-2)', cursor: 'pointer',
              border: `1.5px dashed ${picked === i ? 'var(--bad)' : 'var(--line-2)'}`,
            }}
          >
            #{i + 1}
          </motion.button>
        ))}
      </div>

      <div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--hue)', marginBottom: 6 }}>
          what the model receives · {used} of {WINDOW} tokens
        </div>
        <div
          role="img" aria-label={`Turns ${first + 1} to ${count} fit in the window`}
          style={{
            display: 'flex', height: 66, padding: 4, borderRadius: 13, overflow: 'hidden',
            border: '1.5px solid color-mix(in srgb, var(--hue) 70%, transparent)',
            background: 'color-mix(in srgb, var(--hue) 5%, transparent)',
          }}
        >
          {SIZES.slice(first, count).map((sz, k) => {
            const i = first + k;
            return (
              <motion.div
                key={i} layoutId={`cw-turn-${i}`} data-turn={i + 1} data-gone="0"
                initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                style={{ width: `${(sz / WINDOW) * 100}%`, padding: '0 2px', flex: 'none' }}
              >
                <div
                  className="mono"
                  style={{
                    height: '100%', borderRadius: 9, display: 'grid', placeContent: 'center', textAlign: 'center', overflow: 'hidden',
                    border: '1px solid var(--hue)', background: `color-mix(in srgb, var(--hue) ${i % 2 ? 20 : 38}%, transparent)`,
                  }}
                >
                  <b style={{ fontSize: 14, color: '#fff' }}>#{i + 1}</b>
                  <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>{sz}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mono dim" style={{ fontSize: 11.5, marginTop: 6, textAlign: 'right' }}>
          {WINDOW - used} tokens free · the oldest whole turn is dropped when the next one does not fit
        </div>
      </div>
      <div className="row">
        <Stat label="turns sent" value={count} />
        <Stat label="still visible" value={first + 1 === count ? `#${count}` : `#${first + 1}–#${count}`} hot />
        <Stat label="tokens processed, all calls" value={processed.toLocaleString('en-US')} />
        <span className="dim" style={{ fontSize: 13, maxWidth: '36ch' }}>
          {picked !== null && picked < first
            ? <>Turn #{picked + 1} is gone. Nothing of it reaches the model, so a question about it can only be answered by guessing.</>
            : <>Every call resends everything in the box. The model keeps nothing between calls.</>}
        </span>
      </div>
    </div>
  );
}

/* ---------------- the lab ---------------- */

const PRESETS: [number, string][] = [[4, '16'], [10, '1k'], [13, '8k'], [17, '128k'], [20, '1M']];

function ContextLab({ complete }: LabProps) {
  const [exp, setExp] = useState(3); // n = 2^exp
  const [prev, setPrev] = useState<number | null>(null);
  const [causal, setCausal] = useState(false);

  const n = 2 ** exp;
  const count = pairs(n, causal);
  const prevN = prev === null ? null : 2 ** prev;

  const move = (e: number) => {
    if (e === exp) return;
    setPrev(exp);
    setExp(e);
  };

  useEffect(() => {
    // Both insights quote the full-grid numbers, so they only count with the mask off.
    if (!causal && prevN !== null && n === prevN * 2) complete('quad');
    if (!causal && count >= 1e9) complete('billion');
    if (causal) complete('causal');
  }, [n, prevN, count, causal, complete]);

  const G = Math.min(n, CAP);

  return (
    <div className="lab-grid">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div>
          <Grid n={n} causal={causal} />
          <div className="dim" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8, minHeight: 36 }}>
            {n <= CAP
              ? <>{n} × {n}. Each square is one comparison: the row's token reading the column's token.</>
              : <>Drawn at {G} × {G}. Each square stands for <strong style={{ color: 'var(--fg)' }}>{words((n / CAP) ** 2)}</strong> comparisons.</>}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="row">
            <Stat label="tokens (n)" value={n.toLocaleString('en-US')} />
            <Stat label={causal ? 'comparisons: n(n+1)/2' : 'comparisons: n × n'} value={words(count)} hot />
          </div>
          <div className="row">
            <Stat label={`vs a ${BASE_N.toLocaleString('en-US')}-token input`} value={times(count / pairs(BASE_N, causal))} />
            <Stat label="scores at 4 bytes each" value={bytes(count * 4)} />
          </div>
          <div className="mono" style={{ fontSize: 13.5, minHeight: 22, color: 'var(--fg-2)' }}>
            {prevN !== null && (
              <>
                last move: n {times(n / prevN)} <span style={{ color: 'var(--fg-3)' }}>→</span> comparisons{' '}
                <span style={{ color: 'var(--hue)', fontWeight: 700 }}>{times(count / pairs(prevN, causal))}</span>
              </>
            )}
          </div>
          <div className="dim" style={{ fontSize: 13 }}>
            Counts are per attention head, per layer. With a KV cache, generating the next token takes only the new row:{' '}
            <span className="mono" style={{ color: 'var(--fg)' }}>{words(n)}</span> comparisons.
          </div>
        </div>
      </div>

      <Slider
        label="Sequence length n · each notch doubles it"
        value={exp} min={2} max={20} onChange={move} format={(v) => (2 ** v).toLocaleString('en-US') + ' tokens'}
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dim" style={{ fontSize: 13 }}>Jump to</span>
          {PRESETS.map(([e, label]) => (
            <button key={e} className="btn sm" data-n={label} onClick={() => { sfx.tap(); move(e); }} style={e === exp ? { borderColor: 'var(--hue)', color: 'var(--hue)' } : undefined}>{label}</button>
          ))}
        </div>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Mask</span>
          <Seg value={causal ? 'causal' : 'full'} onChange={(v) => setCausal(v === 'causal')} options={[{ value: 'full', label: 'none' }, { value: 'causal', label: 'causal' }]} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <Conversation onPickDropped={() => complete('forgot')} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'context-window',
  hook: {
    prompt: (
      <>
        A model handles a 1,000-token prompt. You give it a 2,000-token prompt instead. How much more work does each
        attention layer do?
      </>
    ),
    options: [
      {
        text: 'Four times as much, because every token is compared with every token',
        correct: true,
        why: 'Attention scores every pair of tokens. 1,000 tokens make 1,000 × 1,000 = 1 million pairs. 2,000 tokens make 4 million. Doubling the length quadruples the work.',
      },
      {
        text: 'Twice as much, because there are twice as many tokens to process',
        why: 'That would be true if each token were processed alone. In attention each token looks at all the others, so both the number of lookers and the number looked at double.',
      },
      {
        text: 'About the same, because all tokens are processed in parallel',
        why: 'Parallel hardware changes how long you wait, not how much arithmetic is done. Four million comparisons still have to be computed and paid for.',
      },
      {
        text: 'It depends on the content, since only related tokens are compared',
        why: 'The model cannot know which tokens are related before scoring them. Every pair is scored, and the softmax decides afterwards which ones matter.',
      },
    ],
    reveal: 'Next you will grow the grid of comparisons yourself, from 8 tokens to a million.',
  },
  Lab: ContextLab,
  missions: [
    {
      id: 'quad',
      text: 'With the mask set to “none”, move the length slider up one notch, which doubles n, and read the “last move” line.',
      insight: 'n doubled and the comparisons went up 4×. Twice as many rows, each twice as long. This holds at every size: the cost grows with the square of the length.',
    },
    {
      id: 'billion',
      text: 'With the mask set to “none”, keep raising n until one layer needs a billion comparisons or more.',
      insight: 'It happens at 32,768 tokens: 32,768² ≈ 1.07 billion, per head, per layer. A million tokens would need about 1.1 trillion. This is why a longer window is a cost decision and not a setting someone forgot to raise.',
    },
    {
      id: 'causal',
      text: 'Switch the mask to “causal” and compare the count.',
      insight: 'A text generator only lets a token look at itself and what came before, which leaves n(n+1)/2 pairs: about half. Half of a quadratic is still quadratic. Doubling n still roughly quadruples the work.',
    },
    {
      id: 'forgot',
      text: 'Send turns until the window overflows, then click the turn the model can no longer see.',
      insight: 'Turn 5 did not fit, so turn 1 was cut. The model was not told. It simply never receives that text again, and it will answer questions about it by guessing.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          The <strong>context window</strong> is the maximum number of tokens a model can attend over at once. The
          prompt and the answer being generated share it: every token the model writes takes a slot.
        </p>
        <p>
          The cost comes from the grid you drew. Each token is compared with every token, so <M>{'n'}</M> tokens need{' '}
          <M>{'n^2'}</M> scores in every head of every layer. Double the length and you pay four times the compute.
        </p>
        <p>
          The limit itself is fixed when the model is built: the lengths it was trained on and the memory its hardware
          has. Windows of a million tokens exist, paid for with this arithmetic.
        </p>
        <p>
          Two more facts:
        </p>
        <ul>
          <li>
            <strong>Generation reuses work.</strong> A <em>KV cache</em> keeps the key and value vectors of all earlier
            tokens. Each new token only computes its own row: <M>{'n'}</M> comparisons, not <M>{'n^2'}</M>.
          </li>
          <li>
            <strong>The model is stateless.</strong> It keeps nothing between calls. A chat application resends the
            conversation every turn. When the history no longer fits, the application cuts or compresses it, and
            what is cut is gone.
          </li>
        </ul>
      </>
    ),
    worked: (
      <>
        <p>
          <strong>The grid.</strong> Count the comparisons for one head in one layer.
        </p>
        <table>
          <thead>
            <tr><th>tokens</th><th>comparisons (n²)</th><th>vs 1,024</th></tr>
          </thead>
          <tbody>
            <tr><td>1,024</td><td>1,048,576 (1.05 million)</td><td>1×</td></tr>
            <tr><td>2,048</td><td>4,194,304 (4.19 million)</td><td>4×</td></tr>
            <tr><td>8,192</td><td>67.1 million</td><td>64×</td></tr>
            <tr><td>131,072</td><td>17.2 billion</td><td>16,384×</td></tr>
            <tr><td>1,048,576</td><td>1.1 trillion</td><td>1,048,576×</td></tr>
          </tbody>
        </table>
        <p>
          Length grew 1,024-fold from the first row to the last. Work grew 1,024² = 1,048,576-fold.
        </p>
        <p>
          <strong>The window.</strong> The lab's window holds 800 tokens. Turns 1 to 4 are 150 + 220 + 120 + 260 = 750
          tokens. Turn 5 is 180, and 750 + 180 = 930 does not fit. Dropping turn 1 leaves 930 − 150 = 780, which does.
        </p>
        <p>
          <strong>The cache.</strong> With 1,000 tokens in context, generating the next token with a KV cache takes 1,000
          comparisons per head: the newest token's query against 1,000 keys. Recomputing the full grid would take
          1,000² = 1,000,000.
        </p>
        <Code>{`
def fit(turns, window):              # the application does this, not the model
    while sum(len(t) for t in turns) > window:
        turns = turns[1:]            # drop the oldest turn
    return turns

reply = model(fit(history + [new_message], window))   # full history, every call
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Where the cost goes</h3>
        <p>
          For <M>{'n'}</M> tokens of width <M>{'d'}</M>, one attention layer costs on the order of{' '}
          <M>{'n^2 d'}</M> operations, and the feed-forward layer costs on the order of <M>{'n d^2'}</M>. For short
          inputs the feed-forward term is the larger one. Attention takes over once <M>{'n'}</M> is a few times larger than{' '}
          <M>{'d'}</M>, and from there the quadratic term decides everything.
        </p>
        <h3>What the KV cache does and does not save</h3>
        <p>
          A causal model's earlier tokens never look at later ones, so their keys and values do not change when a token
          is appended. Caching them makes step <M>{'n'}</M> cost <M>{'n'}</M> comparisons. Generating a whole sequence
          still adds up to <M>{String.raw`1 + 2 + \dots + n = n(n+1)/2`}</M>, the lower triangle you saw under the
          causal mask. The cache also has to be stored: one key and one value per token, per head, per layer, so its
          memory grows in step with the context.
        </p>
        <h3>Stateless calls add up</h3>
        <p>
          If every turn adds 500 tokens and the application resends everything, call 1 processes 500 tokens, call 2
          processes 1,000, and call 20 processes 10,000. The 20 calls together process 500 × (1 + 2 + … + 20) = 105,000
          tokens to exchange 10,000 tokens of conversation. Long chats cost more per message than short ones.
        </p>
        <h3>Staying inside the window</h3>
        <p>
          Applications choose a policy. <em>Truncation</em> drops the oldest turns, usually keeping the system
          instructions pinned. <em>Summarisation</em> replaces old turns with a shorter model-written summary, trading
          detail for room. <em>Retrieval</em> stores old material outside the window and puts back only the pieces that
          look relevant to the current question. All three are done by the application, before the model sees anything.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Overflow is silent',
      body: 'When history is truncated, the model gets no notice that anything is missing. It answers from what it has. Instructions given early in a long conversation can stop being followed for no visible reason.',
    },
    {
      title: 'Output shares the window',
      body: 'A prompt that nearly fills the window leaves almost no room for the answer. Generation stops when the slots run out, often in the middle of a sentence, unless the application rejects the request or caps the output first.',
    },
    {
      title: 'Bigger windows cost the square',
      body: 'Going from 8,192 to 131,072 tokens is 16 times the length and 256 times the attention work per layer. Long prompts are slower and more expensive even when most of the text is irrelevant to the question.',
    },
    {
      title: 'Summaries lose what they leave out',
      body: 'A summary is written before anyone knows what the next question will be. Any detail it drops cannot be recovered later, and errors in the summary are treated as fact from then on.',
    },
  ],
  questions: [
    {
      id: 'cw-1', kind: 'mcq', level: 1,
      prompt: 'What is a model’s context window?',
      options: [
        { text: 'The most tokens it can attend over at once, prompt plus output', correct: true, why: 'It is a limit on sequence length. Everything the model reads and everything it writes in one call has to fit inside it.' },
        { text: 'The amount of training text it can remember facts from', why: 'What a model learned in training lives in its weights. The window is about the text supplied in a single call.' },
        { text: 'The number of past conversations it keeps stored for a user', why: 'The model stores no conversations. Any history it sees was resent by the application inside the current call.' },
        { text: 'The maximum number of tokens it can generate in one reply', why: 'That is an output limit. The window covers the prompt as well, and the two share the same slots.' },
      ],
    },
    {
      id: 'cw-2', kind: 'mcq', level: 1,
      prompt: 'Why does attention cost grow with the square of the sequence length?',
      options: [
        { text: 'Every token computes a score against every token, so n tokens need n × n scores', correct: true, why: 'n rows, each with n entries. Doubling n doubles both, which gives four times as many scores.' },
        { text: 'Each token’s vector gets twice as wide whenever the length doubles', why: 'Vector width is fixed by the model design. It does not change with the length of the input.' },
        { text: 'Longer inputs need proportionally more layers to process them', why: 'The number of layers is fixed. Every input passes through the same stack.' },
        { text: 'The softmax becomes slower to compute as probabilities get smaller', why: 'A softmax over n scores costs n operations. The square comes from running one for each of n tokens.' },
      ],
    },
    {
      id: 'cw-3', kind: 'num', level: 2,
      prompt: 'A prompt has 3,000 tokens and no mask. How many million comparisons does one attention head make in one layer?',
      answer: 9, tol: 0.05, unit: 'million',
      why: <>3,000 × 3,000 = 9,000,000, which is <strong>9 million</strong>. A 1,000-token prompt needs 1 million, so tripling the length cost 9 times as much.</>,
      hint: 'Every token against every token.',
    },
    {
      id: 'cw-4', kind: 'num', level: 2,
      prompt: 'A model has an 8,000-token context window. Your prompt uses 6,500 tokens. What is the longest reply, in tokens, it can generate?',
      answer: 1500, tol: 0, unit: 'tokens',
      why: <>Prompt and output share the window. 8,000 − 6,500 = <strong>1,500</strong> tokens are left for the reply.</>,
      hint: 'Input and output draw on the same budget.',
    },
    {
      id: 'cw-5', kind: 'mcq', level: 2,
      prompt: 'A chat app has an 800-token window and drops the oldest whole turns when history does not fit. The turns so far are 300, 200, 400 and 250 tokens. Which turns does the model receive?',
      options: [
        { text: 'Turns 3 and 4, which total 650 tokens', correct: true, why: 'All four total 1,150. Dropping turn 1 leaves 850, still too many. Dropping turn 2 as well leaves 650, which fits.' },
        { text: 'Turns 2, 3 and 4, which total 850 tokens', why: '850 is still over the 800-token limit, so one more turn has to go.' },
        { text: 'Turns 1 and 2 and part of turn 3, filling all 800 tokens', why: 'That keeps the oldest text and cuts the newest, including the question just asked. This policy drops from the old end.' },
        { text: 'All four turns, with the model skimming the oldest one', why: 'There is no skimming. Tokens beyond the window cannot be given to the model at all.' },
      ],
      hint: 'Add up the turns, then remove from the oldest end until the total fits.',
    },
    {
      id: 'cw-6', kind: 'num', level: 2,
      prompt: 'Under a causal mask, each token attends to itself and every earlier token. How many comparisons does a 10-token sequence need?',
      answer: 55, tol: 0,
      why: <>Token 1 makes 1 comparison, token 2 makes 2, up to token 10 with 10. 1 + 2 + … + 10 = 10 × 11 ÷ 2 = <strong>55</strong>, a little over half of the full 100.</>,
      hint: 'Count row by row: the first token sees 1 token, the second sees 2.',
    },
    {
      id: 'cw-7', kind: 'mcq', level: 3,
      prompt: 'A model is generating text with a KV cache and has 4,000 tokens in context. What does producing the next token cost in attention, and why?',
      options: [
        { text: 'About 4,000 comparisons per head: one new row against cached keys', correct: true, why: 'Earlier tokens never look at later ones, so their keys and values are reused. Only one new query is scored against them.' },
        { text: 'About 16 million comparisons per head: the full grid is rebuilt for each token', why: 'That is the cost without a cache. The cache exists to avoid recomputing rows that cannot have changed.' },
        { text: 'One comparison per head: the cache already holds the answer', why: 'The cache holds keys and values, not results. The new token still has to score itself against every one of them.' },
        { text: 'Nothing: cached tokens make later generation free of attention cost', why: 'The new token is not in the cache until it has been processed. Its own row always has to be computed.' },
      ],
      hint: 'Which rows of the grid can change when one token is appended at the end?',
    },
    {
      id: 'cw-8', kind: 'num', level: 3,
      prompt: 'A chat adds 500 tokens per turn, and the application resends the whole history on every call with nothing cached. How many tokens does the model process in total over the first 4 calls?',
      answer: 5000, tol: 0, unit: 'tokens',
      why: <>The calls carry 500, 1,000, 1,500 and 2,000 tokens. 500 + 1,000 + 1,500 + 2,000 = <strong>5,000</strong>, to exchange 2,000 tokens of conversation. The model is stateless, so old text is paid for again on every call.</>,
      hint: 'Write down how many tokens each of the four calls contains, then add them.',
    },
    {
      id: 'cw-9', kind: 'mcq', level: 3,
      prompt: 'Early in a long chat a user says “always answer in French”. Fifty turns later the replies switch to English. What is the most likely mechanical cause?',
      options: [
        { text: 'The app truncated the history, so the instruction is no longer sent', correct: true, why: 'The model only knows what is in the current call. Once the turn with the instruction is dropped, nothing tells it to use French.' },
        { text: 'The model’s memory of the instruction decayed over the many turns', why: 'There is no memory to decay. Each call starts from the text it is given and nothing else.' },
        { text: 'The KV cache filled up and the earliest keys were overwritten', why: 'A KV cache is a speed-up for one generation. It does not carry instructions between calls or decide what text is sent.' },
        { text: 'The model was retrained on the conversation and lost the rule', why: 'Chatting does not change the weights. The model is the same on turn 50 as on turn 1.' },
      ],
      hint: 'What decides which text the model sees on turn 50?',
    },
  ],
  takeaways: [
    'The context window is the most tokens a model can attend over at once, and the prompt and the output share it.',
    'Attention compares every pair of tokens, so doubling the length quadruples the compute.',
    'A KV cache makes each newly generated token cost one row of comparisons, not the whole grid.',
    'The model is stateless: the application resends history each call and must cut or compress it when it no longer fits.',
  ],
};

export default lesson;
