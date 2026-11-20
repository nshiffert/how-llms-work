import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Slider, Stat, mulberry32, softmax } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: truncating a next-token distribution.
 * Two hand-picked sets of 14 logits are pushed through a real softmax.
 * Top-k and top-p are applied to the sorted probabilities exactly as a
 * sampler applies them, and the survivors are renormalised. A real
 * vocabulary has tens of thousands of entries; 14 keeps it readable.
 * ------------------------------------------------------------------ */

type Ctx = 'confident' | 'uncertain';
type Mode = 'k' | 'p' | 'both';

const CONTEXTS: Record<Ctx, { prompt: string; tokens: string[]; logits: number[] }> = {
  confident: {
    prompt: 'The capital of France is',
    tokens: ['Paris', 'the', 'a', 'located', 'in', 'Lyon', 'not', 'one', 'called', 'home', 'known', 'France', 'Nice', 'Rome'],
    logits: [5.2, 2.3, 2.0, 1.3, 0.6, 0.4, 0.2, 0.0, -0.2, -0.4, -0.6, -0.8, -1.0, -1.3],
  },
  uncertain: {
    prompt: 'For dinner tonight I want',
    tokens: ['pizza', 'pasta', 'sushi', 'tacos', 'curry', 'a', 'to', 'steak', 'some', 'ramen', 'soup', 'the', 'salad', 'shoes'],
    logits: [2.6, 2.45, 2.3, 2.1, 1.9, 1.7, 1.4, 1.1, 0.8, 0.4, 0.0, -0.5, -1.0, -1.6],
  },
};
const N = 14;
const PROBS: Record<Ctx, number[]> = {
  confident: softmax(CONTEXTS.confident.logits),
  uncertain: softmax(CONTEXTS.uncertain.logits),
};
const cumsum = (p: number[]) => {
  let c = 0;
  return p.map((x) => (c += x));
};
const CUM: Record<Ctx, number[]> = { confident: cumsum(PROBS.confident), uncertain: cumsum(PROBS.uncertain) };

/** Smallest prefix of the sorted list whose total reaches p. */
function nucleusCount(cum: number[], p: number) {
  for (let i = 0; i < cum.length; i++) if (cum[i] >= p - 1e-9) return i + 1;
  return cum.length;
}
function keepCount(ctx: Ctx, mode: Mode, k: number, p: number) {
  const nP = nucleusCount(CUM[ctx], p);
  const n = mode === 'k' ? k : mode === 'p' ? nP : Math.min(k, nP);
  const bind: 'k' | 'p' | 'tie' = k < nP ? 'k' : nP < k ? 'p' : 'tie';
  return { n, nP, bind };
}

// Numbers quoted in the prose, all derived from the same logits the lab uses.
const pc = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
const C = PROBS.confident;
const U = PROBS.uncertain;
const C_P90 = nucleusCount(CUM.confident, 0.9);
const U_P90 = nucleusCount(CUM.uncertain, 0.9);
const C_T15 = softmax(CONTEXTS.confident.logits, 1.5);
const C_T15_P90 = nucleusCount(cumsum(C_T15), 0.9);

const SAMPLES = 40;

