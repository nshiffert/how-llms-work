import { useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Zero-shot vs Few-shot lesson. A prompt builder:
// pick how many demonstrations (0/1/3/5) to prepend to the same translation
// query — GPT-3's own Figure 2.1 task — and watch two things move together:
// the context cost (real o200k_base token counts, computed with this repo's
// gpt-tokenizer) and where that lands you on GPT-3 175B's actually measured
// zero-/one-/few-shot accuracy (Brown et al. 2020, Tables 3.2 and 3.3).
// Nothing here trains: the weights are identical at every shot count.

const INSTRUCTION = 'Translate English to French.';
const QUERY_EN = 'cheese';

// Demonstration pairs from GPT-3's Figure 2.1. `tokens` is the marginal
// o200k_base cost of appending "\nEnglish: <en>\nFrench: <fr>" — computed
// with gpt-tokenizer, not estimated.
const EXAMPLES = [
  { en: 'sea otter', fr: 'loutre de mer', tokens: 14 },
  { en: 'peppermint', fr: 'menthe poivrée', tokens: 12 },
  { en: 'plush giraffe', fr: 'girafe en peluche', tokens: 14 },
  { en: 'stained glass', fr: 'vitrail', tokens: 10 },
  { en: 'lighthouse', fr: 'phare', tokens: 8 },
];

// Full-prompt token totals (instruction + k examples + query), o200k_base.
const PROMPT_TOKENS: Record<number, number> = { 0: 11, 1: 25, 3: 51, 5: 69 };
const SHOTS = [0, 1, 3, 5];
const MAX_TOKENS = PROMPT_TOKENS[5];

// GPT-3 175B, as reported — the x-axis is the paper's regimes, not our toy
// k, because these are the published measurements (TriviaQA few-shot K=64).
type Regime = 0 | 1 | 2; // zero / one / few
const BENCHMARKS = [
  { name: 'TriviaQA', acc: [64.3, 68.0, 71.2], color: '#6ea8fe', note: 'few-shot K=64' },
  { name: 'LAMBADA', acc: [76.2, 72.5, 86.4], color: '#5eead4', note: 'one-shot drops' },
];
const REGIME_LABEL = ['zero-shot', 'one-shot', 'few-shot'];

const C = {
  demo: '#5eead4', // teal — demonstration lines
  query: '#6ea8fe', // blue — the actual query
  cost: '#fbbf24', // amber — token cost
  drop: '#f87171',
  gain: '#4ade80',
  faint: '#7d8590',
};

const INSIGHT: Record<number, string> = {
  0: 'no demonstrations — 11 tokens. The instruction alone has to select the task out of pretraining. GPT-3 175B zero-shot: TriviaQA 64.3%, LAMBADA 76.2%.',
  1: 'one demonstration pins the format for +14 tokens. TriviaQA jumps 64.3 → 68.0 (+3.7). But LAMBADA falls 76.2 → 72.5 — a single example can mislead as easily as it anchors.',
  3: 'three demonstrations, 51 tokens. The pattern is unambiguous now; each added example buys less than the one before it.',
  5: 'five demonstrations: 69 tokens vs 11 — a 6.3× cost to ask the same question. On TriviaQA, example #1 bought +3.7 points; the next 63 averaged +0.05 each.',
};

function regimeFor(k: number): Regime {
  return k === 0 ? 0 : k === 1 ? 1 : 2;
}

function PromptLine({
  text,
  tokens,
  kind,
  ghost,
}: {
  text: string;
  tokens?: number;
  kind: 'plain' | 'demo' | 'query';
  ghost?: boolean;
}) {
  const border = kind === 'demo' ? C.demo : kind === 'query' ? C.query : '#30363d';
  return (
    <motion.div
      initial={ghost ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: ghost ? 0.25 : 1, x: 0 }}
      className="flex items-center justify-between gap-2 rounded border-l-2 py-0.5 pl-2 pr-1 font-mono text-2xs"
      style={{ borderColor: border, background: ghost ? 'transparent' : 'rgba(110,168,254,0.03)' }}
    >
      <span className="whitespace-pre-wrap text-fg" style={{ opacity: ghost ? 0.7 : 1 }}>
        {text}
      </span>
      {tokens !== undefined && (
        <span className="shrink-0 rounded bg-ink-900/80 px-1 text-fg-faint">
          {ghost ? '—' : `${tokens} tok`}
        </span>
      )}
    </motion.div>
  );
}

