import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the Beam Search vs Greedy lesson. A fixed 3-step
// probability trellis over continuations of "The cat sat on the". Pick a beam
// width (1 = greedy) and step through decoding: every live hypothesis expands
// over its 4 next tokens (expand), then ONE global top-k cut by cumulative
// log-prob prunes the pool (prune). Pruned paths fade gray, the surviving
// beam stays teal, and after the final prune the chosen path turns green.
// Width 1 reproduces the greedy trap: "mat" wins step 1, but the best whole
// sequence goes through "rug".

const PROMPT = 'The cat sat on the';
const STEPS = 3;
const WIDTHS = [1, 3, 5, 10];

type Tok = { t: string; p: number; kids?: Tok[] };
const tk = (t: string, p: number, kids?: Tok[]): Tok => ({ t, p, kids });

const COMMA = () => [tk('then', 0.35), tk('the', 0.3), tk('its', 0.2), tk('a', 0.15)];
const AGAIN = () => [tk('today', 0.35), tk('anyway', 0.3), tk('later', 0.2), tk('happily', 0.15)];

// Every node's children sum to 1.0 — each is a full next-token distribution.
const TREE: Tok[] = [
  tk('mat', 0.45, [
    tk('and', 0.35, [tk('purred', 0.4), tk('slept', 0.3), tk('waited', 0.2), tk('yawned', 0.1)]),
    tk(',', 0.3, COMMA()),
    tk('quietly', 0.2, [
      tk('watching', 0.4),
      tk('purring', 0.35),
      tk('waiting', 0.15),
      tk('blinking', 0.1),
    ]),
    tk('again', 0.15, AGAIN()),
  ]),
  tk('rug', 0.4, [
    tk('and', 0.7, [tk('purred', 0.6), tk('slept', 0.25), tk('stretched', 0.1), tk('yawned', 0.05)]),
    tk('by', 0.15, [tk('the', 0.6), tk('its', 0.2), tk('a', 0.15), tk('itself', 0.05)]),
    tk(',', 0.1, COMMA()),
    tk('again', 0.05, AGAIN()),
  ]),
  tk('floor', 0.1, [
    tk('and', 0.4, [tk('slept', 0.4), tk('purred', 0.3), tk('waited', 0.2), tk('yawned', 0.1)]),
    tk(',', 0.3, COMMA()),
    tk('near', 0.2, [tk('the', 0.7), tk('its', 0.15), tk('a', 0.1), tk('us', 0.05)]),
    tk('again', 0.1, AGAIN()),
  ]),
  tk('keyboard', 0.05, [
    tk('and', 0.5, [tk('typed', 0.45), tk('slept', 0.25), tk('purred', 0.2), tk('yawned', 0.1)]),
    tk(',', 0.25, COMMA()),
    tk('typing', 0.15, [
      tk('nonsense', 0.5),
      tk('emails', 0.25),
      tk('quickly', 0.15),
      tk('code', 0.1),
    ]),
    tk('again', 0.1, AGAIN()),
  ]),
];

interface Rec {
  id: string;
  parentId: string | null;
  depth: number;
  token: string;
  tokens: string[];
  logp: number; // cumulative over the whole sequence
  childIds: string[];
}

const NODES = new Map<string, Rec>();
NODES.set('root', {
  id: 'root',
  parentId: null,
  depth: 0,
  token: PROMPT,
  tokens: [],
  logp: 0,
  childIds: TREE.map((_, i) => `${i}`),
});
(function walk(kids: Tok[], parent: Rec) {
  kids.forEach((c, i) => {
    const id = parent.id === 'root' ? `${i}` : `${parent.id}.${i}`;
    const rec: Rec = {
      id,
      parentId: parent.id,
      depth: parent.depth + 1,
      token: c.t,
      tokens: [...parent.tokens, c.t],
      logp: parent.logp + Math.log(c.p),
      childIds: (c.kids ?? []).map((_, j) => `${id}.${j}`),
    };
    NODES.set(id, rec);
    if (c.kids) walk(c.kids, rec);
  });
})(TREE, NODES.get('root')!);

interface StepTrace {
  expandedIds: string[]; // all K×V candidates this step
  keptIds: string[]; // top k overall, sorted best-first
}

function runBeam(k: number): StepTrace[] {
  const steps: StepTrace[] = [];
  let beam = ['root'];
  for (let s = 0; s < STEPS; s++) {
    const expanded = beam.flatMap((id) => NODES.get(id)!.childIds);
    const kept = [...expanded]
      .sort((a, b) => NODES.get(b)!.logp - NODES.get(a)!.logp)
      .slice(0, k);
    steps.push({ expandedIds: expanded, keptIds: kept });
    beam = kept;
  }
  return steps;
}

