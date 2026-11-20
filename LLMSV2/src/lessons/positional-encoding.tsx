import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, M, Seg, Slider, Stat, softmax, tokHue, useSpring } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: three ways to treat position, all computed.
 *  none  - one real attention step (query = key = value = the token's
 *          vector) on a sentence and a shuffled copy.
 *  sin   - the standard sinusoidal encoding, d = 16, 48 positions.
 *  rope  - one 2-D query/key pair, each rotated by position × 15°.
 * ------------------------------------------------------------------ */

type Mode = 'none' | 'sin' | 'rope';

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Standard sinusoidal encoding: even dims sin, odd dims cos, frequencies 10000^(-2i/d). */
function sinPE(pos: number, d: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < d / 2; i++) {
    const w = Math.pow(10000, (-2 * i) / d);
    out.push(Math.sin(pos * w), Math.cos(pos * w));
  }
  return out;
}

/* ---------------- mode: none ---------------- */

const EMB: Record<string, number[]> = {
  dog: [1.4, 0.2, 0.0, 0.4],
  bites: [0.2, 1.5, 0.3, 0.0],
  man: [1.1, 0.0, 0.6, 0.5],
};
const WORD_I: Record<string, number> = { dog: 0, bites: 1, man: 4 };
const ORDER_A = ['dog', 'bites', 'man'];
const ORDERS_B = [
  ['dog', 'bites', 'man'],
  ['man', 'bites', 'dog'],
  ['bites', 'man', 'dog'],
  ['man', 'dog', 'bites'],
  ['dog', 'man', 'bites'],
  ['bites', 'dog', 'man'],
];

/** What "bites" receives from one attention step over the sentence. */
function attendFromBites(order: string[], withPos: boolean) {
  const xs = order.map((w, p) => (withPos ? EMB[w].map((v, k) => v + sinPE(p, 4)[k]) : EMB[w]));
  const me = order.indexOf('bites');
  const weights = softmax(xs.map((x) => dot(xs[me], x) / 2)); // ÷ √4
  const out = [0, 1, 2, 3].map((k) => xs.reduce((s, x, j) => s + weights[j] * x[k], 0));
  const byWord: Record<string, number> = {};
  order.forEach((w, j) => { byWord[w] = weights[j]; });
  return { xs, byWord, out };
}

