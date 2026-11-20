import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Seg, Slider, Stat, mulberry32, tokHue } from '../ui/kit';
import { sfx } from '../engine/sfx';
import { ANSWER, CHAIN_SUFFIX, DIRECT_MISSES, DIRECT_SUFFIX, PROBLEM, STEPS, answerLine, chainOutput, runChain } from './chain-of-thought.model';
import { useTokenCount } from './rag.tokens';

/* ------------------------------------------------------------------ *
 * Lab: the same word problem, answered two ways.
 * Real: the arithmetic on every line, the token counts, and p^n.
 * Simulated: whether a model would get a step right. That is a stated
 * probability model with sliders, not a measurement.
 * ------------------------------------------------------------------ */

const N = STEPS.length;

/** A small "context → model → output" diagram shared by both lanes. */
function Flow(props: { ctx: string; mid: string; rows: { label: string; lit: boolean; bad?: boolean }[]; out: string; outColor: string; loop: boolean; busy: boolean }) {
  const { ctx, mid, rows, out, outColor, loop, busy } = props;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg className="viz" viewBox="0 0 340 150" style={{ minWidth: 280 }} role="img" aria-label={`${ctx}, ${mid}, output ${out}`}>
        {/* context */}
        <rect x={4} y={38} width={78} height={56} rx={10} fill="var(--panel-2)" stroke="var(--line-2)" />
        <text x={43} y={62} textAnchor="middle" style={{ fill: '#fff', fontSize: 12 }}>context</text>
        <text x={43} y={80} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--hue)' }}>{ctx}</text>
        <line x1={84} x2={106} y1={66} y2={66} stroke="var(--hue)" strokeWidth={2} strokeDasharray="4 5" style={{ animation: 'dash 4s linear infinite' }} />
        {/* the pass */}
        <rect x={108} y={18} width={136} height={102} rx={12} fill="var(--bg-2)" stroke={busy ? 'var(--hue)' : 'var(--hue-line)'} strokeWidth={busy ? 2 : 1} style={{ transition: 'stroke .2s' }} />
        <text x={176} y={11} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-2)' }}>{mid}</text>
        {rows.map((r, i) => (
          <g key={i}>
            <rect
              x={118} y={27 + i * 22} width={116} height={17} rx={5}
              fill={r.lit ? (r.bad ? 'color-mix(in srgb, var(--bad) 30%, transparent)' : 'var(--hue-soft)') : 'transparent'}
              stroke={r.lit ? (r.bad ? 'var(--bad)' : 'var(--hue)') : 'var(--line)'}
              strokeDasharray={r.lit ? undefined : '3 3'}
              style={{ transition: 'fill .3s, stroke .3s' }}
            />
            <text x={176} y={39.5 + i * 22} textAnchor="middle" style={{ fontSize: 11, fill: r.lit ? '#fff' : 'var(--fg-3)' }}>{r.label}</text>
          </g>
        ))}
        <line x1={246} x2={268} y1={66} y2={66} stroke="var(--hue)" strokeWidth={2} strokeDasharray="4 5" style={{ animation: 'dash 4s linear infinite' }} />
        {/* output */}
        <rect x={270} y={44} width={66} height={44} rx={10} fill="var(--panel-2)" stroke={outColor} style={{ transition: 'stroke .3s' }} />
        <text x={303} y={71} textAnchor="middle" style={{ fontSize: 15, fill: outColor, fontWeight: 700 }}>{out}</text>
        {/* feedback loop */}
        {loop ? (
          <>
            <path d="M 303 90 L 303 144 L 43 144 L 43 98" fill="none" stroke="var(--hue)" strokeWidth={2} strokeDasharray="4 5" strokeLinejoin="round" style={{ animation: 'dash 4s linear infinite' }} />
            <path d="M 38 104 L 43 96 L 48 104" fill="none" stroke="var(--hue)" strokeWidth={2} />
            <text x={176} y={137} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--hue)' }}>each written token is fed back in</text>
          </>
        ) : (
          <text x={176} y={139} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>nothing written, nothing to read back</text>
        )}
      </svg>
    </div>
  );
}

