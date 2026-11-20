import { useEffect, useMemo, useState } from 'react';
import type { LabProps, Lesson } from '../engine/types';
import { Callout, Code, M, Seg } from '../ui/kit';
import { sfx } from '../engine/sfx';

/* ------------------------------------------------------------------ *
 * Lab: decoding over a small hand-built tree of next-token
 * probabilities (3 steps, 3 choices per step, 27 sentences).
 * The tree is invented; everything else is computed from it: the
 * search, every product, every log, and the exhaustive best.
 * ------------------------------------------------------------------ */

type Raw = [string, number, Raw[]?];
const RAW: Raw[] = [
  ['Thanks', 0.45, [
    ['a', 0.4, [['lot', 0.4], ['bunch', 0.3], ['million', 0.3]]],
    ['so', 0.35, [['much', 0.45], ['kindly', 0.3], ['greatly', 0.25]]],
    ['very', 0.25, [['much', 0.5], ['kindly', 0.3], ['well', 0.2]]],
  ]],
  ['Thank', 0.35, [
    ['you', 0.6, [['!', 0.6], ['.', 0.3], ['kindly', 0.1]]],
    ['ya', 0.3, [['!', 0.5], ['.', 0.3], ['kindly', 0.2]]],
    ['thee', 0.1, [['!', 0.4], ['.', 0.35], ['kindly', 0.25]]],
  ]],
  ['Many', 0.2, [
    ['thanks', 0.95, [['!', 0.95], ['.', 0.03], ['indeed', 0.02]]],
    ['many', 0.03, [['thanks', 0.7], ['times', 0.2], ['more', 0.1]]],
    ['happy', 0.02, [['returns', 0.8], ['thanks', 0.15], ['days', 0.05]]],
  ]],
];

interface TNode {
  id: string;
  w: string;
  p: number;
  depth: number;
  parent: TNode | null;
  kids: TNode[];
  /** Product of the probabilities on the path from the root. */
  cum: number;
  /** Sum of natural logs along the same path. */
  logp: number;
  x: number;
  y: number;
}

const DEPTH = 3;
const COLX = [40, 170, 356, 548];
const ROW = 19;
const TOP = 34;
const ROOT: TNode = { id: 'r', w: 'start', p: 1, depth: 0, parent: null, kids: [], cum: 1, logp: 0, x: COLX[0], y: 0 };
const NODES: TNode[] = [];
let leafRow = 0;
function build(raw: Raw[], parent: TNode) {
  raw.forEach(([w, p, kids], i) => {
    const n: TNode = {
      id: parent.id + i, w, p, depth: parent.depth + 1, parent, kids: [],
      cum: parent.cum * p, logp: parent.logp + Math.log(p), x: COLX[parent.depth + 1], y: 0,
    };
    parent.kids.push(n);
    NODES.push(n);
    if (kids) build(kids, n);
    else n.y = TOP + ROW * leafRow++;
    if (kids) n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2;
  });
}
build(RAW, ROOT);
ROOT.y = (ROOT.kids[0].y + ROOT.kids[2].y) / 2;
const SVG_H = TOP + ROW * leafRow + 6;

const words = (n: TNode): string[] => (n.parent ? [...words(n.parent), n.w] : []);
const sentence = (n: TNode) => words(n).join(' ').replace(/ ([!.])/g, '$1');
const byCum = (a: TNode, b: TNode) => b.cum - a.cum;

interface StepRec { cands: TNode[]; kept: TNode[] }
/** Beam search. Width 1 is greedy decoding. */
function search(width: number): StepRec[] {
  const out: StepRec[] = [];
  let beams = [ROOT];
  for (let t = 0; t < DEPTH; t++) {
    const cands = beams.flatMap((b) => b.kids).sort(byCum);
    const kept = cands.slice(0, width);
    out.push({ cands, kept });
    beams = kept;
  }
  return out;
}
const RUNS: Record<number, StepRec[]> = { 1: search(1), 2: search(2), 3: search(3) };
const RESULT = (w: number) => RUNS[w][DEPTH - 1].kept[0];
const SCORED = (w: number) => RUNS[w].reduce((s, r) => s + r.cands.length, 0);
const LEAVES = NODES.filter((n) => n.depth === DEPTH);
const BEST = [...LEAVES].sort(byCum)[0];
const G = RESULT(1);
const B2 = RESULT(2);
const B3 = RESULT(3);
const gPath = [G.parent!.parent!, G.parent!, G];
/** Best finished sentence reachable below a node. */
const bestBelow = (n: TNode): TNode => (n.kids.length ? n.kids.map(bestBelow).sort(byCum)[0] : n);
/** The first step at which greedy's pick put the best sentence out of reach. */
const LOST_AT = gPath.findIndex((n) => bestBelow(n) !== BEST) + 1;