function VecCells({ v }: { v: number[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {v.map((x, k) => (
        <i
          key={k}
          title={x.toFixed(2)}
          style={{
            width: 13, height: 13, borderRadius: 3, display: 'block',
            background: x >= 0 ? 'var(--hue)' : '#f472b6', opacity: 0.12 + Math.min(1, Math.abs(x) / 2.4) * 0.88,
            transition: 'opacity .35s, background .35s',
          }}
        />
      ))}
    </span>
  );
}

function SentencePanel({ title, order, withPos }: { title: string; order: string[]; withPos: boolean }) {
  const { xs, byWord, out } = useMemo(() => attendFromBites(order, withPos), [order, withPos]);
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {order.map((w, p) => (
          <div
            key={w}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${tokHue(WORD_I[w])} 55%, transparent)`,
              background: `color-mix(in srgb, ${tokHue(WORD_I[w])} 14%, transparent)`,
            }}
          >
            <div className="mono" style={{ fontSize: 15, color: '#fff' }}>{w}</div>
            <div style={{ margin: '6px 0 4px', display: 'flex', justifyContent: 'center' }}><VecCells v={xs[p]} /></div>
            <div className="mono dim" style={{ fontSize: 11 }}>{withPos ? `+ pos ${p}` : 'no position'}</div>
          </div>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginBottom: 6 }}>where “bites” looks</div>
      <Bars items={ORDER_A.map((w) => ({ label: w, value: byWord[w], color: tokHue(WORD_I[w]) }))} max={1} labelWidth={44} />
      <div className="dim" style={{ fontSize: 12.5, margin: '12px 0 6px' }}>what “bites” becomes</div>
      <div className="mono" style={{ fontSize: 14, color: 'var(--fg)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {out.map((x, k) => <span key={k}>{x.toFixed(3)}</span>)}
      </div>
    </div>
  );
}

/* ---------------- mode: sinusoidal ---------------- */

const D = 16;
const NPOS = 48;
const TABLE = Array.from({ length: NPOS }, (_, p) => sinPE(p, D));
const WAVES = [0, 1, 2, 3]; // frequency index i; plotted dim is 2i (the sine)
const freq = (i: number) => Math.pow(10000, (-2 * i) / D);

function SinView({ pos, setPos }: { pos: number; setPos: (p: number) => void }) {
  const W = 760, L = 58, R = 10;
  const cw = (W - L - R) / NPOS;
  const ch = 9;
  const yHeat = 22;
  const yWave = yHeat + D * ch + 34;
  const laneH = 34;
  const ySim = yWave + WAVES.length * laneH + 40;
  const simH = 62;
  const H = ySim + simH + 22;
  const x = (p: number) => L + cw * (p + 0.5);

  const cells = useMemo(
    () =>
      TABLE.flatMap((row, p) =>
        row.map((v, k) => (
          <rect key={`${p}-${k}`} x={L + p * cw + 0.5} y={yHeat + k * ch + 0.5} width={cw - 1} height={ch - 1} rx={1.5}
            fill={v >= 0 ? 'var(--hue)' : '#f472b6'} fillOpacity={0.06 + Math.abs(v) * 0.9} />
        )),
      ),
    [cw, yHeat],
  );
  const wavePaths = useMemo(
    () =>
      WAVES.map((i, lane) => {
        const mid = yWave + lane * laneH + laneH / 2;
        let d = '';
        for (let s = 0; s <= (NPOS - 1) * 8; s++) {
          const p = s / 8;
          d += `${s ? 'L' : 'M'} ${x(p).toFixed(1)} ${(mid - Math.sin(p * freq(i)) * (laneH / 2 - 5)).toFixed(1)} `;
        }
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yWave],
  );
  const sims = TABLE.map((row) => dot(row, TABLE[pos]));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        className="viz" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 640, cursor: 'pointer' }} role="img"
        aria-label={`Sinusoidal positional encoding, position ${pos} selected`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const vx = ((e.clientX - r.left) / r.width) * W;
          const p = Math.floor((vx - L) / cw);
          if (p >= 0 && p < NPOS) { sfx.tap(); setPos(p); }
        }}
      >
        <text x={L} y={13} style={{ fill: 'var(--hue)', fontSize: 11, letterSpacing: '.12em' }}>THE ENCODING · ONE COLUMN PER POSITION, ONE ROW PER DIMENSION</text>
        {cells}
        <text x={L - 8} y={yHeat + 8} textAnchor="end" style={{ fontSize: 10 }}>dim 0</text>
        <text x={L - 8} y={yHeat + D * ch - 1} textAnchor="end" style={{ fontSize: 10 }}>dim 15</text>
        <text x={L - 8} y={yHeat + (D * ch) / 2 - 2} textAnchor="end" style={{ fontSize: 9.5, fill: 'var(--fg-3)' }}>fast ↑</text>
        <text x={L - 8} y={yHeat + (D * ch) / 2 + 10} textAnchor="end" style={{ fontSize: 9.5, fill: 'var(--fg-3)' }}>slow ↓</text>
        {/* selected column */}
        <rect x={0} y={yHeat - 3} width={cw + 2} height={D * ch + 6} rx={4} fill="none" stroke="#fff" strokeWidth={1.6}
          style={{ transform: `translateX(${L + pos * cw - 1}px)`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }} />
        <line x1={0} x2={0} y1={yHeat + D * ch + 4} y2={ySim + simH} stroke="#fff" strokeOpacity={0.35} strokeDasharray="3 4"
          style={{ transform: `translateX(${x(pos)}px)`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }} />

        <text x={L} y={yWave - 10} style={{ fill: 'var(--hue)', fontSize: 11, letterSpacing: '.12em' }}>FOUR OF ITS ROWS AS WAVES · THE DOTS ARE THIS POSITION'S VALUES</text>
        {WAVES.map((i, lane) => {
          const mid = yWave + lane * laneH + laneH / 2;
          const v = TABLE[pos][2 * i];
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={mid} y2={mid} stroke="var(--line)" />
              <path d={wavePaths[lane]} fill="none" stroke="var(--hue)" strokeWidth={1.6} strokeOpacity={0.8} />
              <text x={L - 8} y={mid + 4} textAnchor="end" style={{ fontSize: 10 }}>dim {2 * i}</text>
              <circle r={4.5} fill="#fff" cx={0} cy={0}
                style={{ transform: `translate(${x(pos)}px, ${mid - v * (laneH / 2 - 5)}px)`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }} />
            </g>
          );
        })}

        <text x={L} y={ySim - 10} style={{ fill: 'var(--hue)', fontSize: 11, letterSpacing: '.12em' }}>DOT PRODUCT OF POSITION {pos} WITH EVERY POSITION · MAX {D / 2}</text>
        <line x1={L} x2={W - R} y1={ySim + simH} y2={ySim + simH} stroke="var(--line-2)" />
        {sims.map((s, p) => {
          const h = Math.max(1, (Math.max(0, s) / (D / 2)) * simH);
          return (
            <rect key={p} x={L + p * cw + 1.5} width={cw - 3} rx={2}
              y={ySim + simH - h} height={h}
              fill={p === pos ? '#fff' : 'var(--hue)'} fillOpacity={p === pos ? 1 : 0.35 + 0.6 * Math.max(0, s / (D / 2))}
              style={{ transition: 'y .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1), fill-opacity .3s' }} />
          );
        })}
        {[0, 8, 16, 24, 32, 40, 47].map((p) => (
          <text key={p} x={x(p)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--fg-3)' }}>{p}</text>
        ))}
      </svg>
    </div>
  );
}

/* ---------------- mode: rotary ---------------- */

const THETA = 15; // degrees of rotation per position
const Q0 = { len: 1.5, ang: 10 };
const K0 = { len: 1.2, ang: 40 };
const MAXPOS = 24;
const rad = (deg: number) => (deg * Math.PI) / 180;
const rot = (v: { len: number; ang: number }, pos: number) => {
  const a = rad(v.ang + pos * THETA);
  return [v.len * Math.cos(a), v.len * Math.sin(a)];
};
const ropeScore = (m: number, n: number) => dot(rot(Q0, m), rot(K0, n));

function RopeView({ m, n }: { m: number; n: number }) {
  const sm = useSpring(m, 0.16);
  const sn = useSpring(n, 0.16);
  const S = 300, c = S / 2, u = 78;
  const pt = (v: number[]) => [c + v[0] * u, c - v[1] * u];
  const q = pt(rot(Q0, sm)), k = pt(rot(K0, sn));
  const q0 = pt(rot(Q0, 0)), k0 = pt(rot(K0, 0));
  const qa = Q0.ang + sm * THETA, ka = K0.ang + sn * THETA;
  // arc between the two arrows
  const a1 = rad(ka), a2 = rad(qa);
  const steps = 24;
  let arc = '';
  for (let s = 0; s <= steps; s++) {
    const a = a1 + ((a2 - a1) * s) / steps;
    const r = 34;
    arc += `${s ? 'L' : 'M'} ${(c + r * Math.cos(a)).toFixed(1)} ${(c - r * Math.sin(a)).toFixed(1)} `;
  }
  const between = (((Q0.ang - K0.ang + (m - n) * THETA) % 360) + 540) % 360 - 180;
  return (
    <svg className="viz" viewBox={`0 0 ${S} ${S}`} style={{ maxWidth: 340, margin: '0 auto' }} role="img"
      aria-label={`Query at position ${m} and key at position ${n}, ${between} degrees apart`}>
      <defs>
        <marker id="pe-q" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--hue)" /></marker>
        <marker id="pe-k" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#f472b6" /></marker>
      </defs>
      {[0.5, 1, 1.5].map((r) => <circle key={r} cx={c} cy={c} r={r * u} fill="none" stroke="var(--line)" />)}
      <line x1={8} x2={S - 8} y1={c} y2={c} stroke="var(--line)" />
      <line x1={c} x2={c} y1={8} y2={S - 8} stroke="var(--line)" />
      {/* where each vector started, before any rotation */}
      <line x1={c} y1={c} x2={q0[0]} y2={q0[1]} stroke="var(--hue)" strokeOpacity={0.3} strokeDasharray="3 4" strokeWidth={1.5} />
      <line x1={c} y1={c} x2={k0[0]} y2={k0[1]} stroke="#f472b6" strokeOpacity={0.3} strokeDasharray="3 4" strokeWidth={1.5} />
      <path d={arc} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.5} />
      <line x1={c} y1={c} x2={k[0]} y2={k[1]} stroke="#f472b6" strokeWidth={3.5} strokeLinecap="round" markerEnd="url(#pe-k)" />
      <line x1={c} y1={c} x2={q[0]} y2={q[1]} stroke="var(--hue)" strokeWidth={3.5} strokeLinecap="round" markerEnd="url(#pe-q)" />
      <text x={c + (q[0] - c) * 1.16} y={c + (q[1] - c) * 1.16 + 4} textAnchor="middle" style={{ fill: 'var(--hue)', fontSize: 13, fontWeight: 700 }}>q@{m}</text>
      <text x={c + (k[0] - c) * 1.2} y={c + (k[1] - c) * 1.2 + 4} textAnchor="middle" style={{ fill: '#f472b6', fontSize: 13, fontWeight: 700 }}>k@{n}</text>
    </svg>
  );
}

function OffsetCurve({ m, n }: { m: number; n: number }) {
  const W = 320, H = 96, pad = 8, mid = H / 2 - 4, amp = 30;
  const xo = (o: number) => pad + ((o + MAXPOS) / (2 * MAXPOS)) * (W - 2 * pad);
  const y = (o: number) => mid - (ropeScore(o, 0) / (Q0.len * K0.len)) * amp;
  let d = '';
  for (let s = 0; s <= 192; s++) {
    const o = -MAXPOS + (s / 192) * 2 * MAXPOS;
    d += `${s ? 'L' : 'M'} ${xo(o).toFixed(1)} ${y(o).toFixed(1)} `;
  }
  const off = m - n;
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score as a function of position difference">
      <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--line-2)" />
      <line x1={xo(0)} x2={xo(0)} y1={4} y2={H - 22} stroke="var(--line)" />
      <path d={d} fill="none" stroke="var(--hue)" strokeWidth={1.8} strokeOpacity={0.85} />
      <circle r={5.5} fill="#fff" cx={0} cy={0} style={{ transform: `translate(${xo(off)}px, ${y(off)}px)`, transition: 'transform .35s cubic-bezier(.22,1,.36,1)' }} />
      <text x={pad} y={H - 6} style={{ fontSize: 10, fill: 'var(--fg-3)' }}>−{MAXPOS}</text>
      <text x={xo(0)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--fg-3)' }}>m − n = 0</text>
      <text x={W - pad} y={H - 6} textAnchor="end" style={{ fontSize: 10, fill: 'var(--fg-3)' }}>+{MAXPOS}</text>
    </svg>
  );
}

/* ---------------- the lab ---------------- */

function PositionLab({ complete }: LabProps) {
  const [mode, setMode] = useState<Mode>('none');
  // none
  const [bi, setBi] = useState(0);
  const [withPos, setWithPos] = useState(false);
  // sin
  const [pos, setPos] = useState(8);
  // rope
  const [m, setM] = useState(6);
  const [n, setN] = useState(3);
  const [shifts, setShifts] = useState(0);
  const [before, setBefore] = useState<number | null>(null);

  const orderB = ORDERS_B[bi];
  const A = useMemo(() => attendFromBites(ORDER_A, withPos), [withPos]);
  const B = useMemo(() => attendFromBites(orderB, withPos), [orderB, withPos]);
  const diff = Math.max(...A.out.map((v, k) => Math.abs(v - B.out[k])));
  const same = diff < 1e-9;

  const score = ropeScore(m, n);
  const between = (((Q0.ang - K0.ang + (m - n) * THETA) % 360) + 540) % 360 - 180;

  useEffect(() => {
    if (mode === 'none' && bi !== 0 && !withPos) complete('bag');
    if (mode === 'none' && bi !== 0 && withPos) complete('inject');
    if (mode === 'sin' && pos >= 30) complete('near');
    if (mode === 'rope' && shifts >= 3) complete('rope');
  }, [mode, bi, withPos, pos, shifts, complete]);

  const shiftBoth = (by: number) => {
    sfx.tap();
    setBefore(score);
    setM(m + by);
    setN(n + by);
    setShifts((s) => s + 1);
  };
  const canShift = (by: number) => m + by >= 0 && m + by <= MAXPOS && n + by >= 0 && n + by <= MAXPOS;

  const simAt = (k: number) => dot(TABLE[pos], TABLE[pos + k < NPOS ? pos + k : pos - k]);

  return (
    <div className="lab-grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Seg
          value={mode} onChange={setMode}
          options={[{ value: 'none', label: 'no position' }, { value: 'sin', label: 'sinusoidal' }, { value: 'rope', label: 'rotary (RoPE)' }]}
        />
        {mode === 'none' && (
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>Position signal</span>
            <Seg value={withPos ? 'on' : 'off'} onChange={(v) => setWithPos(v === 'on')} options={[{ value: 'off', label: 'off' }, { value: 'on', label: 'added' }]} />
          </div>
        )}
      </div>

      {mode === 'none' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <SentencePanel title="sentence A" order={ORDER_A} withPos={withPos} />
            <SentencePanel title="sentence B" order={orderB} withPos={withPos} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn sm" data-act="shuffle" onClick={() => { sfx.tap(); setBi((bi % (ORDERS_B.length - 1)) + 1); }}>
              shuffle sentence B
            </button>
            <div
              className="mono"
              style={{
                fontSize: 13.5, padding: '7px 12px', borderRadius: 10, transition: 'all .3s',
                border: `1px solid ${same ? 'var(--warn)' : 'var(--good)'}`, color: same ? 'var(--warn)' : 'var(--good)',
              }}
            >
              {same
                ? bi === 0 ? 'same sentence, same result' : 'different order, identical result · largest difference 0.000'
                : `results differ · largest difference ${diff.toFixed(3)}`}
            </div>
          </div>
          <div className="dim" style={{ fontSize: 13 }}>
            Each word is a 4-number vector (the squares). “bites” runs one real attention step over the sentence: dot
            products, softmax, weighted sum. {withPos ? 'Each vector has the sinusoidal encoding of its position added to it first.' : 'Nothing in the arithmetic refers to where a word sits.'}
          </div>
        </>
      )}

      {mode === 'sin' && (
        <>
          <SinView pos={pos} setPos={setPos} />
          <Slider label="Selected position" value={pos} min={0} max={NPOS - 1} onChange={setPos} />
          <div className="row">
            <Stat label="with itself" value={simAt(0).toFixed(2)} />
            <Stat label="1 position away" value={simAt(1).toFixed(2)} hot />
            <Stat label="2 away" value={simAt(2).toFixed(2)} />
            <Stat label="10 away" value={simAt(10).toFixed(2)} />
            <span className="dim" style={{ fontSize: 13, maxWidth: '30ch' }}>
              Dot product of the position {pos} vector with others. These four numbers do not change as you move.
            </span>
          </div>
        </>
      )}

      {mode === 'rope' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'center' }}>
          <div>
            <RopeView m={m} n={n} />
            <div className="dim" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 4 }}>
              Dashed: the two vectors before rotation. Each position turns a vector {THETA}°.
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Slider label={<>Query position <span className="mono">m</span></>} value={m} min={0} max={MAXPOS} onChange={(v) => { setBefore(null); setM(v); }} />
            <Slider label={<>Key position <span className="mono">n</span></>} value={n} min={0} max={MAXPOS} onChange={(v) => { setBefore(null); setN(v); }} />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" data-act="shift-down" disabled={!canShift(-1)} onClick={() => shiftBoth(-1)}>← shift both −1</button>
              <button className="btn sm" data-act="shift-up" disabled={!canShift(1)} onClick={() => shiftBoth(1)}>shift both +1 →</button>
            </div>
            <div className="row">
              <Stat label="m − n" value={(m - n > 0 ? '+' : '') + (m - n)} />
              <Stat label="angle between" value={between + '°'} />
              <Stat label="score q · k" value={score.toFixed(3)} hot />
            </div>
            <div>
              <div className="dim" style={{ fontSize: 12.5, marginBottom: 2 }}>score as a function of m − n</div>
              <OffsetCurve m={m} n={n} />
            </div>
            <div className="mono dim" style={{ fontSize: 12.5, minHeight: 18 }}>
              {before !== null && <>shifted both: score was {before.toFixed(3)}, now {score.toFixed(3)}</>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'positional-encoding',
  hook: {
    prompt: (
      <>
        You feed “dog bites man” and “man bites dog” to an attention layer, with nothing telling it where each word
        sits. Compare the new vector that “bites” ends up with in each sentence.
      </>
    ),
    options: [
      {
        text: 'They are identical. The layer cannot tell the two sentences apart',
        correct: true,
        why: 'Attention scores come from pairs of vectors and nothing else. Both sentences contain the same three vectors, so “bites” computes the same scores, the same weights and the same result. Order has to be injected separately.',
      },
      {
        text: 'They differ, because the words arrive one after another in a different order',
        why: 'A transformer does not read left to right. All tokens are processed at the same time, and no step of attention uses the order they were listed in.',
      },
      {
        text: 'They differ, because “bites” has different neighbours on each side',
        why: 'Attention has no idea of neighbours. It compares every token with every token, and a token next door is treated the same as one far away.',
      },
      {
        text: 'They differ slightly, because order is already stored in the word vectors',
        why: 'A word vector comes from a lookup table with one row per token. The row for “dog” is the same wherever “dog” appears.',
      },
    ],
    reveal: 'Next you will shuffle a sentence yourself, check the numbers, and then try three ways of fixing it.',
  },
  Lab: PositionLab,
  missions: [
    {
      id: 'bag',
      text: 'In “no position”, shuffle sentence B and compare what “bites” becomes in each sentence.',
      insight: 'Identical, to every digit. “dog bites man” and “man bites dog” are the same bag of vectors, so attention gives the same answer. With every token free to read every other and no position signal, the model cannot know who bit whom.',
    },
    {
      id: 'inject',
      text: 'Keep B shuffled and switch the position signal to “added”.',
      insight: 'Each word now has a vector for its position added to it, so “dog” at position 0 and “dog” at position 2 are different vectors. The attention weights and the result now differ between the sentences.',
    },
    {
      id: 'near',
      text: 'Switch to “sinusoidal” and move the selected position to 30 or beyond. Watch the similarity strip.',
      insight: 'The peak follows you, and its shape does not change. A position scores 8.00 with itself, 7.49 with its neighbour and 3.65 with a position 10 away, wherever you stand. Similarity depends on distance, not on absolute position, and it is highest close by. The fall is not steady: the fastest wave comes back round every 6.3 positions, so the strip has bumps, and a position 6 away scores higher than one 3 away.',
    },
    {
      id: 'rope',
      text: 'Switch to “rotary (RoPE)” and press “shift both” at least three times. Watch the score.',
      insight: 'Both arrows turn, the angle between them stays fixed, and the score does not move. Under rotation the score depends only on m − n: how far apart the two tokens are, not where they are in the text.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          Attention compares vectors in pairs. Nothing in that arithmetic says where a token sits, so a sentence and
          its shuffle give each word the same result. You saw the numbers match exactly. Position must be put into the
          vectors or into the scores.
        </p>
        <ul>
          <li>
            <strong>Absolute, added.</strong> Give every position its own vector and add it to the token's embedding
            (its vector from the lookup table). The vector can come from sine and cosine waves of different speeds, as
            in the heatmap, or from a <em>learned</em> table with one row per position.
          </li>
          <li>
            <strong>Relative, inside attention.</strong> Leave the embeddings alone and change the score.{' '}
            <em>RoPE</em> rotates each query and key by an angle proportional to its position, so the score depends
            only on the distance between the two tokens. <em>ALiBi</em> subtracts a penalty from each score that grows
            with that distance.
          </li>
        </ul>
        <p>
          Many current models use a relative scheme.
        </p>
        <p>
          One exception. GPT-style models stop each token from attending to later ones (the <em>causal mask</em>). Each
          token then sees a different set, so some order leaks in. They still add a position signal.
        </p>
      </>
    ),
    worked: (
      <>
        <p>
          The sinusoidal encoding for 4 dimensions uses two wave speeds: 1 radian per position, and 0.01 radian per
          position. Each speed gives a sine and a cosine.
        </p>
        <table>
          <thead>
            <tr><th>position</th><th>sin(p)</th><th>cos(p)</th><th>sin(0.01p)</th><th>cos(0.01p)</th></tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>0.000</td><td>1.000</td><td>0.000</td><td>1.000</td></tr>
            <tr><td>1</td><td>0.841</td><td>0.540</td><td>0.010</td><td>1.000</td></tr>
            <tr><td>2</td><td>0.909</td><td>−0.416</td><td>0.020</td><td>1.000</td></tr>
          </tbody>
        </table>
        <p>
          The lab's vector for “dog” is <code>[1.4, 0.2, 0.0, 0.4]</code>. At position 0 the model sees{' '}
          <code>[1.4, 1.2, 0.0, 1.4]</code>. At position 2 it sees <code>[2.309, −0.216, 0.020, 1.400]</code>. Same
          word, different vector, so attention can now treat the two cases differently.
        </p>
        <p>
          Dot product of position 1 with position 2: 0.841×0.909 + 0.540×(−0.416) + 0.010×0.020 + 1.000×1.000 = 1.540.
          That equals cos(1) + cos(0.01) = 0.540 + 1.000: it depends only on the distance, 1.
        </p>
        <Code>{`
def sinusoidal(pos, d):
    out = []
    for i in range(d // 2):
        w = 10000 ** (-2 * i / d)       # wave speed: fast for small i, slow for large i
        out += [sin(pos * w), cos(pos * w)]
    return out

x = embedding[token] + sinusoidal(pos, d)   # absolute, added
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The sinusoidal formula</h3>
        <M block>{String.raw`PE_{(p,\,2i)} = \sin\!\left(\frac{p}{10000^{2i/d}}\right),\qquad PE_{(p,\,2i+1)} = \cos\!\left(\frac{p}{10000^{2i/d}}\right)`}</M>
        <p>
          The fastest wave repeats every 2π ≈ 6.3 positions and the slowest approaches 2π × 10,000 ≈ 62,800 in a wide
          model (about 19,900 for the lab’s 16 dimensions), so each position
          gets a distinct pattern across the dimensions, like the digits of a clock with many hands. Because{' '}
          <M>{String.raw`\sin a \sin b + \cos a \cos b = \cos(a-b)`}</M>, the dot product of two position vectors is{' '}
          <M>{String.raw`\sum_i \cos\big(\omega_i (p - q)\big)`}</M>: a function of distance only. That is the strip
          you watched follow the slider.
        </p>
        <h3>Why rotation gives relative position</h3>
        <p>
          RoPE splits each query and key into pairs of numbers and treats each pair as a 2-D arrow. The arrow at
          position <M>{'m'}</M> is turned by <M>{String.raw`m\theta`}</M>. A dot product of two arrows is the product
          of their lengths times the cosine of the angle between them, and that angle is the original angle plus{' '}
          <M>{String.raw`(m-n)\theta`}</M>. Turning both by the same extra amount cancels. Real models use many pairs,
          each with its own <M>{String.raw`\theta`}</M>, on the same schedule of speeds as the sinusoidal waves.
        </p>
        <h3>ALiBi: a penalty and nothing else</h3>
        <p>
          ALiBi adds no position vectors at all. Before the softmax, it subtracts a fixed slope times the distance from
          each attention score: <M>{String.raw`\text{score}_{ij} - s\,\lvert i - j\rvert`}</M>, with a different slope
          for each attention head. Distant tokens start at a disadvantage and must earn their weight.
        </p>
        <h3>Learned versus computed</h3>
        <p>
          A learned table costs one row of parameters per position and stops at its last row. GPT-2, for example, has
          1,024 rows. Sinusoidal vectors and rotations can be computed for any index, but being able to compute a
          position is not the same as having been trained on it.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Learned tables have a hard edge',
      body: 'A learned absolute encoding with 1,024 rows has no vector for position 1,025. The model cannot accept a longer input at all, and extending it means adding rows and retraining them.',
    },
    {
      title: 'Computable does not mean trained',
      body: 'Sinusoidal vectors and RoPE rotations exist for any position, but past the trained length the model meets combinations of angles it never saw. Quality drops, often sharply, even though nothing crashes.',
    },
    {
      title: 'Added position shares space with meaning',
      body: 'Adding a position vector to an embedding puts two kinds of information in the same numbers. The model has to learn to pull them apart, and nothing in the method guarantees that it does so cleanly.',
    },
    {
      title: 'Relative schemes hide absolute position',
      body: 'A score that depends only on distance cannot directly say “this is the fifth token”. Tasks that need an absolute count have to recover it indirectly, for example by measuring the distance to the start of the text.',
    },
  ],
  questions: [
    {
      id: 'pos-1', kind: 'mcq', level: 1,
      prompt: 'Why does a transformer need positional information to be added at all?',
      options: [
        { text: 'Without it, a shuffled input gives every token the same result', correct: true, why: 'Nothing in query · key refers to where a token sits. Position has to be written into the vectors or the scores.' },
        { text: 'Tokens are read one at a time and the model forgets the early ones', why: 'All tokens are processed together. The problem is not forgetting, it is that order was never visible.' },
        { text: 'Embeddings of different words are too similar to tell apart', why: 'Embeddings separate words well. What they cannot do is separate the same word at two positions.' },
        { text: 'The softmax in attention would not sum to 1 otherwise', why: 'Softmax always sums to 1. Position has nothing to do with normalization.' },
      ],
    },
    {
      id: 'pos-2', kind: 'mcq', level: 1,
      prompt: 'How does RoPE put position into attention?',
      options: [
        { text: 'It rotates each query and key by an angle set by its position', correct: true, why: 'Rotating both sides makes the score depend on the difference between the two angles, which is the distance between the tokens.' },
        { text: 'It adds a sine-wave vector to each token embedding at the input', why: 'That is the sinusoidal absolute encoding. RoPE leaves the embeddings alone and acts inside attention.' },
        { text: 'It subtracts a penalty from each score that grows with distance', why: 'That is ALiBi. RoPE changes the vectors that produce the score, not the score itself.' },
        { text: 'It looks up a trained vector for each position in a table', why: 'That is a learned absolute encoding. RoPE has no table and no trained position parameters.' },
      ],
    },
    {
      id: 'pos-3', kind: 'num', level: 2,
      prompt: <>A sinusoidal encoding has 16 dimensions: 8 sines and 8 cosines. What is the dot product of any position's vector with itself?</>,
      answer: 8, tol: 0.05,
      why: <>Each sine and cosine pair contributes sin² + cos² = 1. There are 8 pairs, so the answer is <strong>8</strong> at every position. This is the tall bar in the lab's strip.</>,
      hint: 'What is sin² + cos² for one pair? How many pairs are there?',
    },
    {
      id: 'pos-4', kind: 'num', level: 2,
      prompt: <>One RoPE pair turns 30° per position. A query and a key both have length 1 and point the same way before rotation. The query is at position 4 and the key at position 2. What is their dot product?</>,
      answer: 0.5, tol: 0.02,
      why: <>They are 2 positions apart, so the angle between them is 2 × 30° = 60°. Dot product = 1 × 1 × cos(60°) = <strong>0.5</strong>.</>,
      hint: 'Find the angle between the two arrows after rotation, then take length × length × cosine.',
    },
    {
      id: 'pos-5', kind: 'mcq', level: 2,
      prompt: 'With RoPE, a query at position 7 and a key at position 3 score 1.2. The same two vectors now sit at positions 107 and 103. What is the score?',
      options: [
        { text: '1.2, because the distance between them is still 4', correct: true, why: 'Both vectors were turned by the same extra angle, so the angle between them is unchanged and so is the dot product.' },
        { text: 'Lower than 1.2, because both tokens are far from the start', why: 'Distance from the start does not enter the score. Only the difference between the two positions does.' },
        { text: 'Higher than 1.2, because larger positions mean larger rotations', why: 'The rotations are larger, but equal on both sides. They cancel in the angle between the two arrows.' },
        { text: 'It cannot be known without the rotation speed of each pair', why: 'Whatever the speed, the same shift is applied to both arrows, and the angle between them does not change.' },
      ],
      hint: 'What happens to the angle between two arrows when you turn both by the same amount?',
    },
    {
      id: 'pos-6', kind: 'mcq', level: 3,
      prompt: 'A model with a learned absolute position table was trained with 512 positions. You give it a 600-token input. What happens?',
      options: [
        { text: 'It has no vector for positions 513 to 600, so the input must be cut', correct: true, why: 'A learned table is a lookup with a fixed number of rows. There is nothing to look up past the last row.' },
        { text: 'It computes the missing vectors from the sine and cosine formula', why: 'That works only for sinusoidal encodings. A learned table has no formula, only the rows it was trained with.' },
        { text: 'It wraps around and reuses positions 1 to 88 for the extra tokens', why: 'Nothing in the method wraps. And reused rows would make token 513 look like the first token of the text.' },
        { text: 'It runs normally, since attention itself does not depend on length', why: 'Attention does not, but the position lookup happens first and fails past row 512.' },
      ],
      hint: 'A learned encoding is a table. How many rows does it have?',
    },
    {
      id: 'pos-7', kind: 'mcq', level: 3,
      prompt: 'A model lets every token attend to every other token, earlier or later (no causal mask). You remove all its positional information and give it “the dog chased the cat”. Which statement is true?',
      options: [
        { text: 'It gets the same vectors as for “the cat chased the dog”, so order is lost', correct: true, why: 'Both sentences are the same bag of tokens. Every attention layer gives each token the same result in either order.' },
        { text: 'It still works, because grammar is stored in the feed-forward layers', why: 'Feed-forward layers act on one token at a time. They cannot recover an order that attention never passed to them.' },
        { text: 'It still works, because the softmax ranks tokens by where they appear', why: 'Softmax ranks tokens by score, and the scores come from the vectors alone. Where a token appears never enters.' },
        { text: 'It fails to run, because attention requires a position for every token', why: 'The arithmetic runs fine without positions. The output just carries no information about order.' },
      ],
      hint: 'Recall the first thing you did in the lab.',
    },
    {
      id: 'pos-8', kind: 'mcq', level: 3,
      prompt: 'ALiBi subtracts slope × distance from each attention score before the softmax. With a slope of 0.5, how is a token 6 positions back affected compared with the adjacent token, 1 back?',
      options: [
        { text: 'Its score is 2.5 lower, so its weight is about 12 times smaller', correct: true, why: 'Penalties are 3.0 and 0.5, a gap of 2.5. A gap in score becomes a ratio in weight after softmax: e^2.5 ≈ 12.' },
        { text: 'Its weight is set to zero, since ALiBi masks tokens that are far away', why: 'ALiBi is a penalty, not a mask. A strong enough match can still overcome it.' },
        { text: 'Its weight is 6 times smaller, since the penalty is proportional to distance', why: 'The penalty is linear in the score, and softmax turns score gaps into ratios through the exponential, not one for one.' },
        { text: 'Its vector has a larger position offset added to it at the input', why: 'ALiBi adds nothing to the vectors. It only adjusts scores inside attention.' },
      ],
      hint: 'Compute both penalties, take the gap, and remember what softmax does with a gap.',
    },
  ],
  takeaways: [
    'Attention on its own treats its input as a bag of vectors, so order has to be injected for the model to see it reliably.',
    'Absolute encodings add a per-position vector to each embedding, either computed from sine waves or learned as a table.',
    'Relative schemes act inside attention: RoPE rotates queries and keys so the score depends on distance, ALiBi penalizes distance directly.',
    'A learned table stops at its last row, and computed schemes can still degrade beyond the length seen in training.',
  ],
};

export default lesson;
