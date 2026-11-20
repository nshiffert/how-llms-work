import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg, Slider, Stat, mulberry32, useRaf } from '../ui/kit';
import { sfx } from '../engine/sfx';
import { GROUPS, INDEX, WORDS, analogy, cosine, dot, layoutAt, noiseLayout, norm, type Vec } from './embeddings.data';

/* ------------------------------------------------------------------ *
 * Lab: a 30-row, 2-column embedding table drawn as a scatter plot.
 * The "training" is an interpolation from seeded random rows to a
 * hand-placed layout, and the lab says so. Everything measured on the
 * plot (cosine similarity, A − B + C, nearest word) is computed from
 * the coordinates currently displayed.
 * ------------------------------------------------------------------ */

const NOISE = noiseLayout(mulberry32(8));
const COLOR: Record<string, string> = Object.fromEntries(GROUPS.map((g) => [g.id, g.color]));

const PRESETS = [
  { id: 'king', a: 'king', b: 'man', c: 'woman' },
  { id: 'paris', a: 'Paris', b: 'France', c: 'Japan' },
  { id: 'rome', a: 'Rome', b: 'Italy', c: 'France' },
] as const;
type PresetId = (typeof PRESETS)[number]['id'];

/** Plot geometry. A narrower, taller frame is used on phones so the whole plot fits without scrolling. */
const WIDE = { W: 640, H: 520, S: 250, font: 12 };
const NARROW = { W: 430, H: 470, S: 205, font: 12.5 };
let G = WIDE; // set by the lab on every render, read by the helpers below
const sx = (v: Vec) => G.W / 2 + v[0] * G.S;
const sy = (v: Vec) => G.H / 2 - v[1] * G.S;

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 620px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
const f2 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2);
const vec = (v: Vec) => `[${f2(v[0])}, ${f2(v[1])}]`;
const mix = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const seg = (p: number, i: number) => Math.max(0, Math.min(1, p * 3 - i));

function Arrow({ from, to, color, frac = 1, width = 2.5, dash, opacity = 1 }: {
  from: Vec; to: Vec; color: string; frac?: number; width?: number; dash?: string; opacity?: number;
}) {
  if (frac <= 0) return null;
  const end = mix(from, to, frac);
  const x1 = sx(from), y1 = sy(from), x2 = sx(end), y2 = sy(end);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 3) return null;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const h = Math.min(11, len * 0.6);
  const bx = x2 - ux * h, by = y2 - uy * h;
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />
      <polygon points={`${x2},${y2} ${bx - uy * h * 0.45},${by + ux * h * 0.45} ${bx + uy * h * 0.45},${by - ux * h * 0.45}`} fill={color} />
    </g>
  );
}

