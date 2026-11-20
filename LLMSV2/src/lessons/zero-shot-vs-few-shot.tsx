import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Stat } from '../ui/kit';
import { sfx } from '../engine/sfx';
import { CORRECT, INSTRUCTION, POOL, TEST, TRUE_LABEL, W, belief, buildPrompt, other, type Label, type Shot } from './zero-shot-vs-few-shot.model';
import { useTokenCount } from './rag.tokens';

/* ------------------------------------------------------------------ *
 * Lab: build a few-shot prompt and watch a SIMULATED belief sharpen.
 * The prompt text and its token count are real. The belief panel is a
 * stated rule (see zero-shot-vs-few-shot.model.ts): each example adds
 * fixed evidence in logits, and a softmax gives the distribution. It
 * is not a measurement of any model.
 * ------------------------------------------------------------------ */

const WRONG: Label = other(CORRECT);
const LABEL_COLOR: Record<Label, string> = { KIV: '#f472b6', ZOR: '#4ade80' };

function shotsFor(order: string[], flipped: ReadonlySet<string>): Shot[] {
  return order.map((id) => {
    const ex = POOL.find((e) => e.id === id)!;
    const t = TRUE_LABEL[ex.sentiment];
    return { ex, label: flipped.has(id) ? other(t) : t };
  });
}