export default function FewShotPromptBuilder() {
  const [k, setK] = useState(0);
  const regime = regimeFor(k);
  const total = PROMPT_TOKENS[k];

  return (
    <div className="font-sans text-sm">
      {/* shot selector */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-2xs uppercase tracking-wider text-fg-faint">
          demonstrations in the prompt:
        </span>
        {SHOTS.map((s) => (
          <button
            key={s}
            onClick={() => setK(s)}
            aria-pressed={k === s}
            className="rounded border px-2.5 py-0.5 font-mono text-2xs transition-colors"
            style={{
              borderColor: k === s ? C.demo : '#30363d',
              background: k === s ? 'rgba(94,234,212,0.12)' : 'transparent',
              color: k === s ? '#e6edf3' : C.faint,
            }}
          >
            {s}-shot
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── the prompt, literally ─────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-fg-faint">
            the prompt — what the model actually receives
          </p>
          <div className="flex flex-col gap-1">
            <PromptLine text={INSTRUCTION} kind="plain" />
            {EXAMPLES.map((ex, i) => (
              <PromptLine
                key={ex.en}
                text={`English: ${ex.en}\nFrench: ${ex.fr}`}
                tokens={ex.tokens}
                kind="demo"
                ghost={i >= k}
              />
            ))}
            <PromptLine text={`English: ${QUERY_EN}\nFrench:`} kind="query" />
          </div>

          {/* token cost bar */}
          <div className="mt-3 border-t border-line pt-2">
            <div className="mb-1 flex items-baseline justify-between font-mono text-2xs">
              <span className="text-fg-faint">context spent (o200k_base)</span>
              <span>
                <span style={{ color: C.cost }}>{total} tokens</span>
                <span className="text-fg-faint"> / {MAX_TOKENS} (the 5-shot prompt — not the context window)</span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-sm bg-ink-900/80">
              <motion.div
                animate={{ width: `${(total / MAX_TOKENS) * 100}%` }}
                transition={{ duration: 0.4 }}
                className="h-full rounded-sm"
                style={{ background: 'rgba(251,191,36,0.6)' }}
              />
            </div>
            <p className="mt-1 font-mono text-2xs text-fg-faint">
              {k === 0
                ? 'baseline: instruction + query = 11 tokens'
                : `${total - 11} of ${total} tokens (${Math.round(((total - 11) / total) * 100)}%) are demonstrations — paid again on every single call`}
            </p>
          </div>
        </div>

        {/* ── measured accuracy ─────────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-fg-faint">
            GPT-3 175B, measured (Brown et al. 2020) — weights identical in all
            three columns
          </p>
          <div className="grid grid-cols-3 gap-2">
            {REGIME_LABEL.map((label, r) => {
              const active = r === regime;
              return (
                <div
                  key={label}
                  className="rounded border p-1.5 transition-colors"
                  style={{
                    borderColor: active ? C.demo : '#30363d',
                    background: active ? 'rgba(94,234,212,0.07)' : 'transparent',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <p className="mb-1.5 text-center font-mono text-2xs" style={{ color: active ? '#e6edf3' : C.faint }}>
                    {label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {BENCHMARKS.map((b) => {
                      const acc = b.acc[r];
                      const prev = r > 0 ? b.acc[r - 1] : null;
                      const delta = prev !== null ? acc - prev : null;
                      return (
                        <div key={b.name}>
                          <div className="flex items-baseline justify-between font-mono text-2xs">
                            <span style={{ color: b.color }}>{acc.toFixed(1)}</span>
                            {delta !== null && (
                              <span style={{ color: delta >= 0 ? C.gain : C.drop }}>
                                {delta >= 0 ? '+' : ''}
                                {delta.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="h-2 overflow-hidden rounded-sm bg-ink-900/80">
                            <motion.div
                              animate={{ width: `${acc}%` }}
                              transition={{ duration: 0.4 }}
                              className="h-full rounded-sm"
                              style={{ background: b.color, opacity: active ? 0.75 : 0.35 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-fg-faint">
            {BENCHMARKS.map((b) => (
              <span key={b.name}>
                <span style={{ color: b.color }}>■</span> {b.name} ({b.note})
              </span>
            ))}
          </div>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 min-h-10 rounded-lg border border-line bg-ink-900/60 p-2.5 font-mono text-2xs leading-relaxed text-fg-muted">
        {INSIGHT[k]}
      </p>
    </div>
  );
}
