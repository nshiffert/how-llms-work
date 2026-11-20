import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { sfx } from '../engine/sfx';
import { Callout, Code, M, Seg, Slider, Stat, Tok, clamp, lerp, tokHue, useRaf } from '../ui/kit';
import { BATCH, logitsFor, route, softmaxOf } from './mixture-of-experts.route';

/* ------------------------------------------------------------------ *
 * Lab: one mixture-of-experts layer routing a stream of tokens.
 * Router scores per token are seeded random numbers (stand-ins for a
 * learned router). Everything after that is computed for real:
 * skew bias, softmax, top-k, renormalised gate weights, and the load
 * each expert carries over a batch of 512 tokens.
 * ------------------------------------------------------------------ */

const WORDS = ['The', 'cat', 'sat', 'on', 'the', 'mat', 'because', 'it', 'was', 'warm', '.', 'Rates', 'rose', '3', '%', 'after', 'the', 'bank', 'met', '.', 'def', 'add', '(', 'a', ',', 'b', '):', 'return', 'a', '+', 'b'];
// One expert = one feed-forward layer for a 1,024-wide model with 4,096 hidden units.
const EXPERT_PARAMS = 2 * 1024 * 4096 + 4096 + 1024; // 8,393,728
const millions = (x: number) => (x / 1e6).toFixed(1) + 'M';

const bez = (x0: number, y0: number, x1: number, y1: number, q: number) => {
  const xm = (x0 + x1) / 2, r = 1 - q;
  return {
    x: r * r * r * x0 + 3 * r * r * q * xm + 3 * r * q * q * xm + q * q * q * x1,
    y: r * r * r * y0 + 3 * r * r * q * y0 + 3 * r * q * q * y1 + q * q * q * y1,
  };
};
const curve = (x0: number, y0: number, x1: number, y1: number) => `M ${x0} ${y0} C ${(x0 + x1) / 2} ${y0}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`;
const ease = (q: number) => 1 - (1 - q) ** 3;

/** True when the lab column is phone-width, so the drawing can use a narrower layout instead of scrolling. */
function useNarrow() {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, narrow] as const;
}

