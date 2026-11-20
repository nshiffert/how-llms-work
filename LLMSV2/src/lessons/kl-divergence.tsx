import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Stat, clamp, useSpring } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: two distributions over the same five next-token candidates.
 * P is the truth (or a teacher), Q is the model. Every number on the
 * screen is computed from the ten bar heights:
 *   KL(P‖Q) = Σ p·ln(p/q)      H(P) = −Σ p·ln p      CE(P,Q) = −Σ p·ln q
 * Bars stop at 0.1% so the logs stay finite.
 * ------------------------------------------------------------------ */

const WORDS = ['mat', 'floor', 'sofa', 'bed', 'roof'];
const FLOOR = 0.001;
const P_COL = '#7dd3fc';
const Q_COL = 'var(--hue)';

type PresetId = 'identical' | 'miss' | 'broad';
const START = { p: [0.4, 0.25, 0.2, 0.1, 0.05], q: [0.25, 0.25, 0.2, 0.15, 0.15] };
const PRESETS: Record<PresetId, { label: string; p: number[]; q: number[] }> = {
  identical: { label: 'Identical', p: [0.4, 0.25, 0.2, 0.1, 0.05], q: [0.4, 0.25, 0.2, 0.1, 0.05] },
  miss: { label: 'Q misses a mode', p: [0.45, 0.04, 0.02, 0.45, 0.04], q: [0.9, 0.04, 0.02, 0.01, 0.03] },
  broad: { label: 'Q is too broad', p: [0.85, 0.06, 0.04, 0.03, 0.02], q: [0.2, 0.2, 0.2, 0.2, 0.2] },
};

const klTerms = (a: number[], b: number[]) => a.map((x, i) => x * Math.log(x / b[i]));
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const entropy = (a: number[]) => -sum(a.map((x) => x * Math.log(x)));
const crossEntropy = (a: number[], b: number[]) => -sum(a.map((x, i) => x * Math.log(b[i])));

/** Set bar i to v and rescale the others so the total stays 1. */
function setBar(arr: number[], i: number, v: number): number[] {
  const rest = arr.map((x, j) => (j === i ? 0 : x));
  const s1 = (1 - v) / sum(rest);
  const floored = rest.map((x, j) => (j === i ? 0 : Math.max(FLOOR, x * s1)));
  const s2 = (1 - v) / sum(floored);
  return floored.map((x, j) => (j === i ? v : x * s2));
}

const pctLabel = (v: number) => (v < 0.0995 ? (v * 100).toFixed(1) : (v * 100).toFixed(0)) + '%';