const ctxBox: CSSProperties = {
  background: '#0a0c15', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
  color: '#cfd6f3', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--mono)', minHeight: 176,
};
const lane: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: 12, background: 'var(--panel)', display: 'grid', gap: 10, alignContent: 'start', minWidth: 0 };

function CotLab({ complete }: LabProps) {
  const [written, setWritten] = useState(0);
  const [errAt, setErrAt] = useState(-1);
  const [directRuns, setDirectRuns] = useState(0);
  const [directHits, setDirectHits] = useState(0);
  const [directOut, setDirectOut] = useState<{ value: number; ok: boolean; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState(0.95);
  const [n, setN] = useState(N);
  const [q, setQ] = useState(0.5);
  const touched = useRef(false);
  const sawWorse = useRef(false);
  const { count, exact } = useTokenCount();

  const lines = useMemo(() => runChain(errAt), [errAt]);
  const chainDone = written === N;
  const finalValue = lines[N - 1].result;
  const chainTokens = count(chainOutput(lines, written));
  const directTokens = count(answerLine(ANSWER));
  const promptTokens = count(PROBLEM);

  const chainP = Math.pow(p, n);
  const crossover = Math.log(q) / Math.log(p); // steps at which p^n falls to q

  useEffect(() => {
    if (chainDone && errAt === -1) complete('chain');
    if (chainDone && directRuns > 0) complete('cost');
    if (chainDone && (errAt === 0 || errAt === 1)) complete('error');
    if (touched.current) {
      if (chainP < q) sawWorse.current = true;
      else if (sawWorse.current && chainP > q) complete('rel');
    }
  });

  const touch = <T,>(set: (v: T) => void) => (v: T) => { touched.current = true; set(v); };

  const step = () => { sfx.tap(); setWritten((w) => Math.min(N, w + 1)); };
  const reset = () => { sfx.tap(); setWritten(0); };
  const runDirect = () => {
    sfx.tap();
    const run = directRuns + 1;
    const ok = mulberry32(140 + run * 31)() < q;
    setBusy(true);
    setDirectOut(null);
    setTimeout(() => {
      setBusy(false);
      setDirectRuns(run);
      if (ok) setDirectHits((h) => h + 1);
      const miss = DIRECT_MISSES[run % DIRECT_MISSES.length];
      setDirectOut(ok ? { value: ANSWER, ok } : { value: miss.value, ok, note: miss.note });
    }, 650);
  };

  // chart
  const CW = 720, CH = 170, padL = 44, padR = 14, padT = 12, padB = 28;
  const X = (i: number) => padL + ((i - 1) / 19) * (CW - padL - padR);
  const Y = (v: number) => padT + (1 - v) * (CH - padT - padB);

  return (
    <div className="lab-grid">
      <div className="mono" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', background: 'var(--panel)' }}>
        <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>The problem · {promptTokens} tokens</span>
        {PROBLEM}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, alignItems: 'start' }}>
        {/* Direct lane */}
        <div style={lane}>
          <div className="eyebrow">A · Answer directly</div>
          <Flow
            ctx={`${promptTokens} tok`}
            mid="1 forward pass, fixed depth"
            rows={STEPS.map((s, i) => ({ label: `${i === 0 ? '48 ' : ''}${s.sym} ${s.operand} = ?`, lit: busy }))}
            out={busy ? '…' : directOut ? String(directOut.value) : '?'}
            outColor={directOut ? (directOut.ok ? 'var(--good)' : 'var(--bad)') : 'var(--line-2)'}
            loop={false}
            busy={busy}
          />
          <div style={ctxBox}>
            <span style={{ color: 'var(--fg-3)' }}>{DIRECT_SUFFIX}</span>
            {'\n'}
            {directOut ? (
              <motion.span key={directRuns} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'inline-block', color: directOut.ok ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>
                {answerLine(directOut.value)} {directOut.ok ? '✓' : '✗'}
              </motion.span>
            ) : (
              <span>Answer:<span style={{ animation: 'pulse 1.2s infinite', color: 'var(--hue)' }}> ▌</span></span>
            )}
            <div style={{ fontFamily: 'var(--body)', color: 'var(--fg-3)', fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              The very next tokens must be the answer. All four results in the dashed boxes have to be computed and carried inside the network's
              internal numbers, in one pass, because none of them is ever written.
              {directOut && !directOut.ok && <span style={{ color: 'var(--bad)' }}> This draw missed: {directOut.note}.</span>}
            </div>
          </div>
          <div className="row">
            <button className="btn sm primary" data-act="direct" onClick={runDirect} disabled={busy}>Answer directly</button>
            <span className="mono" style={{ fontSize: 12, color: 'var(--warn)' }}>
              simulated draw, right with probability q = {q.toFixed(2)}{directRuns > 0 && ` · ${directHits} of ${directRuns} right`}
            </span>
          </div>
          <div className="row">
            <Stat label="tokens generated" value={directTokens} />
          </div>
        </div>

        {/* Chain lane */}
        <div style={lane}>
          <div className="eyebrow">B · Think step by step</div>
          <Flow
            ctx={`${promptTokens + chainTokens} tok`}
            mid="1 pass per token, 1 step per line"
            rows={STEPS.map((s, i) => ({
              label: i < written ? `${lines[i].input} ${s.sym} ${s.operand} = ${lines[i].result}` : `${s.sym} ${s.operand}`,
              lit: i < written, bad: lines[i].tainted,
            }))}
            out={chainDone ? String(finalValue) : written === 0 ? '?' : String(lines[written - 1].result)}
            outColor={chainDone ? (finalValue === ANSWER ? 'var(--good)' : 'var(--bad)') : written ? 'var(--hue)' : 'var(--line-2)'}
            loop
            busy={false}
          />
          <div style={ctxBox}>
            <span style={{ color: 'var(--fg-3)' }}>{CHAIN_SUFFIX}</span>
            <AnimatePresence initial={false}>
              {lines.slice(0, written).map((l, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                >
                  {l.name}:{' '}
                  <span style={{ color: i === 0 ? '#fff' : tokHue(i - 1), fontWeight: 700, textDecoration: i === 0 ? undefined : 'underline', textUnderlineOffset: 3 }}>{l.input}</span>
                  {' '}{l.sym} {l.operand} ={' '}
                  <motion.span
                    key={l.result}
                    initial={{ scale: 1.35 }}
                    animate={{ scale: 1 }}
                    style={{
                      display: 'inline-block', color: tokHue(i), fontWeight: 700, padding: '0 5px', borderRadius: 5,
                      background: l.tainted ? 'color-mix(in srgb, var(--bad) 26%, transparent)' : `color-mix(in srgb, ${tokHue(i)} 16%, transparent)`,
                      outline: l.tainted ? '1px solid var(--bad)' : undefined,
                    }}
                  >
                    {l.result}
                  </motion.span>
                  {l.slipped && <span style={{ color: 'var(--bad)', fontSize: 12 }}> ← slip, true {l.truth}</span>}
                  {!l.slipped && l.tainted && <span style={{ color: 'var(--warn)', fontSize: 12 }}> ← wrong input</span>}
                </motion.div>
              ))}
            </AnimatePresence>
            {chainDone ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} style={{ color: finalValue === ANSWER ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>
                {answerLine(finalValue)} {finalValue === ANSWER ? '✓' : `✗ (true answer ${ANSWER})`}
              </motion.div>
            ) : (
              <div><span style={{ animation: 'pulse 1.2s infinite', color: 'var(--hue)' }}>▌</span></div>
            )}
            <div style={{ fontFamily: 'var(--body)', color: 'var(--fg-3)', fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              Scripted trace, not model output. An underlined number was read from the line above, where it has the same colour. The arithmetic
              is computed for real. That a model builds on a wrong line the same way is its usual behaviour, not a guarantee.
            </div>
          </div>
          <div className="row">
            <button className="btn sm primary" data-act="step" onClick={step} disabled={chainDone}>
              {chainDone ? 'Chain complete' : `Write step ${written + 1} of ${N}`}
            </button>
            <button className="btn sm" data-act="reset" onClick={reset} disabled={written === 0}>Reset</button>
          </div>
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>Inject a slip in</span>
            <Seg
              value={errAt}
              onChange={setErrAt}
              options={[{ value: -1, label: 'none' }, { value: 0, label: 'step 1' }, { value: 1, label: 'step 2' }, { value: 2, label: 'step 3' }]}
            />
          </div>
          <div className="row">
            <Stat label="tokens generated" value={chainTokens} hot />
            <Stat label="vs direct" value={chainTokens > directTokens ? `+${chainTokens - directTokens}` : '–'} />
          </div>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        Token counts: {exact ? 'GPT-4 tokenizer (cl100k), computed.' : 'estimated as characters ÷ 4 while the tokenizer loads.'} Every generated token costs
        one forward pass over the whole context (work on earlier positions is cached).
      </div>

      {/* Reliability model */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14, background: 'var(--panel)', minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="eyebrow">How often is the final answer right?</div>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 55%, transparent)', borderRadius: 999, padding: '1px 9px' }}>
            SIMULATED
          </span>
        </div>
        <div className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Not measured from a model. Assumptions: each written step succeeds with probability p, independently; one failed step ruins the answer;
          answering with no written steps succeeds with probability q. You set p, q and the number of steps. The product pⁿ is computed. q stays
          where you set it when n changes. On a real problem, more steps also lower q, usually faster than they lower pⁿ.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Slider label="p: one written step is right" value={p} min={0.6} max={0.99} step={0.01} onChange={touch(setP)} format={(v) => v.toFixed(2)} />
          <Slider label="n: steps in the chain" value={n} min={1} max={20} onChange={touch(setN)} />
          <Slider label="q: all steps at once, unwritten" value={q} min={0.05} max={0.95} step={0.05} onChange={touch(setQ)} format={(v) => v.toFixed(2)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12, alignItems: 'center' }}>
          <Bars
            max={1}
            labelWidth={104}
            items={[
              { label: `chain  pⁿ`, value: chainP, color: chainP >= q ? 'var(--good)' : 'var(--bad)' },
              { label: 'direct  q', value: q, color: 'var(--fg-3)' },
            ]}
          />
          <div style={{ fontSize: 14, color: 'var(--fg-2)' }}>
            <span className="mono" style={{ color: 'var(--fg)' }}>{p.toFixed(2)}<sup>{n}</sup> = {(chainP * 100).toFixed(1)}%</span>.{' '}
            {chainP > q ? (
              <>The chain is more reliable than the direct answer by <strong style={{ color: 'var(--good)' }}>{((chainP - q) * 100).toFixed(1)} points</strong>.</>
            ) : chainP < q ? (
              <>The chain is <strong style={{ color: 'var(--bad)' }}>less reliable</strong> than the direct answer by {((q - chainP) * 100).toFixed(1)} points.</>
            ) : (
              <>Exactly level.</>
            )}{' '}
            At this p the chain drops below q after {Math.floor(crossover + 1e-9)} step{Math.floor(crossover + 1e-9) === 1 ? '' : 's'}.
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <svg className="viz" viewBox={`0 0 ${CW} ${CH}`} style={{ minWidth: 480 }} role="img" aria-label="Chain success probability against number of steps">
            {[0, 0.5, 1].map((g) => (
              <g key={g}>
                <line x1={padL} x2={CW - padR} y1={Y(g)} y2={Y(g)} stroke="var(--line)" strokeDasharray={g === 0 ? undefined : '3 5'} />
                <text x={padL - 8} y={Y(g) + 4} textAnchor="end">{g * 100}%</text>
              </g>
            ))}
            {[1, 5, 10, 15, 20].map((i) => <text key={i} x={X(i)} y={CH - 8} textAnchor="middle" style={{ fill: 'var(--fg-3)' }}>{i}</text>)}
            <text x={CW - padR} y={padT + 10} textAnchor="end" style={{ fill: 'var(--fg-3)' }}>steps →</text>
            <line x1={padL} x2={CW - padR} y1={Y(q)} y2={Y(q)} stroke="var(--fg-3)" strokeWidth={2} strokeDasharray="6 5" style={{ transition: 'all .3s' }} />
            <text x={padL + 6} y={Y(q) - 6} style={{ fill: 'var(--fg-2)' }}>direct q</text>
            <polyline
              points={Array.from({ length: 20 }, (_, i) => `${X(i + 1)},${Y(Math.pow(p, i + 1))}`).join(' ')}
              fill="none" stroke="var(--hue)" strokeWidth={2.5} strokeLinejoin="round"
            />
            {Array.from({ length: 20 }, (_, i) => (
              <circle key={i} cx={X(i + 1)} cy={Y(Math.pow(p, i + 1))} r={2.5} fill={Math.pow(p, i + 1) >= q ? 'var(--hue)' : 'var(--bad)'} />
            ))}
            <g style={{ transform: `translate(${X(n)}px, ${Y(chainP)}px)`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }}>
              <circle r={12} fill={chainP >= q ? 'var(--good)' : 'var(--bad)'} opacity={0.25} style={{ animation: 'pulse 1.6s infinite' }} />
              <circle r={6} fill={chainP >= q ? 'var(--good)' : 'var(--bad)'} stroke="#fff" strokeWidth={1.5} />
              <text y={-14} textAnchor="middle" style={{ fill: '#fff', fontSize: 12 }}>pⁿ</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'chain-of-thought',
  hook: {
    prompt: (
      <>
        Adding “think step by step” to a prompt often makes a model better at multi-step problems. The model and its weights are the same. What
        changed?
      </>
    ),
    options: [
      {
        text: 'The model writes intermediate results as text and reads them back as input',
        correct: true,
        why: 'A model produces one token at a time and reads everything written so far to produce the next. Written steps become input it can read, so the work is spread over many passes instead of being crammed into one.',
      },
      {
        text: 'The phrase switches on a slower, more careful mode of computation inside the network',
        why: 'There is no second mode. Every token costs the same fixed computation. The model does more total work only because it generates more tokens.',
      },
      {
        text: 'The model works out the answer first, then writes the steps to explain it to you',
        why: 'The steps come out before the answer, and the answer is generated with those steps as input. On multi-step arithmetic, a corrupted step usually changes the answer. The lab shows that case.',
      },
      {
        text: 'The phrase tells the model the problem is hard, so it spends longer on each token',
        why: 'Time per token is fixed by the architecture: the same layers run once per token whatever the prompt says. Only the number of tokens can change.',
      },
    ],
    reveal: 'Next you will run one problem both ways and watch where the intermediate numbers live.',
  },
  Lab: CotLab,
  missions: [
    {
      id: 'chain',
      text: 'In lane B, with no slip injected, write all four steps and reach the answer.',
      insight:
        'Each line needed one small calculation, and its input was sitting in the context as text: 144, then 864, then 364. The written lines are the working memory. In lane A the same four results would have to be carried inside a single pass.',
    },
    {
      id: 'cost',
      text: 'Press “Answer directly” in lane A, then compare the tokens the two lanes generated.',
      insight:
        'The direct answer is 4 tokens. The chain is 53: about thirteen times as many, each one a full forward pass over a context that keeps growing. Written reasoning buys reliability with tokens and waiting time.',
    },
    {
      id: 'error',
      text: 'Inject a slip in step 1 or step 2 and look at the completed chain.',
      insight:
        'Every later line did its arithmetic correctly on a wrong input, and the chain ended in a confident wrong answer. This trace is scripted, but it is the default behaviour of a model too: later tokens are computed from what is written, and nothing forces a check of earlier lines.',
    },
    {
      id: 'rel',
      text: 'In the reliability model, find settings where the chain loses to the direct answer, then make it win again.',
      insight:
        'Chain success is p multiplied by itself n times. At p = 0.95 a 4-step chain is right 81.5% of the time, and a 14-step chain 48.8%. Writing steps helps only while each step is much more reliable than the unwritten leap. Long chains leak, although on a real long problem the unwritten leap gets worse too.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A language model generates one token at a time. To produce each token it runs one <em>forward pass</em>: the whole context goes through
          a fixed stack of layers once. The new token is then appended to the context, and the next pass reads it.
        </p>
        <p>
          That loop is the entire mechanism of chain-of-thought. In lane A, 144, 864 and 364 had to be computed and held inside one pass of
          fixed depth. In lane B each result was written down, and the next step read it.
        </p>
        <Callout>
          Written reasoning is working memory. It spreads one hard computation over many passes, each doing one easy step.
        </Callout>
        <ul>
          <li><strong>Tokens and latency.</strong> Every reasoning token is another pass, paid for and waited for.</li>
          <li><strong>Compounding errors.</strong> A wrong line is normally built on by every line after it.</li>
          <li><strong>No guarantee of honesty.</strong> The written steps are generated text. They can differ from how the answer was actually reached.</li>
        </ul>
        <p>
          Models with a built-in reasoning phase run this same loop: they generate reasoning tokens first, then answer with those tokens in
          context.
        </p>
      </>
    ),
    worked: (
      <>
        <p>The café problem, as lane B wrote it. Each line's first number comes from the line above.</p>
        <table>
          <thead>
            <tr><th>step</th><th>reads</th><th>computes</th><th>writes</th><th>tokens so far</th></tr>
          </thead>
          <tbody>
            <tr><td>1 Daily sales</td><td>48 (prompt)</td><td>48 × 3</td><td>144</td><td>11</td></tr>
            <tr><td>2 Weekly sales</td><td>144</td><td>144 × 6</td><td>864</td><td>23</td></tr>
            <tr><td>3 Weekly profit</td><td>864</td><td>864 − 500</td><td>364</td><td>35</td></tr>
            <tr><td>4 Each owner</td><td>364</td><td>364 ÷ 2</td><td>182</td><td>53 (with the answer line)</td></tr>
          </tbody>
        </table>
        <p>
          The direct answer, “Answer: 182”, is 4 tokens. The chain is 53. The extra 49 tokens are the price of the working memory.
        </p>
        <p>
          Now inject a slip in step 1: 48 × 3 is written as 134. Step 2 reads 134 and correctly computes 134 × 6 = 804. Step 3: 804 − 500 = 304.
          Step 4: 304 ÷ 2 = 152. Three correct calculations, one wrong answer.
        </p>
        <p>
          Reliability, under the lab's stated assumptions: if each step is right with probability 0.95, four steps are all right with probability
          0.95⁴ = 0.8145. Ten steps: 0.95¹⁰ = 0.5987.
        </p>
        <Code>{`
context = prompt
while not done:
    token = model.next_token(context)   # one forward pass, fixed depth
    context += token                    # the output becomes input
# "144" written at step 1 is plain input text by step 2
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why one pass is limited</h3>
        <p>
          A transformer with L layers applies L rounds of attention and feed-forward computation to produce a token, however hard the question.
          A calculation that needs more sequential steps than the layers can express has nowhere to go. Generating T tokens gives roughly T × L
          rounds, and the tokens in between act as storage that later passes can attend to. Written reasoning turns a fixed-depth computation
          into one whose depth grows with the length of the output.
        </p>
        <h3>The compounding math</h3>
        <p>If steps fail independently, each with success probability p, a chain of n steps succeeds with probability</p>
        <M block>{String.raw`P(\text{chain}) = p^{\,n}, \qquad \text{and it falls below } q \text{ when } n > \frac{\ln q}{\ln p}.`}</M>
        <p>
          With p = 0.95 and q held at 0.5 that is n &gt; 13.5, so a 14-step chain would lose to a direct answer that is still right half the
          time. In practice the direct answer gets worse as steps are added too, so read this as the price of chain length, not as advice to
          skip the steps. Real steps are also not independent, and models sometimes notice and repair an earlier error.
        </p>
        <h3>Faithfulness</h3>
        <p>
          The written chain is itself model output. Experiments have shown models giving a tidy step-by-step justification for an answer that was
          in fact steered by something the justification never mentions, such as a hint planted in the prompt. A chain that reads well is
          evidence about the answer. It is not a recording of the computation.
        </p>
        <h3>Reasoning models and self-checks</h3>
        <p>
          Newer models are trained to produce a reasoning phase before the visible answer, often hidden from the user and billed as output
          tokens. The mechanism is the one in this lab. Common additions attack the compounding problem: generate several independent chains
          and take the majority answer, or have the model re-read and verify its own steps. Both cost more tokens.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Early mistakes are carried forward',
      body: 'Each step reads the previous lines as given. One wrong number near the start produces a chain of correct-looking arithmetic and a confident wrong answer. A longer chain has more places for this to happen.',
    },
    {
      title: 'It costs tokens and time on every call',
      body: 'In the lab the chain generated 53 tokens where the direct answer needed 4. Output tokens are generated one after another, so latency grows in step. For easy questions the reasoning is pure overhead.',
    },
    {
      title: 'The reasoning may not be the real reason',
      body: 'The steps are generated text, not a log of the computation. A model can reach an answer by one route and write down another, plausible one. Do not treat a clean chain as proof that the answer is right or that you know why it was given.',
    },
    {
      title: 'It cannot add knowledge or skill that is missing',
      body: 'Writing steps helps when the problem decomposes into steps the model can already do. If a single step is beyond it, or a needed fact is absent, a longer chain only gives more room to go wrong.',
    },
  ],
  questions: [
    {
      id: 'cot-1', kind: 'mcq', level: 1,
      prompt: 'Why can written reasoning serve as working memory for a language model?',
      options: [
        { text: 'Each generated token joins the context that every later pass reads', correct: true, why: 'Generation is a loop: output becomes input. Anything the model writes is available to attention on the next pass, so it does not need to be recomputed.' },
        { text: 'The model stores the steps in a scratch area of its weights until it answers', why: 'Weights do not change during generation. The only place the steps exist is the context.' },
        { text: 'The steps are held in a hidden state that carries over from token to token', why: 'A transformer carries nothing between tokens except the text itself (and cached copies of computations on that text). The text is the memory.' },
        { text: 'The prompt phrase reserves extra layers for holding intermediate values', why: 'The number of layers is fixed by the architecture and no prompt can change it.' },
      ],
    },
    {
      id: 'cot-2', kind: 'mcq', level: 1,
      prompt: 'What is fixed about a single forward pass?',
      options: [
        { text: 'The computation: the same stack of layers runs once per token', correct: true, why: 'One pass is one trip through a fixed number of layers. A hard question gets no more depth than an easy one unless more tokens are generated.' },
        { text: 'The number of tokens it reads: always the same count, padded if necessary', why: 'The context can be any length up to the window. What is fixed is the depth of processing, not the input size.' },
        { text: 'The token it outputs: the same context always gives the same token', why: 'A pass outputs a probability distribution, and sampling can pick different tokens from it.' },
        { text: 'The facts it can use: only those stated in the prompt', why: 'A pass also uses whatever is stored in the weights. That is unrelated to the limit on computation.' },
      ],
    },
    {
      id: 'cot-3', kind: 'num', level: 2,
      prompt: (
        <>
          Under the lab's model, each written step is right with probability 0.9, independently. What is the probability that a 5-step chain is
          right, in percent?
        </>
      ),
      answer: 59, tol: 0.6, unit: '%',
      why: (
        <>
          0.9⁵ = 0.9 × 0.9 × 0.9 × 0.9 × 0.9 = 0.59049, or about <strong>59%</strong>. Five steps that are each 90% reliable give a chain that
          fails four times in ten.
        </>
      ),
      hint: 'All five must be right. Multiply the per-step probability by itself once per step.',
    },
    {
      id: 'cot-4', kind: 'num', level: 2,
      prompt: (
        <>
          A direct answer is 5 output tokens. With step-by-step reasoning the model writes 6 lines of 15 tokens and then the same 5-token answer.
          How many more output tokens does the reasoning version generate?
        </>
      ),
      answer: 90, tol: 0, unit: 'tokens',
      why: (
        <>
          Reasoning version: 6 × 15 + 5 = 95. Direct: 5. Difference: <strong>90</strong> extra tokens, each one a forward pass.
        </>
      ),
      hint: 'Count the output of each version, then subtract.',
    },
    {
      id: 'cot-5', kind: 'mcq', level: 2,
      prompt: 'In a 4-step chain, the model writes a wrong number on line 1 and makes no further arithmetic slips. What does the output look like?',
      options: [
        { text: 'Lines 2 to 4 compute correctly from the wrong number; the answer is wrong', correct: true, why: 'Each line takes the line above as its input. Correct arithmetic on a wrong input gives a wrong result, all the way to the answer.' },
        { text: 'Line 2 notices the mismatch with the prompt and restores the right value', why: 'Nothing forces a check. A model can sometimes catch an error, but the default is to build on what is written.' },
        { text: 'The error stays on line 1; later lines use the true value from the prompt', why: 'The true intermediate value is not in the prompt. It only ever existed as the wrong number on line 1.' },
        { text: 'The model stops, because a chain with an error cannot be continued', why: 'The model has no signal that an error occurred. It continues as fluently as before.' },
      ],
      hint: 'Ask where line 2 gets its input from.',
    },
    {
      id: 'cot-6', kind: 'mcq', level: 3,
      prompt: 'Under the lab’s model, p = 0.9 per written step and q = 0.5 for answering directly. From how many steps does the chain become less reliable than the direct answer?',
      options: [
        { text: 'From 7 steps: 0.9⁶ is 53.1% and 0.9⁷ is 47.8%', correct: true, why: '0.9⁶ = 0.531 is still above 0.5, and 0.9⁷ = 0.478 is below. Equivalently ln 0.5 ÷ ln 0.9 = 6.58, so the crossover falls between 6 and 7 steps.' },
        { text: 'From 5 steps: five chances at 10% failure add up to 50%', why: 'Failure chances do not add. The chain succeeds with 0.9⁵ = 59%, which still beats 50%.' },
        { text: 'From 10 steps: ten failures of 10% make failure certain', why: 'Adding 10% ten times is the wrong operation. 0.9¹⁰ is 34.9%, and the chain had already fallen below 50% three steps earlier.' },
        { text: 'Never: a written chain is always at least as reliable as a direct answer', why: 'Every extra step multiplies in another chance to fail. With enough steps p to the n falls below any fixed q.' },
      ],
      hint: 'Keep multiplying by 0.9 until the product passes below 0.5.',
    },
    {
      id: 'cot-7', kind: 'mcq', level: 3,
      prompt: 'A model writes a clear five-step derivation and a final answer. What does the derivation establish about how the answer was produced?',
      options: [
        { text: 'Only that the answer was generated with that text in its context', correct: true, why: 'The text may not match the internal computation. The steps are model output like any other. They influence the answer because they are in context, but they are not a trace of the network’s computation and can omit what actually drove it.' },
        { text: 'That the model performed exactly those five operations, in that order', why: 'Nothing ties the internal computation to the written description of it. Studies have found cases where they come apart.' },
        { text: 'That the answer is correct, provided every step is valid arithmetic', why: 'Valid steps from a wrong premise give a wrong answer, and the final answer is not forced to follow from the steps at all.' },
        { text: 'Nothing: the derivation is written after the answer has been fixed', why: 'It is written before the answer and usually affects it. The claim that fails is that it is a complete and faithful account.' },
      ],
      hint: 'Separate two claims: “this text was input to the answer” and “this text describes the computation”.',
    },
    {
      id: 'cot-8', kind: 'mcq', level: 3,
      prompt: 'A reasoning model “thinks” for 2,000 hidden tokens before a 50-token answer. Which statement is accurate?',
      options: [
        { text: 'It ran about 2,050 forward passes; the hidden tokens were context', correct: true, why: 'A reasoning phase is ordinary token generation that happens before the visible answer. Each token is one pass, and the answer is generated with all of them in context.' },
        { text: 'It ran one very deep forward pass that took as long as 2,000 normal ones', why: 'Depth per pass is fixed. Extra thinking time comes from generating more tokens, not from a deeper pass.' },
        { text: 'It ran 50 passes; the thinking happens in the weights between tokens', why: 'Nothing happens between tokens. The weights are static, and all computation is forward passes that emit tokens.' },
        { text: 'It searched a database for 2,000 tokens of relevant facts first', why: 'That would be retrieval, a different mechanism. Reasoning tokens are generated by the model itself.' },
      ],
      hint: 'One generated token, visible or not, is one forward pass.',
    },
  ],
  takeaways: [
    'A model generates one token per forward pass, and every generated token becomes input to the next pass.',
    'One pass has a fixed amount of computation, so writing intermediate results spreads a hard problem over many passes.',
    'The cost is more tokens and latency, and an early wrong line is carried forward to a confident wrong answer.',
    'Written reasoning is generated text, not a guaranteed record of how the answer was actually produced.',
  ],
};

export default lesson;
