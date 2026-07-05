import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Mixture of Experts lesson. A 16-token sequence
// (docstring + tiny Python function) flows through ONE MoE layer with 8
// experts. Click a token to see its gating: the router's full softmax over
// the experts, the top-k winners, and the renormalized weights used to
// combine their outputs. A k switch (1/2/4/8) changes how many experts run
// per token and recomputes Mixtral 8x7B's real active-parameter count. The
// load histogram at the bottom counts how many tokens each expert received —
// two experts get nothing, one hogs a third of the slots: the load-imbalance
// problem the auxiliary loss exists to fix.
//
// The logits are hand-authored to be *plausible*: routing correlates with
// token type (keywords vs identifiers vs punctuation), the same token can
// route differently in different positions (the two ":" tokens), and the
// distribution is imbalanced — as real routers are before load balancing.

interface Tok {
  text: string;
  logits: number[]; // one gating logit per expert, E0..E7
}

// Token 4 ("def") carries the exact logits used in the lesson's worked
// example — the island and the prose must agree.
const TOKENS: Tok[] = [
  { text: 'Sum',     logits: [0.2, 1.9, -0.4, 0.5, 0.1, 1.1, -0.7, -0.2] },
  { text: 'two',     logits: [-0.1, 2.2, -0.6, 0.9, 0.3, 0.6, -0.5, 0.0] },
  { text: 'numbers', logits: [0.4, 2.0, -0.2, 0.3, -0.3, 1.3, -0.8, 0.1] },
  { text: ':',       logits: [0.6, -0.5, 1.4, -0.2, 0.9, -0.4, 1.7, 0.2] },
  { text: 'def',     logits: [1.2, -0.3, 2.1, 0.4, -1.0, 1.8, 0.0, -0.6] },
  { text: 'add',     logits: [0.5, 0.2, 1.0, -0.4, -0.2, 2.3, 0.3, -0.5] },
  { text: '(',       logits: [0.8, -0.7, 1.5, 0.0, 0.6, -0.1, 1.9, -0.3] },
  { text: 'a',       logits: [0.3, 0.0, 0.7, -0.6, 0.2, 2.1, 0.5, -0.2] },
  { text: ',',       logits: [0.5, -0.4, 0.9, 0.1, 0.7, -0.3, 2.0, 0.0] },
  { text: 'b',       logits: [0.2, 0.1, 0.6, -0.5, 0.4, 2.2, 0.7, -0.4] },
  { text: ')',       logits: [0.7, -0.6, 1.3, -0.1, 0.5, -0.2, 1.8, -0.1] },
  { text: ':',       logits: [0.6, -0.5, 1.6, -0.3, 0.8, -0.4, 1.5, 0.1] },
  { text: 'return',  logits: [1.0, -0.2, 2.4, 0.2, -0.8, 1.4, 0.3, -0.5] },
  { text: 'a',       logits: [0.4, 0.3, 0.9, -0.4, 0.1, 1.9, 0.8, -0.3] },
  { text: '+',       logits: [1.8, -0.3, 0.8, 0.0, 1.2, 0.1, 1.5, -0.6] },
  { text: 'b',       logits: [0.3, 0.2, 0.7, -0.6, 0.3, 2.0, 0.9, -0.2] },
];

const N_EXPERTS = 8;

const EXPERT_COLORS = [
  '#6ea8fe', // E0 blue
  '#5eead4', // E1 teal
  '#fbbf24', // E2 amber
  '#f87171', // E3 red
  '#c084fc', // E4 purple
  '#4ade80', // E5 green
  '#f472b6', // E6 pink
  '#94a3b8', // E7 slate
];

// Mixtral 8x7B, computed in the lesson's worked example:
// 3 × 4096 × 14336 ≈ 176.2M params per expert per layer,
// × 32 layers = 5.637B per expert across the model,
// × 8 experts = 45.1B in experts; 46.7B total → ~1.6B shared
// (attention, embeddings, norms). Active(k) = shared + k × 5.637B.
const PER_EXPERT_B = (3 * 4096 * 14336 * 32) / 1e9; // ≈ 5.637
const SHARED_B = 46.7 - 8 * PER_EXPERT_B; // ≈ 1.6
const TOTAL_B = 46.7;

function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const es = xs.map((x) => Math.exp(x - m));
  const s = es.reduce((a, b) => a + b, 0);
  return es.map((e) => e / s);
}

// Top-k expert indices (by logit, descending) and the weights used to
// combine their outputs: a softmax over the k winning logits only.
function route(logits: number[], k: number): { idx: number[]; w: number[] } {
  const idx = logits
    .map((l, i) => [l, i] as [number, number])
    .sort((a, b) => b[0] - a[0])
    .slice(0, k)
    .map(([, i]) => i);
  const w = softmax(idx.map((i) => logits[i]));
  return { idx, w };
}