function DragBar(props: { value: number; color: string; live: boolean; onDrag: (v: number) => void; onEnd: () => void; label: string }) {
  const { value, color, live, onDrag, onEnd, label } = props;
  const down = useRef(false);
  const at = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onDrag(clamp((r.bottom - e.clientY) / r.height, FLOOR, 1 - 4 * FLOOR));
  };
  return (
    <div
      role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
      onPointerDown={(e) => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (down.current) at(e); }}
      onPointerUp={() => { down.current = false; onEnd(); }}
      onPointerCancel={() => { down.current = false; onEnd(); }}
      style={{
        position: 'relative', flex: 1, height: 190, borderRadius: 8, background: 'rgba(255,255,255,0.045)',
        cursor: 'ns-resize', touchAction: 'none', userSelect: 'none', maxWidth: 46,
      }}
    >
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: `${value * 100}%`, minHeight: 3, borderRadius: 8,
          background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, transparent))`,
          boxShadow: `0 0 18px -6px ${color}`,
          transition: live ? 'none' : 'height .55s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 3, right: 3, height: 3, borderRadius: 3, background: '#fff', opacity: 0.9 }} />
      </div>
      <span
        className="mono"
        style={{
          position: 'absolute', left: -6, right: -6, textAlign: 'center', fontSize: 11, color, fontWeight: 700, pointerEvents: 'none',
          bottom: `calc(${Math.min(value, 0.9) * 100}% + 5px)`,
          transition: live ? 'none' : 'bottom .55s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {pctLabel(value)}
      </span>
    </div>
  );
}

function KlLab({ complete }: LabProps) {
  const [p, setP] = useState(START.p);
  const [q, setQ] = useState(START.q);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [live, setLive] = useState(false);
  const [dir, setDir] = useState<'pq' | 'qp'>('pq');
  const [checked, setChecked] = useState(false);

  const m = useMemo(() => {
    const tPQ = klTerms(p, q);
    const tQP = klTerms(q, p);
    return { tPQ, tQP, klPQ: Math.max(0, sum(tPQ)), klQP: Math.max(0, sum(tQP)), h: entropy(p), ce: crossEntropy(p, q) };
  }, [p, q]);

  const klPQs = useSpring(m.klPQ, 0.25);
  const klQPs = useSpring(m.klQP, 0.25);

  useEffect(() => {
    if (m.klPQ < 0.005 && m.klQP < 0.005) complete('zero');
    if (m.klPQ >= 0.1 && m.klPQ >= 3 * m.klQP) complete('asym');
    if (q.some((x, i) => x <= 0.002 && p[i] >= 0.1)) complete('spike');
    if (checked && preset) complete('identity');
  }, [m, p, q, checked, preset, complete]);

  const load = (id: PresetId) => {
    sfx.tap();
    setLive(false);
    setP(PRESETS[id].p);
    setQ(PRESETS[id].q);
    setPreset(id);
    setChecked(false);
  };
  const drag = (which: 'p' | 'q', i: number, v: number) => {
    setLive(true);
    setPreset(null);
    setChecked(false);
    if (which === 'p') setP((a) => setBar(a, i, v));
    else setQ((a) => setBar(a, i, v));
  };

  const terms = dir === 'pq' ? m.tPQ : m.tQP;
  const total = dir === 'pq' ? m.klPQ : m.klQP;
  const tMax = Math.max(0.25, ...terms.map(Math.abs));
  const worst = terms.indexOf(Math.max(...terms));
  const atFloor = q.findIndex((x, i) => x <= 0.0015 && p[i] >= 0.05);
  const idScale = Math.max(2, m.ce) * 1.04;
  const ratio = m.klQP > 1e-6 ? m.klPQ / m.klQP : null;

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dim" style={{ fontSize: 13 }}>Presets</span>
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button key={id} className="btn sm" onClick={() => load(id)} style={preset === id ? { borderColor: 'var(--hue)', color: 'var(--hue)' } : undefined}>
              {PRESETS[id].label}
            </button>
          ))}
        </div>
        <div className="row mono" style={{ fontSize: 12, gap: 14 }}>
          <span style={{ color: P_COL }}>■ P · truth / teacher</span>
          <span style={{ color: Q_COL }}>■ Q · model</span>
        </div>
      </div>

      <div>
        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>
          Next token after <span className="mono" style={{ color: 'var(--fg)' }}>“The cat sat on the”</span>. Drag any bar up or down. The other four rescale so each set still sums to 100%.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
          {WORDS.map((w, i) => (
            <div key={w} style={{ display: 'grid', gap: 6, padding: '22px 6px 8px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                <DragBar value={p[i]} color={P_COL} live={live} label={`P of ${w}`} onDrag={(v) => drag('p', i, v)} onEnd={() => setLive(false)} />
                <DragBar value={q[i]} color={Q_COL} live={live} label={`Q of ${w}`} onDrag={(v) => drag('q', i, v)} onEnd={() => setLive(false)} />
              </div>
              <div className="mono" style={{ textAlign: 'center', fontSize: 13, color: 'var(--fg)' }}>{w}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'stretch' }}>
        <Stat label={<>KL(P‖Q) · nats<br />truth scored by the model</>} value={klPQs.toFixed(3)} hot={m.klPQ >= 1} />
        <Stat label={<>KL(Q‖P) · nats<br />model scored by the truth</>} value={klQPs.toFixed(3)} hot={m.klQP >= 1} />
        <Stat label={<>ratio<br />KL(P‖Q) ÷ KL(Q‖P)</>} value={ratio === null ? '–' : ratio >= 100 ? '>100×' : ratio.toFixed(2) + '×'} />
        <span className="dim" style={{ fontSize: 13, maxWidth: '30ch', alignSelf: 'center' }}>
          1 nat is the surprise of an outcome you gave probability 1/e ≈ 37%. {m.klPQ.toFixed(3)} nats = {(m.klPQ / Math.LN2).toFixed(3)} bits.
        </span>
      </div>

      {atFloor >= 0 && (
        <Callout warn>
          Q gives “{WORDS[atFloor]}” {pctLabel(q[atFloor])} while P gives it {pctLabel(p[atFloor])}. The bars stop at 0.1%. At exactly 0 the term
          p · ln(p/0) is infinite, and so is KL(P‖Q).
        </Callout>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="eyebrow">Per-outcome terms</div>
            <Seg value={dir} onChange={setDir} options={[{ value: 'pq', label: 'p·ln(p/q)' }, { value: 'qp', label: 'q·ln(q/p)' }]} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {WORDS.map((w, i) => {
              const t = terms[i];
              const wPct = (Math.abs(t) / tMax) * 50;
              return (
                <div key={w} className="mono" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 62px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ textAlign: 'right', color: 'var(--fg-2)' }}>{w}</span>
                  <div style={{ position: 'relative', height: 18, borderRadius: 6, background: 'rgba(255,255,255,0.045)' }}>
                    <div
                      style={{
                        position: 'absolute', top: 0, bottom: 0, borderRadius: 5, minWidth: 1,
                        left: t >= 0 ? '50%' : `${50 - wPct}%`, width: `${wPct}%`,
                        background: t >= 0 ? 'var(--bad)' : 'var(--good)',
                        boxShadow: i === worst && t > 0.3 ? '0 0 14px var(--bad)' : undefined,
                        transition: live ? 'none' : 'all .45s cubic-bezier(.22,1,.36,1)',
                      }}
                    />
                    <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--line-2)' }} />
                  </div>
                  <span style={{ textAlign: 'right', color: t >= 0.0005 ? 'var(--bad)' : t <= -0.0005 ? 'var(--good)' : 'var(--fg-3)' }}>
                    {(t >= 0 ? '+' : '−') + Math.abs(t).toFixed(3)}
                  </span>
                </div>
              );
            })}
            <div className="mono" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 62px', gap: 8, fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
              <span style={{ textAlign: 'right', color: 'var(--fg-3)' }}>sum</span>
              <span className="dim" style={{ fontSize: 12 }}>{dir === 'pq' ? 'KL(P‖Q)' : 'KL(Q‖P)'} · red adds, green subtracts</span>
              <span style={{ textAlign: 'right', color: 'var(--fg)', fontWeight: 700 }}>{total.toFixed(3)}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Cross-entropy = entropy + KL</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.045)', overflow: 'hidden' }}>
              <div style={{ width: `${(m.h / idScale) * 100}%`, background: P_COL, transition: live ? 'none' : 'width .45s cubic-bezier(.22,1,.36,1)' }} />
              <div style={{ width: `${(m.klPQ / idScale) * 100}%`, background: 'var(--bad)', transition: live ? 'none' : 'width .45s cubic-bezier(.22,1,.36,1)' }} />
            </div>
            <div style={{ height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.045)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(m.ce / idScale) * 100}%`, background: Q_COL, borderRadius: 6, transition: live ? 'none' : 'width .45s cubic-bezier(.22,1,.36,1)' }} />
            </div>
            <div className="mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <span style={{ color: P_COL }}>H(P) {m.h.toFixed(3)}</span>
              <span className="dim"> + </span>
              <span style={{ color: 'var(--bad)' }}>KL(P‖Q) {m.klPQ.toFixed(3)}</span>
              <br />
              <span style={{ color: Q_COL }}>CE(P,Q) {m.ce.toFixed(3)}</span>
              <span className="dim"> nats</span>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => { sfx.tap(); setChecked(true); }}>Check the sum</button>
              {checked && (
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--good)' }}>
                  {m.h.toFixed(4)} + {m.klPQ.toFixed(4)} = {(m.h + m.klPQ).toFixed(4)} · CE = {m.ce.toFixed(4)} ✓
                </span>
              )}
            </div>
            <span className="dim" style={{ fontSize: 12.5 }}>
              The three numbers are computed separately: −Σ p ln p, Σ p ln(p/q), −Σ p ln q. Blue is the surprise the truth carries whatever the model does. Red is what the model adds.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'kl-divergence',
  hook: {
    prompt: (
      <>
        You have two probability distributions over the same next tokens: the truth P and a model’s guess Q. You measure
        how far Q is from P with KL divergence. Then you swap the two and measure again. What do you get?
      </>
    ),
    options: [
      {
        text: 'Usually a different number: the weights come from whichever one is named first',
        correct: true,
        why: 'KL(P‖Q) averages the log-ratio ln(p/q) using P’s probabilities as weights. Swap the two and both the ratio and the weights change, so the result is generally different. KL is not a distance.',
      },
      {
        text: 'The same number: the gap between two things does not depend on which you name first',
        why: 'That is true of a distance such as a ruler measures. KL is a weighted average, and the weights come from whichever distribution is named first.',
      },
      {
        text: 'The same number with the opposite sign, like subtracting in the other order',
        why: 'KL is never negative in either direction. It is not a subtraction of two totals; the weights change when you swap.',
      },
      {
        text: 'Zero one way round, because a model cannot be “far” from the truth it was trained on',
        why: 'KL is zero only when the two distributions are identical. If they differ at all, both directions are above zero.',
      },
    ],
    reveal: 'Next you will drag both distributions yourself and watch the two directions come apart.',
  },
  Lab: KlLab,
  missions: [
    {
      id: 'zero',
      text: 'Get both divergences below 0.005. Dragging works, and so does a preset.',
      insight: 'KL is zero only when Q matches P on every outcome. Then every ratio p/q is 1, every ln is 0, and using Q costs nothing extra.',
    },
    {
      id: 'asym',
      text: 'Load “Q misses a mode”. The ratio reads 2.45×. Drag Q on “bed” down until the ratio passes 3×.',
      insight: 'KL(P‖Q) weights each outcome by P. A place where P is large and Q is tiny gets a big weight and a big log-ratio. KL(Q‖P) weights by Q, and Q hardly ever goes there, so the same mismatch barely registers.',
    },
    {
      id: 'spike',
      text: 'Keep dragging that Q bar to the bottom (0.1%) and watch KL(P‖Q).',
      insight: 'In the “Q misses a mode” preset, dropping Q on “bed” from 1% to 0.1% raises KL(P‖Q) from 1.41 to 2.44 nats. Every further 10× cut adds p × ln 10 = 0.45 × 2.30 ≈ 1.04 nats. At exactly zero it is infinite: the model called something impossible and it happened.',
    },
    {
      id: 'identity',
      text: 'Load any preset and press “Check the sum” under the identity.',
      insight: 'Cross-entropy splits into a part the model cannot change (the entropy of P) and a part it can (the KL). With fixed data, pushing cross-entropy down is pushing KL down. They are the same optimization.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Cross-entropy scored one prediction. KL divergence scores a whole distribution against another.
        </p>
        <p>
          For each outcome, take ln(p/q), the log of the ratio between the two probabilities. Weight it by how often
          that outcome really happens, p. Add them up. The result is the <strong>extra surprise</strong>, on average,
          from predicting with Q when the outcomes follow P, in <em>nats</em>.
        </p>
        <Callout>
          <M>{String.raw`\mathrm{KL}(P\,\|\,Q)=\sum_i p_i \ln\frac{p_i}{q_i}`}</M>
        </Callout>
        <p>Three properties. The lab showed the first two and came close to the third:</p>
        <ul>
          <li><strong>Never negative.</strong> Single terms can be (the green bars). The sum cannot. It is zero only when Q equals P.</li>
          <li><strong>Not symmetric.</strong> The weights come from the first distribution, so KL(P‖Q) and KL(Q‖P) differ.</li>
          <li><strong>Infinite</strong> when Q gives zero to something P allows. The reverse is harmless: an outcome P gives zero has weight 0 and drops out.</li>
        </ul>
        <p>
          The <strong>entropy</strong> of P is the average surprise when you predict with P itself, −Σ p ln p: the
          floor no predictor can beat. <strong>Cross-entropy</strong> is the average surprise when you predict with Q,
          −Σ p ln q. With a one-hot P it is the −ln p(correct) from the last lesson. Cross-entropy = entropy + KL. The
          data fixes the entropy. Training can only remove the KL part.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          Three outcomes. The truth is P = <code>[0.5, 0.4, 0.1]</code>. The model says Q = <code>[0.8, 0.1, 0.1]</code>:
          too sure of the first, too low on the second.
        </p>
        <table>
          <thead>
            <tr><th>outcome</th><th>p</th><th>q</th><th>ln(p/q)</th><th>p · ln(p/q)</th><th>q · ln(q/p)</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>0.5</td><td>0.8</td><td>−0.470</td><td>−0.235</td><td>+0.376</td></tr>
            <tr><td>2</td><td>0.4</td><td>0.1</td><td>+1.386</td><td>+0.555</td><td>−0.139</td></tr>
            <tr><td>3</td><td>0.1</td><td>0.1</td><td>0</td><td>0</td><td>0</td></tr>
            <tr><td><strong>sum</strong></td><td></td><td></td><td></td><td><strong>0.320</strong></td><td><strong>0.237</strong></td></tr>
          </tbody>
        </table>
        <p>
          KL(P‖Q) = 0.320 nats. KL(Q‖P) = 0.237 nats. Same two distributions, different answers. The forward direction is
          larger because the model’s worst error, giving 10% to something that happens 40% of the time, is weighted by
          0.4. In the reverse direction that same outcome is weighted by 0.1.
        </p>
        <p>
          Now the identity. Entropy of P: −(0.5 ln 0.5 + 0.4 ln 0.4 + 0.1 ln 0.1) = 0.943. Cross-entropy: −(0.5 ln 0.8 +
          0.4 ln 0.1 + 0.1 ln 0.1) = 1.263. And 0.943 + 0.320 = 1.263.
        </p>
        <Code>{`
p = np.array([0.5, 0.4, 0.1])
q = np.array([0.8, 0.1, 0.1])
kl_pq = np.sum(p * np.log(p / q))    # 0.320
kl_qp = np.sum(q * np.log(q / p))    # 0.237
h     = -np.sum(p * np.log(p))       # 0.943
ce    = -np.sum(p * np.log(q))       # 1.263 = h + kl_pq
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Why it is never negative</h3>
        <p>
          For any positive x, <M>{String.raw`\ln x \le x - 1`}</M>. Apply it to x = q/p:
        </p>
        <M block>{String.raw`-\mathrm{KL}(P\|Q)=\sum_i p_i \ln\frac{q_i}{p_i}\;\le\;\sum_i p_i\left(\frac{q_i}{p_i}-1\right)=\sum_i q_i-\sum_i p_i=0`}</M>
        <p>
          Equality needs q/p = 1 everywhere. Q can beat P on some outcomes, but both must sum to 1, so it has to pay for
          that somewhere else, and the log makes the payment larger than the gain.
        </p>
        <h3>What each direction punishes</h3>
        <p>
          Suppose you fit Q to a fixed P. Minimizing <strong>KL(P‖Q)</strong> punishes Q for being small where P is
          large. Q must put mass everywhere P does, so it spreads out, even into gaps between P’s peaks. This is called
          mode-covering. Minimizing <strong>KL(Q‖P)</strong> punishes Q for putting mass where P is small. Q can ignore
          whole peaks of P for free, so it tends to lock onto one peak. This is called mode-seeking.
        </p>
        <h3>Where it shows up around LLMs</h3>
        <p>
          <strong>Pre-training.</strong> The loss is cross-entropy against the data. Since the data’s entropy is fixed,
          that is forward KL from the data to the model: mode-covering. It pushes a language model to keep some
          probability on every token the data might produce.
        </p>
        <p>
          <strong>Distillation.</strong> A small student model is trained so its next-token distribution matches a large
          teacher’s. The classic recipe minimizes KL(teacher‖student) at every position.
        </p>
        <p>
          <strong>Staying close to a reference.</strong> When a model is fine-tuned with reinforcement learning, the loss
          can add a KL term between the new policy’s token distribution and the original model’s. The penalty grows as
          the policy drifts, which stops it from wandering far to chase reward.
        </p>
        <h3>The one-hot case</h3>
        <p>
          If P puts 100% on one token, its entropy is 0 and KL(P‖Q) = −ln q(correct). That is exactly the cross-entropy
          loss from the last lesson. KL is the general form.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'It is not a distance',
      body: 'KL(P‖Q) and KL(Q‖P) differ, and KL does not obey the triangle inequality. Reporting “the KL between two models” without saying which direction is ambiguous, and the two directions can differ several-fold.',
    },
    {
      title: 'One zero makes it infinite',
      body: 'If Q assigns exactly zero to anything P can produce, KL(P‖Q) is infinite, however good Q is elsewhere. Softmax outputs are never exactly zero, which avoids this in training, but hard filters such as top-k create zeros and break the measure.',
    },
    {
      title: 'A single number hides where the mismatch is',
      body: 'A KL of 0.3 nats can come from a small error on every token or a large error on one rare token. The per-outcome terms tell you which. The total does not.',
    },
    {
      title: 'A low KL to a teacher is not correctness',
      body: 'KL measures agreement with P. If P is a flawed teacher or biased data, a student with KL near zero has copied the flaws faithfully.',
    },
  ],
  questions: [
    {
      id: 'kl-1', kind: 'mcq', level: 1,
      prompt: 'In plain words, what does KL(P‖Q) measure?',
      options: [
        { text: 'The average extra surprise from predicting with Q when outcomes actually follow P', correct: true, why: 'Each outcome contributes p · ln(p/q): how much more surprised Q is than P, weighted by how often the outcome occurs under P.' },
        { text: 'The total surprise of predicting with Q when outcomes actually follow P', why: 'That is cross-entropy. KL is only the part above the entropy of P, the part a better Q could remove.' },
        { text: 'The straight-line distance between the two lists of probabilities', why: 'KL uses log-ratios weighted by P, not differences. It is not symmetric, so it is not a distance.' },
        { text: 'The probability that a sample drawn from P could have come from Q', why: 'KL is not a probability. It is measured in nats and can exceed 1 without limit.' },
      ],
    },
    {
      id: 'kl-2', kind: 'mcq', level: 1,
      prompt: 'Which statement about the sign of KL divergence is true?',
      options: [
        { text: 'It is never negative, and zero only when the two are identical', correct: true, why: 'Individual terms can be negative where q exceeds p, but the weighted sum cannot go below zero, and reaches zero only when q = p everywhere.' },
        { text: 'It is negative when the model Q is more confident than the truth P', why: 'Overconfidence makes some terms negative, but Q must then be too low somewhere else, and those terms outweigh the gain.' },
        { text: 'It is zero whenever P and Q agree on the most likely outcome', why: 'Agreeing on the top outcome is not enough. Every probability must match for every log-ratio to be zero.' },
        { text: 'It is always between 0 and 1, because it is built from probabilities', why: 'There is no upper limit. One near-zero q where p is large gives several nats, and an exact zero gives infinity.' },
      ],
    },
    {
      id: 'kl-3', kind: 'num', level: 2,
      prompt: <>P = <code>[0.5, 0.5]</code> and Q = <code>[0.25, 0.75]</code>. What is KL(P‖Q) in nats? (ln 2 ≈ 0.693, ln(2/3) ≈ −0.405)</>,
      answer: 0.144, tol: 0.01, unit: 'nats',
      why: <>0.5 · ln(0.5/0.25) + 0.5 · ln(0.5/0.75) = 0.5 × 0.693 + 0.5 × (−0.405) = 0.347 − 0.203 = <strong>0.144</strong>. One term is negative, the sum is not.</>,
      hint: 'Two terms, each p · ln(p/q). Use the two logs given.',
    },
    {
      id: 'kl-4', kind: 'num', level: 2,
      prompt: 'On a fixed dataset, a model’s cross-entropy is 2.10 nats per token. The entropy of the data distribution is 1.40 nats per token. What is KL(data‖model)?',
      answer: 0.7, tol: 0.01, unit: 'nats',
      why: <>Cross-entropy = entropy + KL, so KL = 2.10 − 1.40 = <strong>0.70</strong> nats. That is all the loss a better model could still remove.</>,
      hint: 'Use the identity that splits cross-entropy into two parts.',
    },
    {
      id: 'kl-5', kind: 'mcq', level: 2,
      prompt: <>P = <code>[0.5, 0.5, 0]</code> and Q = <code>[0.4, 0.4, 0.2]</code>. Which divergence is infinite?</>,
      options: [
        { text: 'Only KL(Q‖P): Q puts 20% on an outcome that P says cannot happen', correct: true, why: 'KL(Q‖P) has the term 0.2 · ln(0.2/0), which is infinite. KL(P‖Q) is finite: the third outcome has weight p = 0 and drops out, leaving ln(1.25) ≈ 0.22 nats.' },
        { text: 'Only KL(P‖Q): P has a zero, and a zero anywhere in the first slot breaks it', why: 'A zero in the weighting distribution removes that term (0 · ln 0 counts as 0). The trouble comes from a zero in the denominator distribution.' },
        { text: 'Both: any zero in either distribution makes both directions infinite', why: 'Only a zero in the second distribution, where the first is positive, is fatal. Here that happens in one direction only.' },
        { text: 'Neither: the two distributions agree on the ranking of the first two outcomes', why: 'Ranking is irrelevant. A single outcome with positive weight and zero predicted probability gives an infinite term.' },
      ],
      hint: 'Look for an outcome where the weight is positive and the probability being divided by is zero.',
    },
    {
      id: 'kl-6', kind: 'mcq', level: 2,
      prompt: 'A model is fine-tuned with reinforcement learning. Its loss includes a penalty of β × KL(new policy‖original model). What happens as β is made very large?',
      options: [
        { text: 'The policy stays almost identical to the original model and gains little reward', correct: true, why: 'Any drift costs β times the KL, so with a huge β the cheapest solution is to keep the KL near zero, which means barely changing.' },
        { text: 'The policy moves faster, because a larger coefficient means larger gradients toward reward', why: 'The coefficient multiplies the penalty, not the reward. The larger gradients point back toward the original model.' },
        { text: 'The policy collapses onto the single highest-reward token at every step', why: 'That is what tends to happen with no penalty. A collapsed policy has a large KL from the original and would be heavily penalized.' },
        { text: 'Nothing changes, because KL between two models is always close to zero', why: 'KL is zero only for identical distributions. A policy that has shifted toward reward has a KL well above zero.' },
      ],
      hint: 'Ask which term dominates the loss and what makes that term small.',
    },
    {
      id: 'kl-7', kind: 'mcq', level: 3,
      prompt: 'P has two separate peaks. You fit a Q that can only have one peak. Which Q does minimizing each direction give?',
      options: [
        { text: 'KL(P‖Q) gives a wide Q stretched over both peaks; KL(Q‖P) gives a narrow Q sitting on one peak', correct: true, why: 'Forward KL is weighted by P, so missing either peak is expensive and Q spreads to cover both. Reverse KL is weighted by Q, so ignoring a peak is free and putting mass in the empty gap is expensive.' },
        { text: 'KL(P‖Q) gives a narrow Q on one peak; KL(Q‖P) gives a wide Q stretched over both peaks', why: 'This is the two directions reversed. Forward KL cannot ignore a peak, because P’s weight there multiplies a huge log-ratio.' },
        { text: 'Both give the same wide Q, since the best fit to P does not depend on how you measure', why: 'The two directions penalize different mistakes, so their best fits differ whenever Q cannot match P exactly.' },
        { text: 'Both give a narrow Q on the taller peak, since that is where most probability sits', why: 'Under forward KL, leaving the second peak near zero costs a great deal. Only reverse KL lets Q abandon it.' },
      ],
      hint: 'In each direction, ask which is the expensive mistake: Q small where P is large, or Q large where P is small.',
    },
    {
      id: 'kl-8', kind: 'mcq', level: 3,
      prompt: 'A language model’s cross-entropy on held-out text stops falling at 1.9 nats per token. With enough training, could it reach 0?',
      options: [
        { text: 'No. The floor is the entropy of the text, which is above zero for real language', correct: true, why: 'Cross-entropy = entropy + KL. A perfect model drives the KL to zero and is left with the entropy of the data: many continuations are plausible, so some surprise always remains.' },
        { text: 'Yes. Zero cross-entropy just means the KL has reached zero, which a perfect model achieves', why: 'KL reaching zero leaves cross-entropy equal to the entropy of the data, not zero. Those are different quantities.' },
        { text: 'Yes, but only if the model is at least as large as its training set', why: 'A model can drive loss to zero on text it has memorized. On held-out text the next token is not determined, so the floor remains.' },
        { text: 'No. Cross-entropy is a KL divergence, and KL can never fall below 1 nat', why: 'KL can be any value from zero up. The floor on cross-entropy comes from the entropy term, not from a limit on KL.' },
      ],
      hint: 'Split the loss into the part the model controls and the part it does not.',
    },
  ],
  takeaways: [
    'KL(P‖Q) is the average extra surprise, in nats, from predicting with Q when outcomes follow P.',
    'It is never negative, zero only when the two match, infinite when Q gives zero to something P allows, and different when you swap P and Q.',
    'Cross-entropy equals the entropy of the data plus KL, so minimizing cross-entropy on fixed data is minimizing KL.',
    'Distillation minimizes KL to a teacher, and a KL penalty keeps a fine-tuned policy close to a reference model.',
  ],
};

export default lesson;