const RUNS: Record<number, StepTrace[]> = Object.fromEntries(WIDTHS.map((k) => [k, runBeam(k)]));

function pathTo(id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur && cur !== 'root') {
    out.unshift(cur);
    cur = NODES.get(cur)!.parentId;
  }
  return out;
}

const GREEDY_WINNER = RUNS[1][STEPS - 1].keptIds[0];
const GREEDY_PATH = new Set(pathTo(GREEDY_WINNER));
// widest run = closest to exhaustive search; its winner is the trellis's best sequence
const BEST_WINNER = RUNS[WIDTHS[WIDTHS.length - 1]][STEPS - 1].keptIds[0];
const BEST_VS_GREEDY = Math.exp(
  NODES.get(BEST_WINNER)!.logp - NODES.get(GREEDY_WINNER)!.logp,
);

const seq = (id: string) => NODES.get(id)!.tokens.join(' ').replace(/ ,/g, ',');
const fmtLog = (v: number) => v.toFixed(2);
const fmtP = (v: number) => Math.exp(v).toFixed(3);

type Status = 'candidate' | 'kept' | 'pruned' | 'winner';

const STYLE: Record<Status, { stroke: string; fill: string; text: string; opacity: number }> = {
  candidate: { stroke: '#6ea8fe', fill: 'rgba(110,168,254,0.10)', text: '#e6edf3', opacity: 1 },
  kept: { stroke: '#5eead4', fill: 'rgba(94,234,212,0.08)', text: '#e6edf3', opacity: 1 },
  pruned: { stroke: '#30363d', fill: 'rgba(125,133,144,0.05)', text: '#7d8590', opacity: 0.45 },
  winner: { stroke: '#4ade80', fill: 'rgba(74,222,128,0.14)', text: '#e6edf3', opacity: 1 },
};

