import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the Chain-of-Thought lesson. Same question, same model,
// two prompts, side by side. Left: the direct prompt — the answer token must
// be predicted in ONE forward pass, so both arithmetic steps have to happen
// inside that position's transient activations; the next-token distribution
// comes out smeared and the argmax is wrong. Right: "let's think step by
// step" — tokens generate one at a time, each emitted token joins the context,
// and clicking a result token (3, 9., final 9) shows its attention weights
// over everything before it: each step is an easy hop over VISIBLE tokens,
// and the final answer token is mostly a copy of the last step's result.

const QUESTION = [
  'Q:', 'The', 'cafeteria', 'had', '23', 'apples.', 'They', 'used', '20',
  'for', 'lunch,', 'then', 'bought', '6', 'more.', 'How', 'many', 'apples',
  'now?', 'A:',
];

const COT = [
  'Let’s', 'think', 'step', 'by', 'step.', 'They', 'started', 'with',
  '23', 'apples.', '23', '−', '20', '=', '3', 'left.', 'Then', '3', '+',
  '6', '=', '9.', 'The', 'answer', 'is', '9',
];
const NC = COT.length;

// Next-token distribution at the answer position, direct prompt. The mass is
// smeared across every partial computation the single pass half-finishes:
// 27 is the model's actual wrong output in Wei et al.'s Figure 1, 49 is
// 23+20+6, 29 is 23+6, 3 is the first step done and then emitted too early.
const DIRECT_DIST: [string, number][] = [
  ['27', 0.30], ['9', 0.24], ['3', 0.14], ['49', 0.11], ['29', 0.11], ['other', 0.10],
];

// Next-token distribution at the final answer position, CoT prompt — after
// "The answer is", with "3 left." and "9." sitting in the context.
const COT_DIST: [string, number][] = [
  ['9', 0.94], ['3', 0.02], ['other', 0.02], ['27', 0.01], ['29', 0.01],
];

// Attention maps for the three result tokens, from the toy trace in the
// lesson. Keys: q<i> = question token i, c<i> = generated token i. Values are
// the attention weights the token being PREDICTED puts on that context token;
// the remainder is spread thinly over everything else.
interface HotSpec {
  weights: Record<string, number>;
  note: string;
}
const HOT: Record<number, HotSpec> = {
  14: {
    // predicting "3": reads the subtraction it just wrote
    weights: { c10: 0.26, c12: 0.27, c13: 0.12, c11: 0.08, q4: 0.07, q8: 0.06 },
    note: 'predicting “3” — attention sits on the “23 − 20 =” it just wrote. One subtraction over visible tokens: an easy hop.',
  },
  21: {
    // predicting "9.": reads step 1's result plus the addition
    weights: { c14: 0.24, c19: 0.26, c20: 0.12, c17: 0.09, c18: 0.07, q13: 0.07 },
    note: 'predicting “9.” — heaviest weights on “3” (step 1’s result, now an ordinary context token) and “6”. Step 1’s output is step 2’s input.',
  },
  25: {
    // final answer: mostly a copy of step 2's result
    weights: { c21: 0.41, c23: 0.10, c14: 0.06, c20: 0.05, q19: 0.05, q17: 0.04 },
    note: 'predicting the final “9” — 0.41 of the attention mass is on “9.” from step 2. The answer token doesn’t compute anything; it copies a result that already exists as a token.',
  },
};
const HOT_IDX = Object.keys(HOT).map(Number);

const C = {
  ctx: '#5eead4',     // teal — tokens in context
  gen: '#6ea8fe',     // blue — freshly generated token
  attn: '#fbbf24',    // amber — attention weight highlight
  wrong: '#f87171',
  right: '#4ade80',
  line: '#30363d',
  faint: '#7d8590',
};