const pc = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
const ln = (x: number) => x.toFixed(2).replace('-', '−');

type Status = 'beam' | 'path' | 'pruned' | 'unseen';
function statuses(width: number, s: number): Map<string, Status> {
  const m = new Map<string, Status>();
  const hist = RUNS[width].slice(0, s);
  const live = s === 0 ? [ROOT] : hist[s - 1].kept;
  const onPath = new Set<string>();
  live.forEach((n) => {
    for (let a = n.parent; a; a = a.parent) onPath.add(a.id);
  });
  const scored = new Set(hist.flatMap((h) => h.cands.map((c) => c.id)));
  for (const n of NODES) {
    m.set(n.id, live.includes(n) ? 'beam' : onPath.has(n.id) ? 'path' : scored.has(n.id) ? 'pruned' : 'unseen');
  }
  return m;
}

const NAMES: Record<number, string> = { 1: 'Greedy', 2: 'Beam 2', 3: 'Beam 3' };
const PILL_W = [58, 74, 66];

function BeamLab({ complete }: LabProps) {
  const [width, setWidth] = useState(1);
  const [s, setS] = useState(0);
  const [finished, setFinished] = useState<number[]>([]);
  const [guess, setGuess] = useState<number | null>(null);

  const st = useMemo(() => statuses(width, s), [width, s]);
  const prev = useMemo(() => statuses(width, Math.max(0, s - 1)), [width, s]);
  const rec = s > 0 ? RUNS[width][s - 1] : null;
  const live = rec ? rec.kept : [ROOT];
  const done = s === DEPTH;
  const winner = done ? live[0] : null;
  const winPath = new Set<string>();
  for (let a: TNode | null = winner; a; a = a.parent) winPath.add(a.id);

  useEffect(() => {
    if (done && !finished.includes(width)) setFinished((f) => [...f, width]);
  }, [done, width, finished]);
  useEffect(() => {
    if (done && width === 1) complete('greedy');
    if (done && width === 2) complete('beam2');
    if (done && width === 3) complete('beam3');
    if (guess === LOST_AT) complete('where');
  }, [done, width, guess, complete]);

  const canAsk = finished.includes(1) && finished.some((w) => w > 1);
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const W = 760;
  const half = (n: TNode) => (n.depth === DEPTH ? 5 : PILL_W[n.depth] / 2);

  const stepLabel = done ? 'Finished' : s === 0 ? 'Step: score first tokens' : `Step: score token ${s + 1}`;
  const maxCand = rec ? rec.cands[0].cum : 1;

  return (
    <div className="lab-grid">
      <style>{`
        @keyframes bvg-prune { 0% { opacity: 1 } 35% { opacity: 1 } 100% { opacity: .26 } }
        @keyframes bvg-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes bvg-pulse { 0%,100% { stroke-opacity: .9 } 50% { stroke-opacity: .35 } }
      `}</style>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>Beam width</span>
          <Seg
            value={width}
            onChange={(v) => { setWidth(v); setS(0); }}
            options={[{ value: 1, label: '1 · greedy' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}
          />
        </div>
        <div className="row">
          <button className="btn primary" disabled={done} onClick={() => { sfx.tap(); setS((x) => Math.min(DEPTH, x + 1)); }}>
            {stepLabel}
          </button>
          <button className="btn sm" disabled={s === 0} onClick={() => { sfx.tap(); setS(0); }}>Reset</button>
        </div>
      </div>

      <div className="mono" style={{ fontSize: 14.5, minHeight: 24 }}>
        <span className="dim">Translate “Merci beaucoup” → </span>
        {s === 0 ? <span style={{ color: 'var(--hue)' }}>▍</span> : (
          <span key={`${width}-${s}`} style={{ color: '#fff', animation: `bvg-in .4s ${ease}` }}>
            {sentence(live[0])}
            {!done && <span style={{ color: 'var(--hue)' }}> ▍</span>}
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg className="viz" viewBox={`0 0 ${W} ${SVG_H}`} style={{ minWidth: 640 }} role="img" aria-label="Tree of next-token probabilities with the surviving beams highlighted">
          <text x={COLX[1]} y={14} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11.5 }}>token 1</text>
          <text x={COLX[2]} y={14} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11.5 }}>token 2</text>
          <text x={COLX[3] + 30} y={14} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontSize: 11.5 }}>token 3</text>
          <text x={W - 8} y={14} textAnchor="end" style={{ fill: 'var(--fg-3)', fontSize: 11.5 }}>sentence p</text>

          {/* edges */}
          {NODES.map((n) => {
            const par = n.parent!;
            const status = st.get(n.id)!;
            const fresh = status === 'pruned' && prev.get(n.id) !== 'pruned';
            const lit = status === 'beam' || status === 'path';
            const x1 = par.x + (par.depth === 0 ? PILL_W[0] / 2 : half(par));
            const x2 = n.x - half(n);
            const mx = (x1 + x2) / 2;
            const win = winPath.has(n.id);
            return (
              <path
                key={`${n.id}-${status}-${fresh ? s : ''}`}
                d={`M ${x1} ${par.y} C ${mx} ${par.y}, ${mx} ${n.y}, ${x2} ${n.y}`}
                fill="none"
                stroke={lit ? 'var(--hue)' : status === 'pruned' ? 'var(--bad)' : 'var(--line-2)'}
                strokeWidth={win ? 3.2 : lit ? 2 : 1}
                strokeOpacity={lit ? 0.9 : 1}
                style={{
                  opacity: status === 'pruned' ? 0.26 : status === 'unseen' ? 0.75 : 1,
                  animation: fresh ? `bvg-prune .9s ${ease} both` : win ? 'bvg-pulse 2.4s ease-in-out infinite' : undefined,
                  transition: 'stroke-width .3s',
                }}
              />
            );
          })}

          {/* root */}
          <rect x={ROOT.x - PILL_W[0] / 2} y={ROOT.y - 12} width={PILL_W[0]} height={24} rx={12} fill="var(--panel-2)" stroke="var(--hue)" />
          <text x={ROOT.x} y={ROOT.y + 4} textAnchor="middle" style={{ fontSize: 12, fill: 'var(--fg-2)' }}>start</text>

          {/* nodes */}
          {NODES.map((n) => {
            const status = st.get(n.id)!;
            const fresh = status === 'pruned' && prev.get(n.id) !== 'pruned';
            const lit = status === 'beam' || status === 'path';
            const leaf = n.depth === DEPTH;
            const win = winPath.has(n.id);
            const gStyle = {
              opacity: status === 'pruned' ? 0.26 : status === 'unseen' ? 0.62 : 1,
              animation: fresh ? `bvg-prune .9s ${ease} both` : undefined,
              transition: 'opacity .3s',
            };
            const scoredNow = status !== 'unseen';
            if (leaf) {
              return (
                <g key={`${n.id}-${fresh ? s : ''}`} style={gStyle}>
                  <circle cx={n.x} cy={n.y} r={win ? 6 : 4.5} fill={status === 'beam' ? 'var(--hue)' : 'var(--panel-2)'} stroke={lit ? 'var(--hue)' : status === 'pruned' ? 'var(--bad)' : 'var(--line-2)'} strokeWidth={1.5} />
                  <text x={n.x + 12} y={n.y + 4} style={{ fontSize: 12.5, fill: lit ? '#fff' : 'var(--fg-2)', fontWeight: win ? 700 : 500 }}>{n.w}</text>
                  <text x={n.x + 72} y={n.y + 4} style={{ fontSize: 11, fill: lit ? 'var(--hue)' : 'var(--fg-3)' }}>{n.p.toFixed(2)}</text>
                  {scoredNow && (
                    <text x={W - 8} y={n.y + 4} textAnchor="end" style={{ fontSize: 11.5, fill: win ? 'var(--hue)' : status === 'beam' ? '#fff' : 'var(--fg-3)', fontWeight: win ? 700 : 400 }}>
                      {pc(n.cum, 2)}
                    </text>
                  )}
                </g>
              );
            }
            const pw = PILL_W[n.depth];
            return (
              <g key={`${n.id}-${fresh ? s : ''}`} style={gStyle}>
                <rect
                  x={n.x - pw / 2} y={n.y - 12} width={pw} height={24} rx={8}
                  fill={status === 'beam' ? 'var(--hue)' : 'var(--panel-2)'}
                  stroke={lit ? 'var(--hue)' : status === 'pruned' ? 'var(--bad)' : 'var(--line-2)'} strokeWidth={lit ? 1.6 : 1}
                  style={{ transition: 'fill .3s' }}
                />
                <text x={n.x} y={n.y + 4.5} textAnchor="middle" style={{ fontSize: 13, fill: status === 'beam' ? '#05060a' : '#fff', fontWeight: status === 'beam' ? 700 : 500 }}>{n.w}</text>
                <text x={n.x - pw / 2 - 7} y={n.y - 6} textAnchor="end" style={{ fontSize: 11, fill: lit ? 'var(--hue)' : 'var(--fg-3)' }}>{n.p.toFixed(2)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: -6 }}>
        Hand-built toy probabilities, not taken from a real model. Number on each branch = probability of that token given
        the tokens before it. Bright = alive, red and faded = scored then pruned, grey = never scored.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {s === 0 ? 'Nothing scored yet' : `Step ${s} · ${rec!.cands.length} candidates scored · keep ${Math.min(width, rec!.cands.length)}`}
          </div>
          {s === 0 ? (
            <div className="dim" style={{ fontSize: 13.5 }}>
              Press <strong>Step</strong>. Each press asks the model for the next-token probabilities after every surviving
              beam, multiplies them in, and keeps the best {width === 1 ? 'one' : width}.
            </div>
          ) : (
            <div key={`${width}-${s}`} style={{ display: 'grid', gap: 5 }}>
              <div className="dim" style={{ display: 'grid', gridTemplateColumns: 'minmax(104px,1.3fr) 1fr 52px 46px', gap: 8, fontSize: 11.5 }}>
                <span>partial sentence</span><span /><span style={{ textAlign: 'right' }}>p</span><span style={{ textAlign: 'right' }}>ln p</span>
              </div>
              {rec!.cands.map((c, i) => {
                const kept = i < width;
                return (
                  <div
                    key={c.id}
                    className="mono"
                    style={{
                      display: 'grid', gridTemplateColumns: 'minmax(104px,1.3fr) 1fr 52px 46px', gap: 8, alignItems: 'center',
                      fontSize: 12.5, color: kept ? '#fff' : 'var(--fg-3)',
                      animation: `bvg-in .4s ${ease} both`, animationDelay: `${i * 45}ms`,
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: kept ? undefined : 'line-through', textDecorationColor: 'var(--bad)' }}>
                      {sentence(c)}
                    </span>
                    <span style={{ height: 8, borderRadius: 4, background: 'var(--panel-2)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(c.cum / maxCand) * 100}%`, background: kept ? 'var(--hue)' : 'var(--line-2)', borderRadius: 4 }} />
                    </span>
                    <span style={{ textAlign: 'right' }}>{pc(c.cum)}</span>
                    <span style={{ textAlign: 'right' }}>{ln(c.logp)}</span>
                  </div>
                );
              })}
              <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                p = product of the branch probabilities. ln p = sum of their logs. Same ranking either way.
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Finished runs</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[1, 2, 3].map((w) => {
              const has = finished.includes(w);
              const r = RESULT(w);
              return (
                <div
                  key={w}
                  style={{
                    border: `1px solid ${has && w === width && done ? 'var(--hue)' : 'var(--line)'}`, borderRadius: 12, padding: '9px 12px',
                    background: 'var(--panel-2)', opacity: has ? 1 : 0.55, transition: 'opacity .3s, border-color .3s',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{NAMES[w]}</span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--fg-3)' }}>{has ? `${SCORED(w)} candidates scored` : 'not run yet'}</span>
                  </div>
                  {has && (
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 2, animation: `bvg-in .4s ${ease}` }}>
                      <strong style={{ fontSize: 15 }}>{sentence(r)}</strong>
                      <span className="mono" style={{ fontSize: 13 }}>
                        <span style={{ color: 'var(--hue)', fontWeight: 700 }}>{pc(r.cum, 2)}</span>
                        <span className="dim"> · ln {ln(r.logp)}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {finished.length === 3 && (
              <div className="dim" style={{ fontSize: 12.5, animation: `bvg-in .4s ${ease}` }}>
                Exhaustive check over all {LEAVES.length} sentences: the most probable is “{sentence(BEST)}” at {pc(BEST.cum, 2)}.
              </div>
            )}
          </div>
        </div>
      </div>

      {canAsk && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', animation: `bvg-in .4s ${ease}` }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            Greedy wrote “{sentence(G)}”. At which step did its choice put every better sentence out of reach?
          </div>
          <div className="row">
            {gPath.map((n, i) => (
              <button
                key={n.id}
                className="btn sm"
                style={guess === i + 1 ? { borderColor: i + 1 === LOST_AT ? 'var(--good)' : 'var(--bad)' } : undefined}
                onClick={() => { sfx.tap(); setGuess(i + 1); }}
              >
                Step {i + 1}: “{n.w}” ({n.p.toFixed(2)})
              </button>
            ))}
          </div>
          {guess !== null && (
            <div key={guess} style={{ fontSize: 13.5, marginTop: 8, color: guess === LOST_AT ? 'var(--good)' : 'var(--fg-2)', animation: `bvg-in .35s ${ease}` }}>
              {guess === LOST_AT
                ? `Yes. “${gPath[0].w}” was the best first token at ${gPath[0].p.toFixed(2)}, but the best sentence that starts with it reaches only ${pc(bestBelow(gPath[0]).cum, 2)}. Every later choice was made inside that branch.`
                : `Not there. By then greedy was already inside the “${gPath[0].w}” branch, and the best sentence in that branch is ${pc(bestBelow(gPath[0]).cum, 2)}: the one greedy found. Look earlier.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ratio = (a: number, b: number) => (a / b).toFixed(2);

const lesson: Lesson = {
  id: 'beam-vs-greedy',
  hook: {
    prompt: (
      <>
        A model writes a sentence by taking the single most probable next token at every step, with no randomness. Is the
        finished sentence the most probable sentence the model could have written?
      </>
    ),
    options: [
      {
        text: 'Not necessarily. A strong first token can lead into weak continuations',
        correct: true,
        why: 'A sentence’s probability is the product of all its token probabilities. Taking the largest factor at each step does not give the largest product, because each choice changes which factors are on offer next.',
      },
      {
        text: 'Yes. The best choice at every step adds up to the best sentence overall',
        why: 'That would hold if the steps were independent. They are not: the first token decides which probabilities are on offer at the second. A 0.45 start followed by 0.40 gives 0.18. A 0.35 start followed by 0.60 gives 0.21.',
      },
      {
        text: 'Yes, provided the temperature is zero so that nothing is left to chance',
        why: 'Temperature zero is exactly this procedure. Removing randomness makes the output repeatable. It does not make it the most probable sequence.',
      },
      {
        text: 'No, because the model’s probabilities are only estimates and contain errors',
        why: 'Even with perfect probabilities the procedure can miss the best sequence. The problem is the search, which commits early and never looks back.',
      },
    ],
    reveal: 'Next you will step through a small tree of probabilities and watch the two search methods disagree.',
  },
  Lab: BeamLab,
  missions: [
    {
      id: 'greedy',
      text: 'With beam width 1 (greedy), press Step until the sentence is finished. Note its probability.',
      insight: (
        <>
          Greedy wrote “{sentence(G)}” at {pc(G.cum, 2)} ({gPath.map((n) => n.p.toFixed(2)).join(' × ')}). It scored{' '}
          {SCORED(1)} candidates and looked at only one branch of the tree. Everything it did not pick at a step was gone
          for good.
        </>
      ),
    },
    {
      id: 'beam2',
      text: 'Switch to beam width 2 and step to the end. Find a more probable sentence.',
      insight: (
        <>
          “{sentence(B2)}” has {pc(B2.cum, 2)}, which is {ratio(B2.cum, G.cum)} times greedy’s result. Its first token was
          only second-best, so greedy dropped it at step 1. Beam search kept it alive for one more step, and that was
          enough for its strong continuation to overtake.
        </>
      ),
    },
    {
      id: 'where',
      text: 'Answer the question that appears under the results: at which step did greedy lose the better sentence?',
      insight: (
        <>
          Step {LOST_AT}. “{gPath[0].w}” was the best single token, and greedy’s choice there was correct by its own rule.
          The mistake only shows up later, when the continuations under “{gPath[0].w}” turn out flat ({gPath[1].p.toFixed(2)},
          then {gPath[2].p.toFixed(2)}). A locally best choice can be globally worse.
        </>
      ),
    },
    {
      id: 'beam3',
      text: 'Set beam width 3 and step to the end. See whether the answer changes again.',
      insight: (
        <>
          It does: “{sentence(B3)}” at {pc(B3.cum, 2)}. Its first token had only {B3.parent!.parent!.p.toFixed(2)}, so
          width 2 pruned it at step 1. Width 2 beat greedy and still missed the best sentence. A wider beam finds more, at
          the price of {SCORED(3)} scored candidates against greedy’s {SCORED(1)}, and no fixed width is guaranteed to
          find the best.
        </>
      ),
    },
  ],
  explain: {
    core: (
      <>
        <p>
          The model only ever gives probabilities for the next token. The probability of a whole sentence is the{' '}
          <strong>product</strong> of the probabilities of its tokens, each given the ones before it. In practice the logs
          are added instead: a sum of logs gives the same ranking and does not shrink toward zero.
        </p>
        <p>
          Decoding is the search for a high-probability sentence. There are far too many sentences to score them all, so
          every method is a shortcut.
        </p>
        <ul>
          <li>
            <strong>Greedy</strong> takes the most probable token (the argmax) at each step and never revisits a choice. In the
            lab it committed to “{gPath[0].w}” and ended at {pc(G.cum, 2)}.
          </li>
          <li>
            <strong>Beam search</strong> keeps the k most probable partial sentences, called beams. At each step it extends
            every beam with every token, scores all of them, and keeps the best k. Width 2 reached {pc(B2.cum, 2)} and
            width 3 reached {pc(B3.cum, 2)}.
          </li>
        </ul>
        <Callout>
          Greedy is beam search with k = 1. Beam search costs about k times as much, and neither is guaranteed to find the
          most probable sentence.
        </Callout>
      </>
    ),
    worked: (
      <>
        <p>Beam width 2 on the lab’s tree, step by step. Each row is one candidate; ✓ means it was kept.</p>
        <table>
          <thead>
            <tr><th>step</th><th>candidate</th><th>product</th><th>p</th><th>ln p</th><th /></tr>
          </thead>
          <tbody>
            {RUNS[2].flatMap((r, t) =>
              r.cands.slice(0, t === 0 ? 3 : 4).map((c, i) => (
                <tr key={c.id}>
                  <td>{i === 0 ? t + 1 : ''}</td>
                  <td>{sentence(c)}</td>
                  <td>{words(c).length === 1 ? c.p.toFixed(2) : `${c.parent!.cum.toFixed(c.parent!.depth === 1 ? 2 : 3)} × ${c.p.toFixed(2)}`}</td>
                  <td>{c.cum.toFixed(3)}</td>
                  <td>{ln(c.logp)}</td>
                  <td>{i < 2 ? '✓' : 'pruned'}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <p>
          At step 2 the order flips: “{sentence(RUNS[2][1].kept[0])}” ({RUNS[2][1].kept[0].cum.toFixed(2)}) passes “
          {sentence(RUNS[2][1].kept[1])}” ({RUNS[2][1].kept[1].cum.toFixed(2)}), although its first token was behind.
          Greedy never sees this, because it dropped “{RUNS[2][1].kept[0].parent!.w}” at step 1. Steps 2 and 3 list only
          the top four candidates of the six scored.
        </p>
        <Code>{`
beams = [([], 0.0)]                       # (tokens, log-probability)
for step in range(max_len):
    cands = []
    for tokens, score in beams:
        logp = log_softmax(model(tokens)) # one model call per beam
        for tok in vocab:
            cands.append((tokens + [tok], score + logp[tok]))
    beams = top_k(cands, k, key=score)    # k = 1 is greedy
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>The math</h3>
        <p>
          By the chain rule of probability, a sequence <M>{'y_1 \\dots y_T'}</M> given an input <M>{'x'}</M> has
        </p>
        <M block>{String.raw`\log P(y \mid x) = \sum_{t=1}^{T} \log P(y_t \mid y_{<t}, x)`}</M>
        <p>
          Exact search would compare <M>{'V^T'}</M> sequences for a vocabulary of size <M>{'V'}</M>. With 50,000 tokens
          and 20 steps that is about <M>{'10^{94}'}</M>. Beam search scores <M>{'k \\cdot V'}</M> candidates per step
          instead and keeps <M>{'k'}</M>.
        </p>
        <h3>Length bias</h3>
        <p>
          Every extra token multiplies in a number below 1, so longer sequences score lower. At 0.9 per token, 5 tokens
          give 0.59 and 20 tokens give 0.12. When beams can end at different lengths, raw probability favours the short
          ones and outputs get cut off early. The usual fix is length normalisation: divide the log-probability by the
          length, or by the length raised to a power below 1, before comparing finished beams.
        </p>
        <h3>Why chat models sample instead</h3>
        <p>
          Beam search suits tasks with one right answer and a short output, such as translation or speech recognition:
          there the most probable sequence is usually the correct one. Open-ended generation is different. The most
          probable long text tends to be bland and repetitive, because generic phrases and loops score well at every step,
          while human writing regularly uses less probable words. So chat models draw from the distribution with
          temperature and top-p rather than searching for its peak.
        </p>
        <h3>More search is not always better</h3>
        <p>
          In translation systems, very wide beams have been observed to lower output quality, sometimes returning very
          short or empty translations. The model’s single most probable sequence is not always a good one, and a narrow
          beam happened to hide that. Widths around 4 to 10 were typical in practice.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'Greedy cannot undo a choice',
      body: `Once a token is emitted, every later step is conditioned on it. In the lab a first token at ${gPath[0].p.toFixed(2)} capped the sentence at ${pc(G.cum, 2)} while a start at ${B3.parent!.parent!.p.toFixed(2)} led to ${pc(B3.cum, 2)}. Greedy has no way to find that out.`,
    },
    {
      title: 'Beam search still prunes the answer sometimes',
      body: `Width 2 dropped the start of the best sentence at step 1, exactly as greedy dropped the second-best. Any beam narrower than the whole search space can do this. It only makes the miss less likely.`,
    },
    {
      title: 'The cost is k model calls per step',
      body: 'Each beam needs its own forward pass and its own cached state at every step. Width 5 costs about five times the compute of greedy, and more memory, for the same output length, which is expensive for long chat responses.',
    },
    {
      title: 'High probability is not high quality',
      body: 'On open-ended text the most probable sequences are short, generic and repetitive. Beam search finds them more reliably than greedy does, so on those tasks more search gives worse text. Raw scores also favour short outputs, because every extra token multiplies in a number below 1 (0.9 per token gives 0.59 after 5 tokens and 0.12 after 20). The fix is to divide the log-probability by the length before comparing.',
    },
  ],
  questions: [
    {
      id: 'bvg-1', kind: 'mcq', level: 1,
      prompt: 'How does beam search with width k choose what to keep at each step?',
      options: [
        { text: 'It extends every beam with every token and keeps the k best totals', correct: true, why: 'All extensions of all beams compete in one pool, ranked by cumulative probability. Two survivors can come from the same parent.' },
        { text: 'It keeps the k most probable next tokens for the single best sentence so far', why: 'That would be greedy with a shortlist. Beam search carries k different partial sentences forward, not one.' },
        { text: 'It keeps the best single extension of each of the k beams', why: 'Beams are not guaranteed a child each. If one beam’s extensions all score low, it dies and another beam supplies two survivors.' },
        { text: 'It samples k continuations at random and keeps the most probable', why: 'Beam search is deterministic. Nothing is drawn at random.' },
      ],
    },
    {
      id: 'bvg-2', kind: 'mcq', level: 1,
      prompt: 'What is greedy decoding?',
      options: [
        { text: 'Taking the most probable next token at every step', correct: true, why: 'It is the argmax at each step: beam search with width 1. Cheap and repeatable, and blind to what a choice leads to.' },
        { text: 'Scoring every possible sentence and returning the most probable', why: 'That is exhaustive search, which is impossible at real vocabulary sizes. Greedy scores one step at a time.' },
        { text: 'Sampling the next token in proportion to its probability', why: 'That is plain sampling. Greedy involves no randomness at all.' },
        { text: 'Generating the longest sentence the model will allow', why: 'Greedy refers to taking the locally best token, not to output length.' },
      ],
    },
    {
      id: 'bvg-3', kind: 'num', level: 2,
      prompt: <>A three-token sentence has token probabilities 0.5, 0.2 and 0.1. Its log-probability is negative. Enter its size without the minus sign, using natural logs. (ln 0.5 ≈ −0.69, ln 0.2 ≈ −1.61, ln 0.1 ≈ −2.30)</>,
      answer: 4.61, tol: 0.05,
      why: <>Add the logs: −0.69 − 1.61 − 2.30 = −4.60, so the size is <strong>4.60</strong>. Multiplying first gives the same thing: 0.5 × 0.2 × 0.1 = 0.01 and ln 0.01 = −4.61. The small gap is rounding.</>,
      hint: 'Add the three logs. A product of probabilities becomes a sum of logs.',
    },
    {
      id: 'bvg-4', kind: 'mcq', level: 2,
      prompt: 'First-token probabilities are A = 0.6 and B = 0.4. After A the best next token has 0.3. After B the best next token has 0.9. Which two-token sequence does greedy return, and which is more probable?',
      options: [
        { text: 'Greedy returns the A sequence at 0.18. The B sequence is more probable at 0.36', correct: true, why: 'Greedy takes A because 0.6 > 0.4, then gets 0.6 × 0.3 = 0.18. The B path is 0.4 × 0.9 = 0.36, twice as probable, and greedy never scored it.' },
        { text: 'Greedy returns the B sequence at 0.36, because it has the higher total', why: 'Greedy does not compare totals. It commits to A at step 1, before the second-step probabilities exist.' },
        { text: 'Greedy returns the A sequence at 0.18, and that is the more probable one', why: 'Check the product for B: 0.4 × 0.9 = 0.36, which is larger than 0.18.' },
        { text: 'Greedy returns the A sequence at 0.9, adding the two probabilities', why: 'Sequence probabilities multiply. A sum of probabilities can exceed 1 and means nothing here.' },
      ],
      hint: 'Greedy decides step 1 on the first-token numbers alone. Then compute both products.',
    },
    {
      id: 'bvg-5', kind: 'num', level: 2,
      prompt: 'A model has a vocabulary of 50,000 tokens. Beam search runs with width 4. Once all four beams are alive, how many candidate extensions are scored at each step?',
      answer: 200000, tol: 0,
      unit: 'candidates',
      why: <>Each of the 4 beams is extended with each of the 50,000 tokens: 4 × 50,000 = <strong>200,000</strong>. Greedy scores 50,000. The cost grows in proportion to the width.</>,
      hint: 'Every beam is extended with every token in the vocabulary.',
    },
    {
      id: 'bvg-6', kind: 'mcq', level: 3,
      prompt: 'Beam search compares two finished outputs by raw log-probability: a 4-token one at −3.2 and a 12-token one at −6.0. It picks the short one. What does length normalisation (dividing by length) change?',
      options: [
        { text: 'Per token the long output scores −0.5 against −0.8, so the long one now wins', correct: true, why: '−3.2 ÷ 4 = −0.8 and −6.0 ÷ 12 = −0.5. Every extra token adds a negative term, so raw scores punish length. Dividing by length compares the average quality per token.' },
        { text: 'Nothing: dividing both scores by a number cannot change which is larger', why: 'That is true only when both are divided by the same number. Here each score is divided by its own length.' },
        { text: 'The short output wins by more, because −0.8 is the larger number', why: '−0.5 is greater than −0.8. With log-probabilities, closer to zero is better.' },
        { text: 'Both scores become positive, so they can be compared as probabilities', why: 'Dividing a negative number by a positive length leaves it negative. The scores are still log-probabilities.' },
      ],
      hint: 'Divide each score by its own length, and remember which direction is better for a negative number.',
    },
    {
      id: 'bvg-7', kind: 'mcq', level: 3,
      prompt: 'A team replaces sampling with beam search (width 10) in a story-writing chatbot, expecting better stories. What is the most likely result?',
      options: [
        { text: 'Blander, more repetitive text: the likeliest continuations are generic', correct: true, why: 'Open-ended writing has no single right answer, and human text often uses less probable words. Searching harder for the probability peak finds safe, repeated phrasing.' },
        { text: 'More creative text, because ten beams explore ten different story lines', why: 'The beams are not ten outputs. They compete, the top one is returned, and they usually differ from each other by a few tokens.' },
        { text: 'Identical text to sampling, at ten times the cost', why: 'Sampling draws from the distribution; beam search hunts for its peak. The outputs differ systematically, not just in cost.' },
        { text: 'The single best possible story, since width 10 guarantees the most probable sequence', why: 'No fixed width guarantees the most probable sequence, and the most probable sequence is not the best story anyway.' },
      ],
      hint: 'Ask what kind of text has the highest probability at every step, and whether that is what a story needs.',
    },
    {
      id: 'bvg-8', kind: 'mcq', level: 3,
      prompt: 'You raise the beam width from 2 to 3 and the returned sequence does not change. What can you conclude?',
      options: [
        { text: 'Only that width 3 found nothing better. The best may still be pruned', correct: true, why: 'Beam search is a heuristic at every width below the full search space. Agreement between two widths is weak evidence, not proof of optimality.' },
        { text: 'That the sequence is the most probable one the model can produce', why: 'In the lab, width 2 beat greedy and still missed the best sentence. Only exhaustive search proves optimality.' },
        { text: 'That the third beam was never used, so the cost was the same as width 2', why: 'The third beam was extended and scored at every step. You paid for it whether or not it won.' },
        { text: 'That the model is deterministic, so every width returns the same output', why: 'The model’s probabilities are fixed, but different widths search different parts of the tree and often disagree.' },
      ],
      hint: 'Think about what beam search throws away at each step, at any width.',
    },
  ],
  takeaways: [
    'The probability of a sequence is the product of its token probabilities, computed in practice as a sum of logs.',
    'Greedy takes the most probable token at each step and never revisits it; beam search keeps the k best partial sequences and costs about k times as much.',
    'A locally best token can lead to a globally worse sequence, and neither method is guaranteed to find the most probable one.',
    'Beam search suits tasks with one right answer such as translation; open-ended generation samples instead, because the most probable text is bland and repetitive.',
  ],
};

export default lesson;
