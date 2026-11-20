import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Slider, Stat, mulberry32, softmax, useRaf, useSpring } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: eight next-token candidates with fixed logits. The logits are
 * illustrative (hand-picked, not read from a model), but everything
 * downstream is computed: probabilities = softmax(logits / T), entropy,
 * and every sample is a real draw from the distribution on screen.
 * ------------------------------------------------------------------ */

const WORDS = ['sunny', 'nice', 'cloudy', 'cold', 'rainy', 'hot', 'great', 'awful'];
const LOGITS = [4.0, 3.2, 2.9, 2.6, 2.2, 1.5, 1.3, 0.4];
const NW = WORDS.length;
const T_MIN = 0.1, T_MAX = 2.5;
const N_SAMPLES = 200;

function dist(logits: number[], T: number, greedy: boolean): number[] {
  if (greedy) {
    // T = 0 cannot be divided by. It is special-cased as argmax.
    const top = logits.indexOf(Math.max(...logits));
    return logits.map((_, i) => (i === top ? 1 : 0));
  }
  return softmax(logits, T);
}
const entropyBits = (p: number[]) => -p.reduce((s, x) => s + (x > 0 ? x * Math.log2(x) : 0), 0);
function draw(p: number[], r: number): number {
  let acc = 0;
  for (let i = 0; i < p.length; i++) { acc += p[i]; if (r < acc) return i; }
  return p.length - 1;
}

/* Toy next-word table for the sentence strip: logits depend only on the previous word. */
type Table = [string, number][];
const JOIN: Table = [['.', 2.6], ['and', 2.2], ['but', 1.4], ['again', 0.6]];
const AFTER: Record<string, Table> = {
  and: [['warm', 2.4], ['bright', 2.0], ['windy', 1.6], ['wet', 1.0], ['strange', 0.0]],
  but: [['windy', 2.2], ['chilly', 1.9], ['humid', 1.5], ['pleasant', 1.0], ['strange', 0.0]],
};
const END: Table = [['.', 3.0], ['tonight', 1.2], ['again', 0.8]];
interface Word { w: string; p: number | null; rank: number }

function genSentence(T: number, greedy: boolean, rand: () => number): Word[] {
  const out: Word[] = [];
  const pick = (t: Table): string => {
    const p = dist(t.map((x) => x[1]), T, greedy);
    const i = draw(p, rand());
    out.push({ w: t[i][0], p: p[i], rank: i + 1 });
    return t[i][0];
  };
  pick(WORDS.map((w, i) => [w, LOGITS[i]] as [string, number]));
  const j = pick(JOIN);
  if (j === 'and' || j === 'but') {
    pick(AFTER[j]);
    if (pick(END) !== '.') out.push({ w: '.', p: null, rank: 1 });
  } else if (j === 'again') out.push({ w: '.', p: null, rank: 1 });
  return out;
}

interface Run { id: number; label: string; picks: number[] }
const REL = 0.011; // seconds between drops
const FALL = 0.42;