function FewShotLab({ complete }: LabProps) {
  const [order, setOrder] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [lastAdd, setLastAdd] = useState<{ dP: number; dTok: number } | null>(null);
  const { count, exact } = useTokenCount();

  const shots = useMemo(() => shotsFor(order, flipped), [order, flipped]);
  const b = useMemo(() => belief(shots), [shots]);
  const prompt = useMemo(() => buildPrompt(shots), [shots]);
  const tokens = count(prompt);
  const zeroTokens = count(buildPrompt([]));

  // Belief after each prefix of the prompt: 0 examples, 1 example, ...
  const curve = useMemo(
    () => shots.map((_, i) => i).concat(shots.length).map((n) => {
      const pre = shots.slice(0, n);
      return { n, p: belief(pre).p[CORRECT], tok: count(buildPrompt(pre)) };
    }),
    [shots, count],
  );

  const flippedInPrompt = order.filter((id) => flipped.has(id));
  const cleanP = useMemo(() => belief(shotsFor(order, new Set())).p[CORRECT], [order]);
  const flipCost = cleanP - b.p[CORRECT];
  const allSame = shots.length >= 3 && shots.every((s) => s.label === shots[0].label);

  useEffect(() => {
    if (b.p[CORRECT] >= 0.9 && flippedInPrompt.length === 0) complete('confident');
    if (flippedInPrompt.length > 0 && flipCost >= 0.05) complete('mislabel');
    if (allSame && shots[0].label === WRONG && b.p[WRONG] > 0.5) complete('majority');
    if (lastAdd && order.length >= 4 && Math.abs(lastAdd.dP) < 0.01 && b.p[CORRECT] >= 0.9) complete('plateau');
  });

  const toggle = (id: string) => {
    sfx.tap();
    if (order.includes(id)) {
      setOrder(order.filter((x) => x !== id));
      setLastAdd(null);
    } else {
      const next = [...order, id];
      const nb = belief(shotsFor(next, flipped));
      setLastAdd({ dP: nb.p[CORRECT] - b.p[CORRECT], dTok: count(buildPrompt(shotsFor(next, flipped))) - tokens });
      setOrder(next);
    }
  };
  const flip = (id: string) => {
    sfx.tap();
    const n = new Set(flipped);
    if (n.has(id)) n.delete(id); else n.add(id);
    setFlipped(n);
    setLastAdd(null);
  };
  const moveLast = (id: string) => {
    sfx.tap();
    setOrder([...order.filter((x) => x !== id), id]);
    setLastAdd(null);
  };
  const reset = () => { sfx.tap(); setOrder([]); setFlipped(new Set()); setLastAdd(null); };

  const top = (['ZOR', 'KIV', 'other'] as const).reduce((a, c) => (b.p[c] > b.p[a] ? c : a), 'other' as 'ZOR' | 'KIV' | 'other');

  // chart geometry
  const CW = 720, CH = 170, padL = 44, padR = 16, padT = 14, padB = 30;
  const maxTok = Math.max(130, ...curve.map((c) => c.tok));
  const cx = (tok: number) => padL + ((tok - zeroTokens) / (maxTok - zeroTokens)) * (CW - padL - padR);
  const cy = (p: number) => padT + (1 - p) * (CH - padT - padB);

  return (
    <div className="lab-grid">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Example pool */}
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="eyebrow">Example cards · click to add</div>
            <button className="btn sm" onClick={reset} disabled={order.length === 0 && flipped.size === 0}>Clear</button>
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            {POOL.map((ex) => {
              const pos = order.indexOf(ex.id);
              const inP = pos >= 0;
              const isFlipped = flipped.has(ex.id);
              const label = isFlipped ? other(TRUE_LABEL[ex.sentiment]) : TRUE_LABEL[ex.sentiment];
              return (
                <div
                  key={ex.id}
                  style={{
                    border: `1px solid ${inP ? 'var(--hue)' : 'var(--line)'}`, background: inP ? 'var(--hue-soft)' : 'var(--panel)',
                    borderRadius: 12, padding: '8px 10px', transition: 'border-color .25s, background .25s',
                  }}
                >
                  <button
                    onClick={() => toggle(ex.id)}
                    aria-pressed={inP}
                    data-ex={ex.id}
                    style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', alignItems: 'start' }}
                  >
                    <span
                      className="mono"
                      style={{
                        width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, marginTop: 1,
                        border: `1.5px solid ${inP ? 'var(--hue)' : 'var(--line-2)'}`, background: inP ? 'var(--hue)' : 'transparent', color: inP ? '#05060a' : 'var(--fg-3)',
                      }}
                    >
                      {inP ? pos + 1 : '+'}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.4 }}>{ex.text}</span>
                  </button>
                  <div className="row" style={{ marginTop: 6, paddingLeft: 30, gap: 6 }}>
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>→</span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 12.5, fontWeight: 700, padding: '1px 8px', borderRadius: 6, color: LABEL_COLOR[label],
                        border: `1px ${isFlipped ? 'dashed' : 'solid'} color-mix(in srgb, ${LABEL_COLOR[label]} 55%, transparent)`,
                      }}
                    >
                      {label}
                    </span>
                    {isFlipped && <span style={{ fontSize: 12, color: 'var(--warn)' }}>mislabelled</span>}
                    <span style={{ flex: 1 }} />
                    <button className="btn sm" data-flip={ex.id} style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => flip(ex.id)}>flip label</button>
                    {inP && pos < order.length - 1 && (
                      <button className="btn sm" data-last={ex.id} style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => moveLast(ex.id)}>move last</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The prompt */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>The prompt, exactly as sent</div>
          <div
            className="mono"
            style={{ background: '#0a0c15', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: '#cfd6f3', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            <div style={{ color: 'var(--fg-3)' }}>{INSTRUCTION}</div>
            <div style={{ height: '1.55em' }} />
            <AnimatePresence initial={false} mode="popLayout">
              {shots.map((s) => (
                <motion.div
                  layout
                  key={s.ex.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  style={{ borderLeft: `3px solid ${LABEL_COLOR[s.label]}`, paddingLeft: 8, marginLeft: -11, marginBottom: '1.55em' }}
                >
                  Review: {s.ex.text}
                  {'\n'}Code: <span style={{ color: LABEL_COLOR[s.label], fontWeight: 700 }}>{s.label}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.div layout="position" style={{ color: '#fff' }}>
              Review: {TEST.text}
              {'\n'}Code:<span style={{ animation: 'pulse 1.2s infinite', color: 'var(--hue)' }}> ▌</span>
            </motion.div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Stat label={exact ? 'prompt tokens (GPT-4 tokenizer)' : 'prompt tokens (≈ chars ÷ 4)'} value={tokens} hot />
            <Stat label="examples" value={shots.length} />
            <Stat label="tokens added by examples" value={'+' + (tokens - zeroTokens)} />
          </div>
        </div>
      </div>

      {/* Belief */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14, background: 'var(--panel)' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="eyebrow">What comes after “Code:”</div>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 55%, transparent)', borderRadius: 999, padding: '1px 9px' }}>
            SIMULATED
          </span>
        </div>
        <div className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Not a real model. Assumption: every example in the prompt adds a fixed amount of evidence (in logits, shown below), and a softmax turns the
          totals into probabilities. The weights are chosen for illustration.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'start' }}>
          <div>
            <Bars
              max={1}
              labelWidth={92}
              items={[
                { label: 'ZOR (right)', value: b.p.ZOR, color: LABEL_COLOR.ZOR },
                { label: 'KIV (wrong)', value: b.p.KIV, color: LABEL_COLOR.KIV },
                { label: 'other text', value: b.p.other, color: 'var(--fg-3)' },
              ]}
            />
            <div style={{ fontSize: 13.5, marginTop: 10, color: 'var(--fg-2)', minHeight: 40 }}>
              {shots.length === 0 && <>Zero-shot. The instruction says “house code” and never says what the codes are. The likely output is ordinary text such as “negative”.</>}
              {shots.length > 0 && top === 'other' && <>Still most likely to answer in its own words. One example is thin evidence of the format.</>}
              {shots.length > 0 && top === 'ZOR' && <>Most likely output: <strong style={{ color: LABEL_COLOR.ZOR }}>ZOR</strong>, the right code for a negative review.</>}
              {shots.length > 0 && top === 'KIV' && <>Most likely output: <strong style={{ color: LABEL_COLOR.KIV }}>KIV</strong>. That is the code for a positive review, and the test review is negative.</>}
            </div>
            {flippedInPrompt.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--warn)', marginTop: 6 }}>
                Mislabelled example in the prompt. It changes P(ZOR) by {(-flipCost * 100).toFixed(1)} points compared with the same prompt labelled correctly.
              </div>
            )}
            {lastAdd && (
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 6 }}>
                last example added: P(ZOR) {lastAdd.dP >= 0 ? '+' : '−'}{Math.abs(lastAdd.dP * 100).toFixed(1)} pts, prompt +{lastAdd.dTok} tokens
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="mono" style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%', minWidth: 300 }}>
              <thead>
                <tr style={{ color: 'var(--fg-3)', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '3px 0' }}>evidence (logits)</th>
                  <th style={{ fontWeight: 600 }}>KIV</th>
                  <th style={{ fontWeight: 600 }}>ZOR</th>
                  <th style={{ fontWeight: 600 }}>other</th>
                </tr>
              </thead>
              <tbody style={{ textAlign: 'right', color: 'var(--fg-2)' }}>
                {[
                  { name: `start`, k: 0, z: 0, o: W.otherStart },
                  { name: `shows a bare code: −${W.format} each`, k: 0, z: 0, o: -W.format * shots.length },
                  { name: `carries this label: +${W.freq} each`, k: b.parts.KIV.freq, z: b.parts.ZOR.freq, o: 0 },
                  { name: `similar review, this label: +${W.match}`, k: b.parts.KIV.match, z: b.parts.ZOR.match, o: 0 },
                  { name: `label of last example: +${W.recency}`, k: b.parts.KIV.recency, z: b.parts.ZOR.recency, o: 0 },
                ].map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ textAlign: 'left', padding: '4px 8px 4px 0', color: 'var(--fg-3)', fontFamily: 'var(--body)', fontSize: 12.5 }}>{r.name}</td>
                    {[r.k, r.z, r.o].map((x, i) => (
                      <td key={i} style={{ padding: '4px 0 4px 10px', color: x === 0 ? 'var(--fg-3)' : 'var(--fg)' }}>{x === 0 ? '0' : (x > 0 ? '+' : '−') + Math.abs(x).toFixed(1)}</td>
                    ))}
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid var(--line-2)', fontWeight: 700 }}>
                  <td style={{ textAlign: 'left', padding: '5px 8px 5px 0', color: 'var(--fg)', fontFamily: 'var(--body)' }}>total logit</td>
                  <td style={{ color: LABEL_COLOR.KIV }}>{b.logits.KIV.toFixed(1)}</td>
                  <td style={{ color: LABEL_COLOR.ZOR }}>{b.logits.ZOR.toFixed(1)}</td>
                  <td style={{ color: 'var(--fg)' }}>{b.logits.other.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Belief vs prompt size */}
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>P(ZOR) after each example, against prompt size · simulated</div>
        <div style={{ overflowX: 'auto' }}>
          <svg className="viz" viewBox={`0 0 ${CW} ${CH}`} style={{ minWidth: 480 }} role="img" aria-label="Probability of the correct code against prompt tokens">
            {[0, 0.5, 1].map((g) => (
              <g key={g}>
                <line x1={padL} x2={CW - padR} y1={cy(g)} y2={cy(g)} stroke="var(--line)" strokeDasharray={g === 0 ? undefined : '3 5'} />
                <text x={padL - 8} y={cy(g) + 4} textAnchor="end">{g * 100}%</text>
              </g>
            ))}
            <text x={CW - padR} y={CH - 6} textAnchor="end" style={{ fill: 'var(--fg-3)' }}>prompt tokens →</text>
            <polyline
              points={curve.map((c) => `${cx(c.tok)},${cy(c.p)}`).join(' ')}
              fill="none" stroke="var(--hue)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
            />
            {curve.map((c, i) => {
              const last = i === curve.length - 1;
              return (
                <g key={i} style={{ transform: `translate(${cx(c.tok)}px, ${cy(c.p)}px)`, transition: 'transform .45s cubic-bezier(.22,1,.36,1)' }}>
                  {last && <circle r={11} fill="var(--hue)" opacity={0.25} style={{ animation: 'pulse 1.6s infinite' }} />}
                  <circle r={last ? 6 : 4.5} fill={last ? 'var(--hue)' : 'var(--bg-2)'} stroke="var(--hue)" strokeWidth={2} />
                  <text y={c.p > 0.8 ? 22 : -12} textAnchor="middle" style={{ fontSize: 11, fill: last ? '#fff' : 'var(--fg-3)' }}>
                    {c.n === 0 ? '0-shot' : c.n}
                  </text>
                  <text y={CH - padB - cy(c.p) + 16} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{c.tok}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'zero-shot-vs-few-shot',
  hook: {
    prompt: (
      <>
        You paste three labelled examples into a prompt and the model starts labelling new inputs the same way. What changed inside the model?
      </>
    ),
    options: [
      {
        text: 'Nothing. The examples are extra input tokens that attention reads',
        correct: true,
        why: 'The weights are identical before and after. The examples are part of the input, attention layers read them like any other tokens, and the effect ends when the prompt does.',
      },
      {
        text: 'Its weights shifted slightly: three examples amount to a very small training run',
        why: 'No gradient is computed and no weight is written during a prompt. Send a new prompt without the examples and the behaviour is gone, which could not happen if weights had moved.',
      },
      {
        text: 'It saved the examples to a memory that later conversations can also draw on',
        why: 'A model has no storage that outlasts the call. Products that appear to remember are pasting saved text back into later prompts.',
      },
      {
        text: 'It switched into a classification mode that the examples unlocked',
        why: 'There are no modes to switch. The same network runs the same arithmetic. Only the input it runs on is different.',
      },
    ],
    reveal: 'Next you will build that prompt one example at a time and watch what each example buys, and what it costs.',
  },
  Lab: FewShotLab,
  missions: [
    {
      id: 'confident',
      text: 'Starting from zero examples, add correctly labelled examples until ZOR reaches 90%.',
      insight:
        'With no examples the model cannot know that “ZOR” exists, let alone that it means negative. Two negative examples are enough in this simulation: they show the output format, the label, and which kind of review gets it. No weight changed. You only made the input longer.',
    },
    {
      id: 'mislabel',
      text: 'Flip the label on a negative example that is in your prompt and watch P(ZOR) drop.',
      insight:
        'A mislabelled example is evidence for the wrong mapping, and the model has no way to know it is a mistake. With few examples, one bad label carries a large share of the total evidence. Check your examples before you blame the model.',
    },
    {
      id: 'majority',
      text: 'Clear the prompt, then add three examples that all carry KIV. See which code the negative review gets.',
      insight:
        'The test review is negative, and the simulated model still answers KIV, because KIV is the only label it has ever seen here. Real models show the same lean toward labels that are frequent in the prompt (majority-label bias) and toward the label of the last example (recency).',
    },
    {
      id: 'plateau',
      text: 'Add all three negative examples, then add one more example and see how little P(ZOR) moves.',
      insight:
        'At 99.4% there was almost nothing left to gain: the fourth example moved P(ZOR) by 0.4 points. The prompt still grew by 15 to 18 tokens, and those tokens are sent, and paid for, on every single call.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A <strong>zero-shot</strong> prompt contains an instruction and the input. A <strong>few-shot</strong> prompt adds a handful of
          demonstrations: example inputs with the outputs you want. In the lab's simulated belief, the instruction alone left free text as the likely output
          (96.5%). Each example you added moved that belief.
        </p>
        <p>
          This is called <em>in-context learning</em>, and the name misleads. No weight changes. The examples are more tokens in the input, and
          attention reads them when the model computes what follows “Code:”. When the prompt ends, the effect is gone.
        </p>
        <p>Examples carry four things:</p>
        <ol>
          <li><strong>Format</strong>: answer with a bare code, not a sentence.</li>
          <li><strong>Label space</strong>: the allowed answers are KIV and ZOR.</li>
          <li><strong>Input distribution</strong>: what kind of text to expect.</li>
          <li><strong>The mapping</strong>: negative goes to ZOR.</li>
        </ol>
        <Callout>
          Every example is paid for on every call, in tokens and in context space. The gain per example shrinks quickly. The cost per example
          does not.
        </Callout>
      </>
    ),
    worked: (
      <>
        <p>
          Follow the lab's simulated rule for the prompt with two negative examples, both labelled ZOR. Remember that the weights are illustrative,
          not measured.
        </p>
        <table>
          <thead>
            <tr><th>evidence</th><th>KIV</th><th>ZOR</th><th>other</th></tr>
          </thead>
          <tbody>
            <tr><td>start</td><td>0</td><td>0</td><td>4.0</td></tr>
            <tr><td>2 examples show a bare code (−1.2 each)</td><td></td><td></td><td>−2.4</td></tr>
            <tr><td>2 examples carry ZOR (+0.5 each)</td><td></td><td>+1.0</td><td></td></tr>
            <tr><td>2 similar reviews labelled ZOR (+1.4 each)</td><td></td><td>+2.8</td><td></td></tr>
            <tr><td>last example is ZOR (+0.4)</td><td></td><td>+0.4</td><td></td></tr>
            <tr><td>total logit</td><td>0</td><td>4.2</td><td>1.6</td></tr>
            <tr><td>e^logit</td><td>1.00</td><td>66.69</td><td>4.95</td></tr>
            <tr><td>probability</td><td>1.4%</td><td>91.8%</td><td>6.8%</td></tr>
          </tbody>
        </table>
        <p>
          The exponentials sum to 72.64, and 66.69 ÷ 72.64 = 91.8%. Now flip the second label to KIV. ZOR keeps 0.5 + 1.4 = 1.9. KIV gains 0.5 +
          1.4 + 0.4 = 2.3. The result is KIV 46.1%, ZOR 30.9%, other 22.9%: one bad label out of two reversed the answer.
        </p>
        <p>
          The token count is real. The zero-shot prompt is 25 tokens. With the first two negative cards it is 54, with all six it is 119: almost five times the
          zero-shot size, on every call.
        </p>
        <Code>{`
prompt  = instruction
prompt += "".join(f"Review: {x}\\nCode: {y}\\n\\n" for x, y in examples)
prompt += f"Review: {new_review}\\nCode:"
answer  = model.generate(prompt)    # same weights as before
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Evidence adds in logits</h3>
        <p>
          The lab's rule is the simplest Bayesian picture. If each example multiplies the odds of a hypothesis by some factor, the log-odds add:
        </p>
        <M block>{String.raw`\log\frac{P(\text{ZOR})}{P(\text{KIV})} = \text{prior} + \sum_{i} \text{evidence}_i`}</M>
        <p>
          A sum of logits passed through a softmax saturates: going from 4.2 to 6.1 moves the probability from 91.8% to 99.4%, and the next step
          can add at most 0.6 points. That is the plateau you found. Real models are not this tidy, but the shape, fast gains and then a flat
          line, is what is usually observed.
        </p>
        <h3>What the model actually does with examples</h3>
        <p>
          Mechanically, later tokens attend to earlier ones. The position after the final “Code:” can attend to earlier “Code:” positions and to
          the labels after them, and copy the pattern forward. Research on real models has found that demonstrations sometimes help even when
          their labels are shuffled, which shows that format, label space and input style can matter more than the mapping. For a made-up scheme
          like KIV and ZOR the mapping must come from the examples, because training cannot have supplied it.
        </p>
        <h3>Known sensitivities</h3>
        <p>
          Results move with the order of examples, the balance of labels, and small changes of wording or separators. Two prompts with the same
          examples in a different order can score differently. So a few-shot prompt should be tested on held-out inputs like any other change:
          balance the labels, shuffle the order, and measure.
        </p>
        <h3>When to stop adding examples and fine-tune</h3>
        <p>
          Few-shot is the right start: no training, instant changes. Move to fine-tuning, which writes the behaviour into the weights, when the
          examples you need no longer fit comfortably in the context, when call volume makes the repeated tokens expensive, or when accuracy has
          stopped improving with more examples. A fine-tuned model can then be called with a short zero-shot prompt.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'You pay for the examples on every call',
      body: 'Examples are not stored anywhere. They are sent again with each request, cost tokens each time, add latency, and take context space away from the actual input. In the lab six short examples made the prompt almost five times longer.',
    },
    {
      title: 'Order, balance and wording move the answer',
      body: 'A prompt whose examples mostly carry one label leans toward that label on any input. The last example can count for extra. Reordering or rewording the same examples can change measured accuracy, so an untested few-shot prompt is a guess.',
    },
    {
      title: 'A wrong example is taught as faithfully as a right one',
      body: 'The model cannot tell a mislabelled demonstration from a correct one. With only a few examples, one mistake is a large share of the evidence. The same goes for examples that are unlike the real inputs: they teach the wrong input distribution.',
    },
    {
      title: 'It does not scale, and nothing is kept',
      body: 'A task that needs hundreds of examples, or knowledge that no example can convey, will not fit in a prompt. And when the prompt ends, everything the examples conveyed is gone. Lasting change needs fine-tuning.',
    },
  ],
  questions: [
    {
      id: 'fs-1', kind: 'mcq', level: 1,
      prompt: 'What is the difference between a zero-shot and a few-shot prompt?',
      options: [
        { text: 'Few-shot adds example inputs with outputs; zero-shot has none', correct: true, why: 'A “shot” is one demonstration placed in the prompt. Zero-shot relies on the instruction and on what the model learned in training.' },
        { text: 'Few-shot briefly trains the model on examples; zero-shot uses it frozen', why: 'Both use the model frozen. Few-shot examples are part of the input text and no training step runs.' },
        { text: 'Few-shot asks the model several times; zero-shot asks it only once', why: 'The number of calls is the same: one. “Shots” counts the examples inside the prompt, not attempts.' },
        { text: 'Few-shot uses a short instruction; zero-shot uses a long detailed one', why: 'Instruction length is unrelated. The terms describe whether demonstrations are present.' },
      ],
    },
    {
      id: 'fs-2', kind: 'mcq', level: 1,
      prompt: 'Where does “in-context learning” live while the model is using it?',
      options: [
        { text: 'In the prompt tokens, which attention reads on every forward pass', correct: true, why: 'The examples exist only as input tokens. Attention lets later positions read them. Remove them from the prompt and the behaviour is gone.' },
        { text: 'In a small temporary copy of the weights made for the session', why: 'No copy is made and no weight is updated. The same weights serve every request.' },
        { text: 'In the embedding table, where the new labels are added as rows', why: 'The embedding table is fixed. A made-up label like ZOR is split into existing tokens.' },
        { text: 'In a cache of earlier answers that the model looks up by input', why: 'Nothing is looked up. Each output is computed fresh from the tokens in the prompt.' },
      ],
    },
    {
      id: 'fs-3', kind: 'num', level: 2,
      prompt: (
        <>
          A prompt has a 30-token instruction, a 20-token input, and 8 examples of 45 tokens each. How many prompt tokens are sent across 1,000
          calls?
        </>
      ),
      answer: 410000, tol: 0, unit: 'tokens',
      why: (
        <>
          One call: 30 + 20 + 8 × 45 = 410 tokens. 1,000 calls: <strong>410,000</strong>. The examples account for 360,000 of them, because they
          are resent every time.
        </>
      ),
      hint: 'Work out one call first. The examples are not sent once: they ride along on every call.',
    },
    {
      id: 'fs-4', kind: 'num', level: 2,
      prompt: (
        <>
          Using the lab's rule, the logits for three outputs are KIV 0, ZOR 2, other 1. What probability does ZOR get, in percent? (e ≈ 2.718)
        </>
      ),
      answer: 66.5, tol: 1, unit: '%',
      why: (
        <>
          e² = 7.39, e¹ = 2.72, e⁰ = 1. Sum = 11.11. 7.39 ÷ 11.11 = <strong>66.5%</strong>.
        </>
      ),
      hint: 'Softmax: exponentiate each logit, then divide by the total.',
    },
    {
      id: 'fs-5', kind: 'mcq', level: 2,
      prompt: 'A few-shot prompt for spam detection has nine examples labelled “spam” and one labelled “ok”. What should you expect on new inputs?',
      options: [
        { text: 'A lean toward “spam”, including on some messages that are fine', correct: true, why: 'Label frequency in the prompt is itself evidence to the model. An unbalanced prompt pushes outputs toward the majority label regardless of the input.' },
        { text: 'A lean toward “ok”, because the rare label stands out more', why: 'Rarity does not attract the output. The frequent label gets more support from the prompt, not less.' },
        { text: 'No effect: the model reads each example for its content only', why: 'Models pick up surface statistics of the prompt as well as content. Label balance is one of the best documented sensitivities.' },
        { text: 'Higher accuracy overall, because ten examples beat a balanced four', why: 'More examples help only if they carry balanced evidence. Nine of one class mostly teach “say spam”.' },
      ],
      hint: 'Recall what happened in the lab when every example carried KIV.',
    },
    {
      id: 'fs-6', kind: 'mcq', level: 3,
      prompt: 'You add a fourth, fifth and sixth example. Accuracy on your test set stays at 94% and the prompt doubles in length. What is the sensible reading?',
      options: [
        { text: 'The first three already conveyed the task; the rest only add cost', correct: true, why: 'Gains from demonstrations flatten quickly once format, label space and mapping are clear. Beyond that point each example only adds tokens to every call.' },
        { text: 'The model has run out of memory for examples and is ignoring the new ones', why: 'Six short examples are far below any context limit, and attention still reads them. They are simply redundant.' },
        { text: 'The new examples are being learned, and accuracy will rise after more calls', why: 'Nothing accumulates across calls. Each call starts from the same weights and the same prompt.' },
        { text: 'Few-shot prompting has failed, so the task must be impossible for the model', why: 'A plateau at 94% is not failure. If you need more, the next tools are better examples, a clearer instruction or fine-tuning.' },
      ],
      hint: 'Think about what an example can convey, and whether examples four to six carry anything the first three did not.',
    },
    {
      id: 'fs-7', kind: 'mcq', level: 3,
      prompt: 'A team classifies 5 million tickets a month with a prompt holding 40 examples. Which fact most strongly argues for fine-tuning instead?',
      options: [
        { text: 'The 40 examples are resent on all 5 million calls each month', correct: true, why: 'A fine-tuned model needs none of them. Fine-tuning moves the behaviour into the weights once. After that a short zero-shot prompt is enough, which cuts the tokens on every call.' },
        { text: 'Fine-tuned models always classify more accurately than prompted ones', why: 'Not always. Fine-tuning on a small or skewed dataset can do worse. The clear win here is the per-call cost.' },
        { text: 'A model slowly forgets its examples as the month goes on', why: 'There is nothing to forget. The examples are supplied in full on every call.' },
        { text: 'Few-shot prompts stop working once a model has seen them too often', why: 'The model keeps no record of earlier calls, so repetition has no effect on it.' },
      ],
      hint: 'Multiply the size of the examples by the number of calls.',
    },
    {
      id: 'fs-8', kind: 'mcq', level: 3,
      prompt: 'In a study, researchers shuffle the labels in few-shot examples so they no longer match the inputs, and accuracy on a familiar task drops only a little. What does that suggest?',
      options: [
        { text: 'The examples mainly conveyed format and label set, not the mapping', correct: true, why: 'The model already knew the mapping. If the mapping was learned in training, examples mostly tell the model what kind of answer is wanted. For an invented scheme like KIV and ZOR, shuffled labels would be ruinous.' },
        { text: 'The model does not read the examples at all once an instruction is present', why: 'Then removing the examples would cost nothing either, and it usually does. The examples are read; the labels were just not the main signal.' },
        { text: 'Labels never matter in few-shot prompts, so they can be left out', why: 'They matter whenever the mapping is new to the model, and the lab showed a single flipped label reversing the answer.' },
        { text: 'The shuffled labels were corrected by the model before it used them', why: 'No correction step exists. The model computed its answer from other signals in the prompt and from training.' },
      ],
      hint: 'List the four things an example can convey, then ask which of them survive shuffled labels.',
    },
  ],
  takeaways: [
    'Zero-shot is an instruction alone; few-shot adds demonstrations of input and output to the prompt.',
    'In-context learning changes no weights: the examples are extra tokens that attention reads, and the effect ends with the prompt.',
    'Examples convey format, label space, input style and sometimes the mapping, and they are sensitive to order, balance and wording.',
    'Every example is paid for on every call, gains flatten fast, and fine-tuning is the next step when the prompt gets too long or too costly.',
  ],
};

export default lesson;
