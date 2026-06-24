import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Interactive byte-pair-encoding trainer. Type a corpus, then step through the
// algorithm one merge at a time: it counts every adjacent symbol pair, merges
// the most frequent one into a new token, and repeats. The whole merge history
// is precomputed from the corpus so stepping forward/back is instant and
// deterministic.

const END = '</w>'; // end-of-word marker — why "est" learns to attach a boundary
const DEFAULT_CORPUS =
  'low low low low low lowest lowest newer newer newer newer newer newer wider wider wider new new';
const MAX_MERGES = 30;
const MAX_CHARS = 400;

interface Word {
  sym: string[];
  count: number;
}
interface PairCount {
  a: string;
  b: string;
  count: number;
}
interface State {
  words: Word[];
  vocab: string[];
  merges: { a: string; b: string; tok: string }[];
}
interface Candidate {
  a: string;
  b: string;
  tok: string;
  count: number;
  pairs: PairCount[]; // ranked pair counts at this state (for the freq panel)
}

const SEP = '';
const baseLen = (s: string) => (s.endsWith(END) ? s.length - END.length : s.length);

function parseCorpus(text: string): Word[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().split(/\s+/)) {
    const clean = w.replace(/[^a-z0-9]/g, '');
    if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  return [...counts].map(([w, c]) => ({ sym: [...w, END], count: c }));
}

function pairCounts(words: Word[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of words)
    for (let i = 0; i < w.sym.length - 1; i++) {
      const k = w.sym[i] + SEP + w.sym[i + 1];
      m.set(k, (m.get(k) ?? 0) + w.count);
    }
  return m;
}

