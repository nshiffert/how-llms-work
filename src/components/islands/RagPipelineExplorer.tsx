import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the RAG lesson. A 5-chunk help-center corpus lives in a
// 5-dimensional toy embedding space with human-readable axes (fees, shipping,
// authenticity, account, returns). Every cosine score shown is computed live
// from these vectors — the same numbers as the lesson's worked example. The
// user steps a query through the full pipeline: embed → score → select top-k
// → assemble prompt → generate. Preset 3 is the failure mode: its meaning
// lives almost entirely in a dimension the corpus never covers (returns), so
// every score is junk — and top-k stuffs the two nearest junk chunks anyway,
// and the "model" answers with a confident fabrication.

const DIMS = ['fees', 'ship', 'auth', 'acct', 'ret'] as const;
const DIM_LABELS = ['fees', 'shipping', 'authenticity', 'account', 'returns'];
const K = 2;

type Chunk = { id: string; title: string; text: string; v: number[] };

const CHUNKS: Chunk[] = [
  {
    id: 'c1',
    title: 'Seller fees',
    text: 'Final value fee is 12.9% of the total sale price plus $0.30 per order. Premium-plan sellers pay 11.5%.',
    v: [0.91, 0.07, 0.02, 0.28, 0.05],
  },
  {
    id: 'c2',
    title: 'Shipping & tracking',
    text: 'Tracking can take 24–48 hours to update after the first carrier scan. No movement for 7 days? Open a shipment inquiry.',
    v: [0.08, 0.94, 0.05, 0.12, 0.1],
  },
  {
    id: 'c3',
    title: 'Authentication',
    text: 'Watches and handbags over $500 route through the authentication center before delivery, adding 2–4 business days.',
    v: [0.04, 0.18, 0.95, 0.06, 0.08],
  },
  {
    id: 'c4',
    title: 'Account security',
    text: 'Two-factor authentication is required for payouts. Reset 2FA from Settings → Security with a verified email.',
    v: [0.06, 0.04, 0.22, 0.93, 0.03],
  },
  {
    id: 'c5',
    title: 'Payouts',
    text: 'Payouts land 2 business days after delivery confirmation, minus the final value fee and shipping label costs.',
    v: [0.74, 0.12, 0.03, 0.55, 0.04],
  },
];

type Preset = {
  label: string;
  query: string;
  v: number[];
  grounded: boolean;
  answer: string;
  verdict: string;
};

const PRESETS: Preset[] = [
  {
    label: 'Semantic match',
    query: 'What cut does the platform take when I sell something?',
    v: [0.79, 0.18, 0.05, 0.12, 0.06],
    grounded: true,
    answer:
      'The platform takes a final value fee of 12.9% of the sale price plus $0.30 per order (11.5% on the Premium plan). It comes out of your payout after delivery confirmation.',
    verdict:
      'Grounded — every claim is verbatim from the two retrieved chunks. Note the query never says "fee": "cut" matched "final value fee" on meaning, not keywords.',
  },
  {
    label: 'Direct match',
    query: 'My buyer says tracking has not updated since Tuesday.',
    v: [0.12, 0.86, 0.1, 0.24, 0.16],
    grounded: true,
    answer:
      'Tracking can take 24–48 hours to update after the first carrier scan. If it shows no movement for 7 days, open a shipment inquiry.',
    verdict: 'Grounded — the answer is a restatement of the top chunk, which scored far above the rest.',
  },
  {
    label: 'Retrieval failure',
    query: 'Can I return an item if I just don’t like it?',
    v: [0.12, 0.22, 0.03, 0.08, 0.9],
    grounded: false,
    answer:
      'Yes — items can be returned within 30 days of delivery for a full refund, provided they are in their original condition.',
    verdict:
      'Hallucinated — no retrieved chunk mentions returns at all. The corpus has no returns policy, retrieval stuffed the two nearest junk chunks anyway, and the model filled the gap with a generic policy it made up.',
  },
];

const STAGES = ['Embed query', 'Score chunks', 'Select top-k', 'Assemble prompt', 'Generate'];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function VecBars({ v, tall }: { v: number[]; tall?: boolean }) {
  const h = tall ? 36 : 22;
  return (
    <div className="flex items-end gap-[3px]" style={{ height: h }} aria-hidden>
      {v.map((x, i) => (
        <div key={i} className="flex flex-col items-center gap-[2px]">
          <div
            className="w-[9px] rounded-sm bg-accent/70"
            style={{ height: Math.max(2, x * (h - (tall ? 12 : 0))) }}
            title={`${DIM_LABELS[i]}: ${x.toFixed(2)}`}
          />
          {tall && <span className="font-mono text-[9px] leading-none text-fg-faint">{DIMS[i]}</span>}
        </div>
      ))}
    </div>
  );
}

