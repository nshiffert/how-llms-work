import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, Seg, Slider, Stat, mulberry32 } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: one 8-token sentence, two training games.
 * The grid is the real attention mask: cell (row i, column j) is lit
 * when position i is allowed to read position j. Autoregressive uses
 * the lower triangle (j ≤ i). Masked uses the full square and hides
 * the words the learner clicks. There is no trained model in the lab:
 * it shows what each model is allowed to see and what it is graded on,
 * not what it would answer.
 * ------------------------------------------------------------------ */

const TOK = ['The', 'dog', 'chased', 'the', 'ball', 'across', 'the', 'yard'];
const N = TOK.length;
const PROMPT_LEN = 3;
type Mode = 'ar' | 'mlm';

const quote = (xs: string[]) => (xs.length ? '“' + xs.join(' ') + '”' : 'nothing');

function MaskGrid(props: { mode: Mode; step: number; masked: ReadonlySet<number>; focus: number | null; onRow: (i: number) => void }) {
  const { mode, step, masked, focus, onRow } = props;
  const L = 74, T = 58, C = 30, RW = 88;
  const W = L + N * C + RW;
  const H = T + N * C + 8;
  const activeRow = mode === 'ar' ? step - 1 : focus;
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 440, margin: '0 auto' }} role="img"
      aria-label={mode === 'ar' ? 'Causal attention mask: lower triangle allowed' : 'Full attention mask: every cell allowed'}>
      <defs>
        <pattern id="arm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--panel-2)" />
          <rect width="3" height="6" fill="var(--hue)" fillOpacity="0.55" />
        </pattern>
      </defs>
      {TOK.map((t, j) => (
        <text key={'c' + j} x={L + j * C + C / 2 + 4} y={T - 8} transform={`rotate(-50 ${L + j * C + C / 2 + 4} ${T - 8})`}
          style={{ fontSize: 11.5, fill: mode === 'mlm' && masked.has(j) ? 'var(--hue)' : 'var(--fg-2)' }}>
          {mode === 'mlm' && masked.has(j) ? '[MASK]' : t}
        </text>
      ))}
      {TOK.map((t, i) => {
        const rowOn = mode === 'ar' ? i === activeRow : masked.has(i);
        const y = T + i * C;
        const right =
          mode === 'ar' ? (i < N - 1 ? '→ ' + TOK[i + 1] : 'no label') : masked.has(i) ? '→ ' + TOK[i] : 'no loss';
        const rightOn = mode === 'ar' ? i === activeRow && i < N - 1 : masked.has(i);
        return (
          <g key={'r' + i} onClick={() => onRow(i)} style={{ cursor: 'pointer' }}>
            <text x={L - 8} y={y + C / 2 + 4} textAnchor="end"
              style={{ fontSize: 12, fill: rowOn || i === activeRow ? 'var(--hue)' : 'var(--fg-2)', fontWeight: rowOn ? 700 : 500 }}>
              {mode === 'mlm' && masked.has(i) ? '[MASK]' : t}
            </text>
            {TOK.map((_, j) => {
              const allowed = mode === 'mlm' || j <= i;
              const hiddenWord = mode === 'mlm' && masked.has(j);
              return (
                <rect key={j} x={L + j * C + 2} y={y + 2} width={C - 4} height={C - 4} rx={6}
                  fill={!allowed ? 'var(--panel-2)' : hiddenWord ? 'url(#arm-hatch)' : 'var(--hue)'}
                  fillOpacity={!allowed ? 0.55 : rowOn ? 1 : mode === 'ar' ? 0.32 : 0.22}
                  stroke={allowed ? 'none' : 'var(--line)'}
                  style={{ transition: 'fill-opacity .35s cubic-bezier(.22,1,.36,1)' }}
                />
              );
            })}
            {i === activeRow && (
              <rect x={L} y={y} width={N * C} height={C} rx={8} fill="none" stroke="var(--hue)" strokeWidth={1.5}
                style={{ animation: 'pulse 1.6s ease-in-out infinite' }} />
            )}
            <text x={L + N * C + 8} y={y + C / 2 + 4}
              style={{ fontSize: 11.5, fill: rightOn ? 'var(--hue)' : 'var(--fg-3)', fontWeight: rightOn ? 700 : 400 }}>
              {right}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Small growing triangle used by the generation demo. */
function MiniMask({ n, full }: { n: number; full: boolean }) {
  const c = 9;
  return (
    <svg className="viz" viewBox={`0 0 ${N * c} ${N * c}`} style={{ width: 96, flex: 'none' }} aria-hidden>
      {Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (
          <rect key={i + '-' + j} x={j * c + 1} y={i * c + 1} width={c - 2} height={c - 2} rx={2}
            fill={full || j <= i ? 'var(--hue)' : 'var(--panel-2)'} fillOpacity={full || j <= i ? (i === n - 1 ? 1 : 0.35) : 0.7} />
        )),
      )}
    </svg>
  );
}

function chipStyle(kind: 'lit' | 'target' | 'dim' | 'mask' | 'plain'): CSSProperties {
  const base: CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 14, padding: '5px 9px', borderRadius: 8, border: '1px solid var(--line-2)',
    background: 'var(--panel-2)', color: 'var(--fg)', transition: 'all .3s cubic-bezier(.22,1,.36,1)', whiteSpace: 'pre',
  };
  if (kind === 'lit') return { ...base, background: 'color-mix(in srgb, var(--hue) 22%, transparent)', borderColor: 'var(--hue-line)' };
  if (kind === 'target') return { ...base, background: 'transparent', border: '1.5px dashed var(--hue)', color: 'var(--hue)', animation: 'pulse 1.4s ease-in-out infinite' };
  if (kind === 'mask') return { ...base, background: 'var(--hue)', borderColor: 'var(--hue)', color: '#05060a', fontWeight: 700 };
  if (kind === 'dim') return { ...base, opacity: 0.32 };
  return base;
}

function ArMlmLab({ complete }: LabProps) {
  const [mode, setMode] = useState<Mode>('ar');
  const [step, setStep] = useState(1); // AR: reads tokens 1..step, predicts token step+1
  const [playing, setPlaying] = useState(false);
  const [masked, setMasked] = useState<ReadonlySet<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [arGen, setArGen] = useState(PROMPT_LEN);
  const [arRun, setArRun] = useState(false);
  const [mlmGen, setMlmGen] = useState<0 | 1 | 2>(0);
  const seed = useRef(7);

  useEffect(() => {
    if (mode === 'ar' && step === N - 1) complete('step');
    if (mode === 'mlm' && [...masked].some((i) => i >= 1 && i <= N - 2)) complete('middle');
    if (mode === 'mlm' && masked.size >= N - 1) complete('signal');
    if (mode === 'mlm' && mlmGen >= 1) complete('gen');
  }, [mode, step, masked, mlmGen, complete]);

  useEffect(() => {
    if (!playing) return;
    if (step >= N - 1) { setPlaying(false); return; }
    const id = setTimeout(() => { sfx.tick(step / N); setStep((s) => s + 1); }, 750);
    return () => clearTimeout(id);
  }, [playing, step]);

  useEffect(() => {
    if (!arRun) return;
    if (arGen >= N) { setArRun(false); return; }
    const id = setTimeout(() => { sfx.tick(arGen / N); setArGen((g) => g + 1); }, 700);
    return () => clearTimeout(id);
  }, [arRun, arGen]);

  const toggleMask = (i: number) => {
    sfx.tap();
    const next = new Set(masked);
    if (next.has(i)) { next.delete(i); setFocus(next.size ? [...next][next.size - 1] : null); }
    else { next.add(i); setFocus(i); }
    setMasked(next);
  };
  const random15 = () => {
    sfx.tap();
    const r = mulberry32(seed.current++);
    const k = Math.max(1, Math.round(0.15 * N)); // 15% of 8 rounds to 1
    const picks = new Set<number>();
    while (picks.size < k) picks.add(Math.floor(r() * N));
    setMasked(picks);
    setFocus([...picks][0]);
  };

  const signals = mode === 'ar' ? N - 1 : masked.size;
  const visibleWords = mode === 'ar' ? step : N - masked.size;

  let story: ReactNode;
  if (mode === 'ar') {
    story = (
      <>
        <strong>Row {step}.</strong> At “{TOK[step - 1]}” the model can read {quote(TOK.slice(0, step))} and is graded on predicting{' '}
        <strong style={{ color: 'var(--hue)' }}>“{TOK[step]}”</strong>.{' '}
        {step < N - 1 ? <>It cannot read {quote(TOK.slice(step + 1))}, or the answer itself.</> : <>Only the answer itself is hidden.</>}
      </>
    );
  } else if (focus === null || !masked.has(focus)) {
    story = <>Nothing is hidden, so nothing is graded. Click a word in the sentence to replace it with <span className="mono">[MASK]</span>.</>;
  } else {
    const left = TOK.slice(0, focus).map((t, i) => (masked.has(i) ? '[MASK]' : t));
    const right = TOK.slice(focus + 1).map((t, i) => (masked.has(focus + 1 + i) ? '[MASK]' : t));
    const ctx = N - masked.size;
    story = (
      <>
        <strong>Slot {focus + 1} is hidden.</strong> To recover <strong style={{ color: 'var(--hue)' }}>“{TOK[focus]}”</strong> the model reads{' '}
        {quote(left)} on the left and {quote(right)} on the right.{' '}
        {ctx <= 1 ? <>Only {ctx} real word{ctx === 1 ? '' : 's'} left to read: almost no evidence.</> : <>{ctx} real words remain as evidence.</>}
      </>
    );
  }

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Seg value={mode} onChange={(m) => { setMode(m); setPlaying(false); }}
          options={[{ value: 'ar', label: 'Autoregressive (GPT-style)' }, { value: 'mlm', label: 'Masked (BERT-style)' }]} />
        {mode === 'ar' ? (
          <button className="btn sm" onClick={() => { sfx.tap(); if (step >= N - 1) setStep(1); setPlaying(!playing); }}>
            {playing ? '❚❚ Pause' : '▶ Step through'}
          </button>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={random15}>Mask 15% at random</button>
            <button className="btn sm" onClick={() => { sfx.tap(); setMasked(new Set()); setFocus(null); }}>Clear</button>
          </div>
        )}
      </div>

      {/* the sentence */}
      <div>
        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>
          {mode === 'ar'
            ? 'Lit = readable at this row. Dashed = the token to predict. Dots mark every token graded in this one pass.'
            : 'Click any word to hide it. Dots mark every token graded in this one pass.'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TOK.map((t, i) => {
            const kind = mode === 'ar' ? (i < step ? 'lit' : i === step ? 'target' : 'dim') : masked.has(i) ? 'mask' : 'lit';
            const graded = mode === 'ar' ? i >= 1 : masked.has(i);
            return (
              <div key={i} style={{ display: 'grid', justifyItems: 'center', gap: 5 }}>
                <button style={chipStyle(kind)} onClick={() => (mode === 'ar' ? (sfx.tap(), setPlaying(false), setStep(Math.min(N - 1, Math.max(1, i)))) : toggleMask(i))}>
                  {mode === 'mlm' && masked.has(i) ? '[MASK]' : mode === 'ar' && i === step ? t + ' ?' : t}
                </button>
                <span style={{
                  width: 8, height: 8, borderRadius: 8, background: graded ? 'var(--hue)' : 'var(--line-2)',
                  boxShadow: graded ? '0 0 10px var(--hue)' : 'none', transition: 'all .3s',
                }} />
              </div>
            );
          })}
        </div>
      </div>

      {mode === 'ar' && (
        <Slider label="Row (how many tokens the model has read)" value={step} min={1} max={N - 1} onChange={(v) => { setPlaying(false); setStep(v); }}
          format={(v) => `${v} of ${N - 1}`} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Attention mask · {mode === 'ar' ? '36 of 64 cells allowed' : '64 of 64 cells allowed'}</div>
          <MaskGrid mode={mode} step={step} masked={masked} focus={focus}
            onRow={(i) => { sfx.tap(); if (mode === 'ar') { setPlaying(false); setStep(Math.min(N - 1, i + 1)); } else if (masked.has(i)) setFocus(i); }} />
          <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
            Row = the position doing the reading. Column = the token it may read. Lit = allowed.
            {mode === 'mlm' ? ' Striped = the slot is readable but its word is replaced by [MASK].' : ' One pass computes all rows at once. The slider only moves the highlight.'}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--hue-line)', background: 'var(--hue-soft)', fontSize: 14.5, lineHeight: 1.55, minHeight: 112 }}>
            {story}
          </div>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <Stat label="graded predictions this pass" value={`${signals} of ${N}`} hot />
            <Stat label={mode === 'ar' ? 'words readable at this row' : 'real words left to read'} value={`${visibleWords} of ${N}`} />
            <Stat label="direction" value={mode === 'ar' ? 'left only' : 'both sides'} />
          </div>
          <div className="dim" style={{ fontSize: 13 }}>
            {mode === 'ar'
              ? 'Every token except the first is a target, and no word had to be removed: the mask hides each answer from the row that predicts it.'
              : masked.size === 0
                ? 'Typical setting: hide about 15% of tokens. In 8 tokens that is 1.'
                : masked.size === N
                  ? `All ${N} hidden: ${N} graded predictions and no real word left to read. Every answer is a blind guess.`
                : masked.size === N - 1
                  ? `${masked.size} graded predictions, the same count as autoregressive, but the model now has ${N - masked.size} word${N - masked.size === 1 ? '' : 's'} to work from.`
                  : `Only hidden slots are graded. The other ${N - masked.size} positions run through the model and contribute no loss.`}
          </div>
        </div>
      </div>

      {/* generation demo */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--panel)', padding: 14, display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="eyebrow">Generate · {mode === 'ar' ? 'autoregressive' : 'masked'}</div>
          {mode === 'ar' ? (
            <button className="btn sm primary" onClick={() => { sfx.tap(); setArGen(PROMPT_LEN); setArRun(true); }}>
              {arGen > PROMPT_LEN && !arRun ? 'Run again' : 'Generate'}
            </button>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm primary" onClick={() => { sfx.tap(); setMlmGen(1); }}>Generate</button>
              {mlmGen >= 1 && <button className="btn sm" onClick={() => { sfx.tap(); setMlmGen(2); }}>Append 3 [MASK] slots</button>}
              {mlmGen >= 1 && <button className="btn sm" onClick={() => { sfx.tap(); setMlmGen(0); }}>Reset</button>}
            </div>
          )}
        </div>

        {mode === 'ar' ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <MiniMask n={arGen} full={false} />
            <div style={{ flex: '1 1 220px', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 34 }}>
                {TOK.slice(0, arGen).map((t, i) => (
                  <motion.span key={i} style={chipStyle(i < PROMPT_LEN ? 'plain' : 'lit')}
                    initial={i < PROMPT_LEN ? false : { opacity: 0, y: -14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                    {t}
                  </motion.span>
                ))}
                {arGen < N && <span style={chipStyle('target')}>?</span>}
              </div>
              <div className="dim" style={{ fontSize: 13 }}>
                {arGen === PROMPT_LEN
                  ? 'Prompt: 3 tokens. Each pass reads everything so far and outputs one more token.'
                  : `Pass ${arGen - PROMPT_LEN}${arGen < N ? '' : ' (done)'}: read ${arGen - 1} tokens, output 1, append it, run again. The mask grows by one row and no earlier row changes.`}{' '}
                Scripted continuation: the lab has no trained model in it.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 34 }}>
              {TOK.map((t, i) => <span key={i} style={chipStyle('plain')}>{t}</span>)}
              {mlmGen === 1 && (
                <motion.span key="ghost" style={{ ...chipStyle('plain'), borderColor: 'var(--bad)', color: 'var(--bad)', borderStyle: 'dashed', background: 'transparent' }}
                  initial={{ x: 0 }} animate={{ x: [0, -7, 7, -5, 5, -2, 0] }} transition={{ duration: 0.55 }}>
                  slot 9 does not exist
                </motion.span>
              )}
              {mlmGen === 2 && [0, 1, 2].map((k) => (
                <motion.span key={'m' + k} style={chipStyle('mask')} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.12 }}>
                  [MASK]
                </motion.span>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 13 }}>
              {mlmGen === 0 && 'The sentence has 8 slots. Ask the masked model for a ninth token.'}
              {mlmGen === 1 && 'A masked model returns one prediction per input slot. Nothing sits after “yard”, so there is no output for a next token. It was trained to fill blanks, never to extend.'}
              {mlmGen === 2 && 'Now there is something to fill, but you had to pick the length (3) in advance, and all three blanks are predicted in the same pass. None of them can see what the others chose.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'autoregressive-vs-masked',
  hook: {
    prompt: (
      <>
        GPT-style models write text. BERT-style models are used for search and classification, not for writing. What is
        the main difference inside them?
      </>
    ),
    options: [
      {
        text: 'Very little: the same transformer block, a different rule for who may read whom, and a different training target',
        correct: true,
        why: 'Both stack the same attention and feed-forward block. One hides every later token and learns to predict the next one. The other lets every token read both ways and learns to fill in hidden words. That one choice decides what each can do.',
      },
      {
        text: 'They use different kinds of layers: one has attention built for writing, the other attention built for reading',
        why: 'The attention arithmetic is identical. The only change is which scores are set to −∞ before the softmax.',
      },
      {
        text: 'BERT-style models are just much smaller, so they lack the capacity to write',
        why: 'Size is not the cause. A masked model of any size has no output for “the token after the end”, so it has nothing to write with.',
      },
      {
        text: 'BERT-style models run two networks, one reading left to right and one right to left, and merge the results',
        why: 'That describes some older systems. A BERT-style model is one network in which every token attends to both sides in every layer.',
      },
    ],
    reveal: 'Next you will switch between the two rules on one sentence and see what each model is allowed to read.',
  },
  Lab: ArMlmLab,
  missions: [
    {
      id: 'step',
      text: 'In autoregressive mode, step through to the last row.',
      insight: 'Each row reads itself and what is to its left, and predicts the token to its right. All 7 rows are computed in one pass, so one 8-token sentence gives 7 graded predictions, and nothing had to be hidden by hand.',
    },
    {
      id: 'middle',
      text: 'Switch to masked mode and hide a word in the middle of the sentence.',
      insight: 'The whole grid is lit: the hidden slot reads the words before it and the words after it. If the hidden word is “ball”, both “chased the” and “across the yard” are evidence. An autoregressive model predicting “ball” would have only “The dog chased the”.',
    },
    {
      id: 'signal',
      text: 'Keep hiding words until masked mode has as many graded predictions as autoregressive mode had.',
      insight: 'You had to hide 7 of 8 words, leaving one word to infer everything from. Hiding more leaves less to read, so BERT hid about 15%: the model learns from roughly 1 token in 7 per pass, where next-token training learns from all of them.',
    },
    {
      id: 'gen',
      text: 'Still in masked mode, press Generate in the panel at the bottom.',
      insight: 'There is no output slot after the last token. You can append blanks, but then you choose the length first and the blanks are filled without seeing each other. Writing text one token at a time is what the autoregressive setup is trained to do.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Both families use the same transformer block. Two settings differ: the <strong>attention mask</strong> (which
          tokens each position may read) and the <strong>training target</strong> (what the model is graded on).
        </p>
        <ul>
          <li>
            <strong>Autoregressive.</strong> A <em>causal mask</em> lets each position read itself and everything to its
            left. Every position is graded on predicting the next token. One pass over 8 tokens gave 7 graded
            predictions. Such models are called <em>decoder-only</em>. GPT is the standard example.
          </li>
          <li>
            <strong>Masked.</strong> No attention mask: every position reads every other. The name comes from the
            training input, where about 15% of the tokens are replaced by a <code>[MASK]</code> token. The model is
            graded only on recovering those. Such models are called <em>encoder-only</em>. BERT is the standard example.
          </li>
        </ul>
        <p>
          The consequences follow from the grid. A causal model can extend text, because predicting the next token is
          its training task. Its vector for a token never includes later words. A masked model builds each token’s vector
          from the whole sentence, which suits classification, search and embeddings, but it has no way to produce a
          token after the end.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Take the lab sentence, 8 tokens: <code>The dog chased the ball across the yard</code>.
        </p>
        <table>
          <thead>
            <tr><th></th><th>autoregressive</th><th>masked (1 token hidden)</th></tr>
          </thead>
          <tbody>
            <tr><td>cells allowed in the 8 × 8 mask</td><td>36 (8 + 7 + … + 1)</td><td>64</td></tr>
            <tr><td>what the model reads when it predicts “ball”</td><td>The dog chased the (4 words; predicted from slot 4)</td><td>all 7 other words (predicted at slot 5, which holds [MASK])</td></tr>
            <tr><td>graded predictions per pass</td><td>7</td><td>1</td></tr>
            <tr><td>input the model sees</td><td>the real sentence</td><td>the sentence with a [MASK] in it</td></tr>
          </tbody>
        </table>
        <p>
          Scale that up to a 512-token sequence. Next-token training grades 511 predictions per pass. Masked training at
          15% grades about 77. Per pass, the autoregressive model gets between six and seven times as many graded
          predictions from the same text.
        </p>
        <Code>{`
# autoregressive: every position predicts the token after it
mask   = tril(ones(n, n))                    # row i reads columns 0..i
logits = model(tokens, mask)
loss   = cross_entropy(logits[:-1], tokens[1:])

# masked: only the hidden positions are graded
hide   = rand(n) < 0.15
logits = model(where(hide, MASK, tokens))    # no attention mask
loss   = cross_entropy(logits[hide], tokens[hide])
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why chat models are autoregressive</h3>
        <p>
          Writing a reply is the training task repeated: read everything so far, output one token, append it, run again.
          The task is the same in training and in use. One thing differs: in training the earlier tokens are always the
          real text, and in use they are whatever the model itself wrote. The causal mask also makes this cheap. Adding a token adds a row to
          the grid and leaves every earlier row unchanged, so the work done for earlier tokens can be cached and reused.
          With a full mask, every token’s vector would change each time the text grew.
        </p>
        <h3>What the causal mask costs</h3>
        <p>
          In “The bank by the river”, the vector at “bank” is computed before “river” is visible, in every layer. It
          cannot settle which kind of bank is meant. Only later positions can, because they see both words. This is why
          a sentence embedding taken from a causal model often comes from the last token: it is the only position
          that has read everything.
        </p>
        <h3>Encoder-decoder models</h3>
        <p>
          The original 2017 transformer, built for translation, used both. An encoder reads the source sentence with
          full two-way attention. A decoder writes the output one token at a time under a causal mask, and at each layer
          also attends to the encoder’s vectors through a second attention step called cross-attention. T5 and BART are
          well-known models of this shape. It fits tasks with a clear input and a separate output. Decoder-only models
          took over general use. One reason is that the input can just be placed in front as a prompt.
        </p>
        <h3>The [MASK] mismatch</h3>
        <p>
          The <code>[MASK]</code> token appears in training and never in real use. BERT softened this: of the 15% of
          positions chosen, 80% became <code>[MASK]</code>, 10% became a random token and 10% were left unchanged, with
          the model graded on all of them.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'A causal model cannot look ahead, even when you want it to',
      body: 'The vector for an early token is built without the rest of the sentence. Tasks that label each word using later context, such as deciding whether “Apple” is a company, get less evidence at that position than a two-way model would have.',
    },
    {
      title: 'A masked model cannot extend text',
      body: 'It has one output per input slot and none for a next token. Appending blanks forces you to choose the length first, and blanks filled in the same pass are chosen independently, so they can contradict each other. Multi-pass schemes exist that fill a few blanks, re-run and repeat, but they still need the length up front and cost several passes.',
    },
    {
      title: 'Masked training wastes most of each pass',
      body: 'Only about 15% of positions are graded. The other 85% cost the same compute and return no loss. Hiding more gives more signal and less context to learn from, which you saw when 7 of 8 words were hidden.',
    },
    {
      title: 'An autoregressive model cannot take a token back',
      body: 'Each token is emitted before anything after it exists, and it stays in the context for good. An early wrong word is read by every later step.',
    },
  ],
  questions: [
    {
      id: 'arm-1', kind: 'mcq', level: 1,
      prompt: 'What separates a GPT-style model from a BERT-style model?',
      options: [
        { text: 'The attention mask and the training target; the transformer block itself is the same', correct: true, why: 'One uses a causal mask and predicts the next token at every position. The other uses no attention mask and recovers hidden tokens. The layers are built the same way.' },
        { text: 'The attention formula; GPT-style models use dot products and BERT-style models do not', why: 'Both use the same query-key dot products and softmax. Only the set of allowed positions differs.' },
        { text: 'The tokenizer; one works on whole words and the other works on sub-word pieces', why: 'Both use sub-word tokens. Tokenization is not what makes one a generator and the other not.' },
        { text: 'The number of layers; BERT-style models stop after the encoder half of each block', why: 'There is no half block. An encoder-only model runs complete blocks with attention and feed-forward layers.' },
      ],
    },
    {
      id: 'arm-2', kind: 'mcq', level: 1,
      prompt: 'In masked training, which positions contribute to the loss?',
      options: [
        { text: 'Only the positions whose tokens were hidden', correct: true, why: 'The model is graded on recovering the hidden tokens. Every other position is processed but produces no loss.' },
        { text: 'Every position, each predicting the token after it', why: 'That is the autoregressive target. With two-way attention, the next token is already visible, so predicting it would teach nothing.' },
        { text: 'Every position, each predicting its own token', why: 'An unhidden token can read itself, so predicting it is trivial. Only hidden positions give a real task.' },
        { text: 'Only the final position, which summarizes the sentence', why: 'There is no special final position in masked training. The graded positions are wherever the masks were placed.' },
      ],
    },
    {
      id: 'arm-3', kind: 'num', level: 2,
      prompt: 'A causal mask over 6 tokens is a 6 × 6 grid. How many cells are allowed (a position may read itself and everything before it)?',
      answer: 21, tol: 0.5,
      why: <>Row 1 reads 1 token, row 2 reads 2, up to row 6 reading 6. 1 + 2 + 3 + 4 + 5 + 6 = <strong>21</strong> of 36 cells.</>,
      hint: 'Count how many tokens each row can read, then add the rows.',
    },
    {
      id: 'arm-4', kind: 'num', level: 2,
      prompt: 'A 400-token sequence is used for masked training with 15% of tokens hidden. How many graded predictions does one pass produce?',
      answer: 60, tol: 1,
      why: <>Only hidden positions are graded: 0.15 × 400 = <strong>60</strong>. Next-token training on the same sequence would grade 399.</>,
      hint: 'Which positions are graded in masked training?',
    },
    {
      id: 'arm-5', kind: 'mcq', level: 2,
      prompt: 'You need one vector per support ticket to sort tickets into 12 categories. No text is generated. Which setup gives each word’s vector the most context?',
      options: [
        { text: 'An encoder-only model: every token’s vector is built from the whole ticket, both sides', correct: true, why: 'With no causal mask, each position reads all the others in every layer, so the vectors reflect the full text. That suits classification and embeddings.' },
        { text: 'A decoder-only model: later tokens are hidden, which keeps each vector focused', why: 'Hiding later tokens removes evidence. An early token’s vector in a causal model knows nothing about the rest of the ticket.' },
        { text: 'Either one: after enough layers a causal model’s early tokens have seen the whole text', why: 'The causal mask applies in every layer. Stacking layers never lets information flow from right to left.' },
        { text: 'Neither: a vector per text needs an encoder-decoder with cross-attention', why: 'Cross-attention connects an input to a separately generated output. Nothing is generated here, so an encoder alone is enough.' },
      ],
      hint: 'Check the mask grid for each family and ask what the first token can read.',
    },
    {
      id: 'arm-6', kind: 'mcq', level: 3,
      prompt: 'A 24-layer causal model reads “The bank by the river flooded.” In the top layer, what does the vector at “bank” know about “river”?',
      options: [
        { text: 'Nothing. “river” comes later, and the causal mask blocks it at “bank” in all 24 layers', correct: true, why: 'Information only moves from earlier positions to later ones, in every layer. The vector at “bank” is a function of “The bank” alone. Later positions, such as “river” itself, can combine the two.' },
        { text: 'Everything. By the top layer, attention has passed information in both directions', why: 'Each layer applies the same causal mask. No number of layers creates a path from a later token to an earlier one.' },
        { text: 'A little. The mask reduces attention to later tokens but does not remove it', why: 'The mask sets those scores to −∞, so the weight is exactly zero, not small.' },
        { text: 'Only its position. The model can tell a word follows, but not which word', why: 'The earlier position gets no signal at all from later slots, not even that they exist.' },
      ],
      hint: 'Trace what row 2 of the causal grid can read. Does that change from layer to layer?',
    },
    {
      id: 'arm-7', kind: 'mcq', level: 3,
      prompt: 'You append two [MASK] slots to “I flew to New” and a masked model fills both in one pass. “York City” and “Orleans tonight” are both likely. What can go wrong?',
      options: [
        { text: 'It can output “York tonight”: each blank is chosen without seeing the other', correct: true, why: 'Both blanks are predicted in the same pass from the same visible words. Each picks a token that is likely on its own, and nothing ties the two picks together.' },
        { text: 'It fills the first blank, then reads that choice when filling the second, which is slow', why: 'That would be autoregressive generation. In one masked pass the second blank only sees [MASK] in the first slot.' },
        { text: 'Nothing: two-way attention lets each blank read the other blank’s answer', why: 'Each blank can read the other slot, but that slot holds [MASK], not an answer. The answers do not exist until the pass ends.' },
        { text: 'It refuses, because masked models cannot process a [MASK] at the end of a sentence', why: 'Position does not matter to a masked model. It will fill a blank anywhere, including at the end.' },
      ],
      hint: 'When the second blank is being predicted, what token sits in the first slot?',
    },
    {
      id: 'arm-8', kind: 'mcq', level: 3,
      prompt: 'A chat model has processed 1,000 tokens and appends token 1,001. Why can it reuse the work already done for the first 1,000?',
      options: [
        { text: 'Under a causal mask, earlier rows never read the new token, so their vectors are unchanged', correct: true, why: 'Row i depends only on tokens 1 to i. Adding token 1,001 adds a row and changes none of the earlier ones, so they can be cached.' },
        { text: 'The new token is attended to with a tiny weight, so the change is small enough to ignore', why: 'Nothing is approximated. Earlier positions give the new token exactly zero weight, so their results are exactly the same.' },
        { text: 'The model only ever reads the most recent token, so older work is never needed again', why: 'The new row reads all 1,001 tokens. Older results are needed, which is exactly why caching them helps.' },
        { text: 'Any transformer can do this; the mask has nothing to do with reusing earlier work', why: 'With a full mask, every earlier token would read the new one and its vector would change, so nothing could be reused.' },
      ],
      hint: 'Which rows of the mask grid change when you add one more row and column?',
    },
  ],
  takeaways: [
    'Autoregressive and masked models share the same transformer block and differ in the attention mask and the training target.',
    'A causal mask lets each position read only leftward and grades every position on the next token, which is exactly the loop used to generate text.',
    'A masked model reads both sides and is graded only on the roughly 15% of tokens that were hidden, which gives rich vectors for understanding and no way to extend text.',
    'In a causal model, the vector for a token never contains information from later words.',
  ],
};

export default lesson;