function rankPairs(m: Map<string, number>): PairCount[] {
  return [...m]
    .map(([k, count]) => {
      const [a, b] = k.split(SEP);
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count);
}

function mergeWords(words: Word[], a: string, b: string): Word[] {
  return words.map((w) => {
    const out: string[] = [];
    for (let i = 0; i < w.sym.length; ) {
      if (i < w.sym.length - 1 && w.sym[i] === a && w.sym[i + 1] === b) {
        out.push(a + b);
        i += 2;
      } else {
        out.push(w.sym[i]);
        i += 1;
      }
    }
    return { sym: out, count: w.count };
  });
}

function train(text: string) {
  const initial = parseCorpus(text.slice(0, MAX_CHARS));
  const base = new Set<string>();
  for (const w of initial) for (const s of w.sym) base.add(s);

  const states: State[] = [
    { words: initial, vocab: [...base].sort(), merges: [] },
  ];
  const candidates: Candidate[] = [];

  for (let m = 0; m < MAX_MERGES; m++) {
    const cur = states[states.length - 1];
    const ranked = rankPairs(pairCounts(cur.words));
    const best = ranked[0];
    if (!best || best.count < 2) break; // stop once no pair repeats
    const tok = best.a + best.b;
    candidates.push({ ...best, tok, pairs: ranked.slice(0, 7) });
    states.push({
      words: mergeWords(cur.words, best.a, best.b),
      vocab: [...cur.vocab, tok],
      merges: [...cur.merges, { a: best.a, b: best.b, tok }],
    });
  }
  return { states, candidates };
}

/** Render a symbol, drawing the end-of-word marker as a faint dot. */
function Sym({ s }: { s: string }) {
  const isEnd = s.endsWith(END);
  const text = isEnd ? s.slice(0, -END.length) : s;
  return (
    <>
      {text}
      {isEnd && <span className="text-fg-faint/60">·</span>}
    </>
  );
}

export default function BpeAnimator() {
  const [corpus, setCorpus] = useState(DEFAULT_CORPUS);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const { states, candidates } = useMemo(() => train(corpus), [corpus]);
  const maxStep = candidates.length;
  const s = Math.min(step, maxStep);
  const state = states[s];
  const cand = s < maxStep ? candidates[s] : null;

  // Reset to the start whenever the corpus changes.
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [corpus]);

  // Auto-play.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((p) => {
        if (p >= maxStep) {
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 1100);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, maxStep]);

  const maxPairCount = cand ? cand.pairs[0].count : 1;
  const newestTok = s > 0 ? states[s].merges[s - 1]?.tok : null;

  return (
    <div className="font-sans text-sm">
      {/* Corpus input */}
      <label className="mb-1.5 block text-2xs font-medium uppercase tracking-wider text-fg-faint">
        training corpus
      </label>
      <textarea
        value={corpus}
        onChange={(e) => setCorpus(e.target.value)}
        spellCheck={false}
        rows={2}
        className="mb-3 w-full resize-y rounded-lg border border-line bg-ink-900 px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/50"
      />

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setStep(0);
            setPlaying(false);
          }}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
        >
          Reset
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStep((p) => Math.max(0, p - 1));
          }}
          disabled={s === 0}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg disabled:opacity-40"
        >
          ◀ Back
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStep((p) => Math.min(maxStep, p + 1));
          }}
          disabled={s >= maxStep}
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          Step ▶
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={s >= maxStep}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg disabled:opacity-40"
        >
          {playing ? '❚❚ Pause' : '▶ Auto'}
        </button>
        <span className="ml-auto font-mono text-2xs tabular text-fg-faint">
          merge {s} / {maxStep}
        </span>
      </div>

      {/* Next-merge callout */}
      <div className="mb-4 flex min-h-[2.25rem] items-center gap-2 rounded-lg border border-line bg-ink-900/60 px-3 py-2 text-xs">
        {cand ? (
          <>
            <span className="text-fg-faint">next merge:</span>
            <span className="rounded bg-ink-600 px-1.5 py-0.5 font-mono text-fg">
              <Sym s={cand.a} />
            </span>
            <span className="text-fg-faint">+</span>
            <span className="rounded bg-ink-600 px-1.5 py-0.5 font-mono text-fg">
              <Sym s={cand.b} />
            </span>
            <span className="text-fg-faint">→</span>
            <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-accent ring-1 ring-accent/40">
              <Sym s={cand.tok} />
            </span>
            <span className="ml-auto font-mono text-fg-faint">
              {cand.count}× most frequent pair
            </span>
          </>
        ) : (
          <span className="text-live">
            ✓ converged — no adjacent pair repeats. Vocabulary is{' '}
            {state.vocab.length} tokens.
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: corpus segmentation */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            corpus — each word as current tokens
          </div>
          <div className="space-y-2">
            {state.words.map((w, wi) => {
              let offset = 0;
              return (
                <div key={wi} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right font-mono text-2xs text-fg-faint">
                    {w.count}×
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {w.sym.map((sym, i) => {
                      const key = `${wi}:${offset}`;
                      offset += baseLen(sym);
                      const isCandA =
                        cand &&
                        sym === cand.a &&
                        w.sym[i + 1] === cand.b;
                      const isCandB =
                        cand &&
                        sym === cand.b &&
                        i > 0 &&
                        w.sym[i - 1] === cand.a;
                      const isNew = sym === newestTok && sym.length > 1;
                      return (
                        <motion.span
                          key={key}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                          className={[
                            'rounded px-1.5 py-0.5 font-mono text-xs',
                            isCandA || isCandB
                              ? 'bg-accent/20 text-accent ring-1 ring-accent/50'
                              : isNew
                                ? 'bg-live/15 text-live ring-1 ring-live/40'
                                : 'bg-ink-700 text-fg-muted',
                          ].join(' ')}
                        >
                          <Sym s={sym} />
                        </motion.span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: pair frequencies + vocab */}
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-ink-900/40 p-3">
            <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
              adjacent pair counts
            </div>
            {cand ? (
              <div className="space-y-1">
                {cand.pairs.map((p, i) => (
                  <div key={p.a + SEP + p.b} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate font-mono text-2xs text-fg-muted">
                      <Sym s={p.a} />
                      <span className="text-fg-faint">·</span>
                      <Sym s={p.b} />
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-ink-700">
                      <div
                        className={i === 0 ? 'h-full bg-accent' : 'h-full bg-accent/35'}
                        style={{ width: `${(p.count / maxPairCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono text-2xs tabular text-fg-faint">
                      {p.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-2xs text-fg-faint">No pair occurs more than once.</p>
            )}
          </div>

          <div className="rounded-lg border border-line bg-ink-900/40 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
                vocabulary
              </span>
              <span className="font-mono text-2xs tabular text-fg-faint">
                {state.vocab.length} tokens
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {state.vocab.map((v) => (
                <span
                  key={v}
                  className={[
                    'rounded px-1.5 py-0.5 font-mono text-2xs',
                    v === newestTok
                      ? 'bg-live/15 text-live ring-1 ring-live/40'
                      : v.length > (v.endsWith(END) ? END.length + 1 : 1)
                        ? 'bg-ink-600 text-fg-muted'
                        : 'bg-ink-700 text-fg-faint',
                  ].join(' ')}
                >
                  <Sym s={v} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Learned merge rules */}
      {state.merges.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-faint">
            merge rules learned (in order)
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {state.merges.map((m, i) => (
              <span key={i} className="font-mono text-2xs text-fg-muted">
                <span className="text-fg-faint">{i + 1}.</span>{' '}
                <span className="text-live">
                  <Sym s={m.tok} />
                </span>{' '}
                <span className="text-fg-faint">←</span> <Sym s={m.a} /> +{' '}
                <Sym s={m.b} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