export default function RagPipelineExplorer() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [stage, setStage] = useState(0); // 0 = nothing run yet; 1..5 = STAGES completed up to
  const [playing, setPlaying] = useState(false);

  const preset = PRESETS[presetIdx];

  const scored = useMemo(() => {
    const s = CHUNKS.map((c) => ({ ...c, cos: cosine(preset.v, c.v) }));
    const ranked = [...s].sort((a, b) => b.cos - a.cos);
    const topIds = new Set(ranked.slice(0, K).map((c) => c.id));
    return { s, ranked, topIds, best: ranked[0].cos };
  }, [presetIdx]);

  useEffect(() => {
    if (!playing) return;
    if (stage >= STAGES.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStage((s) => s + 1), 1100);
    return () => clearTimeout(t);
  }, [playing, stage]);

  const pick = (i: number) => {
    setPresetIdx(i);
    setStage(0);
    setPlaying(false);
  };

  const topRanked = scored.ranked.slice(0, K);

  return (
    <div className="space-y-4 text-sm">
      {/* Query presets */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => pick(i)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              i === presetIdx
                ? 'border-accent bg-accent/15 text-fg'
                : 'border-line bg-ink-700 text-fg-muted hover:bg-ink-600'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => (stage >= STAGES.length ? null : setStage((s) => s + 1))}
            disabled={stage >= STAGES.length || playing}
            className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            Step
          </button>
          <button
            onClick={() => {
              if (stage >= STAGES.length) setStage(0);
              setPlaying(true);
            }}
            disabled={playing}
            className="rounded-lg border border-line bg-ink-700 px-3 py-1 text-xs text-fg-muted hover:bg-ink-600 disabled:opacity-40"
          >
            {playing ? 'Running…' : 'Run all'}
          </button>
          <button
            onClick={() => {
              setStage(0);
              setPlaying(false);
            }}
            className="rounded-lg border border-line bg-ink-700 px-3 py-1 text-xs text-fg-muted hover:bg-ink-600"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stage tracker */}
      <div className="flex flex-wrap gap-1.5" data-testid="rag-stages">
        {STAGES.map((s, i) => (
          <span
            key={s}
            className={`rounded-md border px-2 py-0.5 font-mono text-2xs transition-colors ${
              stage > i
                ? 'border-accent/50 bg-accent/15 text-fg'
                : stage === i
                  ? 'border-accent/40 text-fg-muted'
                  : 'border-line text-fg-faint'
            }`}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {/* Query + its embedding */}
      <div className="rounded-xl2 border border-line bg-ink-700/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wider text-fg-faint">query</div>
            <div className="mt-0.5 text-fg">“{preset.query}”</div>
          </div>
          <AnimatePresence>
            {stage >= 1 && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3"
              >
                <span className="font-mono text-2xs text-fg-faint">
                  embed(query) = [{preset.v.map((x) => x.toFixed(2)).join(', ')}]
                </span>
                <VecBars v={preset.v} tall />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {stage >= 1 && (
          <div className="mt-1.5 text-2xs text-fg-faint">
            Same embedding model as the index — query and chunks must live in the same space.
          </div>
        )}
      </div>

      {/* Chunk store with scores */}
      <div className="space-y-1.5">
        <div className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          vector index · 5 chunks · axes: {DIM_LABELS.join(' / ')}
        </div>
        {scored.s.map((c) => {
          const selected = stage >= 3 && scored.topIds.has(c.id);
          const dimmed = stage >= 3 && !scored.topIds.has(c.id);
          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300 ${
                selected ? 'border-accent/60 bg-accent/10' : 'border-line bg-ink-700/40'
              } ${dimmed ? 'opacity-40' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-fg">{c.title}</div>
                <div className="truncate text-xs text-fg-muted sm:whitespace-normal">{c.text}</div>
              </div>
              <VecBars v={c.v} />
              <div className="w-28 shrink-0">
                {stage >= 2 ? (
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 flex-1 rounded bg-ink-600">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded ${
                          c.cos > 0.6 ? 'bg-live/80' : 'bg-[#f87171]/70'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, c.cos * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="tabular w-10 text-right font-mono text-xs text-fg">
                      {c.cos.toFixed(3)}
                    </span>
                  </div>
                ) : (
                  <span className="block text-right font-mono text-2xs text-fg-faint">cos = ?</span>
                )}
              </div>
            </div>
          );
        })}
        {stage >= 3 && scored.best < 0.6 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-xs text-fg-muted"
          >
            <span className="font-semibold text-[#f87171]">Best score is only {scored.best.toFixed(3)}.</span>{' '}
            Retrieval has no “no good match” signal — top-{K} returns the {K} nearest chunks no matter
            how far away they are. The junk goes into the prompt regardless.
          </motion.div>
        )}
      </div>

      {/* Assembled prompt */}
      <AnimatePresence>
        {stage >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl2 border border-line bg-ink-800 px-4 py-3"
          >
            <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
              assembled prompt → the LLM sees exactly this
            </div>
            <pre className="whitespace-pre-wrap font-mono text-2xs leading-relaxed text-fg-muted">
              {`System: Answer using ONLY the context below.\n\n` +
                topRanked
                  .map((c, i) => `[${i + 1}] (${c.title}, cos ${c.cos.toFixed(3)}) ${c.text}`)
                  .join('\n') +
                `\n\nUser: ${preset.query}`}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generation */}
      <AnimatePresence>
        {stage >= 5 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl2 border px-4 py-3 ${
              preset.grounded ? 'border-live/40 bg-live/15' : 'border-[#f87171]/40 bg-[#f87171]/10'
            }`}
            data-testid="rag-answer"
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-2xs font-semibold ${
                  preset.grounded ? 'bg-live/15 text-live' : 'bg-[#f87171]/15 text-[#f87171]'
                }`}
              >
                {preset.grounded ? 'GROUNDED' : 'HALLUCINATED'}
              </span>
            </div>
            <div className="text-fg">“{preset.answer}”</div>
            <div className="mt-2 text-xs text-fg-muted">{preset.verdict}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