export default function BeamSearchExplorer() {
  const [width, setWidth] = useState(3);
  // phase 0 = prompt only; odd = mid-expand of step (phase+1)/2; even = that step pruned
  const [phase, setPhase] = useState(0);

  const trace = RUNS[width];
  const stepsApplied = Math.floor(phase / 2);
  const expanding = phase % 2 === 1;
  const done = phase === STEPS * 2;

  const view = useMemo(() => {
    const status = new Map<string, Status>();
    // fully applied steps: kept vs pruned
    for (let s = 0; s < stepsApplied; s++) {
      const kept = new Set(trace[s].keptIds);
      for (const id of trace[s].expandedIds) status.set(id, kept.has(id) ? 'kept' : 'pruned');
    }
    if (expanding) for (const id of trace[stepsApplied].expandedIds) status.set(id, 'candidate');

    // fade kept nodes whose subtree the beam has since abandoned
    const frontier = expanding
      ? trace[stepsApplied].expandedIds
      : stepsApplied > 0
        ? trace[stepsApplied - 1].keptIds
        : ['root'];
    const alive = new Set<string>();
    for (const id of frontier) for (const a of pathTo(id)) alive.add(a);
    for (const [id, st] of status) if (st === 'kept' && !alive.has(id)) status.set(id, 'pruned');

    if (done) for (const id of pathTo(trace[STEPS - 1].keptIds[0])) status.set(id, 'winner');

    // layout: horizontal tree, leaf slots in DFS order, parents centered
    const visible = new Set(['root', ...status.keys()]);
    const leafCount = [...visible].filter(
      (id) => !NODES.get(id)!.childIds.some((c) => visible.has(c)),
    ).length;
    const rowH = leafCount > 28 ? 17 : leafCount > 14 ? 24 : 34;
    const pos = new Map<string, number>();
    let slot = 0;
    const place = (id: string): number => {
      const kids = NODES.get(id)!.childIds.filter((c) => visible.has(c));
      let y: number;
      if (!kids.length) {
        y = slot * rowH;
        slot += 1;
      } else {
        const ys = kids.map(place);
        y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      pos.set(id, y);
      return y;
    };
    place('root');
    return { status, pos, rowH, height: slot * rowH, frontier };
  }, [trace, stepsApplied, expanding, done]);

  const { status, pos, rowH } = view;
  const nodeH = Math.min(rowH - 3, 22);
  const nodeW = 108;
  const colX = (depth: number) => (depth === 0 ? 6 : 70 + (depth - 1) * 190 + 40);
  const svgH = view.height + nodeH + 16;
  const svgW = colX(STEPS) + nodeW + 8;

  // ranked candidate list for the side panel
  const ranked = useMemo(() => {
    if (expanding)
      return [...trace[stepsApplied].expandedIds].sort(
        (a, b) => NODES.get(b)!.logp - NODES.get(a)!.logp,
      );
    if (stepsApplied > 0) return trace[stepsApplied - 1].keptIds;
    return [];
  }, [trace, stepsApplied, expanding]);
  const maxRows = expanding ? Math.min(ranked.length, width + 3) : ranked.length;

  const winner = done ? trace[STEPS - 1].keptIds[0] : null;
  const ratio = winner
    ? Math.exp(NODES.get(winner)!.logp - NODES.get(GREEDY_WINNER)!.logp)
    : null;

  const statusLine = done
    ? `decoded ${STEPS} steps — best whole sequence selected`
    : expanding
      ? `step ${stepsApplied + 1}: expanded ${trace[stepsApplied].expandedIds.length} candidates (${
          view.frontier.length / 4 || 1
        } ${stepsApplied === 0 ? 'prompt' : 'beams'} × 4 tokens) — every live hypothesis scores every next token`
      : stepsApplied > 0
        ? `kept top ${trace[stepsApplied - 1].keptIds.length} of ${
            trace[stepsApplied - 1].expandedIds.length
          } by cumulative log-prob — one global cut, not a per-beam cut`
        : `prompt: "${PROMPT}" — press expand to score the first token`;

  return (
    <div className="font-sans text-sm">
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          beam width
        </span>
        {WIDTHS.map((k) => (
          <button
            key={k}
            onClick={() => setWidth(k)}
            aria-pressed={width === k}
            className={`rounded border px-2.5 py-0.5 font-mono text-xs transition-colors ${
              width === k
                ? 'border-accent bg-ink-700 text-fg'
                : 'border-line bg-ink-700/60 text-fg-muted hover:border-accent hover:text-fg'
            }`}
          >
            {k}
            {k === 1 && <span className="ml-1 text-2xs text-fg-faint">= greedy</span>}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPhase((p) => Math.min(p + 1, STEPS * 2))}
            disabled={done}
            className="rounded border border-accent/60 bg-ink-700 px-3 py-1 font-mono text-xs text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {done
              ? 'done'
              : expanding
                ? `prune to top ${width}`
                : `expand step ${stepsApplied + 1}`}
          </button>
          <button
            onClick={() => setPhase(0)}
            className="rounded border border-line bg-ink-700/60 px-2.5 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            reset
          </button>
        </div>
      </div>

      <p aria-live="polite" className="mb-2 font-mono text-2xs leading-snug text-fg-muted">
        {statusLine}
      </p>

      {/* tree */}
      <div className="overflow-x-auto rounded-lg border border-line bg-ink-900/40 p-2">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width="100%"
          style={{ minWidth: 560, height: 'auto' }}
          role="img"
          aria-label="Beam search tree: nodes are candidate tokens with cumulative log-probabilities; pruned paths are faded gray, the surviving beam is teal, the chosen path is green"
        >
          {/* edges */}
          <AnimatePresence>
            {[...status.keys()].map((id) => {
              const n = NODES.get(id)!;
              const st = status.get(id)!;
              const py = pos.get(n.parentId!)! + nodeH / 2 + 6;
              const cy = pos.get(id)! + nodeH / 2 + 6;
              const px = colX(n.depth - 1) + (n.depth === 1 ? 58 : nodeW);
              const cx = colX(n.depth);
              const mid = (px + cx) / 2;
              return (
                <motion.path
                  key={`e${id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: st === 'pruned' ? 0.25 : 0.8 }}
                  exit={{ opacity: 0 }}
                  d={`M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`}
                  fill="none"
                  stroke={STYLE[st].stroke}
                  strokeWidth={st === 'winner' ? 1.8 : 1}
                />
              );
            })}
          </AnimatePresence>

          {/* prompt node */}
          <g transform={`translate(${colX(0)}, ${pos.get('root')! + 6})`}>
            <rect
              width={58}
              height={nodeH}
              rx={5}
              fill="rgba(110,168,254,0.06)"
              stroke="#30363d"
            />
            <text
              x={29}
              y={nodeH / 2 + 3}
              textAnchor="middle"
              fontSize={9.5}
              fontFamily="monospace"
              fill="#7d8590"
            >
              …the
            </text>
          </g>

          {/* token nodes */}
          <AnimatePresence>
            {[...status.keys()].map((id) => {
              const n = NODES.get(id)!;
              const st = status.get(id)!;
              const s = STYLE[st];
              const inGreedy = done && width > 1 && GREEDY_PATH.has(id);
              return (
                <motion.g
                  key={id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: s.opacity }}
                  exit={{ opacity: 0 }}
                  transform={`translate(${colX(n.depth)}, ${pos.get(id)! + 6})`}
                >
                  <rect width={nodeW} height={nodeH} rx={5} fill={s.fill} stroke={s.stroke} />
                  {inGreedy && (
                    <rect
                      x={-2.5}
                      y={-2.5}
                      width={nodeW + 5}
                      height={nodeH + 5}
                      rx={7}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}
                  <text
                    x={7}
                    y={nodeH / 2 + 3.5}
                    fontSize={10}
                    fontFamily="monospace"
                    fill={s.text}
                  >
                    {n.token}
                  </text>
                  <text
                    x={nodeW - 7}
                    y={nodeH / 2 + 3.5}
                    textAnchor="end"
                    fontSize={9}
                    fontFamily="monospace"
                    fill={st === 'pruned' ? '#7d8590' : '#9ea7b3'}
                  >
                    {fmtLog(n.logp)}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      </div>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-fg-faint">
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm border" style={{ borderColor: '#6ea8fe', background: 'rgba(110,168,254,0.2)' }} />
          candidate
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm border" style={{ borderColor: '#5eead4', background: 'rgba(94,234,212,0.15)' }} />
          kept beam
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm border opacity-50" style={{ borderColor: '#30363d', background: 'rgba(125,133,144,0.1)' }} />
          pruned
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm border" style={{ borderColor: '#4ade80', background: 'rgba(74,222,128,0.2)' }} />
          chosen path
        </span>
        {done && width > 1 && (
          <span>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-dashed" style={{ borderColor: '#fbbf24' }} />
            greedy&apos;s path
          </span>
        )}
        <span className="ml-auto">numbers = cumulative ln p of the whole sequence</span>
      </div>

      {/* ranked hypotheses */}
      {ranked.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-ink-900/40 p-3">
          <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            {expanding
              ? `all ${ranked.length} candidates, ranked — the cut keeps the top ${width}`
              : 'current beam, ranked by cumulative log-prob'}
          </p>
          <div className="space-y-1">
            {ranked.slice(0, maxRows).map((id, i) => {
              const n = NODES.get(id)!;
              const cut = expanding && i === width;
              return (
                <div key={id}>
                  {cut && (
                    <div className="my-1.5 flex items-center gap-2">
                      <div className="h-px flex-1 bg-red-400/40" />
                      <span className="font-mono text-2xs" style={{ color: '#f87171' }}>
                        pruned below this line
                      </span>
                      <div className="h-px flex-1 bg-red-400/40" />
                    </div>
                  )}
                  <div
                    className="flex items-baseline gap-2 font-mono text-2xs"
                    style={{ opacity: expanding && i >= width ? 0.45 : 1 }}
                  >
                    <span className="w-4 shrink-0 text-right text-fg-faint">{i + 1}</span>
                    <span className="flex-1 truncate text-fg">
                      …the <span className={i === 0 && done ? 'text-[#4ade80]' : ''}>{seq(id)}</span>
                    </span>
                    <span className="tabular w-14 shrink-0 text-right text-fg-muted">
                      {fmtLog(n.logp)}
                    </span>
                    <span className="tabular w-16 shrink-0 text-right text-fg-faint">
                      p={fmtP(n.logp)}
                    </span>
                  </div>
                </div>
              );
            })}
            {expanding && ranked.length > maxRows && (
              <p className="pl-6 font-mono text-2xs text-fg-faint opacity-60">
                … {ranked.length - maxRows} more, all pruned
              </p>
            )}
          </div>
        </div>
      )}

      {/* final readout */}
      <AnimatePresence>
        {done && winner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs leading-relaxed">
              <p className="text-fg">
                width {width} decodes:{' '}
                <span style={{ color: '#4ade80' }}>
                  &ldquo;{PROMPT} {seq(winner)}&rdquo;
                </span>{' '}
                <span className="text-fg-muted">
                  — p = {fmtP(NODES.get(winner)!.logp)} (ln p = {fmtLog(NODES.get(winner)!.logp)})
                </span>
              </p>
              {width === 1 ? (
                <p className="mt-1.5 text-fg-muted">
                  Greedy locked onto <span className="text-fg">mat</span> at step 1 (p = 0.45 beats
                  rug&apos;s 0.40) and could never revisit it. The best whole sequence in this tree,{' '}
                  <span className="text-fg">&ldquo;{seq(BEST_WINNER)}&rdquo;</span> (p ={' '}
                  {fmtP(NODES.get(BEST_WINNER)!.logp)}), is {BEST_VS_GREEDY.toFixed(1)}× more
                  probable — switch the width to 3 and rerun to find it.
                </p>
              ) : (
                <p className="mt-1.5 text-fg-muted">
                  Greedy (width 1, amber dashes) would decode{' '}
                  <span className="text-fg">&ldquo;{seq(GREEDY_WINNER)}&rdquo;</span> at p ={' '}
                  {fmtP(NODES.get(GREEDY_WINNER)!.logp)} — the beam&apos;s pick is{' '}
                  {ratio!.toFixed(1)}× more probable, because it kept the locally weaker
                  &ldquo;rug&rdquo; alive long enough for its confident continuation to win.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