function DistBars({ dist, correct, emitted }: { dist: [string, number][]; correct: string; emitted: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {dist.map(([tok, p]) => {
        const top = tok === dist[0][0];
        const isCorrect = tok === correct;
        return (
          <div key={tok} className="flex items-center gap-2 font-mono text-2xs">
            <span className="w-9 text-right" style={{ color: isCorrect ? C.right : top ? C.wrong : C.faint }}>
              {tok}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-ink-900/80">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: emitted ? `${p * 100}%` : 0 }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-sm"
                style={{ background: isCorrect ? 'rgba(74,222,128,0.65)' : top ? 'rgba(248,113,113,0.65)' : 'rgba(125,133,144,0.45)' }}
              />
            </div>
            <span className="w-8 text-fg-muted">{emitted ? p.toFixed(2) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chip({
  text,
  refId,
  role,
  attnW,
  onClick,
  selected,
  hot,
}: {
  text: string;
  refId: string;
  role: 'ctx' | 'gen' | 'future' | 'plain';
  attnW?: number;
  onClick?: () => void;
  selected?: boolean;
  hot?: boolean;
}) {
  const base: Record<string, { border: string; bg: string; color: string; opacity: number }> = {
    ctx: { border: C.line, bg: 'rgba(94,234,212,0.06)', color: '#e6edf3', opacity: 1 },
    gen: { border: C.gen, bg: 'rgba(110,168,254,0.16)', color: '#e6edf3', opacity: 1 },
    future: { border: C.line, bg: 'transparent', color: C.faint, opacity: 0.3 },
    plain: { border: C.line, bg: 'rgba(110,168,254,0.04)', color: '#e6edf3', opacity: 1 },
  };
  const s = base[role];
  const lit = attnW !== undefined && attnW > 0;
  return (
    <button
      data-ref={refId}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`rounded border px-1 py-0.5 font-mono text-2xs transition-all ${onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
      style={{
        borderColor: lit ? C.attn : hot && !selected ? 'rgba(251,191,36,0.55)' : s.border,
        background: lit ? `rgba(251,191,36,${Math.min(0.08 + attnW! * 1.9, 0.85)})` : s.bg,
        color: lit ? '#1c1917' : s.color,
        opacity: s.opacity,
        fontWeight: lit && attnW! >= 0.2 ? 600 : 400,
        boxShadow: selected ? `0 0 0 2px ${C.attn}88` : undefined,
        textDecoration: hot && !selected && !lit ? 'underline dotted' : undefined,
        textUnderlineOffset: 3,
      }}
    >
      {text}
    </button>
  );
}

export default function CotScratchpadExplorer() {
  const [directDone, setDirectDone] = useState(false);
  const [genCount, setGenCount] = useState(0); // # of CoT tokens emitted
  const [sel, setSel] = useState<number | null>(null); // selected hot token idx

  const cotDone = genCount >= NC;
  const spec = sel !== null ? HOT[sel] : null;
  const w = (ref: string) => (spec ? spec.weights[ref] : undefined);

  const stepNext = () => {
    const next = Math.min(genCount + 1, NC);
    setGenCount(next);
    if (next === NC) setSel(25);
  };
  const runAll = () => {
    setGenCount(NC);
    setSel(25);
  };
  const reset = () => {
    setGenCount(0);
    setSel(null);
  };

  return (
    <div className="font-sans text-sm">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Direct prompt ─────────────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium uppercase tracking-wider" style={{ color: C.wrong }}>
              direct prompt — one hard hop
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setDirectDone(true)}
                disabled={directDone}
                className="rounded border border-accent/60 bg-ink-700 px-2 py-0.5 font-mono text-2xs text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                predict answer token
              </button>
              <button
                onClick={() => setDirectDone(false)}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
              >
                reset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {QUESTION.map((t, i) => (
              <Chip key={i} refId={`d${i}`} text={t} role="plain" />
            ))}
            {directDone && (
              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded border px-1 py-0.5 font-mono text-2xs font-semibold"
                style={{ borderColor: C.wrong, background: 'rgba(248,113,113,0.14)', color: C.wrong }}
              >
                27 ✗
              </motion.span>
            )}
          </div>

          <p aria-live="polite" className="mt-2 min-h-10 font-mono text-2xs leading-snug text-fg-muted">
            {directDone ? (
              <>
                the argmax is <span style={{ color: C.wrong }}>27 — wrong</span>. Both steps
                (23−20=3, then 3+6=9) had to happen inside the activations of this ONE
                position. No intermediate result exists as a token, so attention has nothing
                to read back.
              </>
            ) : (
              <>
                one forward pass at the &ldquo;A:&rdquo; position must do the whole computation
                internally — press the button to see the next-token distribution it produces.
              </>
            )}
          </p>

          <div className="mt-2 border-t border-line pt-2">
            <p className="mb-1.5 font-mono text-2xs text-fg-faint">p(next token | question)</p>
            <DistBars dist={DIRECT_DIST} correct="9" emitted={directDone} />
          </div>
        </div>

        {/* ── CoT prompt ────────────────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium uppercase tracking-wider" style={{ color: C.gen }}>
              &ldquo;let&rsquo;s think step by step&rdquo; — many easy hops
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={stepNext}
                disabled={cotDone}
                className="rounded border border-accent/60 bg-ink-700 px-2 py-0.5 font-mono text-2xs text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                next token
              </button>
              <button
                onClick={runAll}
                disabled={cotDone}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                run all
              </button>
              <button
                onClick={reset}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
              >
                reset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {QUESTION.map((t, i) => (
              <Chip key={`q${i}`} refId={`q${i}`} text={t} role="ctx" attnW={w(`q${i}`)} />
            ))}
            {COT.map((t, i) => {
              if (i >= genCount) {
                return <Chip key={`c${i}`} refId={`c${i}`} text={t} role="future" />;
              }
              const isHot = HOT_IDX.includes(i);
              return (
                <Chip
                  key={`c${i}`}
                  refId={`c${i}`}
                  text={t}
                  role={i === genCount - 1 ? 'gen' : 'ctx'}
                  attnW={w(`c${i}`)}
                  hot={isHot}
                  onClick={isHot ? () => setSel(sel === i ? null : i) : undefined}
                  selected={sel === i}
                />
              );
            })}
          </div>

          <p aria-live="polite" className="mt-2 min-h-14 font-mono text-2xs leading-snug text-fg-muted">
            {spec && sel !== null && sel < genCount ? (
              <>
                <span style={{ color: C.attn }}>amber = attention weight</span> of the token
                being predicted, over everything before it. {spec.note}
              </>
            ) : genCount === 0 ? (
              <>
                same question, plus one appended line. Generate token by token — every emitted
                token immediately joins the context the next prediction attends over.
              </>
            ) : !cotDone ? (
              <>
                {genCount} / {NC} tokens emitted. Each one is now ordinary context.{' '}
                <span className="text-fg-faint">
                  dotted-underlined result tokens (3, 9., 9) are clickable once generated —
                  click to see their attention.
                </span>
              </>
            ) : (
              <>generation finished — click 3, 9. or the final 9 to inspect what each one read.</>
            )}
          </p>

          <div className="mt-2 border-t border-line pt-2">
            <p className="mb-1.5 font-mono text-2xs text-fg-faint">
              p(next token | question + {cotDone ? NC - 1 : Math.max(genCount - 1, 0)} scratchpad tokens) — final answer position
            </p>
            <DistBars dist={COT_DIST} correct="9" emitted={cotDone} />
          </div>
        </div>
      </div>

      {/* scoreboard */}
      <AnimatePresence>
        {directDone && cotDone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
              <p>
                Same weights, same architecture, same question. The only difference is what
                existed in the context when the answer token was predicted:{' '}
                <span style={{ color: C.wrong }}>direct — entropy 2.45 bits, argmax wrong</span>{' '}
                vs{' '}
                <span style={{ color: C.gen }}>CoT — entropy 0.44 bits, p(9) = 0.94</span>. The
                25 scratchpad tokens cost 25 extra forward passes; they bought a place for the
                intermediate results to live where attention can read them.
              </p>
              <p className="mt-1.5 text-fg-faint">
                the trace is stylized; the effect size is not — few-shot CoT lifted PaLM 540B
                on GSM8K from 17.9% to 56.9% with zero weight changes (Wei et al. 2022).
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
