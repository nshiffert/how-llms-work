import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, Seg, Slider, Stat, tokHue, useSpring } from '../ui/kit';
import { RARE_INDEX, buildSnapshots, type Snapshot } from './vocabulary-handling.data';

/* ------------------------------------------------------------------ *
 * Lab: one slider for vocabulary size. BPE is trained in the browser
 * on a 243-token toy corpus, one snapshot per merge. Sequence length,
 * token reuse and the "rarely seen" share are measured on that toy
 * corpus. The embedding-table sizes are plain arithmetic at real scale.
 * ------------------------------------------------------------------ */

const START_K = 12;
const REAL_VOCABS = [
  { label: 'bytes only', v: 256 },
  { label: 'GPT-2', v: 50257 },
  { label: 'GPT-4o size', v: 200000 },
];
const WIDTHS = [768, 2048, 4096];

const big = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString('en-US');

/** A small line chart over the snapshots, with the current point marked. */
function Chart({ snaps, k, y, yMax, yFmt, title, color = 'var(--hue)' }: {
  snaps: Snapshot[]; k: number; y: (s: Snapshot) => number; yMax: number; yFmt: (v: number) => string; title: string; color?: string;
}) {
  const W = 360, H = 190, L = 40, R = 14, T = 14, B = 34;
  const v0 = snaps[0].vocab, v1 = snaps[snaps.length - 1].vocab;
  const px = (v: number) => L + ((v - v0) / (v1 - v0)) * (W - L - R);
  const py = (val: number) => T + (1 - val / yMax) * (H - T - B);
  const d = snaps.map((s, i) => `${i ? 'L' : 'M'} ${px(s.vocab).toFixed(1)} ${py(y(s)).toFixed(1)}`).join(' ');
  const cur = snaps[k];
  const cx = px(cur.vocab), cy = py(y(cur));
  const flip = cx > W - 90;
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${yFmt(y(cur))} at vocabulary size ${cur.vocab}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={py(yMax * f)} y2={py(yMax * f)} stroke="var(--line)" strokeDasharray={f ? '3 4' : undefined} />
            <text x={L - 6} y={py(yMax * f) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{yFmt(yMax * f)}</text>
          </g>
        ))}
        <text x={L} y={H - 8} style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{v0}</text>
        <text x={W - R} y={H - 8} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{v1}</text>
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>vocabulary size →</text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.85} strokeLinejoin="round" />
        <line x1={cx} x2={cx} y1={cy} y2={py(0)} stroke={color} strokeOpacity={0.45} strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r={11} fill={color} fillOpacity={0.18} style={{ animation: 'pulse 1.8s ease-in-out infinite' }} />
        <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={color} strokeWidth={2.5} />
        <text x={cx + (flip ? -10 : 10)} y={Math.max(T + 10, cy - 10)} textAnchor={flip ? 'end' : 'start'} style={{ fontSize: 13, fill: '#fff', fontWeight: 700, paintOrder: 'stroke', stroke: 'var(--bg-2)', strokeWidth: 4 }}>
          {yFmt(y(cur))}
        </text>
      </svg>
    </div>
  );
}