function EmbeddingsLab({ complete }: LabProps) {
  G = useNarrow() ? NARROW : WIDE;
  const { W, H, S } = G;
  const CX = W / 2, CY = H / 2;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<'compare' | 'math'>('compare');
  const [sel, setSel] = useState<number[]>([]);
  const [preset, setPreset] = useState<PresetId>('king');
  const [run, setRun] = useState(0); // 0 = not run, 1 = finished
  const [running, setRunning] = useState(false);

  useRaf((_, dt) => {
    const next = Math.min(1, t + dt / 4.5);
    setT(next);
    if (next >= 1) setPlaying(false);
  }, playing);
  useRaf((_, dt) => {
    const next = Math.min(1, run + dt / 2.7);
    setRun(next);
    if (next >= 1) { setRunning(false); sfx.tap(); }
  }, running);

  const pos = useMemo(() => layoutAt(t, NOISE.start, NOISE.delay), [t]);
  const trained = t >= 0.95;

  const P = PRESETS.find((p) => p.id === preset)!;
  const ia = INDEX[P.a], ib = INDEX[P.b], ic = INDEX[P.c];
  const ana = useMemo(() => analogy(pos, ia, ib, ic), [pos, ia, ib, ic]);
  const nearest = ana.ranked[0];

  const cmp = sel.length === 2 ? cosine(pos[sel[0]], pos[sel[1]]) : null;

  useEffect(() => {
    if (t >= 1) complete('train');
    if (mode === 'compare' && cmp !== null && trained) {
      if (cmp > 0.9) complete('close');
      if (cmp < 0) complete('far');
    }
    if (mode === 'math' && preset === 'king' && run >= 1 && trained && WORDS[nearest.i].w === 'queen') complete('arith');
  }, [t, mode, cmp, trained, preset, run, nearest, complete]);

  const click = (i: number) => {
    if (mode !== 'compare') return;
    sfx.tap();
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < 2 ? [...s, i] : [s[1], i]));
  };

  const origin: Vec = [0, 0];
  const role = (i: number) => (mode === 'math' ? (i === ia ? 'A' : i === ib ? 'B' : i === ic ? 'C' : '') : '');
  const tint = Math.round(Math.min(1, t * 1.2) * 100);

  // Rows of the table to print under the plot.
  const rows = mode === 'compare'
    ? [...sel, ...[INDEX.king, INDEX.queen, INDEX.cat, INDEX.Paris].filter((i) => !sel.includes(i))].slice(0, 4)
    : [ia, ib, ic, nearest.i];

  return (
    <div className="lab-grid">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'center' }}>
        <button
          className="btn primary"
          style={{ minWidth: 132 }}
          onClick={() => {
            sfx.tap();
            if (t >= 1) { setT(0); setPlaying(true); } else setPlaying(!playing);
          }}
        >
          {t >= 1 ? '↺ Retrain' : playing ? '❚❚ Pause' : '▶ Train'}
        </button>
        <Slider
          label="Training progress (drag to scrub)"
          value={Math.round(t * 100)} min={0} max={100}
          onChange={(v) => { setPlaying(false); setT(v / 100); }}
          format={(v) => (v === 0 ? 'random rows' : v === 100 ? 'trained' : v + '%')}
        />
      </div>

      <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg)' }}>
        <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter plot of 30 word vectors">
          <defs>
            <radialGradient id="emb-bg" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="var(--hue)" stopOpacity="0.07" />
              <stop offset="100%" stopColor="var(--hue)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill="url(#emb-bg)" />
          {/* axes through the origin */}
          <line x1={0} x2={W} y1={CY} y2={CY} stroke="var(--line)" />
          <line x1={CX} x2={CX} y1={0} y2={H} stroke="var(--line)" />
          <circle cx={CX} cy={CY} r={S * 0.5} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          <circle cx={CX} cy={CY} r={S} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          <text x={W - 8} y={CY - 6} textAnchor="end" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>dimension 1 →</text>
          <text x={CX + 6} y={14} style={{ fontSize: 11, fill: 'var(--fg-3)' }}>↑ dimension 2</text>
          <circle cx={CX} cy={CY} r={3} fill="var(--fg-3)" />

          {/* compare mode: two arrows from the origin */}
          {mode === 'compare' && sel.map((i, n) => (
            <Arrow key={i} from={origin} to={pos[i]} color={n === 0 ? '#fff' : 'var(--hue)'} />
          ))}

          {/* arithmetic mode: tip-to-tail addition */}
          {mode === 'math' && run > 0 && (
            <>
              <Arrow from={origin} to={pos[ib]} color="var(--bad)" width={1.5} dash="3 4" opacity={0.5 * seg(run, 1)} />
              <Arrow from={origin} to={pos[ic]} color="var(--good)" width={1.5} dash="3 4" opacity={0.5 * seg(run, 2)} />
              <Arrow from={origin} to={pos[ia]} color="#fff" frac={seg(run, 0)} />
              <Arrow from={pos[ia]} to={ana.mid} color="var(--bad)" frac={seg(run, 1)} />
              <Arrow from={ana.mid} to={ana.res} color="var(--good)" frac={seg(run, 2)} />
              {run >= 1 && (
                <>
                  <line
                    x1={sx(ana.res)} y1={sy(ana.res)} x2={sx(pos[nearest.i])} y2={sy(pos[nearest.i])}
                    stroke="var(--hue)" strokeDasharray="3 4" strokeWidth={1.5}
                  />
                  <circle cx={sx(pos[nearest.i])} cy={sy(pos[nearest.i])} r={17} fill="none" stroke="var(--hue)" strokeWidth={2.5} style={{ animation: 'pulse 1.4s ease-in-out infinite' }} />
                  <g transform={`translate(${sx(ana.res)} ${sy(ana.res)}) rotate(45)`}>
                    <rect x={-5.5} y={-5.5} width={11} height={11} fill="var(--hue)" stroke="#05060a" strokeWidth={1.5} />
                  </g>
                </>
              )}
            </>
          )}

          {/* the words */}
          {WORDS.map((p, i) => {
            const x = sx(pos[i]), y = sy(pos[i]);
            const picked = mode === 'compare' && sel.includes(i);
            const r = role(i);
            const strong = picked || !!r || (mode === 'math' && run >= 1 && i === nearest.i);
            const c = `color-mix(in srgb, ${COLOR[p.g]} ${tint}%, #8a91ad)`;
            return (
              <g key={p.w} onClick={() => click(i)} style={{ cursor: mode === 'compare' ? 'pointer' : 'default' }}>
                <circle cx={x} cy={y} r={16} fill="transparent" />
                <circle cx={x} cy={y} r={strong ? 6.5 : 4.5} fill={c} stroke={strong ? '#fff' : 'none'} strokeWidth={2} />
                <text
                  x={x} y={y - 10} textAnchor="middle"
                  style={{ fontSize: G.font, fill: strong ? '#fff' : c, fontWeight: strong ? 700 : 500, paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3, userSelect: 'none' }}
                >
                  {p.w}{r && ` (${r})`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <div className="row" style={{ gap: 12 }}>
          {GROUPS.map((g) => (
            <span key={g.id} className="dim" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i style={{ width: 9, height: 9, borderRadius: 9, background: `color-mix(in srgb, ${g.color} ${tint}%, #8a91ad)`, display: 'inline-block' }} />
              {g.label}
            </span>
          ))}
        </div>
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -8 }}>
        Illustration: the trained layout is placed by hand in 2 dimensions, and the motion is an interpolation from seeded
        random positions, not a real training run. Real embeddings are learned and have hundreds to thousands of
        dimensions. The numbers below are computed from the coordinates on screen.
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Seg
          value={mode}
          onChange={(m) => { setMode(m); setRun(0); setRunning(false); }}
          options={[{ value: 'compare', label: 'Compare two words' }, { value: 'math', label: 'Vector arithmetic' }]}
        />
        {mode === 'math' && (
          <Seg
            value={preset}
            onChange={(p) => { setPreset(p); setRun(0); setRunning(false); }}
            options={PRESETS.map((p) => ({ value: p.id, label: `${p.a} − ${p.b} + ${p.c}` }))}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        {mode === 'compare' ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>cosine similarity</div>
            {sel.length < 2 ? (
              <div className="muted" style={{ fontSize: 14.5 }}>
                Click {sel.length === 0 ? 'two words' : 'one more word'} in the plot. Each becomes an arrow from the origin, and
                the cosine measures how closely the two arrows point the same way.
              </div>
            ) : (
              <>
                <div className="row">
                  <Stat label={`${WORDS[sel[0]].w} vs ${WORDS[sel[1]].w}`} value={f2(cmp!)} hot />
                  <Stat label="angle between" value={Math.round((Math.acos(Math.max(-1, Math.min(1, cmp!))) * 180) / Math.PI) + '°'} />
                </div>
                <div className="mono muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.7 }}>
                  a · b = {f2(dot(pos[sel[0]], pos[sel[1]]))}<br />
                  |a| = {f2(norm(pos[sel[0]]))}, |b| = {f2(norm(pos[sel[1]]))}<br />
                  cos = a · b ÷ (|a| × |b|) = <strong>{f2(cmp!)}</strong>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{P.a} − {P.b} + {P.c}</div>
            <button
              className="btn primary"
              disabled={running}
              onClick={() => { sfx.tap(); setRun(0.0001); setRunning(true); }}
            >
              {run >= 1 ? '↺ Run again' : 'Run the arithmetic'}
            </button>
            <div className="mono muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.7 }}>
              <span style={{ color: '#fff' }}>{vec(pos[ia])}</span> − <span style={{ color: 'var(--bad)' }}>{vec(pos[ib])}</span> +{' '}
              <span style={{ color: 'var(--good)' }}>{vec(pos[ic])}</span>
              <br />= <strong style={{ color: 'var(--hue)' }}>{vec(ana.res)}</strong>
            </div>
            {run >= 1 && (
              <div style={{ marginTop: 10, fontSize: 14.5 }} className="muted">
                Nearest word to the result: <strong style={{ color: 'var(--hue)' }}>{WORDS[nearest.i].w}</strong>{' '}
                <span className="mono dim">(distance {nearest.d.toFixed(2)})</span>
                <br />
                <span className="dim" style={{ fontSize: 13 }}>
                  then {WORDS[ana.ranked[1].i].w} ({ana.ranked[1].d.toFixed(2)}), {WORDS[ana.ranked[2].i].w} ({ana.ranked[2].d.toFixed(2)}).
                  The three input words are left out.
                </span>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>the table: 4 of its 30 rows</div>
          <div className="mono" style={{ fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '5px 14px', alignItems: 'center' }}>
            <span className="dim">id</span><span className="dim">token</span><span className="dim" style={{ textAlign: 'right' }}>dim 1</span><span className="dim" style={{ textAlign: 'right' }}>dim 2</span>
            {rows.map((i) => (
              <Row key={i} i={i} v={pos[i]} color={`color-mix(in srgb, ${COLOR[WORDS[i].g]} ${tint}%, #8a91ad)`} />
            ))}
          </div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 8 }}>
            A point in the plot is one row of this table. Looking a token up means reading its row. Training changes the
            numbers, never the ids.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ i, v, color }: { i: number; v: Vec; color: string }) {
  return (
    <>
      <span className="dim">{i}</span>
      <span style={{ color }}>{WORDS[i].w}</span>
      <span style={{ textAlign: 'right', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{f2(v[0])}</span>
      <span style={{ textAlign: 'right', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{f2(v[1])}</span>
    </>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'embeddings',
  hook: {
    prompt: (
      <>
        The token <code>bank</code> appears in “river bank” and in “bank account”. At the model’s first layer, the
        embedding layer, what vector does each occurrence get?
      </>
    ),
    options: [
      {
        text: 'The same vector both times: the id selects one fixed table row',
        correct: true,
        why: 'The embedding layer is a lookup. The id picks a row and that row is returned unchanged, whatever the neighbours are. Telling the two meanings apart is done by later layers, which mix in the surrounding tokens.',
      },
      {
        text: 'Two different vectors, one for each meaning of the word',
        why: 'The table has one row per token, not one per meaning. The row for “bank” has to serve every use of the word at once.',
      },
      {
        text: 'A vector computed from the letters b, a, n, k',
        why: 'Nothing is computed from spelling. The model never sees the letters. The id is used as a row number and the row is read out.',
      },
      {
        text: 'A blend of “bank” with the vectors of the words around it',
        why: 'That blending is real, but it is attention, and it happens in the layers after this one. The embedding layer looks at one token at a time.',
      },
    ],
    reveal: 'Next you will watch a small table of those rows go from random numbers to something with structure, then measure it.',
  },
  Lab: EmbeddingsLab,
  missions: [
    {
      id: 'train',
      text: 'Press Train and let it run to the end.',
      insight:
        'Every row started as random numbers, so the first picture had no structure. This animation moves the points to a layout placed by hand. In a real model nobody sorts the words: tokens that occur in similar contexts receive similar updates, so their rows drift the same way and end up near each other.',
    },
    {
      id: 'close',
      text: 'With training finished, click two words whose cosine similarity is above 0.9.',
      insight:
        'Cosine similarity is the dot product divided by both lengths. It is 1 when two vectors point the same way, whatever their lengths. Words from one group point in nearly the same direction: cat and dog score 0.97.',
    },
    {
      id: 'far',
      text: 'Now find two words whose cosine similarity is below 0.',
      insight:
        'A negative cosine means the two arrows are more than 90° apart: cat against Paris is −1.00 to two decimals. That extreme is an artefact of having only 2 dimensions, where four groups can only spread out by pointing in opposite directions. In a real table, with hundreds of dimensions, unrelated words sit near 0. The part that carries over: direction is how the table stores “what kind of thing is this”, and nobody labelled the directions. They come out of training.',
    },
    {
      id: 'arith',
      text: 'Switch to Vector arithmetic, keep training at the end, and run king − man + woman.',
      insight:
        'king − man leaves an offset of [0.08, 0.34]: the “royal” direction. Adding it to woman lands on queen. A relation between words has become a direction you can add and subtract. Drag training back to 0 and run it again: on random rows the same arithmetic lands on an unrelated word.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          An <strong>embedding table</strong> is a grid of numbers with one row per token in the vocabulary. Each row is
          a vector as wide as the model. For GPT-2 small that is 50,257 rows × 768 numbers.
        </p>
        <ul>
          <li>
            <strong>Lookup is row selection.</strong> Token id 464 means “read row 464”. The same id always returns the
            same row.
          </li>
          <li>
            <strong>Rows start random.</strong> Before training, the row for “king” is noise, no closer to “queen” than
            to “swim”.
          </li>
          <li>
            <strong>Gradients move the rows.</strong> Each training step nudges the rows that were used, in the direction
            that would have made the prediction better. Tokens used in similar contexts get similar nudges and end up
            close together.
          </li>
        </ul>
        <Callout>
          After training, meaning is geometry. Similar tokens point in similar directions, and some relations, such as
          country to capital, become roughly constant offsets.
        </Callout>
        <p>
          The lab drew 30 rows of width 2. At this layer a token gets one vector regardless of context. Context arrives
          later, through attention. Many models reuse this table at the output, scoring each candidate token by a dot
          product with its row (<em>weight tying</em>).
        </p>
      </>
    ),
    worked: (
      <>
        <p>Take two rows from the lab’s trained layout: king = <code>[0.38, 0.76]</code> and queen = <code>[0.62, 0.70]</code>.</p>
        <table>
          <thead>
            <tr><th>step</th><th>calculation</th><th>result</th></tr>
          </thead>
          <tbody>
            <tr><td>dot product</td><td>0.38 × 0.62 + 0.76 × 0.70</td><td>0.7676</td></tr>
            <tr><td>length of king</td><td>√(0.38² + 0.76²)</td><td>0.850</td></tr>
            <tr><td>length of queen</td><td>√(0.62² + 0.70²)</td><td>0.935</td></tr>
            <tr><td>cosine</td><td>0.7676 ÷ (0.850 × 0.935)</td><td>0.97</td></tr>
          </tbody>
        </table>
        <p>
          Against eat = <code>[−0.80, −0.52]</code> the dot product is 0.38 × −0.80 + 0.76 × −0.52 = −0.6992 and the
          cosine is −0.86: nearly opposite directions.
        </p>
        <p>
          Now the arithmetic, one coordinate at a time. king − man + woman = [0.38 − 0.30 + 0.54, 0.76 − 0.42 + 0.36] ={' '}
          <code>[0.62, 0.70]</code>, which is the row for queen. It lands exactly because this layout was placed by hand.
          In a learned table it lands near queen, and queen is the closest row once king, man and woman are left out.
        </p>
        <Code>{`
E = randn(vocab_size, width) * 0.02   # the whole table: random numbers
x = E[token_ids]                      # lookup: pick rows, no arithmetic
# ... the transformer layers turn x into a final vector h ...
logits = h @ E.T                      # weight tying: the same table scores the output
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Lookup as a matrix product</h3>
        <p>
          Write the token as a one-hot vector: all zeros except a 1 at its id. Multiplying it by the table picks out one
          row: <M>{String.raw`x = \text{onehot}(i)^\top E = E_i`}</M>. This is why the table is an ordinary weight
          matrix and trains by ordinary gradient descent. Only the rows of tokens present in a batch receive a gradient
          through this path.
        </p>
        <h3>Why similar words end up close</h3>
        <p>
          The model is trained to predict the next token. If “cat” and “dog” are followed by the same kinds of words,
          the same change to either row lowers the loss, so both rows are pushed the same way. Similarity of vectors is
          similarity of contexts. That includes opposites: “hot” and “cold” appear in the same sentences and end up near
          each other.
        </p>
        <h3>Weight tying</h3>
        <p>
          At the output, the model needs one score per vocabulary entry. Many models, GPT-2 among them, reuse the
          embedding table for this: the score of token <M>{'i'}</M> is the dot product of the final vector with row{' '}
          <M>{'E_i'}</M>. One table then serves as both “what this token means on the way in” and “what the model aims
          at on the way out”. It saves vocabulary × width parameters, 38.6 million for GPT-2 small.
        </p>
        <h3>Static and contextual vectors</h3>
        <p>
          Earlier systems such as word2vec stopped here: one fixed vector per word was the whole product, and the
          king − man + woman result was made famous by them. In a transformer the table is only the input. Each layer
          rewrites every token’s vector using its neighbours, so by the last layer the two “bank”s have different vectors.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'One row has to cover every meaning',
      body: '“bank” gets the same vector beside “river” and beside “account”. The row is a compromise between all the uses seen in training. Nothing at this layer can separate them. That work falls on attention in the layers above.',
    },
    {
      title: 'Vector arithmetic is a tendency, not a rule',
      body: 'Offsets line up for frequent, regular relations such as capitals and gender pairs, and fail for many others. The published results also leave out the input words when searching: otherwise the nearest vector to king − man + woman is usually king.',
    },
    {
      title: 'Near does not mean same',
      body: 'Closeness reflects shared contexts, not shared meaning. Opposites like “hot” and “cold” sit close together, and so do words that are merely used the same way. The table also absorbs whatever associations the training text contains, including stereotypes.',
    },
    {
      title: 'Two-dimensional pictures mislead',
      body: 'A real table has hundreds or thousands of dimensions. Flattening it to 2 for a plot has to distort distances, so clusters and gaps in such pictures can be artefacts. Measure similarity in the full space, not by eye.',
    },
  ],
  questions: [
    {
      id: 'emb-1', kind: 'mcq', level: 1,
      prompt: 'What is an embedding table?',
      options: [
        { text: 'A grid of learned numbers with one row per vocabulary entry', correct: true, why: 'Vocabulary × width numbers, nothing else. Every row is the vector for one token and is adjusted during training.' },
        { text: 'A dictionary that maps each token to its definition and related words', why: 'There are no definitions anywhere. Relations between words exist only as geometry among the rows.' },
        { text: 'A list of hand-chosen features, such as “is an animal” or “is plural”', why: 'Nobody chooses the columns. They start random and whatever structure they have comes from training.' },
        { text: 'A function that computes a vector from the letters of each token', why: 'Nothing is computed from spelling. The token id is just a row number.' },
      ],
    },
    {
      id: 'emb-2', kind: 'mcq', level: 1,
      prompt: 'What does the embedding layer do with a token id?',
      options: [
        { text: 'Uses it as a row number and returns that row unchanged', correct: true, why: 'Lookup is selection. The same id always gives the same vector, with no dependence on the other tokens.' },
        { text: 'Multiplies it by a learned weight to get a vector', why: 'The id is an index, not a quantity. Id 2,000 is not “twice” id 1,000.' },
        { text: 'Compares it with every row and returns the most similar one', why: 'No search happens on the way in. The id names its row directly.' },
        { text: 'Averages the rows of that token and its neighbours', why: 'Mixing neighbouring tokens is attention, which comes after this layer.' },
      ],
    },
    {
      id: 'emb-3', kind: 'num', level: 2,
      prompt: <>Two word vectors are <code>a = [3, 4]</code> and <code>b = [4, 3]</code>. What is their cosine similarity?</>,
      answer: 0.96, tol: 0.01,
      why: <>Dot product: 3×4 + 4×3 = 24. Lengths: √(9+16) = 5 and √(16+9) = 5. Cosine = 24 ÷ (5 × 5) = <strong>0.96</strong>.</>,
      hint: 'Dot product divided by the product of the two lengths.',
    },
    {
      id: 'emb-4', kind: 'num', level: 2,
      prompt: <>In a 2-dimensional table, king = <code>[0.4, 0.8]</code>, man = <code>[0.3, 0.4]</code> and woman = <code>[0.5, 0.3]</code>. What is the <em>second</em> coordinate of king − man + woman?</>,
      answer: 0.7, tol: 0.01,
      why: <>Work one coordinate at a time. Second coordinate: 0.8 − 0.4 + 0.3 = <strong>0.7</strong>. The first is 0.4 − 0.3 + 0.5 = 0.6, so the result is [0.6, 0.7].</>,
      hint: 'Vectors add and subtract coordinate by coordinate.',
    },
    {
      id: 'emb-5', kind: 'mcq', level: 2,
      prompt: 'A model has just been initialized and not trained at all. What is true of its rows for “cat” and “dog”?',
      options: [
        { text: 'They are unrelated random vectors, like any other two rows', correct: true, why: 'Rows start as random numbers. Any similarity between cat and dog is put there by training, step by step.' },
        { text: 'They are already close, because both words are animals', why: 'The model has no knowledge of animals before training. All structure in the table is learned.' },
        { text: 'They are identical, because every row starts at zero', why: 'Rows start random, not equal. Identical rows would make the two tokens indistinguishable.' },
        { text: 'They are close, because the two tokens have nearby ids', why: 'Ids are arbitrary positions in a list. Neighbouring ids carry no relation, before or after training.' },
      ],
      hint: 'Where did the lab’s points start?',
    },
    {
      id: 'emb-6', kind: 'mcq', level: 2,
      prompt: 'Two vectors have a cosine similarity of 0.98, but one is three times longer than the other. What does the 0.98 tell you?',
      options: [
        { text: 'They point in almost the same direction', correct: true, why: 'Dividing by both lengths removes them from the measure. Only the angle is left, and 0.98 is an angle of about 11°.' },
        { text: 'They are almost the same vector, entry for entry', why: 'One is three times longer, so the entries differ by about a factor of three. Cosine does not see that.' },
        { text: 'Their dot product is 0.98', why: 'The dot product still contains both lengths. Cosine is the dot product after dividing them out.' },
        { text: 'They are 98% likely to be synonyms', why: 'Cosine is a geometric quantity, not a probability, and closeness reflects shared contexts, not sameness of meaning.' },
      ],
      hint: 'Look at what the formula divides by.',
    },
    {
      id: 'emb-7', kind: 'mcq', level: 3,
      prompt: 'A model uses weight tying. How does it score candidate next tokens at the output?',
      options: [
        { text: 'It takes the dot product of its final vector with every table row', correct: true, why: 'The same table is reused: one score per row. Tokens whose rows align with the final vector get high scores.' },
        { text: 'It looks up the row of the most recent input token and returns it', why: 'That is the input lookup. The output needs a score for every vocabulary entry, based on the final vector.' },
        { text: 'It uses a second, separately trained table of the same shape', why: 'That is the untied design. Tying means there is one table doing both jobs.' },
        { text: 'It copies the input table and then freezes the copy', why: 'Tying shares the very same parameters. A gradient at the output moves the rows used at the input.' },
      ],
      hint: 'Tying means one set of numbers is used in two places. What operation compares a vector with every row?',
    },
    {
      id: 'emb-8', kind: 'mcq', level: 3,
      prompt: 'A model that does not reuse its embedding table at the output, and has nothing that shrinks unused weights, is trained on text in which one vocabulary token never appears. What does that token’s row look like afterwards?',
      options: [
        { text: 'Essentially its random starting values, since it was never updated', correct: true, why: 'Lookup sends gradient only to the rows that were read. A row that is never read is never moved by this path.' },
        { text: 'The average of all other rows, since training smooths the table', why: 'Nothing spreads information between rows. Each row moves only on its own gradients.' },
        { text: 'All zeros, because parameters that are never used fade to nothing', why: 'Nothing in this model shrinks unused weights. No gradient reaches the row, so it keeps its random start.' },
        { text: 'Close to the rows of similar words, which pull it toward them', why: 'Similar words end up close because they get similar updates. A token with no updates is not pulled anywhere.' },
      ],
      hint: 'Which rows receive a gradient on a given training step?',
    },
    {
      id: 'emb-9', kind: 'mcq', level: 3,
      prompt: 'In trained embedding tables, “hot” and “cold” often have a high cosine similarity. Why?',
      options: [
        { text: 'They occur in the same contexts and so got similar updates', correct: true, why: 'Rows are shaped by what surrounds a token. Opposites are used in the same sentences about the same things, so their updates are alike.' },
        { text: 'The table failed to learn that the two words are opposites', why: 'This is the expected outcome, not a failure. The table records patterns of use, and the two words are used alike.' },
        { text: 'Cosine similarity cannot be negative, so opposites look similar', why: 'Cosine ranges from −1 to 1. The lab showed negative values, and in real tables unrelated words sit near 0.' },
        { text: 'Their spellings are both short, so their vectors are similar', why: 'Spelling plays no part. Rows are tied to ids and shaped only by training.' },
      ],
      hint: 'What decides which way a row is nudged during training?',
    },
  ],
  takeaways: [
    'An embedding table is vocabulary × width learned numbers, and looking up a token means reading its row.',
    'Rows start random, and gradients move tokens used in similar contexts toward each other.',
    'After training, direction carries meaning: cosine similarity compares directions, and some relations become offsets you can add.',
    'The embedding gives one vector per token regardless of context, and many models reuse the same table to score the output.',
  ],
};

export default lesson;