function TruncationLab({ complete }: LabProps) {
  const [ctx, setCtx] = useState<Ctx>('uncertain');
  const [mode, setMode] = useState<Mode>('k');
  const [k, setK] = useState(10);
  const [p, setP] = useState(0.9);
  const [seed, setSeed] = useState(0);

  const probs = PROBS[ctx];
  const cum = CUM[ctx];
  const toks = CONTEXTS[ctx].tokens;
  const { n, nP, bind } = keepCount(ctx, mode, k, p);
  const mass = cum[n - 1];
  const worst = probs[n - 1];
  const renorm = probs.map((x, i) => (i < n ? x / mass : 0));

  const samples = useMemo(() => {
    if (!seed) return [];
    const rnd = mulberry32(seed * 7919 + n * 31 + (ctx === 'confident' ? 1 : 2));
    return Array.from({ length: SAMPLES }, () => {
      let r = rnd();
      for (let i = 0; i < n; i++) {
        r -= renorm[i];
        if (r <= 0) return i;
      }
      return n - 1;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, n, ctx]);
  const rare = samples.filter((i) => probs[i] < 0.01).length;

  // Missions
  const seenP = useRef(new Set<Ctx>());
  const seenBind = useRef(new Set<string>());
  useEffect(() => {
    if (mode === 'k' && k === 5 && ctx === 'confident' && worst < 0.01) complete('junk');
    if (mode === 'p' && Math.abs(p - 0.9) < 0.004) {
      seenP.current.add(ctx);
      if (seenP.current.size === 2) complete('adapt');
    }
    if (mode === 'p' && ctx === 'confident' && n === 1) complete('one');
    if (mode === 'both' && bind !== 'tie') {
      seenBind.current.add(bind);
      if (seenBind.current.size === 2) complete('bind');
    }
  }, [mode, k, p, ctx, n, worst, bind, complete]);

  // Layout
  const W = 760;
  const L = 46;
  const R = 54;
  const cw = (W - L - R) / N;
  const bw = 30;
  const top1 = 30;
  const H1 = 170;
  const base1 = top1 + H1;
  const top2 = 290;
  const H2 = 110;
  const base2 = top2 + H2;
  const bx = (i: number) => L + cw * i + (cw - bw) / 2;
  const cxm = (i: number) => L + cw * (i + 0.5);
  const y1 = (v: number) => base1 - v * H1;
  const cutX = L + cw * n;
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const useK = mode !== 'p';
  const useP = mode !== 'k';
  const crossing = nP - 1;

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Context</span>
          <Seg
            value={ctx}
            onChange={setCtx}
            options={[{ value: 'confident', label: 'confident' }, { value: 'uncertain', label: 'uncertain' }]}
          />
        </div>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Truncate with</span>
          <Seg
            value={mode}
            onChange={setMode}
            options={[{ value: 'k', label: 'top-k' }, { value: 'p', label: 'top-p' }, { value: 'both', label: 'both' }]}
          />
        </div>
      </div>

      <div className="mono" style={{ fontSize: 15 }}>
        <span className="dim">prompt: </span>
        {CONTEXTS[ctx].prompt}{' '}
        <span style={{ color: 'var(--hue)', borderBottom: '2px solid var(--hue)', padding: '0 10px' }}>?</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg className="viz" viewBox={`0 0 ${W} 430`} style={{ minWidth: 640 }} role="img" aria-label="Sorted next-token probabilities with the kept set highlighted, and the renormalised distribution below">
          <text x={L} y={16} style={{ fill: 'var(--fg-3)', fontSize: 12 }}>
            1 · model output, sorted · bars = probability · line = running total
          </text>
          {/* gridlines */}
          {[0, 0.5, 1].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={y1(g)} y2={y1(g)} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 8} y={y1(g) + 4} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>{g * 100}%</text>
            </g>
          ))}
          {/* kept region */}
          <rect
            x={L} y={top1 - 6} height={base2 - top1 + 6} width={cutX - L} rx={8}
            fill="var(--hue)" fillOpacity={0.07}
            style={{ transition: `width .45s ${ease}` }}
          />
          <line
            x1={0} x2={0} y1={top1 - 6} y2={base2 + 28}
            stroke="var(--hue)" strokeWidth={1.5} strokeDasharray="5 4"
            style={{ transform: `translateX(${cutX}px)`, transition: `transform .45s ${ease}` }}
          />
          <text
            x={0} y={base2 + 27}
            textAnchor={n > 11 ? 'end' : 'start'}
            style={{ fill: 'var(--hue)', fontSize: 12, fontWeight: 600, transform: `translateX(${cutX + (n > 11 ? -8 : 8)}px)`, transition: `transform .45s ${ease}` }}
          >
            {n > 11 ? `keep ${n} ←` : `← keep ${n}`}
          </text>

          {/* bars */}
          {probs.map((v, i) => {
            const kept = i < n;
            const h = Math.max(2, v * H1);
            return (
              <g key={i}>
                <rect
                  x={bx(i)} width={bw} rx={4}
                  y={base1 - h} height={h}
                  fill={kept ? 'var(--hue)' : 'var(--line-2)'} fillOpacity={kept ? 0.85 : 0.7}
                  style={{ transition: `y .45s ${ease}, height .45s ${ease}, fill .3s` }}
                />
                <text x={cxm(i)} y={base1 + 18} textAnchor="middle" style={{ fontSize: 12, fill: kept ? '#fff' : 'var(--fg-3)', fontWeight: kept ? 600 : 400, transition: 'fill .3s' }}>
                  {toks[i]}
                </text>
                <text x={cxm(i)} y={base1 + 33} textAnchor="middle" style={{ fontSize: 10.5, fill: kept && v < 0.01 ? 'var(--warn)' : 'var(--fg-3)' }}>
                  {v < 0.1 ? (v * 100).toFixed(2) : (v * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* top-p threshold */}
          <g style={{ opacity: useP ? 1 : 0, transition: 'opacity .3s' }}>
            <line
              x1={L} x2={W - R} y1={0} y2={0} stroke="#fff" strokeOpacity={0.75} strokeWidth={1.2} strokeDasharray="3 4"
              style={{ transform: `translateY(${y1(p)}px)`, transition: `transform .25s ${ease}` }}
            />
            <text x={W - R + 6} y={4} style={{ fill: '#fff', fontSize: 11.5, fontWeight: 600, transform: `translateY(${y1(p)}px)`, transition: `transform .25s ${ease}` }}>
              p={p.toFixed(2)}
            </text>
          </g>

          {/* cumulative line */}
          <polyline
            points={cum.map((c, i) => `${cxm(i)},${y1(c)}`).join(' ')}
            fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.6} strokeLinejoin="round"
          />
          {cum.map((c, i) => {
            const hit = useP && i === crossing;
            return (
              <circle
                key={i} cx={cxm(i)} cy={y1(c)} r={hit ? 6 : 3}
                fill={hit ? 'var(--hue)' : i < n ? '#fff' : 'var(--fg-3)'}
                stroke={hit ? '#fff' : 'none'} strokeWidth={2}
                style={{ transition: `cy .45s ${ease}, r .25s` }}
              />
            );
          })}

          {/* renormalised row */}
          <text x={L} y={top2 - 22} style={{ fill: 'var(--fg-3)', fontSize: 12 }}>
            2 · what the sampler draws from · survivors ÷ {mass.toFixed(3)} so they sum to 100%
          </text>
          {[0, 1].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={base2 - g * H2} y2={base2 - g * H2} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 8} y={base2 - g * H2 + 4} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>{g * 100}%</text>
            </g>
          ))}
          {renorm.map((v, i) => {
            const kept = i < n;
            const h = kept ? Math.max(2, v * H2) : 0;
            return (
              <g key={i}>
                <rect
                  x={bx(i)} width={bw} rx={4} y={base2 - h} height={h}
                  fill="var(--hue)"
                  style={{ transition: `y .45s ${ease}, height .45s ${ease}` }}
                />
                <text
                  x={cxm(i)} y={kept ? base2 - h - 6 : base2 - 6} textAnchor="middle"
                  style={{ fontSize: 10.5, fill: kept ? 'var(--fg-2)' : 'var(--fg-3)', opacity: kept ? 1 : 0.6 }}
                >
                  {kept ? (v < 0.1 ? (v * 100).toFixed(2) : (v * 100).toFixed(1)) + '%' : '0'}
                </text>
                <text x={cxm(i)} y={base2 + 17} textAnchor="middle" style={{ fontSize: 11, fill: kept ? 'var(--fg-2)' : 'var(--fg-3)', opacity: kept ? 1 : 0.5, textDecoration: kept ? undefined : 'line-through' }}>
                  {toks[i]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div style={{ opacity: useK ? 1 : 0.3, pointerEvents: useK ? undefined : 'none', transition: 'opacity .3s' }}>
          <Slider label="k · how many tokens to keep" value={k} min={1} max={N} step={1} onChange={setK} />
        </div>
        <div style={{ opacity: useP ? 1 : 0.3, pointerEvents: useP ? undefined : 'none', transition: 'opacity .3s' }}>
          <Slider label="p · how much probability to keep" value={p} min={0.05} max={1} step={0.01} onChange={setP} format={(v) => v.toFixed(2)} />
        </div>
      </div>

      <div className="row">
        <Stat label="tokens kept" value={`${n} of ${N}`} hot />
        <Stat label="mass kept" value={pc(mass)} />
        <Stat label="worst kept token" value={pc(worst, worst < 0.1 ? 2 : 1)} hot={worst < 0.01} />
        {mode === 'both' && (
          <Stat label="limit that binds" value={bind === 'tie' ? 'both' : bind === 'k' ? `top-k (${k} < ${nP})` : `top-p (${nP} < ${k})`} />
        )}
        {worst < 0.01 && n > 1 && (
          <span style={{ fontSize: 13, color: 'var(--warn)', maxWidth: '30ch' }}>
            “{toks[n - 1]}” is under 1% and still in the draw.
          </span>
        )}
      </div>

      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn sm" onClick={() => { sfx.tap(); setSeed((s) => s + 1); }}>
            Sample {SAMPLES} tokens
          </button>
          <span className="dim" style={{ fontSize: 13 }}>
            {samples.length
              ? `${rare} of ${SAMPLES} draws were tokens the model rated under 1%.`
              : 'Draws from row 2, the renormalised survivors.'}
          </span>
        </div>
        {samples.length > 0 && (
          <div key={seed} style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {samples.map((i, j) => {
              const low = probs[i] < 0.01;
              return (
                <span
                  key={j} className="mono"
                  style={{
                    fontSize: 12, padding: '2px 7px', borderRadius: 7,
                    border: `1px solid ${low ? 'var(--warn)' : 'var(--line-2)'}`,
                    color: low ? 'var(--warn)' : 'var(--fg-2)',
                    background: low ? 'color-mix(in srgb, var(--warn) 12%, transparent)' : 'var(--panel-2)',
                    animation: `tkp-pop .35s ${ease} both`, animationDelay: `${j * 12}ms`,
                  }}
                >
                  {toks[i]}
                </span>
              );
            })}
          </div>
        )}
        <style>{'@keyframes tkp-pop{from{opacity:0;transform:translateY(6px) scale(.9)}to{opacity:1;transform:none}}'}</style>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'top-k-top-p',
  hook: {
    prompt: (
      <>
        A sampler keeps the 50 highest-ranked tokens at every step (top-k = 50). At one step the model is 86% sure of the
        next token. What is true of the 50 tokens it can draw from?
      </>
    ),
    options: [
      {
        text: 'Most are junk: one good token and 49 fillers, all still drawable',
        correct: true,
        why: 'Top-k keeps the k highest-ranked tokens and looks at nothing else. At a confident step that is one strong token plus 49 the model scored as poor, and every one of them can still be drawn. At a step where hundreds of words are reasonable, the same 50 would cut good options.',
      },
      {
        text: 'Only a few are really kept: the count shrinks when the model is sure',
        why: 'That describes top-p, which keeps a fixed amount of probability and lets the count vary. Top-k does the reverse: fixed count, varying probability.',
      },
      {
        text: 'Only the 86% token can be drawn, because it is far above the rest',
        why: 'Top-k has no confidence threshold. It never looks at the size of the probabilities, only at their rank order.',
      },
      {
        text: 'It depends on the temperature, which changes which 50 rank highest',
        why: 'Temperature divides every score by the same number, so the rank order stays the same. The same 50 tokens are kept at any temperature.',
      },
    ],
    reveal: 'Next you will cut the same two kinds of distribution yourself, with a count and with a probability budget.',
  },
  Lab: TruncationLab,
  missions: [
    {
      id: 'junk',
      text: 'Pick the confident context, use top-k, and set k = 5. Find a kept token with less than 1%.',
      insight: (
        <>
          “{CONTEXTS.confident.tokens[4]}” has {pc(C[4], 2)} and is still eligible. k = 5 was a count chosen in advance. The
          model only had one good answer here, so four of the five slots were filled with whatever came next.
        </>
      ),
    },
    {
      id: 'adapt',
      text: 'Switch to top-p with p = 0.90. Look at how many tokens survive in each context.',
      insight: (
        <>
          {C_P90} survive in the confident context and {U_P90} in the uncertain one. The setting did not change. Top-p keeps
          adding tokens until their total reaches p, so a peaked distribution fills the budget quickly and a flat one
          takes many tokens.
        </>
      ),
    },
    {
      id: 'one',
      text: 'Stay on top-p in the confident context. Lower p until exactly one token survives.',
      insight: (
        <>
          “Paris” alone holds {pc(C[0])}, so any p at or below {(Math.floor(C[0] * 100) / 100).toFixed(2)} is already
          satisfied by the first token. One survivor means no randomness left: the sampler behaves like greedy decoding at
          this step.
        </>
      ),
    },
    {
      id: 'bind',
      text: 'Choose “both” with k = 5 and p = 0.90. Switch contexts until you have seen each limit be the one that binds.',
      insight: (
        <>
          With both set, a token must pass both filters, so the smaller kept set wins. In the confident context top-p binds
          ({C_P90} tokens). In the uncertain one top-k binds (5 tokens, where top-p alone would keep {U_P90}). This is why
          APIs let you set both: k is a hard ceiling, p adapts underneath it.
        </>
      ),
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Softmax gives every token in the vocabulary some probability. Truncation removes the unlikely ones before the
          sampler draws. It always runs the same four steps.
        </p>
        <ol>
          <li><strong>Sort</strong> the tokens from most to least probable.</li>
          <li>
            <strong>Cut.</strong> <em>Top-k</em> keeps the first k tokens: a fixed count. <em>Top-p</em>, also called
            nucleus sampling, walks down the list adding up probability and stops at the first token that brings the total
            to p: the smallest set whose mass reaches p.
          </li>
          <li><strong>Renormalise.</strong> Divide each survivor by the survivors’ total so they sum to 1 again.</li>
          <li><strong>Sample</strong> from the survivors only. A cut token has probability exactly 0.</li>
        </ol>
        <p>
          You saw the difference in the lab. A fixed k kept a {pc(C[4], 2)} token in the confident context and cut
          reasonable words in the uncertain one. A fixed p kept {C_P90} tokens in one and {U_P90} in the other.
        </p>
        <Callout>
          Order of operations: in the usual implementation (Hugging Face transformers), temperature reshapes the
          distribution first, then top-k or top-p cuts it. Some samplers run the cut first, so check yours. k = 1 keeps
          one token, which is greedy decoding.
        </Callout>
      </>
    ),
    worked: (
      <>
        <p>
          Take a vocabulary of only five tokens, already sorted, with
          probabilities <code>[0.40, 0.25, 0.20, 0.10, 0.05]</code>.
        </p>
        <table>
          <thead>
            <tr><th>token</th><th>prob</th><th>running total</th><th>top-k = 2</th><th>top-p = 0.80</th></tr>
          </thead>
          <tbody>
            <tr><td>pizza</td><td>0.40</td><td>0.40</td><td>0.40 ÷ 0.65 = 0.615</td><td>0.40 ÷ 0.85 = 0.471</td></tr>
            <tr><td>pasta</td><td>0.25</td><td>0.65</td><td>0.25 ÷ 0.65 = 0.385</td><td>0.25 ÷ 0.85 = 0.294</td></tr>
            <tr><td>sushi</td><td>0.20</td><td>0.85</td><td>cut</td><td>0.20 ÷ 0.85 = 0.235</td></tr>
            <tr><td>tacos</td><td>0.10</td><td>0.95</td><td>cut</td><td>cut</td></tr>
            <tr><td>curry</td><td>0.05</td><td>1.00</td><td>cut</td><td>cut</td></tr>
          </tbody>
        </table>
        <p>
          Top-k = 2 keeps two tokens holding 0.65. Top-p = 0.80 needs three: after two the total is 0.65, which is short
          of 0.80, and the third brings it to 0.85. The token that crosses the line is kept, so the kept mass is usually a
          little more than p.
        </p>
        <Code>{`
probs  = softmax(logits / temperature)       # temperature first
order  = argsort(probs)[::-1]                # most probable first
keep_k = order[:k]                           # top-k: a fixed count
n      = searchsorted(cumsum(probs[order]), p) + 1
keep_p = order[:n]                           # top-p: smallest set reaching p
keep   = keep_k if k < n else keep_p         # both set: the shorter list wins
q      = probs[keep] / probs[keep].sum()     # renormalise the survivors
token  = sample(keep, q)
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why the tail has to go</h3>
        <p>
          Each tail token is unlikely. Together they are not. If 50,000 tokens each hold 0.0004%, the tail holds 20% of the
          probability, and one draw in five lands in it. Even a tail of 2% per step adds up: over 100 generated tokens the
          chance of at least one tail draw is <M>{'1 - 0.98^{100} \\approx 87\\%'}</M>. One bad token is enough to
          derail a text, because the model then conditions on it and continues from there.
        </p>
        <h3>Temperature interacts with top-p, not with top-k</h3>
        <p>
          When temperature runs first, it never changes the rank order, so top-k keeps the same tokens at any temperature
          and only their relative weights change. Top-p is different: a higher temperature flattens the distribution, so
          more tokens are needed to reach p. Using the lab’s confident logits (computed here; the lab has no temperature
          slider), top-p = 0.90 keeps {C_P90} tokens at temperature 1
          and {C_T15_P90} at temperature 1.5, where “Paris” falls from {pc(C[0])} to {pc(C_T15[0])}.
        </p>
        <h3>The formal definition</h3>
        <p>
          With tokens sorted so that <M>{'p_1 \\ge p_2 \\ge \\dots'}</M>, top-p keeps the first <M>{'n'}</M> tokens where
        </p>
        <M block>{String.raw`n = \min\Big\{ m : \sum_{i=1}^{m} p_i \ge p \Big\}, \qquad q_i = \frac{p_i}{\sum_{j \le n} p_j}`}</M>
        <p>
          Top-k is the same with <M>{'n = k'}</M>. Renormalising preserves the ratios between survivors: a token twice as
          likely as another before the cut is still twice as likely after it.
        </p>
        <h3>What real systems do</h3>
        <p>
          Most sampling APIs expose temperature, top-p and often top-k together, and apply all the filters that are set.
          When top-p is used, values of 0.9 to 0.95 are typical. Some APIs default it to 1, which means no cut. Tuning both temperature and top-p at once makes the effect hard to
          reason about, because each changes how much the other does; change one and leave the other alone.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'A fixed k is wrong at most steps',
      body: 'The right number of candidates changes at every token: one after “The capital of France is”, hundreds at the start of a story. Any single k keeps junk at some steps and cuts good options at others.',
    },
    {
      title: 'Top-p can keep a long tail when the model is unsure',
      body: 'On a very flat distribution, reaching 90% can take hundreds of tokens or more, many of them poor. Top-p only bounds the mass that is cut. It does not bound the quality of what is kept, which is why a top-k ceiling is often set alongside it.',
    },
    {
      title: 'Truncation cannot fix a wrong ranking',
      body: 'Both methods trust the model’s order. If the model puts a false statement at 60%, truncation keeps it and renormalising raises it. Cutting the tail removes noise, not errors.',
    },
    {
      title: 'Tight settings make text repetitive',
      body: 'A very small k or p leaves one or two candidates at most steps, which is close to greedy decoding. The output becomes deterministic, and long generations tend to loop on the same phrases.',
    },
  ],
  questions: [
    {
      id: 'tkp-1', kind: 'mcq', level: 1,
      prompt: 'What does top-p (nucleus) sampling keep?',
      options: [
        { text: 'The smallest top-ranked set whose total reaches p', correct: true, why: 'Walk down the sorted list adding probabilities and stop at the first token that brings the total to p. The count varies from step to step.' },
        { text: 'Every token whose own probability is at least p', why: 'That would be a per-token threshold. With p = 0.9 it would usually keep nothing. Top-p is a budget on the running total.' },
        { text: 'The p most probable tokens, where p is a count', why: 'A fixed count is top-k. In top-p, p is an amount of probability between 0 and 1.' },
        { text: 'A random fraction p of the vocabulary', why: 'Nothing about the cut is random. It always keeps the highest-ranked tokens; the randomness comes afterwards, in the draw.' },
      ],
    },
    {
      id: 'tkp-2', kind: 'mcq', level: 1,
      prompt: 'After top-k or top-p has cut the list, what does the sampler do?',
      options: [
        { text: 'Rescales the survivors so they sum to 1, then draws from them alone', correct: true, why: 'Each survivor is divided by the survivors’ total. Cut tokens have probability exactly zero and can never be drawn.' },
        { text: 'Picks the most probable survivor every time', why: 'That is greedy decoding, which is what you get only when one token survives. With several survivors the draw is still random.' },
        { text: 'Draws from the full vocabulary, with cut tokens made less likely', why: 'A cut is not a penalty. Cut tokens are removed completely.' },
        { text: 'Gives every survivor an equal chance', why: 'Survivors keep their relative sizes. A token twice as likely as another before the cut is still twice as likely after it.' },
      ],
    },
    {
      id: 'tkp-3', kind: 'num', level: 2,
      prompt: <>Sorted probabilities are <code>[0.5, 0.2, 0.15, 0.1, 0.05]</code>. With top-p = 0.8, what is the probability of drawing the first token after renormalising?</>,
      answer: 0.59, tol: 0.015,
      why: <>Running totals: 0.5, 0.7, 0.85. The third token is the first to reach 0.8, so three tokens survive with mass 0.85. 0.5 ÷ 0.85 = <strong>0.59</strong>.</>,
      hint: 'Find how many tokens it takes to reach 0.8, then divide by the mass of that kept set.',
    },
    {
      id: 'tkp-4', kind: 'num', level: 2,
      prompt: <>Sorted probabilities are <code>[0.4, 0.3, 0.15, 0.1, 0.05]</code>. How many tokens does top-p = 0.9 keep?</>,
      answer: 4, tol: 0,
      unit: 'tokens',
      why: <>Running totals: 0.4, 0.7, 0.85, 0.95. Three tokens reach only 0.85, which is short of 0.9. The fourth crosses the line and is kept, so the answer is <strong>4</strong>, holding 0.95.</>,
      hint: 'Add probabilities from the top and stop at the first total that is at least 0.9.',
    },
    {
      id: 'tkp-5', kind: 'mcq', level: 2,
      prompt: 'A sampler is set to top-k = 1 and temperature 1.3. What does the output look like?',
      options: [
        { text: 'The top token every step: the same text on every run', correct: true, why: 'One survivor renormalises to probability 1. Temperature cannot change which token ranks first, so it has no effect here.' },
        { text: 'More varied than usual, because the temperature is above 1', why: 'Temperature reshapes the distribution, but then all tokens except the first are cut. There is nothing left to vary.' },
        { text: 'One token is generated and then generation stops', why: 'k limits the candidates at each step, not the number of steps.' },
        { text: 'A random token each step, because only one draw is allowed', why: 'k = 1 keeps the top-ranked token, not a random one.' },
      ],
      hint: 'How many candidates are left after the cut, and can temperature change which one ranks first?',
    },
    {
      id: 'tkp-6', kind: 'mcq', level: 2,
      prompt: 'A sampler has both top-k = 40 and top-p = 0.95 set. At one step, top-p alone would keep 6 tokens. How many are kept?',
      options: [
        { text: '6, because top-p is the stricter filter here', correct: true, why: 'Both filters apply, so the kept set is the smaller of the two. At a flat step where top-p wanted 500 tokens, top-k would bind at 40.' },
        { text: '40, because top-k is applied first and fixes the count', why: 'Top-k sets a ceiling, not a floor. The 34 tokens beyond the nucleus are still cut by top-p.' },
        { text: '46, because the two filters add their kept tokens', why: 'The filters intersect. They do not add. And both keep prefixes of the same sorted list, so one set contains the other.' },
        { text: '38, because p = 0.95 keeps 95% of the 40 tokens', why: 'p is a share of probability mass, not a share of the token count.' },
      ],
      hint: 'Both sets are prefixes of the same sorted list. Which is shorter?',
    },
    {
      id: 'tkp-7', kind: 'mcq', level: 3,
      prompt: 'A sampler applies temperature before truncation. You keep top-p = 0.9 and raise the temperature from 1.0 to 1.5. What happens to the number of tokens kept at a typical step?',
      options: [
        { text: 'It goes up: the distribution is flatter, so more tokens are needed to reach 90%', correct: true, why: `Temperature runs before truncation here. A flatter distribution spreads the mass, so the running total climbs more slowly. Using the lab’s confident logits (computed here; the lab has no temperature slider), the count goes from ${C_P90} to ${C_T15_P90}.` },
        { text: 'It stays the same, because temperature does not change the rank order', why: 'Unchanged rank order is why top-k is unaffected. Top-p depends on the sizes of the probabilities, and those do change.' },
        { text: 'It goes down, because top-p is applied first and temperature only reweights the survivors', why: 'The question fixes the order: temperature first. Top-p then cuts the reshaped, flatter distribution.' },
        { text: 'It goes down, because higher temperature makes the top token stronger', why: 'Higher temperature weakens the top token. Lower temperature is what sharpens the distribution.' },
      ],
      hint: 'Which runs first? Then ask what a flatter distribution does to the running total.',
    },
    {
      id: 'tkp-8', kind: 'mcq', level: 3,
      prompt: 'With no truncation, a model puts 0.0004% on each of 50,000 unlikely tokens. Why does that matter if each one is so improbable?',
      options: [
        { text: 'Together they hold 20%, so one draw in five is a tail token', correct: true, why: '50,000 × 0.000004 = 0.2. Over a long generation a tail draw is close to certain, and the model then continues from that bad token.' },
        { text: 'It does not matter: a 0.0004% token will effectively never be drawn', why: 'True for any one named token, false for the group. The sampler does not care which tail token it hits.' },
        { text: 'Computing 50,000 extra probabilities makes sampling slow', why: 'The model computes a score for every token regardless. Truncation changes which can be drawn, not what is computed.' },
        { text: 'Softmax breaks down when probabilities are that small', why: 'Softmax handles small values correctly. The issue is the total mass of the tail, not numerical accuracy.' },
      ],
      hint: 'Multiply the count by the probability of each.',
    },
  ],
  takeaways: [
    'Truncation sorts the tokens, cuts the tail, renormalises the survivors to sum to 1, and samples only from them.',
    'Top-k keeps a fixed number of tokens; top-p keeps the smallest set whose probability reaches p, so its count adapts to how confident the model is.',
    'In the usual order, temperature reshapes the distribution first and truncation cuts second; k = 1 is greedy decoding.',
    'The tail is cut because its tokens are individually unlikely but collectively large, and one bad token can derail the text.',
  ],
};

export default lesson;