function Histo({ run, elapsed, title }: { run: Run | null; elapsed: number | null; title: string }) {
  const W = 360, x0 = 12, cw = 42, base = 138, maxH = 112;
  const counts = new Array(NW).fill(0) as number[];
  const falling: { i: number; c: number; f: number }[] = [];
  if (run) {
    run.picks.forEach((c, i) => {
      const t = elapsed === null ? Infinity : elapsed - i * REL;
      if (t >= FALL) counts[c]++;
      else if (t > 0) falling.push({ i, c, f: t / FALL });
    });
  }
  const landed = counts.reduce((a, b) => a + b, 0);
  const distinct = counts.filter((c) => c > 0).length;
  const top = Math.max(...counts);
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="eyebrow" style={{ color: elapsed === null && title.startsWith('Previous') ? 'var(--fg-3)' : undefined }}>{title}</div>
        <span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{run ? run.label : ''}</span>
      </div>
      <svg className="viz" viewBox={`0 0 ${W} 176`} role="img" aria-label={`${title}: histogram of sampled tokens`}>
        <line x1={x0} x2={W - x0} y1={base} y2={base} stroke="var(--line-2)" />
        {WORDS.map((w, c) => {
          const h = (counts[c] / N_SAMPLES) * maxH;
          const cx = x0 + c * cw + cw / 2;
          return (
            <g key={w}>
              <rect x={cx - 15} y={base - h} width={30} height={h} rx={4} fill="var(--hue)" fillOpacity={counts[c] === top && top > 0 ? 1 : 0.6} />
              {counts[c] > 0 && <text x={cx} y={base - h - 5} textAnchor="middle" style={{ fontSize: 11.5, fill: 'var(--fg)' }}>{counts[c]}</text>}
              <text x={cx} y={base + 16} textAnchor="middle" style={{ fontSize: 11, fill: counts[c] > 0 ? 'var(--fg-2)' : 'var(--fg-3)' }}>{w}</text>
            </g>
          );
        })}
        {falling.map(({ i, c, f }) => {
          const cx = x0 + c * cw + cw / 2 + (((i * 37) % 17) - 8);
          const yEnd = base - (counts[c] / N_SAMPLES) * maxH;
          return <circle key={i} cx={cx} cy={4 + (yEnd - 4) * f * f} r={2.8} fill="#fff" fillOpacity={0.9} />;
        })}
        {!run && <text x={W / 2} y={80} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 12 }}>no samples yet</text>}
        <text x={W / 2} y={172} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>
          {run ? `${landed} drawn · ${distinct} different token${distinct === 1 ? '' : 's'} · most common ${top}/${landed || 0}` : ''}
        </text>
      </svg>
    </div>
  );
}

function Curves({ T, greedy }: { T: number; greedy: boolean }) {
  const W = 360, H = 262, xl = 40, xr = 348, yt = 14, yb = 226;
  const X = (t: number) => xl + ((t - T_MIN) / (T_MAX - T_MIN)) * (xr - xl);
  const Y = (p: number) => yb - p * (yb - yt);
  const paths = useMemo(() => {
    const pts: string[][] = WORDS.map(() => []);
    for (let k = 0; k <= 80; k++) {
      const t = T_MIN + ((T_MAX - T_MIN) * k) / 80;
      softmax(LOGITS, t).forEach((p, i) => pts[i].push(`${X(t).toFixed(1)},${Y(p).toFixed(1)}`));
    }
    return pts.map((p) => 'M' + p.join(' L'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const p = dist(LOGITS, T, greedy);
  const cx = greedy ? xl : X(T);
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Probability of each token as temperature changes">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={xl} x2={xr} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={xl - 6} y={Y(v) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{v * 100}%</text>
        </g>
      ))}
      <line x1={xl} x2={xr} y1={Y(1 / NW)} y2={Y(1 / NW)} stroke="var(--fg-3)" strokeDasharray="3 4" />
      <text x={xl + 5} y={Y(1 / NW) - 5} style={{ fontSize: 10.5, fill: 'var(--fg-3)' }}>all equal: 12.5%</text>
      {[0.1, 0.5, 1, 1.5, 2, 2.5].map((t) => (
        <text key={t} x={X(t)} y={yb + 16} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{t}</text>
      ))}
      <text x={(xl + xr) / 2} y={H - 3} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>temperature</text>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={i === 0 ? 'var(--hue)' : 'var(--fg-2)'} strokeOpacity={i === 0 ? 1 : 0.75 - i * 0.07} strokeWidth={i === 0 ? 2.4 : 1.4} />
      ))}
      <line x1={cx} x2={cx} y1={yt - 4} y2={yb} stroke="#fff" strokeOpacity={0.5} style={{ transition: 'all .2s' }} />
      {p.map((v, i) => (
        <circle key={i} cx={cx} cy={Y(v)} r={i === 0 ? 4.5 : 3} fill={i === 0 ? 'var(--hue)' : '#fff'} style={{ transition: 'all .2s' }} />
      ))}
      <text x={Math.min(cx + 8, xr - 60)} y={yt + 2} style={{ fontSize: 11, fill: 'var(--hue)' }}>sunny</text>
    </svg>
  );
}