function MoeLab({ complete }: LabProps) {
  const [n, setN] = useState(8);
  const [k, setK] = useState(2);
  const [skew, setSkew] = useState(0);
  const [balance, setBalance] = useState(false);
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState(0);
  useRaf((_, dt) => setClock((c) => c + dt), !paused);
  const [boxRef, narrow] = useNarrow();

  const routing = useMemo(() => route(n, k, skew, balance), [n, k, skew, balance]);
  const share = routing.load.map((l) => l / BATCH); // fraction of tokens each expert handled
  const maxShare = Math.max(...share);
  const busiest = share.indexOf(maxShare);
  const fair = k / n;

  useEffect(() => {
    if (n / k >= 8) complete('ratio');
    if (k === n) complete('dense');
    if (n >= 8 && k <= 2 && !balance && maxShare > 0.5) complete('collapse');
    if (k < n && balance && skew >= 2 && maxShare / fair < 1.5) complete('balance');
  }, [n, k, skew, balance, maxShare, fair, complete]);

  // ---- the token currently in flight ----
  const PERIOD = 1.7;
  const idx = Math.floor(clock / PERIOD) % WORDS.length;
  const ph = (clock % PERIOD) / PERIOD;
  const chosen = routing.chosen[idx];
  const probs = useMemo(() => softmaxOf(logitsFor(idx, n, skew, routing.corr)), [idx, n, skew, routing]);
  const gateSum = chosen.reduce((s, e) => s + probs[e], 0);
  const gate = (e: number) => probs[e] / gateSum;

  // ---- geometry ----
  const W = narrow ? 400 : 760, H = 344;
  const yMid = 184;
  const EX0 = narrow ? 168 : 322, EW = narrow ? 122 : 160, EX1 = EX0 + EW;
  const top = 30, colH = 300;
  const rh = colH / n;
  const gap = Math.min(6, rh * 0.2);
  const ey = (e: number) => top + rh * (e + 0.5);
  const RX = narrow ? 64 : 150, RW = narrow ? 60 : 72;
  const SX = narrow ? 344 : 592;
  const lit = ph > 0.22;
  const q1 = clamp((ph - 0.22) / 0.3, 0, 1);
  const q2 = clamp((ph - 0.52) / 0.3, 0, 1);
  const outPop = clamp((ph - 0.8) / 0.12, 0, 1);
  const inX = narrow ? lerp(-56, 3, ease(clamp(ph / 0.22, 0, 1))) : lerp(8, RX - 62, ease(clamp(ph / 0.22, 0, 1)));
  const OX = narrow ? SX - 62 : SX + 42, OY = narrow ? yMid + 30 : yMid - 14; // output chip

  return (
    <div className="lab-grid">
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="eyebrow">Token stream · colour = each token’s first-choice expert</span>
          <button className="btn sm" onClick={() => { sfx.tap(); setPaused(!paused); }}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
        </div>
        <div style={{ lineHeight: 1.9 }}>
          {WORDS.map((w, i) => (
            <Tok key={i} color={tokHue(routing.chosen[i][0])} active={i === idx}>{w}</Tok>
          ))}
        </div>
      </div>

      <div ref={boxRef}>
        <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Router sending each token to ${k} of ${n} experts`}>
          <defs>
            <filter id="moe-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <text x={EX0} y={16} style={{ fill: 'var(--fg-3)', fontSize: 11 }}>{narrow ? '' : `${n} experts · `}bar = share of 512 tokens</text>
          <text x={RX + RW / 2} y={narrow ? yMid + 48 : yMid - 44} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>scores {n}, keeps {k}</text>
          {!narrow && <text x={SX} y={yMid - 30} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11 }}>weighted sum</text>}

          {/* router → experts: every expert gets a score; opacity = router probability */}
          {share.map((_, e) => {
            const on = lit && chosen.includes(e);
            return (
              <path
                key={'a' + e} d={curve(RX + RW, yMid, EX0, ey(e))} fill="none"
                stroke={on ? tokHue(e) : 'var(--fg-3)'} strokeLinecap="round"
                strokeWidth={on ? 1.5 + gate(e) * 4 : 1} strokeOpacity={on ? 0.95 : 0.1 + probs[e] * 0.5}
                style={{ transition: 'stroke-opacity .2s, stroke-width .2s' }}
              />
            );
          })}
          {/* experts → sum: only the chosen experts produce anything */}
          {share.map((_, e) => {
            const on = lit && chosen.includes(e);
            return (
              <path
                key={'c' + e} d={curve(EX1, ey(e), SX - 17, yMid)} fill="none"
                stroke={on ? tokHue(e) : 'var(--fg-3)'} strokeLinecap="round"
                strokeWidth={on ? 1.5 + gate(e) * 4 : 1} strokeOpacity={on && ph > 0.5 ? 0.95 : 0.07}
                style={{ transition: 'stroke-opacity .2s, stroke-width .2s' }}
              />
            );
          })}

          {/* experts */}
          <line x1={EX0 + EW / 2} x2={EX0 + EW / 2} y1={top - 4} y2={top + colH + 4} stroke="var(--bad)" strokeDasharray="3 4" strokeOpacity={0.7} />
          <text x={EX0 + EW / 2} y={H - 1} textAnchor="middle" style={{ fill: 'var(--bad)', fontSize: 11 }}>half of all tokens</text>
          {share.map((sh, e) => {
            const on = lit && chosen.includes(e);
            const showText = rh >= 14 || on || e === busiest;
            const fs = Math.max(9, Math.min(11.5, rh * 0.62));
            return (
              <g key={'e' + e}>
                <rect
                  x={EX0} y={ey(e) - rh / 2 + gap / 2} width={EW} height={rh - gap} rx={Math.min(7, rh / 3)}
                  fill="var(--panel-2)" stroke={on ? tokHue(e) : 'var(--line-2)'} strokeWidth={on ? 2 : 1}
                  filter={on ? 'url(#moe-glow)' : undefined}
                />
                <rect
                  x={EX0} y={ey(e) - rh / 2 + gap / 2} width={Math.max(2, EW * sh)} height={rh - gap} rx={Math.min(7, rh / 3)}
                  fill={tokHue(e)} fillOpacity={on ? 0.95 : 0.5}
                  style={{ transition: 'width .4s cubic-bezier(.22,1,.36,1), fill-opacity .2s' }}
                />
                {showText && (
                  <>
                    <text x={EX0 + 7} y={ey(e) + fs * 0.36} style={{ fontSize: fs, fill: '#fff', fontWeight: 600 }}>E{e + 1}</text>
                    <text x={EX1 - 6} y={ey(e) + fs * 0.36} textAnchor="end" style={{ fontSize: fs, fill: e === busiest ? '#fff' : 'var(--fg-2)' }}>{(sh * 100).toFixed(0)}%</text>
                  </>
                )}
              </g>
            );
          })}
          {/* fair share marker */}
          {k < n && <line x1={EX0 + EW * fair} x2={EX0 + EW * fair} y1={top - 4} y2={top + colH + 4} stroke="#fff" strokeDasharray="2 3" strokeOpacity={0.55} style={{ transition: 'all .3s' }} />}

          {/* router */}
          <rect x={RX} y={yMid - 30} width={RW} height={60} rx={12} fill="var(--panel-2)" stroke="var(--hue)" strokeWidth={lit && ph < 0.5 ? 2.2 : 1.4} />
          <text x={RX + RW / 2} y={yMid - 3} textAnchor="middle" style={{ fontSize: 13, fill: '#fff', fontWeight: 600 }}>router</text>
          <text x={RX + RW / 2} y={yMid + 14} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--hue)' }}>top-{k}</text>

          {/* incoming token */}
          <g opacity={ph < 0.3 ? 1 : Math.max(0, 1 - (ph - 0.3) * 8)}>
            <rect x={inX} y={yMid - 14} width={58} height={28} rx={8} fill={`color-mix(in srgb, ${tokHue(chosen[0])} 30%, var(--panel-2))`} stroke={tokHue(chosen[0])} />
            <text x={inX + 29} y={yMid + 4.5} textAnchor="middle" style={{ fontSize: 12.5, fill: '#fff' }}>{WORDS[idx]}</text>
          </g>

          {/* sum node and output */}
          <circle cx={SX} cy={yMid} r={17} fill="var(--panel-2)" stroke="var(--hue)" strokeWidth={ph > 0.78 ? 2.2 : 1.4} />
          <text x={SX} y={yMid + 5} textAnchor="middle" style={{ fontSize: 15, fill: '#fff' }}>Σ</text>
          {narrow
            ? <line x1={SX} x2={SX} y1={yMid + 17} y2={OY} stroke="var(--line-2)" strokeWidth={1.5} />
            : <line x1={SX + 17} x2={OX} y1={yMid} y2={yMid} stroke="var(--line-2)" strokeWidth={1.5} />}
          <g opacity={outPop} transform={narrow ? `translate(0 ${(1 - outPop) * -8})` : `translate(${(1 - outPop) * -10} 0)`}>
            <rect x={OX} y={OY} width={110} height={28} rx={8} fill="var(--panel-2)" stroke="var(--hue)" />
            <text x={OX + 55} y={OY + 18.5} textAnchor="middle" style={{ fontSize: 12, fill: '#fff' }}>new “{WORDS[idx]}”</text>
          </g>

          {/* travelling dots */}
          {lit && q1 < 1 && chosen.map((e) => {
            const p = bez(RX + RW, yMid, EX0, ey(e), ease(q1));
            return <circle key={'d1' + e} cx={p.x} cy={p.y} r={3 + gate(e) * 4} fill={tokHue(e)} filter="url(#moe-glow)" />;
          })}
          {q2 > 0 && q2 < 1 && chosen.map((e) => {
            const p = bez(EX1, ey(e), SX - 17, yMid, ease(q2));
            return <circle key={'d2' + e} cx={p.x} cy={p.y} r={3 + gate(e) * 4} fill={tokHue(e)} filter="url(#moe-glow)" />;
          })}
        </svg>
      </div>

      <div className="mono" style={{ fontSize: 13.5, color: 'var(--fg-2)', minHeight: 22 }}>
        “{WORDS[idx]}” →{' '}
        {k === n
          ? <span style={{ color: 'var(--warn)' }}>all {n} experts run. Nothing is skipped: this is one dense layer {n}× as wide.</span>
          : chosen.map((e, i) => (
            <span key={e}>
              {i > 0 && <span className="dim"> + </span>}
              <strong style={{ color: tokHue(e) }}>{(gate(e) * 100).toFixed(0)}% × E{e + 1}</strong>
            </span>
          ))}
        {k < n && <span className="dim"> · the other {n - k} do not run</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'end' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13, minWidth: 92 }}>Experts (N)</span>
          <Seg value={n} onChange={setN} options={[4, 8, 16, 32].map((v) => ({ value: v, label: String(v) }))} />
        </div>
        <div className="row">
          <span className="dim" style={{ fontSize: 13, minWidth: 92 }}>Active (k)</span>
          <Seg value={k} onChange={setK} options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
        </div>
        <Slider label="Router skew (extra score for a few favoured experts)" value={skew} min={0} max={4} step={0.1} onChange={setSkew} format={(v) => '+' + v.toFixed(1)} />
        <div className="row">
          <span className="dim" style={{ fontSize: 13, minWidth: 92 }}>Balancing loss</span>
          <Seg value={balance ? 'on' : 'off'} onChange={(v) => setBalance(v === 'on')} options={[{ value: 'off', label: 'off' }, { value: 'on', label: 'on (simulated)' }]} />
        </div>
      </div>

      <div className="row">
        <Stat label={`stored: ${n} × ${millions(EXPERT_PARAMS)}`} value={millions(n * EXPERT_PARAMS)} />
        <Stat label={`used per token: ${k} × ${millions(EXPERT_PARAMS)}`} value={millions(k * EXPERT_PARAMS)} />
        <Stat label="stored ÷ used" value={(n / k).toFixed(n % k === 0 ? 0 : 1) + '×'} hot />
        <Stat
          label={`busiest: E${busiest + 1} (fair share ${(fair * 100).toFixed(0)}%)`}
          value={<em style={{ fontStyle: 'normal', color: k < n && maxShare > 0.5 ? 'var(--bad)' : undefined }}>{(maxShare * 100).toFixed(0)}%</em>}
        />
      </div>

      <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
        Each token’s raw router scores are seeded random numbers standing in for a trained router. The skew, softmax, top-k
        and loads are computed from them. “Balancing loss” is simulated: it lowers the router bias of any expert above its
        fair share and raises it for any below, which is the pressure the real loss term applies during training.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'mixture-of-experts',
  hook: {
    prompt: (
      <>
        One layer of a model holds 8 separate feed-forward networks, called experts, and runs only 2 of them for each
        token. Compared with a layer that has a single feed-forward network, what does that design buy?
      </>
    ),
    options: [
      {
        text: 'Eight networks’ worth of parameters in the layer, for about the compute cost of two per token',
        correct: true,
        why: 'All 8 experts exist and can learn different things, but each token only pays to run 2 of them. Parameter count and compute per token are decoupled.',
      },
      {
        text: 'A model that fits in less memory, because only 2 of the 8 networks are needed at a time',
        why: 'Different tokens pick different experts, so all 8 must stay loaded. Memory use goes up with the number of experts, not down.',
      },
      {
        text: 'One specialist per subject, such as a law expert and a code expert, chosen by the topic of the prompt',
        why: 'Routing is decided per token and per layer by a learned scorer, not per prompt by topic. The experts that emerge rarely match human subjects.',
      },
      {
        text: 'Eight opinions on every token, which are averaged to give a more reliable answer',
        why: 'That would be an ensemble, and it would cost eight times the compute. Here six of the eight do not run at all for a given token.',
      },
    ],
    reveal: 'Next you will watch a router make that choice token by token, and see what happens when it chooses badly.',
  },
  Lab: MoeLab,
  missions: [
    {
      id: 'ratio',
      text: 'Change N and k until the layer stores 8× more expert parameters than a single token uses.',
      insight: 'Stored parameters scale with N. Compute per token scales with k. 16 experts with 2 active, or 32 with 4, stores eight times what any token pays to run. All of it still has to sit in memory.',
    },
    {
      id: 'dense',
      text: 'Set 4 experts and k = 4, so every token uses every expert.',
      insight: 'With k = N nothing is skipped. Every expert runs for every token, the compute is N times one expert, and the layer is just a dense layer N times as wide with a learned weighting on top. The saving comes entirely from k being much smaller than N.',
    },
    {
      id: 'collapse',
      text: 'With 8 or more experts, k of 1 or 2, and balancing off, raise the router skew until one expert handles more than half of all tokens.',
      insight: 'This is the start of router collapse. One expert already takes about twice its fair share. Push the skew to its maximum and the favoured experts handle nearly every token while the rest get a few percent each: parameters you paid memory for, wasted. In training it feeds itself: an expert that is picked more gets trained more, gets better, and is picked more.',
    },
    {
      id: 'balance',
      text: 'Keep the skew at 2.0 or more and switch the balancing loss on.',
      insight: 'The loads even out although the skew is still there. A load-balancing loss adds a penalty whenever experts receive unequal shares, which pushes the router to spread tokens. Without something like it, MoE training tends to collapse.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          In a standard transformer block, attention is followed by one feed-forward layer that every token passes
          through. A <strong>mixture of experts</strong> (MoE) block replaces that one layer with N feed-forward layers,
          the <em>experts</em>, plus a small <strong>router</strong>.
        </p>
        <p>For each token, the router does what you watched:</p>
        <ol>
          <li><strong>Score.</strong> One small matrix turns the token's vector into N scores, one per expert.</li>
          <li><strong>Pick.</strong> Keep the k highest (top-k). A softmax over those k gives mixing weights.</li>
          <li><strong>Run and mix.</strong> Only those k experts run. Their outputs are added, weighted.</li>
        </ol>
        <p>
          The choice is made again for every token in every layer. A token can use experts 2 and 7 in one layer and 1
          and 4 in the next.
        </p>
        <Callout>
          Stored parameters grow with N. Compute per token grows with k. Raising N adds capacity while the work per
          token stays about the same.
        </Callout>
        <p>
          It does not save memory. Every expert must be loaded, because the next token may be routed to any of them.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Use the lab's expert: a feed-forward layer for a 1,024-wide model with 4,096 hidden units. That is 1,024 ×
          4,096 weights in, 4,096 × 1,024 out, plus 5,120 biases: 8,393,728 parameters, about 8.4M.
        </p>
        <table>
          <thead>
            <tr><th>setting</th><th>stored</th><th>used per token</th><th>ratio</th></tr>
          </thead>
          <tbody>
            <tr><td>dense (1 layer)</td><td>8.4M</td><td>8.4M</td><td>1×</td></tr>
            <tr><td>N = 8, k = 2</td><td>67.1M</td><td>16.8M</td><td>4×</td></tr>
            <tr><td>N = 32, k = 2</td><td>268.6M</td><td>16.8M</td><td>16×</td></tr>
          </tbody>
        </table>
        <p>
          Now route one token with N = 4 and k = 2. Suppose the router's scores are <code>[2.0, 1.0, 0.0, −1.0]</code>.
          The top two are experts 1 and 2. Softmax over just those two: e² = 7.39 and e¹ = 2.72, sum 10.11, so the
          weights are 0.73 and 0.27. Experts 3 and 4 do not run.
        </p>
        <p>The layer's output for this token is 0.73 × expert₁(x) + 0.27 × expert₂(x).</p>
        <Code>{`
scores = x @ W_router              # N scores for this token
top    = argsort(scores)[-k:]      # indices of the k best experts
gates  = softmax(scores[top])      # k weights that sum to 1
y      = sum(g * experts[e](x) for g, e in zip(gates, top))
`}</Code>
        <p>The router itself is tiny: 1,024 × 8 = 8,192 weights for 8 experts.</p>
      </>
    ),
    deeper: (
      <>
        <h3>Why routers collapse, and the balancing loss</h3>
        <p>
          Top-k is a hard choice. An expert that was not picked for a token gets no gradient from it, so it cannot
          improve on that kind of token, so it is even less likely to be picked next time. Left alone, a few experts
          take everything. The usual fix is an extra loss term that is smallest when every expert receives an equal
          share of the batch. With <M>{'f_i'}</M> the fraction of tokens sent to expert <M>{'i'}</M> and{' '}
          <M>{'P_i'}</M> the average router probability for it, one common form is{' '}
          <M>{String.raw`N \sum_i f_i P_i`}</M>, which is minimised when both are uniform. Some systems also add random
          noise to the scores so that every expert gets tried.
        </p>
        <h3>Per token, per layer</h3>
        <p>
          Each MoE layer has its own router and its own experts. With 8 experts, k = 1 and 12 layers there are 8¹² ≈ 69
          billion possible paths through the model for a single token. The model is not choosing one of 8 sub-models.
          It is composing a path.
        </p>
        <h3>Experts are not topics</h3>
        <p>
          Nothing in training asks an expert to own a subject. The router is trained only to lower the loss, and
          published analyses of trained MoE language models find that routing tends to follow surface features such as
          syntax and position far more than subject matter. A “code expert” or “law expert” is a
          story people tell, not what the weights show.
        </p>
        <h3>Whole-model numbers</h3>
        <p>
          Only the feed-forward layers are split into experts. Attention, embeddings and normalisation are shared and
          always run. The openly released Mixtral 8x7B model uses 8 experts with 2 active per token: about 47 billion
          parameters stored and about 13 billion used per token. The ratio is 3.6×, not 4×, because of the shared
          parts.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Memory is not saved',
      body: 'Every expert must be loaded, because any token can be routed to any of them. A model with 8 experts and 2 active needs the memory of all 8 while delivering the compute cost of 2. If memory is your limit, MoE makes it worse.',
    },
    {
      title: 'Router collapse',
      body: 'Without a balancing pressure a few experts win most tokens and the rest stop learning. You then pay to store N experts and get the quality of two or three.',
    },
    {
      title: 'Each expert sees less data',
      body: 'An expert only learns from the tokens routed to it, roughly k ÷ N of them. Doubling the number of experts halves the training signal each one receives, so adding experts gives diminishing returns.',
    },
    {
      title: 'Uneven work is awkward for hardware',
      body: 'In a batch, different tokens go to different experts, so the work arrives as ragged groups in place of one large matrix multiply. “About the same compute” is true on paper. In practice the routing and regrouping add overhead.',
    },
  ],
  questions: [
    {
      id: 'moe-1', kind: 'mcq', level: 1,
      prompt: 'In a mixture-of-experts transformer block, what do the experts replace?',
      options: [
        { text: 'The single feed-forward layer that follows attention', correct: true, why: 'Each expert is a feed-forward layer. The block keeps its attention and gains N feed-forward layers plus a router to choose among them.' },
        { text: 'The attention heads, with one expert per head', why: 'Attention is left as it is and still runs for every token. The experts sit where the feed-forward layer was.' },
        { text: 'The whole model, with one complete model per expert', why: 'Experts are components inside each layer. Everything else in the model is shared by all tokens.' },
        { text: 'The embedding table, with one vocabulary per expert', why: 'There is one embedding table. Experts act on token vectors inside the blocks.' },
      ],
    },
    {
      id: 'moe-2', kind: 'mcq', level: 1,
      prompt: 'How does the router decide which experts process a token?',
      options: [
        { text: 'It computes one score per expert from the token’s vector and keeps the k highest', correct: true, why: 'A small learned matrix maps the token vector to N scores. Top-k picks the experts, and a softmax over the kept scores sets their mixing weights.' },
        { text: 'It classifies the topic of the whole prompt once and uses that expert throughout', why: 'The decision is made per token and again in every layer. No topic label is involved.' },
        { text: 'It cycles through the experts in turn so each one gets the same number of tokens', why: 'Routing depends on the token’s vector. Balance has to be encouraged with an extra loss; it is not built into the choice.' },
        { text: 'It runs all experts, then keeps the k outputs that look best', why: 'That would spend the compute it is meant to save. The choice is made before any expert runs.' },
      ],
    },
    {
      id: 'moe-3', kind: 'num', level: 2,
      prompt: <>A layer has 64 experts of 20 million parameters each, and 2 are active per token. How many million expert parameters does one token use?</>,
      answer: 40, tol: 0.5, unit: 'million',
      why: <>Used per token = k × size = 2 × 20M = <strong>40 million</strong>. The layer stores 64 × 20M = 1,280 million, a ratio of 32×.</>,
      hint: 'Only the active experts run. The total number of experts does not enter this figure.',
    },
    {
      id: 'moe-4', kind: 'num', level: 2,
      prompt: <>A router with k = 2 scores four experts <code>[3.0, 1.0, 2.0, 0.0]</code> for a token. What mixing weight does the highest-scoring expert get? (e ≈ 2.718)</>,
      answer: 0.73, tol: 0.02,
      why: <>Top-2 keeps the scores 3.0 and 2.0. Softmax over those two: e³ = 20.09, e² = 7.39, sum 27.47. 20.09 ÷ 27.47 = <strong>0.73</strong>. The dropped experts get exactly zero.</>,
      hint: 'Drop everything outside the top k first, then take a softmax over what is left.',
    },
    {
      id: 'moe-5', kind: 'mcq', level: 2,
      prompt: 'You switch a model’s feed-forward layers from dense to 8 experts with 2 active, keeping the expert size equal to the old layer. What happens to the memory those layers need at inference?',
      options: [
        { text: 'It rises to about 8 times as much, because all experts must be loaded', correct: true, why: 'Any token may be routed to any expert, so all 8 stay in memory. Only the compute per token is limited to 2.' },
        { text: 'It rises to about 2 times as much, because 2 experts are active', why: 'That is the compute per token. Memory is set by how many experts exist, not how many run.' },
        { text: 'It stays the same, because sparse activation skips the unused weights', why: 'Skipped experts are not run, but they still occupy memory waiting for the tokens that will use them.' },
        { text: 'It falls to a quarter, because each token touches 2 of 8 experts', why: 'A quarter is the fraction of expert parameters used per token. Nothing can be unloaded.' },
      ],
      hint: 'Separate two questions: what must be stored, and what must be computed.',
    },
    {
      id: 'moe-6', kind: 'mcq', level: 3,
      prompt: 'A trained MoE layer has 16 experts with k = 2. Monitoring shows two experts handle 95% of all tokens. What is the main cost?',
      options: [
        { text: 'Fourteen experts are stored but nearly unused: the capacity of about two', correct: true, why: 'Idle experts take memory, get almost no training signal, and add nothing to quality. The layer behaves like a much smaller one.' },
        { text: 'Compute per token rises, because the two busy experts must run more often', why: 'Each token still runs exactly 2 experts. Compute per token is unchanged; what is lost is capacity.' },
        { text: 'The outputs become wrong, because gate weights no longer sum to 1', why: 'The softmax over the chosen experts always sums to 1, whichever experts are chosen.' },
        { text: 'Nothing: it shows the model found the two best experts and can ignore the rest', why: 'The rest are weak because they were starved of training, not because they were tried and rejected.' },
      ],
      hint: 'Ask what you paid for with 16 experts, and how much of it is doing work.',
    },
    {
      id: 'moe-7', kind: 'mcq', level: 3,
      prompt: 'You set k equal to N in an MoE layer with 8 experts. Which description is accurate?',
      options: [
        { text: 'Every expert runs for every token: a dense layer at 8 times the cost of one expert', correct: true, why: 'No expert is skipped, so there is no sparsity and no saving. What remains is a wide feed-forward layer whose eight parts are mixed by the router’s softmax.' },
        { text: 'It is the cheapest setting, because the router no longer has to choose', why: 'The router is a tiny cost. Running all 8 experts is the largest compute this layer can use.' },
        { text: 'It is identical to a single expert, because the weighted outputs average out', why: 'Eight different networks with input-dependent weights compute a different function from one of them alone.' },
        { text: 'Memory use falls, because all experts are now in use and none are wasted', why: 'Memory is the same at any k: all experts are always loaded.' },
      ],
      hint: 'Ask how many experts are skipped for each token, and where the saving came from.',
    },
    {
      id: 'moe-8', kind: 'mcq', level: 3,
      prompt: 'A model has 12 MoE layers, each with 8 experts and k = 1. A token is sent to expert 3 in layer 1. Which expert will it use in layer 2?',
      options: [
        { text: 'Whichever layer 2’s own router scores highest for the token’s new vector', correct: true, why: 'Every layer has a separate router and separate experts, and the token’s vector has changed since layer 1. Across 12 layers there are 8¹² possible paths.' },
        { text: 'Expert 3 again, because a token keeps its expert for the whole model', why: 'Expert 3 of layer 2 is a different network from expert 3 of layer 1. The numbering carries no meaning across layers.' },
        { text: 'Expert 4, because routing advances by one each layer to spread the load', why: 'Routing is computed from the token’s vector by a learned scorer. There is no fixed rotation.' },
        { text: 'The expert that the previous token in the sentence used in layer 2', why: 'Each token is routed on its own vector. A neighbour’s choice is not an input to the router.' },
      ],
      hint: 'Routers and experts belong to a layer. Nothing about them is shared between layers.',
    },
  ],
  takeaways: [
    'A mixture-of-experts block replaces the one feed-forward layer with N experts and a router that sends each token to the top k of them.',
    'Routing is decided per token and per layer, and experts do not line up with human topics.',
    'Stored parameters grow with N while compute per token grows with k, but every expert must still be held in memory.',
    'Without a load-balancing loss the router collapses onto a few experts and the rest are wasted.',
  ],
};

export default lesson;