export default function MoeRoutingExplorer() {
  const [sel, setSel] = useState(4); // "def" — the worked-example token
  const [k, setK] = useState(2);

  const routes = useMemo(() => TOKENS.map((t) => route(t.logits, k)), [k]);
  const probs = useMemo(() => softmax(TOKENS[sel].logits), [sel]);
  const r = routes[sel];

  const load = useMemo(() => {
    const counts = new Array(N_EXPERTS).fill(0);
    for (const rt of routes) for (const i of rt.idx) counts[i] += 1;
    return counts as number[];
  }, [routes]);
  const maxLoad = Math.max(...load);
  const slots = TOKENS.length * k;
  const deadExperts = load.filter((c) => c === 0).length;

  const activeB = SHARED_B + k * PER_EXPERT_B;

  const combineStr = r.idx
    .slice(0, Math.min(k, 4))
    .map((e, j) => `${r.w[j].toFixed(2)}·E${e}(x)`)
    .join(' + ');

  return (
    <div className="font-sans text-sm">
      {/* k switch + params readout */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
            experts per token
          </span>
          {[1, 2, 4, 8].map((kk) => (
            <button
              key={kk}
              onClick={() => setK(kk)}
              className={`rounded border px-2 py-0.5 font-mono text-2xs transition-colors ${
                k === kk
                  ? 'border-accent bg-ink-700 text-fg'
                  : 'border-line bg-ink-700/60 text-fg-muted hover:border-accent hover:text-fg'
              }`}
            >
              k={kk}
            </button>
          ))}
        </div>
        <div className="font-mono text-2xs tabular text-fg-muted">
          Mixtral 8x7B · total <span className="text-fg">{TOTAL_B.toFixed(1)}B</span> · active{' '}
          <span className="text-live">{activeB.toFixed(1)}B</span>/token
          {k === 8 && <span className="text-fg-faint"> (= dense)</span>}
        </div>
      </div>

      {/* Token strip with per-token expert assignment */}
      <div className="mb-3 rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 font-mono text-2xs font-medium uppercase tracking-wider text-fg-faint">
          one sequence · one MoE layer · click a token
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-2">
          {TOKENS.map((t, i) => (
            <button
              key={i}
              onClick={() => setSel(i)}
              className={`flex flex-col items-center gap-1 rounded border px-1.5 py-1 font-mono text-xs transition-colors ${
                sel === i
                  ? 'border-accent bg-ink-700 text-fg'
                  : 'border-line bg-ink-700/50 text-fg-muted hover:border-accent/60 hover:text-fg'
              }`}
            >
              <span>{t.text}</span>
              <span className="flex gap-0.5">
                {routes[i].idx.map((e) => (
                  <span
                    key={e}
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: EXPERT_COLORS[e] }}
                    title={`expert ${e}`}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          dots = which experts this token was routed to. Keywords, identifiers, and punctuation
          cluster on different experts — and the two <span className="font-mono">:</span> tokens
          route to the same pair in a different order. Routing is per token, per layer.
        </p>
      </div>

      {/* Gating detail for the selected token */}
      <div className="mb-3 rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-medium text-fg">
            gating for “{TOKENS[sel].text}” — logit → softmax → top-{k} → renormalize
          </span>
          <span className="font-mono text-2xs tabular text-live">
            picked: {r.idx.map((e) => `E${e}`).join(', ')}
          </span>
        </div>
        <div className="space-y-1.5">
          {TOKENS[sel].logits.map((logit, e) => {
            const rank = r.idx.indexOf(e);
            const kept = rank !== -1;
            return (
              <div key={e} className={`flex items-center gap-2 ${kept ? '' : 'opacity-40'}`}>
                <span className="w-7 shrink-0 text-right font-mono text-xs" style={{ color: EXPERT_COLORS[e] }}>
                  E{e}
                </span>
                <span className="tabular w-10 shrink-0 text-right font-mono text-2xs text-fg-faint">
                  {logit.toFixed(1)}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-600">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ background: EXPERT_COLORS[e], opacity: kept ? 0.85 : 0.35 }}
                    animate={{ width: `${probs[e] * 100}%` }}
                    transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  />
                </div>
                <span className="tabular w-24 shrink-0 text-right font-mono text-xs">
                  {kept ? (
                    <>
                      <span className="text-fg-muted">{(probs[e] * 100).toFixed(1)}%</span>
                      <span className="text-fg-faint"> → </span>
                      <span className="text-fg">{r.w[rank].toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-fg-faint line-through">{(probs[e] * 100).toFixed(1)}%</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-2xs leading-snug text-fg-muted">
          y = {combineStr}
          {k > 4 && ' + …'}
          <span className="text-fg-faint">
            {' '}
            — the other {N_EXPERTS - k} expert{N_EXPERTS - k === 1 ? '' : 's'} never run for this
            token
          </span>
        </p>
      </div>

      {/* Load histogram */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-medium text-fg">expert load, whole sequence</span>
          <span className="font-mono text-2xs tabular text-fg-faint">
            {slots} routing slots ({TOKENS.length} tokens × k={k})
          </span>
        </div>
        <div className="space-y-1">
          {load.map((c, e) => (
            <div key={e} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-right font-mono text-xs" style={{ color: EXPERT_COLORS[e] }}>
                E{e}
              </span>
              <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-ink-600">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ background: EXPERT_COLORS[e], opacity: c === 0 ? 0 : 0.75 }}
                  animate={{ width: `${maxLoad === 0 ? 0 : (c / maxLoad) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                />
              </div>
              <span className="tabular w-24 shrink-0 text-right font-mono text-2xs">
                {c === 0 ? (
                  <span className="text-fg-faint">0 — dead</span>
                ) : (
                  <span className="text-fg-muted">
                    {c} ({((c / slots) * 100).toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          uniform would be {(100 / N_EXPERTS).toFixed(1)}% per expert.{' '}
          {k === 8 ? (
            <>at k=8 every expert runs for every token — that is just a dense model again.</>
          ) : deadExperts > 0 ? (
            <>
              here {deadExperts} expert{deadExperts === 1 ? ' gets' : 's get'} nothing while the
              busiest takes {((maxLoad / slots) * 100).toFixed(0)}% — this skew is why training
              adds a load-balancing loss.
            </>
          ) : (
            <>
              no dead experts at this k, but load is still skewed — the busiest takes{' '}
              {((maxLoad / slots) * 100).toFixed(0)}% of the slots.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