function TemperatureLab({ complete }: LabProps) {
  const [T, setT] = useState(1);
  const [greedy, setGreedy] = useState(false);
  const [seen, setSeen] = useState({ lo: 1, hi: 1 });
  const [run, setRun] = useState<Run | null>(null);
  const [prev, setPrev] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null); // null = not animating
  const [sampled, setSampled] = useState({ low: false, high: false });
  const [sentences, setSentences] = useState<{ id: number; label: string; words: Word[] }[]>([]);
  const start = useRef<number | null>(null);
  const seed = useRef(11);
  const rand = useRef(mulberry32(2024));

  const p = useMemo(() => dist(LOGITS, T, greedy), [T, greedy]);
  const H = entropyBits(p);
  const topS = useSpring(p[0], 0.3);
  const hS = useSpring(H, 0.3);
  const effS = useSpring(2 ** H, 0.3);
  const label = greedy ? 'T → 0' : 'T = ' + T.toFixed(2);

  useEffect(() => {
    if (!greedy && p[0] >= 0.95) complete('sharp');
    if (!greedy && Math.max(...p) <= 0.25) complete('flat');
    if (greedy && seen.lo <= 0.5 && seen.hi >= 2) complete('rank');
    if (sampled.low && sampled.high) complete('sample');
  }, [p, greedy, seen, sampled, complete]);

  useRaf((t) => {
    if (start.current === null) start.current = t;
    const e = t - start.current;
    if (e > N_SAMPLES * REL + FALL + 0.05) setElapsed(null);
    else setElapsed(e);
  }, elapsed !== null);

  const changeT = (v: number) => {
    setGreedy(false);
    setT(v);
    setSeen((s) => ({ lo: Math.min(s.lo, v), hi: Math.max(s.hi, v) }));
  };
  const sample = () => {
    sfx.tap();
    const r = mulberry32(seed.current++);
    if (run) setPrev(run);
    setRun({ id: seed.current, label, picks: Array.from({ length: N_SAMPLES }, () => draw(p, r())) });
    start.current = null;
    setElapsed(0);
    setSampled((s) => ({ low: s.low || greedy || T <= 0.3, high: s.high || (!greedy && T >= 1.5) }));
  };
  const sentence = () => {
    sfx.tap();
    const words = genSentence(T, greedy, rand.current);
    setSentences((s) => [{ id: (s[0]?.id ?? 0) + 1, label, words }, ...s].slice(0, 3));
  };

  const gap = LOGITS[0] - LOGITS[1];
  // Rank is computed from the tempered probabilities (not the array order), so the lab would show a swap if one could happen.
  const ranks = softmax(LOGITS, T).map((x, _, a) => 1 + a.filter((y) => y > x).length);

  return (
    <div className="lab-grid">
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 17, color: 'var(--fg)' }}>
          The weather today is <span style={{ color: 'var(--hue)', borderBottom: '2px dashed var(--hue)', padding: '0 14px' }}>?</span>
        </div>
        <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
          Eight candidates with illustrative logits (hand-picked, not read from a model). A real model scores every token in its vocabulary.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'end' }}>
        <Slider label="Temperature T (every logit is divided by it)" value={T} min={T_MIN} max={T_MAX} step={0.05} onChange={changeT}
          format={(v) => (greedy ? 'T → 0' : v.toFixed(2))} />
        <button className="btn sm" onClick={() => { sfx.tap(); setGreedy(!greedy); }}
          style={greedy ? { borderColor: 'var(--hue)', color: 'var(--hue)', marginBottom: 2 } : { marginBottom: 2 }}>
          T → 0 (greedy)
        </button>
      </div>

      <div className="row" style={{ alignItems: 'stretch' }}>
        <Stat label="probability of top token" value={(topS * 100).toFixed(1) + '%'} hot />
        <Stat label="entropy (bits)" value={hS.toFixed(2)} />
        <Stat label="effective choices (2^entropy)" value={effS.toFixed(2)} />
        <span className="dim" style={{ fontSize: 13, maxWidth: '32ch', alignSelf: 'center' }}>
          {greedy
            ? 'Dividing by 0 is undefined, so T = 0 is handled as a rule: always take the top token.'
            : <>sunny leads nice by {gap.toFixed(1)}. ÷ T = {(gap / T).toFixed(2)}, so sunny is e^{(gap / T).toFixed(2)} = <strong style={{ color: 'var(--fg)' }}>{Math.exp(gap / T) >= 1000 ? Math.exp(gap / T).toFixed(0) : Math.exp(gap / T).toFixed(2)}×</strong> as likely.</>}
        </span>
      </div>

      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        Entropy measures how spread out the distribution is. 2^entropy is the number of equally likely options that would
        be just as uncertain: 1 = certain, 8 = all eight equal.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{greedy ? 'argmax(logits)' : `softmax(logits ÷ ${T.toFixed(2)})`}</div>
          <Bars
            items={WORDS.map((w, i) => ({ label: `${ranks[i]} ${w}`, value: p[i], color: i === 0 ? undefined : 'color-mix(in srgb, var(--hue) 62%, transparent)' }))}
            max={1} labelWidth={72}
          />
          <div className="dim" style={{ fontSize: 12.5, marginTop: 8 }}>The number before each word is its rank, recomputed from the probabilities at every T. Watch whether it ever changes.</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Every token’s probability at every T</div>
          <Curves T={T} greedy={greedy} />
          <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>Eight curves, one per token. They squeeze together as T rises and never cross.</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--panel)', padding: 14, display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, color: 'var(--fg-2)' }}>Draw {N_SAMPLES} next tokens from the distribution above.</span>
          <button className="btn sm primary" onClick={sample} disabled={elapsed !== null}>Sample {N_SAMPLES} tokens at {label}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <Histo run={run} elapsed={elapsed} title="This run" />
          <Histo run={prev} elapsed={null} title="Previous run" />
        </div>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--panel)', padding: 14, display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, color: 'var(--fg-2)' }}>Sample word after word at {label}.</span>
          <button className="btn sm" onClick={sentence}>Generate a sentence</button>
        </div>
        <div style={{ display: 'grid', gap: 8, minHeight: 44 }}>
          {sentences.length === 0 && <span className="dim" style={{ fontSize: 13 }}>Press the button a few times at one temperature, then move the slider and press again.</span>}
          {sentences.map((s, si) => (
            <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', opacity: si === 0 ? 1 : 0.55 }}>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-3)', minWidth: 62 }}>{s.label}</span>
              <span className="mono" style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>The weather today is</span>
              {s.words.map((w, wi) => (
                <motion.span key={wi} className="mono" initial={si === 0 ? { opacity: 0, y: -10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: wi * 0.16 }}
                  title={w.p === null ? 'forced end' : `rank ${w.rank} in its table`}
                  style={{
                    fontSize: 13.5, padding: '3px 7px', borderRadius: 7, color: '#fff',
                    border: `1px solid ${w.p === null ? 'var(--line-2)' : w.rank === 1 ? 'var(--hue-line)' : 'color-mix(in srgb, var(--warn) 60%, transparent)'}`,
                    background: w.p === null ? 'transparent' : w.rank === 1 ? 'var(--hue-soft)' : 'color-mix(in srgb, var(--warn) 14%, transparent)',
                  }}>
                  {w.w}
                  {w.p !== null && <span style={{ fontSize: 10.5, color: 'var(--fg-2)', marginLeft: 5 }}>{(w.p * 100).toFixed(0)}%</span>}
                </motion.span>
              ))}
            </div>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12.5 }}>
          Toy table: hand-written logits that depend only on the previous word. The draws are real, the table is not a language model.
          The percentage is the chance that word had at this temperature. Amber = not the top choice.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'temperature',
  hook: {
    prompt: <>You lower a model’s temperature setting from 1.0 to 0.2 and ask the same question again. What has changed inside?</>,
    options: [
      {
        text: 'The same scores are divided by a smaller number, so the leading tokens pull further ahead',
        correct: true,
        why: 'Temperature divides every score before the softmax. Dividing by 0.2 multiplies every gap by 5, so the leading tokens pull far ahead. The scores, their order and the weights are all untouched.',
      },
      {
        text: 'The model reasons more carefully before answering, so its answers become more accurate',
        why: 'No extra computation happens. The network produces exactly the same scores. Only the last step, turning scores into probabilities, changes.',
      },
      {
        text: 'The model switches to a more conservative version of its weights that was trained for precision',
        why: 'There is one set of weights and temperature never touches it. It is a number applied to the output scores at the moment of sampling.',
      },
      {
        text: 'Unlikely tokens are deleted from the candidate list, so only a few safe options are left',
        why: 'Nothing is deleted. Every token keeps a probability above zero at any temperature above zero. Cutting the list is a different setting (top-k and top-p).',
      },
    ],
    reveal: 'Next you will move that one number yourself and watch eight probabilities reshape.',
  },
  Lab: TemperatureLab,
  missions: [
    {
      id: 'sharp',
      text: 'Lower the temperature slider until the top token has more than 95%.',
      insight: 'At T = 0.2 the gap of 0.8 between “sunny” and “nice” becomes 4.0, and e^4 ≈ 55, so “sunny” is 55 times as likely where it was 2.2 times at T = 1. Dividing by a number below 1 stretches every gap, and softmax turns stretched gaps into a near-certain winner.',
    },
    {
      id: 'flat',
      text: 'Raise the temperature until no token has more than 25%.',
      insight: 'Dividing by a number above 1 shrinks every gap. At T = 2.5 “sunny” has 22.9% and “awful” has risen from 1.2% to 5.4%. The effective number of choices is above 7 out of 8: close to picking at random.',
    },
    {
      id: 'rank',
      text: 'Sweep the slider from below 0.5 to above 2 while watching the rank numbers, then press “T → 0 (greedy)”.',
      insight: 'The ranks never moved and the curves never crossed. Dividing every score by the same positive number cannot change which is larger. Greedy is the limit: all the probability on rank 1. Temperature decides how often the lower ranks get picked, never which token is on top.',
    },
    {
      id: 'sample',
      text: 'Sample 200 tokens at T = 0.3 or lower, then at T = 1.5 or higher, and compare the two histograms.',
      insight: 'Same scores, same model, different spread. At low T nearly every draw is “sunny”. At high T all eight words show up, including ones the model scored as poor. Run a low setting twice and you get almost the same result twice: that repeatability is what low temperature buys. Then generate a few sentences at each setting: amber words are picks that were not the top choice.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A model ends each step with one score per token, called a <em>logit</em>. Softmax turns those into
          probabilities and the next token is drawn at random from them. Temperature is one extra step in between:{' '}
          <strong>divide every logit by T, then apply softmax</strong>.
        </p>
        <Callout>
          <M>{String.raw`p_i=\frac{e^{z_i/T}}{\sum_j e^{z_j/T}}`}</M>
        </Callout>
        <ul>
          <li><strong>T below 1</strong> stretches the gaps between logits. The distribution sharpens toward the top token.</li>
          <li><strong>T above 1</strong> shrinks the gaps. The distribution flattens toward equal shares.</li>
          <li><strong>T = 1</strong> leaves the model’s own probabilities as they are.</li>
          <li><strong>T = 0</strong> would divide by zero, so software treats it as a special case: always pick the highest logit. This is called greedy or argmax decoding.</li>
        </ul>
        <p>
          The order of the tokens never changes, as the lab showed. Temperature acts only when text is generated. It
          changes nothing in the weights and nothing in the scores.
        </p>
        <p>
          Low temperature does not make a model more correct. It makes it more repeatable: the same top choice, right or
          wrong, nearly every time.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Three tokens with logits <code>[3, 1, 0]</code>. Run the same softmax at three temperatures.
        </p>
        <table>
          <thead>
            <tr><th>T</th><th>logits ÷ T</th><th>e^(…)</th><th>sum</th><th>probabilities</th></tr>
          </thead>
          <tbody>
            <tr><td>0.5</td><td>[6, 2, 0]</td><td>403.4, 7.39, 1</td><td>411.8</td><td>0.980, 0.018, 0.002</td></tr>
            <tr><td>1</td><td>[3, 1, 0]</td><td>20.09, 2.72, 1</td><td>23.80</td><td>0.844, 0.114, 0.042</td></tr>
            <tr><td>2</td><td>[1.5, 0.5, 0]</td><td>4.48, 1.65, 1</td><td>7.13</td><td>0.629, 0.231, 0.140</td></tr>
          </tbody>
        </table>
        <p>
          The first token goes from 98% to 84% to 63% as T rises. The last goes from 0.2% to 4% to 14%. In every row the
          order is the same: first, second, third.
        </p>
        <p>
          The ratio between the top two tells the whole story. Their logits differ by 2, so the ratio is e^(2/T): e^4 ≈
          55 at T = 0.5, e^2 ≈ 7.4 at T = 1, e^1 ≈ 2.7 at T = 2.
        </p>
        <Code>{`
def sample(logits, T):
    if T == 0:                       # special case, no division
        return argmax(logits)
    probs = softmax(logits / T)      # the only place T appears
    return random_choice(probs)
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why the order cannot change</h3>
        <p>
          The ratio of any two probabilities is <M>{String.raw`p_i/p_j = e^{(z_i - z_j)/T}`}</M>. If{' '}
          <M>{'z_i > z_j'}</M> the exponent is positive for every positive T, so the ratio stays above 1. T only sets how
          far above. As <M>{String.raw`T \to \infty`}</M> every ratio goes to 1 (all tokens equal). As{' '}
          <M>{String.raw`T \to 0`}</M> the ratio of the top token to any other goes to infinity (one token takes
          everything).
        </p>
        <h3>You have seen this slider before</h3>
        <p>
          In the Attention lesson a “score scale” multiplied scores before a softmax, and a large scale gave one token
          over 90% of the weight. Temperature is the same control written as a division: multiplying by 5 is dividing by
          T = 0.2.
        </p>
        <h3>When to use which</h3>
        <p>
          Use low values (0 to about 0.3) when you want the same input to give the same output: extracting fields,
          classifying, writing code to a spec, automated tests. Use values near 1 when variety is the point:
          brainstorming, fiction, asking for several different drafts. Values well above 1 are rarely useful, because a
          real vocabulary has tens of thousands of tokens and flattening moves probability onto a very long tail of bad
          ones.
        </p>
        <h3>What real systems do</h3>
        <p>
          APIs usually accept a temperature from 0 up to 1 or 2. In the most common open-source implementation (Hugging
          Face transformers) temperature is applied first, and top-k or top-p then cut the tail of the reshaped
          distribution. Other samplers use a different order, so check before relying on it. Even at T = 0, output can differ slightly
          between runs: near-ties between two logits can be broken differently by floating-point arithmetic on different
          hardware.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Low temperature repeats mistakes faithfully',
      body: 'If the model’s top token is wrong, T = 0 picks it every time. You get the same wrong answer on every run, which looks like confidence and is only repetition.',
    },
    {
      title: 'High temperature feeds the tail',
      body: 'In the lab, raising T from 1 to 2.5 took “awful” from 1.2% to 5.4%. A real vocabulary has tens of thousands of low-scored tokens, and together they gain a large share. One bad token stays in the context and every later step builds on it.',
    },
    {
      title: 'It cannot promote the answer you wanted',
      body: 'If the token you want is ranked third, no temperature makes it the most likely. Temperature changes how often lower ranks are drawn, never the ranking. Changing the ranking takes a different prompt or different weights.',
    },
    {
      title: 'Always taking the top token makes flat text',
      body: 'Greedy decoding over many steps tends to produce generic wording and can fall into repeating loops. The most likely next word, chosen every time, is not the same as the best paragraph.',
    },
  ],
  questions: [
    {
      id: 'tmp-1', kind: 'mcq', level: 1,
      prompt: 'Where does temperature enter the computation?',
      options: [
        { text: 'Every logit is divided by T just before the softmax', correct: true, why: 'p = softmax(logits ÷ T). That single division is the entire mechanism.' },
        { text: 'Every probability is divided by T just after the softmax', why: 'Dividing probabilities by a constant and renormalizing would give back the same distribution. The division has to happen before the exponentials.' },
        { text: 'Every weight in the final layer is scaled by T', why: 'The weights are never modified. T is applied to the scores the weights produce.' },
        { text: 'Random noise of size T is added to every logit', why: 'Nothing is added. The randomness comes from drawing a token from the probabilities, and T reshapes those probabilities.' },
      ],
    },
    {
      id: 'tmp-2', kind: 'mcq', level: 1,
      prompt: 'What does a temperature below 1 do to the distribution?',
      options: [
        { text: 'Sharpens it: gaps between logits grow, so the top tokens gain probability', correct: true, why: 'Dividing by a number below 1 makes every logit gap larger, and softmax turns larger gaps into a more lopsided distribution.' },
        { text: 'Flattens it: gaps between logits shrink, so all tokens move toward equal shares', why: 'That is T above 1. Dividing by a number below 1 enlarges the gaps.' },
        { text: 'Reorders it: tokens that were close in score can swap places', why: 'Dividing all scores by the same positive number never changes which one is larger.' },
        { text: 'Truncates it: tokens below a cutoff are set to exactly zero', why: 'Every token keeps a nonzero probability at any T above 0. Cutting tokens off is what top-k and top-p do.' },
      ],
    },
    {
      id: 'tmp-3', kind: 'mcq', level: 1,
      prompt: 'A team changes its deployed model’s temperature from 0.7 to 0.2. What happens to the model’s weights?',
      options: [
        { text: 'Nothing. Temperature is applied to the output scores when sampling', correct: true, why: 'It is an inference-time setting. The same weights produce the same logits, and only the conversion to probabilities changes.' },
        { text: 'The output layer is rescaled, and the other layers stay the same', why: 'No layer is changed. The division is applied to the logits after the network has finished.' },
        { text: 'They are fine-tuned briefly so the model becomes more cautious', why: 'No training happens when you change a sampling setting. The change takes effect on the next request.' },
        { text: 'A different stored copy of the weights is loaded for that setting', why: 'There is one set of weights. Any temperature can be used with it, request by request.' },
      ],
    },
    {
      id: 'tmp-4', kind: 'num', level: 2,
      prompt: <>Two tokens have logits <code>[2, 0]</code>. At T = 2, what is the probability of the first token? (e ≈ 2.718)</>,
      answer: 0.73, tol: 0.02,
      why: <>Divide by T: [1, 0]. e¹ = 2.718, e⁰ = 1, sum 3.718. 2.718 ÷ 3.718 = <strong>0.73</strong>. At T = 1 it would have been 0.88.</>,
      hint: 'Divide both logits by T first, then do an ordinary softmax.',
    },
    {
      id: 'tmp-5', kind: 'num', level: 2,
      prompt: 'The top token’s logit is 3 higher than the runner-up’s. At T = 1.5, how many times as likely is the top token? (e² ≈ 7.39, e³ ≈ 20.1)',
      answer: 7.39, tol: 0.15, unit: '×',
      why: <>The ratio of two probabilities is e^(gap ÷ T) = e^(3 ÷ 1.5) = e² = <strong>7.39</strong>. At T = 1 it would be e³ ≈ 20.1.</>,
      hint: 'The ratio depends only on the logit gap divided by T.',
    },
    {
      id: 'tmp-6', kind: 'mcq', level: 2,
      prompt: 'At T = 1 the token you want is ranked third with 12%. Which temperature makes it the most likely token?',
      options: [
        { text: 'None. Temperature never changes the ranking, so the third token stays third', correct: true, why: 'Raising T pushes its probability toward an equal share and lowering T pushes it toward zero, but the two tokens above it stay above it at every T.' },
        { text: 'A high one, such as 2.5, because flattening lifts lower-ranked tokens to the top', why: 'Flattening moves every token toward the same share. The two tokens ahead of it move toward that share from above, so it can approach them and never pass them.' },
        { text: 'A low one, such as 0.2, because sharpening rewards the tokens the model prefers', why: 'Sharpening rewards rank 1. The third-ranked token loses almost all of its 12%.' },
        { text: 'Exactly T = 0, because greedy decoding searches for the best available token', why: 'Greedy picks the highest logit, which is rank 1. There is no search.' },
      ],
      hint: 'Think about what happened to the rank numbers in the lab as you swept the slider.',
    },
    {
      id: 'tmp-7', kind: 'mcq', level: 3,
      prompt: 'On a factual question, the model’s top token is a wrong answer with 60% at T = 1. The right answer has 30%. You set T = 0.2. What happens to accuracy?',
      options: [
        { text: 'It falls: the wrong answer takes nearly all the probability, so the right one is rarely drawn', correct: true, why: 'Sharpening moves probability to rank 1, and here rank 1 is wrong. At T = 1 the model was right about 30% of the time. At T = 0.2 it is wrong on nearly every run, and consistently so.' },
        { text: 'It rises: lower temperature removes randomness, and randomness was the cause of the errors', why: 'The error is in the scores, not the sampling. Removing randomness locks in whatever the top token is, right or wrong.' },
        { text: 'It stays the same: temperature changes wording but cannot change which answer is given', why: 'It changes how often each token is drawn. The right answer goes from being drawn about 30% of the time to almost never.' },
        { text: 'It rises: at low temperature the model weighs the evidence for each answer more heavily', why: 'The model does no additional work at a lower temperature. The same logits are divided by a smaller number.' },
      ],
      hint: 'Which token benefits from sharpening, and is that token the right one here?',
    },
    {
      id: 'tmp-8', kind: 'mcq', level: 3,
      prompt: <>Someone implements sampling as <code>softmax(logits / T)</code> with no other code, and a user sets T = 0. What happens, and what do real systems do instead?</>,
      options: [
        { text: 'It divides by zero; real systems special-case T = 0 as “pick the highest logit”', correct: true, why: 'Logits ÷ 0 is infinite or undefined, so the softmax returns garbage. Since the limit of sharpening is all probability on the top token, implementations skip the formula and return the argmax.' },
        { text: 'It returns equal probabilities for all tokens; real systems accept this as the meaning of T = 0', why: 'Equal probabilities are the limit as T grows large, not as it shrinks. T = 0 means the opposite: one token takes everything.' },
        { text: 'It works and returns the argmax by itself; real systems need no special handling', why: 'The formula does not survive a division by zero. The argmax behaviour has to be written in as a separate branch.' },
        { text: 'It returns the unmodified distribution; real systems treat T = 0 as “temperature off”', why: 'The unmodified distribution is T = 1, where dividing changes nothing.' },
      ],
      hint: 'Work out logits ÷ T for T = 0, then ask what the distribution approaches as T gets very small.',
    },
  ],
  takeaways: [
    'Temperature divides every logit by T before the softmax: below 1 sharpens the distribution, above 1 flattens it.',
    'The ranking of tokens is the same at every temperature; only how often lower ranks are drawn changes.',
    'T = 0 is special-cased as argmax, because dividing by zero is undefined.',
    'Temperature is an inference setting that leaves the weights alone, and a low value makes output more repeatable, not more correct.',
  ],
};

export default lesson;