function VocabLab({ complete }: LabProps) {
  const data = useMemo(buildSnapshots, []);
  const { snaps } = data;
  const MAX_K = snaps.length - 1;
  const [k, setK] = useState(START_K);
  const [width, setWidth] = useState(768);
  const s = snaps[k];
  const rareShare = s.rare / s.vocab;
  const uses = s.corpusLen / s.vocab;
  const lenSpring = useSpring(s.sampleLen, 0.3);

  useEffect(() => {
    if (k === 0) complete('chars');
    if (s.sample.every((w, i) => i === RARE_INDEX || w.length === 1)) complete('words');
    if (rareShare > 0.5) complete('rare');
    if (k === MAX_K) complete('max');
  }, [k, s, rareShare, MAX_K, complete]);

  return (
    <div className="lab-grid">
      <Slider
        label={<>Vocabulary size <span className="dim">({data.base.length} characters + {k} merges)</span></>}
        value={k} min={0} max={MAX_K} onChange={setK} format={(v) => `${data.base.length + v} tokens`}
      />

      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="eyebrow">one sentence at this vocabulary</div>
          <span className="dim" style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--warn)' }}>■</span> “overcooked” never appears in the training corpus
          </span>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--bg)', padding: '12px 12px 6px', minHeight: 92 }}>
          {s.sample.map((w, wi) => (
            <span
              key={wi}
              style={{
                display: 'inline-flex', flexWrap: 'wrap', gap: 2, margin: '0 9px 6px 0', padding: 2, borderRadius: 9, verticalAlign: 'top',
                outline: wi === RARE_INDEX ? '1px dashed color-mix(in srgb, var(--warn) 70%, transparent)' : 'none',
              }}
            >
              {w.map((sym, si) => {
                const merged = Array.from(sym).length > 1;
                const c = wi === RARE_INDEX ? 'var(--warn)' : tokHue(wi);
                return (
                  <motion.span
                    layout
                    key={`${si}:${sym}`}
                    initial={{ scale: 0.7, opacity: 0.3 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                    className="mono"
                    style={{
                      fontSize: 14.5, padding: '3px 6px', borderRadius: 7, whiteSpace: 'pre', color: '#fff', lineHeight: 1.3,
                      border: `1px solid color-mix(in srgb, ${c} ${merged ? 60 : 30}%, transparent)`,
                      background: `color-mix(in srgb, ${c} ${merged ? 22 : 7}%, transparent)`,
                    }}
                  >
                    {sym}
                  </motion.span>
                );
              })}
            </span>
          ))}
        </div>
        <div className="dim mono" style={{ fontSize: 12, marginTop: 6, minHeight: 18 }}>
          {s.merge
            ? <>merge #{k}: {s.merge[0]} + {s.merge[1]} → {s.merge[0] + s.merge[1]} · this pair occurred {s.mergeCount}× in the corpus</>
            : <>no merges: every character is its own token · “·” is a space</>}
        </div>
      </div>

      <div className="row">
        <Stat label="tokens in the sentence" value={Math.round(lenSpring)} hot />
        <Stat label="vocabulary size" value={s.vocab} />
        <Stat label="avg. times each entry is seen" value={uses.toFixed(1)} />
        <Stat label="entries seen 0 to 2 times" value={(rareShare * 100).toFixed(0) + '%'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Chart snaps={snaps} k={k} y={(x) => x.sampleLen} yMax={40} yFmt={(v) => v.toFixed(0)} title="sentence length, in tokens" />
        <Chart
          snaps={snaps} k={k} y={(x) => x.rare / x.vocab} yMax={1} yFmt={(v) => (v * 100).toFixed(0) + '%'}
          title="entries seen 0 to 2 times" color="var(--warn)"
        />
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        Measured on the toy corpus: {data.corpusWords} words and punctuation marks, {data.corpusChars.toLocaleString('en-US')} characters. Trained live in your browser.
        {' '}Right now {s.dead} of {s.vocab} entries are never used at all: leftover pieces swallowed by a later merge.
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '2px 0', width: '100%' }} />

      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="eyebrow">embedding table = vocabulary × width</div>
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>Width</span>
            <Seg value={width} onChange={setWidth} options={WIDTHS.map((w) => ({ value: w, label: w.toLocaleString('en-US') }))} />
          </div>
        </div>
        <Bars
          items={[
            { label: `this toy: ${s.vocab}`, value: s.vocab * width, color: 'var(--fg-3)' },
            ...REAL_VOCABS.map((r) => ({ label: `${r.label}: ${r.v.toLocaleString('en-US')}`, value: r.v * width })),
          ]}
          max={200000 * 4096}
          format={big}
          labelWidth={172}
        />
        <div className="dim" style={{ fontSize: 12.5, marginTop: 8 }}>
          Arithmetic, not measurement: one row per vocabulary entry, {width.toLocaleString('en-US')} numbers per row. This toy
          vocabulary would need {s.vocab} × {width.toLocaleString('en-US')} = {(s.vocab * width).toLocaleString('en-US')} numbers.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'vocabulary-handling',
  hook: {
    prompt: (
      <>
        A team wants shorter inputs, so they grow their tokenizer’s vocabulary from 50,000 tokens to 5 million. Now
        almost every word and common phrase is a single token. What is the main thing that goes wrong?
      </>
    ),
    options: [
      {
        text: 'Most new tokens are too rare to be learned, and the table grows 100 times',
        correct: true,
        why: 'Every token owns a row of numbers that is only adjusted when that token appears in training. Word frequencies have a long tail, so most of 5 million tokens would be seen too rarely to move far and stay close to their random start, while the table grows 100×.',
      },
      {
        text: 'Sequences get longer, because the tokenizer has more tokens to choose between',
        why: 'The opposite. A larger vocabulary contains longer pieces, so the same text needs fewer tokens. Sequence length is the one thing that improves.',
      },
      {
        text: 'Token ids above 65,535 no longer fit in the integers the model uses',
        why: 'An id is an ordinary integer index and 5 million fits easily. The cost is in the rows the ids point at, not in the ids.',
      },
      {
        text: 'Nothing important: a bigger vocabulary is strictly better, only slower to build',
        why: 'The vocabulary is not free. Every entry is a row of parameters at the input and a score to compute at the output, and a row needs many examples to be learned.',
      },
    ],
    reveal: 'Next you will move one slider from a 24-character vocabulary to a word-level one and watch both costs change.',
  },
  Lab: VocabLab,
  missions: [
    {
      id: 'chars',
      text: 'Drag the vocabulary all the way down to 24 tokens: characters only.',
      insight:
        'The 7-word sentence is now 40 tokens. The table is tiny and well fed: each of the 24 entries is seen about 49 times on average even in this small corpus. The cost is length. Every token is a position the model has to process and attend over.',
    },
    {
      id: 'words',
      text: 'Raise the vocabulary until every word of the sentence except “overcooked” is a single token.',
      insight:
        'That happens at 59 tokens: 35 merges cut the sentence from 40 tokens to 13. The six familiar words take one token each. “overcooked” was never in the corpus, so it shatters into 7 pieces: · o v er c ook ed. A rare word costs more positions than a common one.',
    },
    {
      id: 'rare',
      text: 'Keep raising it until more than half of the vocabulary is seen at most twice in the corpus.',
      insight:
        'That is at 89 tokens. The sentence has been stuck at 13 tokens since vocabulary size 59, so the last 30 entries bought it nothing. Of the 46 entries seen at most twice, 29 are leftover pieces that are no longer used at all and 17 are seen once or twice. Later merges always cover rarer strings: that is the order BPE learns them in.',
    },
    {
      id: 'max',
      text: 'Push the slider to the maximum, where every word of the corpus is its own token.',
      insight:
        'At 158 tokens, 85% of the entries are seen at most twice. Most of those, 109, are never used at all: they are leftover pieces such as ·wai, swallowed when ·waiter was merged, and they still own a row. Of the 49 entries still in use, 26 are seen only once or twice. A row adjusted once or twice is still mostly random. And “overcooked” still splits into 6 pieces: a word-level vocabulary does not help with words it has never met.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          The vocabulary size is a number someone chooses before the tokenizer is built: how many merges to run.
        </p>
        <ul>
          <li>
            <strong>Small vocabulary:</strong> short pieces, so long sequences. The table of token vectors is small and
            every entry is seen often.
          </li>
          <li>
            <strong>Large vocabulary:</strong> long pieces, so short sequences. The table is large, and most of the added
            entries are seen too rarely to be learned, or never.
          </li>
        </ul>
        <p>
          The table is the <em>embedding table</em>: one row of numbers per entry, as wide as the model. Its size is
          vocabulary × width.
        </p>
        <Callout>
          The gains shrink and the costs do not. In the lab, the first 35 merges cut the sentence from 40 tokens to 13.
          The next 99 cut it from 13 to 12.
        </Callout>
        <p>
          Real tokenizers settle between about 30,000 and 260,000 entries: common words are one token, rare words split
          into a few reusable pieces.
        </p>
        <p>
          <em>Special tokens</em> are reserved ids that mark structure, such as end of text. The system inserts them;
          merging never produces them.
        </p>
        <p>
          After training, row <em>i</em> means whatever token <em>i</em> meant in training. Tokenizer and model are a
          matched pair.
        </p>
      </>
    ),
    worked: (
      <>
        <p>Four stops on the slider, measured on the toy corpus (1,165 characters):</p>
        <table>
          <thead>
            <tr><th>vocabulary</th><th>sentence</th><th>corpus</th><th>corpus ÷ vocabulary</th><th>seen 0 to 2 times</th></tr>
          </thead>
          <tbody>
            <tr><td>24</td><td>40 tokens</td><td>1,165</td><td>48.5</td><td>3 of 24 (13%)</td></tr>
            <tr><td>59</td><td>13 tokens</td><td>492</td><td>8.3</td><td>12 of 59 (20%)</td></tr>
            <tr><td>89</td><td>13 tokens</td><td>366</td><td>4.1</td><td>46 of 89 (52%)</td></tr>
            <tr><td>158</td><td>12 tokens</td><td>243</td><td>1.5</td><td>135 of 158 (85%)</td></tr>
          </tbody>
        </table>
        <p>
          “Corpus ÷ vocabulary” is how many times the average entry appears: 1,165 ÷ 24 = 48.5 at character level, 243 ÷
          158 = 1.5 at word level. That is the number of chances training gets to adjust the average row.
        </p>
        <p>Now the table size at real scale. This is arithmetic, not a measurement from the toy:</p>
        <ul>
          <li>GPT-2 small: 50,257 entries × 768 wide = 38,597,376 numbers. The whole model has about 124 million parameters, so the table is about 31% of it.</li>
          <li>A 200,000-entry vocabulary at width 4,096: 200,000 × 4,096 = 819,200,000 numbers.</li>
          <li>Adding 3 new tokens to GPT-2 small adds 3 × 768 = 2,304 numbers, all untrained.</li>
        </ul>
        <Code>{`
table = Embedding(vocab_size, width)      # vocab_size x width numbers
tokenizer.add_tokens(["<patient_id>"])    # vocabulary grows by 1
model.resize_token_embeddings(len(tokenizer))
# the new row is freshly initialized: it means nothing until trained
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Special tokens</h3>
        <p>
          Some vocabulary entries are not text at all. They are reserved ids that mark structure: end of text, padding,
          the start of a user or assistant message in a chat. GPT-2 has one, <code>&lt;|endoftext|&gt;</code>, id 50256.
          They are never produced by merging ordinary text, so typing the characters of a special token should not create
          one. A model stops generating when it emits the end token, and learns that only because the token ended every
          training example.
        </p>
        <h3>Why you cannot change the tokenizer afterwards</h3>
        <p>
          The model knows tokens only by id. If a new tokenizer assigns id 9059 to a different string, the model still
          looks up row 9059 and gets the vector trained for the old string. Every input becomes scrambled. A new
          tokenizer means new embedding rows, trained again, and in practice the rest of the network with them.
        </p>
        <h3>Adding tokens when fine-tuning</h3>
        <p>
          You can append entries: the table gains rows and the output layer gains matching scores. The new rows start
          untrained, either random or copied from an average of existing rows. They become useful only if the fine-tuning
          data contains each new token many times. With few examples it is usually better to leave the word split into
          pieces the model already knows.
        </p>
        <h3>The long tail</h3>
        <p>
          Word frequency in natural text falls off steeply: a few strings are extremely common and most are rare. BPE
          merges in frequency order, so each additional entry covers a rarer string than the one before. That is why the
          “seen 0 to 2 times” curve in the lab keeps climbing. In this toy most of them are leftovers (109 of the 135 at the maximum): a
          piece such as <code>·wai</code> stops being used once <code>·waiter</code> exists, but keeps its row. Real
          tokenizers stop long before this point, so far fewer of their rows are dead.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Too small: sequences explode',
      body: 'A character-level vocabulary made the lab sentence 40 tokens instead of 13. Attention compares every token with every other, so 3 times the tokens is about 9 times that work, and a fixed context window holds a third as much text.',
    },
    {
      title: 'Too large: rows that never train',
      body: 'A row is only adjusted when its token appears. At word level in the lab, 109 of 158 rows were never used and 26 of the 49 used rows were seen at most twice. Those rows stay near their random start, and the model behaves erratically on exactly the words they stand for.',
    },
    {
      title: 'The table and the output layer both scale with it',
      body: 'Vocabulary × width at the input: 819 million numbers for 200,000 × 4,096. At the output the model computes one score per vocabulary entry for every token it generates, so a larger vocabulary also makes each step dearer.',
    },
    {
      title: 'New tokens start knowing nothing',
      body: 'A token added for fine-tuning gets an untrained row. With a few dozen examples it will not catch up with rows that saw billions of tokens of training, and the model can do worse on that term than before you added it.',
    },
  ],
  questions: [
    {
      id: 'voc-1', kind: 'mcq', level: 1,
      prompt: 'You retrain a tokenizer with a larger vocabulary. What happens to the same piece of text?',
      options: [
        { text: 'It becomes fewer tokens, and the embedding table gains rows', correct: true, why: 'More merges mean longer pieces, so fewer tokens per text. Each new entry adds one row of width numbers to the table.' },
        { text: 'It becomes more tokens, because there are more to pick from', why: 'More entries means longer pieces are available, which shortens the sequence.' },
        { text: 'It stays the same length, and only the ids change', why: 'The added entries are merged pairs. Wherever such a pair occurs, two tokens become one.' },
        { text: 'It becomes fewer tokens, and the embedding table shrinks', why: 'The table has one row per vocabulary entry. More entries can only make it larger.' },
      ],
    },
    {
      id: 'voc-2', kind: 'mcq', level: 1,
      prompt: 'What is a special token?',
      options: [
        { text: 'A reserved entry that marks structure, such as end of text', correct: true, why: 'Special tokens get ids and rows like any other entry, but they stand for structure and are inserted by the system, not produced by merges.' },
        { text: 'A token for a rare word that has to be spelled from bytes', why: 'That is ordinary tokenization. A rare word is built from normal entries.' },
        { text: 'A token with a larger vector than the others, for important words', why: 'Every row of the table has the same width. Special tokens differ in what they mean, not in size.' },
        { text: 'The most frequent token, which is stored first in the vocabulary', why: 'Frequency has nothing to do with it. Special tokens are added by hand, outside the merge process.' },
      ],
    },
    {
      id: 'voc-3', kind: 'num', level: 2,
      prompt: 'A model has a vocabulary of 32,000 tokens and a width of 4,096. How many numbers are in its embedding table, in millions?',
      answer: 131.07, tol: 0.6, unit: 'million',
      why: <>One row per token, 4,096 numbers per row: 32,000 × 4,096 = 131,072,000, or about <strong>131 million</strong>.</>,
      hint: 'Rows × numbers per row.',
    },
    {
      id: 'voc-4', kind: 'num', level: 2,
      prompt: 'A 1,200-token corpus is tokenized with a 60-entry vocabulary. On average, how many times does each vocabulary entry appear?',
      answer: 20, tol: 0.1,
      why: <>1,200 ÷ 60 = <strong>20</strong>. That is the average number of chances training has to adjust each row. Grow the vocabulary to 600 and the corpus gets shorter while the average falls below 2.</>,
      hint: 'Total token occurrences divided by the number of entries.',
    },
    {
      id: 'voc-5', kind: 'mcq', level: 2,
      prompt: 'In the lab, the sentence stayed at 13 tokens while the vocabulary grew from 59 to 89. What were those 30 extra merges doing?',
      options: [
        { text: 'Joining pieces of rarer words that are not in this sentence', correct: true, why: 'BPE merges in frequency order. Once the common words are whole, later merges cover rarer strings: more rows, few examples each, no gain for common text.' },
        { text: 'Nothing: BPE stops having an effect once common words are whole', why: 'The corpus kept shrinking, from 492 tokens to 366. The merges were real; they just applied to other words.' },
        { text: 'Splitting “overcooked” into smaller and smaller pieces', why: 'Merges only join. “overcooked” stayed in 7 pieces because no merge matched it.' },
        { text: 'Re-learning the common words to make their rows more accurate', why: 'The tokenizer holds no vectors and learns nothing about meaning. It only joins frequent pairs.' },
      ],
      hint: 'In what order does BPE learn its merges?',
    },
    {
      id: 'voc-6', kind: 'mcq', level: 3,
      prompt: 'After training, you replace a model’s tokenizer with a different one of the same vocabulary size and change nothing else. What happens?',
      options: [
        { text: 'Each id now selects a row trained for a different string', correct: true, why: 'The model knows tokens only by id. Same-sized tables do not help: row i still holds the meaning of the old token i.' },
        { text: 'It works, because the vocabulary size and table shape are unchanged', why: 'The shape fits, so nothing crashes. The contents are wrong: the rows belong to the old id assignment.' },
        { text: 'It works but is slower, since the model must convert ids', why: 'There is no conversion step. An id is used directly as a row index.' },
        { text: 'Only rare words are affected, since common words keep their ids', why: 'Nothing ties ids across tokenizers. A common word in one can be any id, or several tokens, in the other.' },
      ],
      hint: 'What does the model do with an id, and what did training put there?',
    },
    {
      id: 'voc-7', kind: 'mcq', level: 3,
      prompt: 'You add 50 new tokens for product names and fine-tune on 20 examples in total. What should you expect for those names?',
      options: [
        { text: 'Their rows get too few updates and may do worse than the split pieces', correct: true, why: 'A new row carries no information until gradients move it. Even if every example used one new token, 20 examples over 50 tokens is less than one appearance each.' },
        { text: 'The model understands them at once, since each name now has its own token', why: 'A dedicated id is only an empty slot. Meaning comes from training the row, not from having one.' },
        { text: 'The new rows inherit the meaning of the pieces they replace', why: 'Nothing is inherited automatically. Unless you initialize them from the old pieces yourself, the rows start from scratch.' },
        { text: 'Fine-tuning fails, because the table cannot change size after training', why: 'The table can be extended. The problem is what the new rows contain, not whether they can exist.' },
      ],
      hint: 'How many times does each new row get adjusted?',
    },
    {
      id: 'voc-8', kind: 'mcq', level: 3,
      prompt: 'A team switches to a character-level vocabulary of about 100 entries so that no token is ever rare. What do they pay?',
      options: [
        { text: 'Sequences several times longer, so attention does far more work', correct: true, why: 'Every character is a position. Attention work grows with the square of the length, so 4 times the tokens is about 16 times the work.' },
        { text: 'A much larger embedding table, since characters need wide vectors', why: 'The table shrinks to about 100 rows. Width is set by the model, not by the vocabulary.' },
        { text: 'Unknown tokens whenever a new word appears', why: 'Any word can be spelled from characters. Unknown tokens are a word-level problem.' },
        { text: 'Nothing: it is the best choice and only convention prevents it', why: 'The lab sentence went from 13 tokens to 40 at character level. That length is paid in compute and context on every input.' },
      ],
      hint: 'Which side of the trade did the left end of the slider make worse?',
    },
  ],
  takeaways: [
    'Vocabulary size trades sequence length against table size: more entries mean fewer tokens per text and more rows to store and train.',
    'The embedding table has vocabulary × width numbers, and a row is only learned if its token appears often enough in training.',
    'Rare and unseen words split into several pieces, so they cost more positions than common words.',
    'A trained model is tied to its tokenizer by id, and any token added later starts with an untrained row.',
  ],
};

export default lesson;
