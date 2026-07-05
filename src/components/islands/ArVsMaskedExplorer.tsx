import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Bespoke island for the Autoregressive vs Masked lesson. One sentence, two
// training objectives side by side. Left: an autoregressive pass steps
// left-to-right — each position is predicted from ONLY the tokens before it
// (causal mask), and a loss chip lands on every position. Right: a masked-LM
// pass hides ~15% of the tokens and predicts them all in ONE bidirectional
// pass — loss chips land only on the masked slots. Click a [MASK] to see it
// read context from both sides. The mask grids underneath are the actual
// attention masks: lower-triangular vs full.

const TOKENS = ['the', 'cat', 'sat', 'on', 'the', 'mat', 'because', 'it', 'was', 'warm'];
const N = TOKENS.length;

// p(true token) the AR model assigns at each position, given ONLY the left
// context. Position 0 has no left context — AR never scores it.
const AR_P: (number | null)[] = [null, 0.02, 0.18, 0.55, 0.72, 0.34, 0.08, 0.61, 0.68, 0.25];

// Three deterministic "draws" of the ~15% BERT masking (2 of 10 tokens).
// p(true token) is higher than the AR value at the same position wherever
// there is real right context to exploit.
interface MaskDraw {
  positions: Record<number, number>; // index -> p(true | both sides)
  note: string;
}
const MASK_DRAWS: MaskDraw[] = [
  {
    positions: { 2: 0.74, 8: 0.89 },
    note: 'compare position 2: the AR pass gave "sat" p = 0.18 from "the cat" alone — with "on the mat" visible on the right, the masked pass gives it 0.74',
  },
  {
    positions: { 1: 0.66, 5: 0.81 },
    note: '"mat" is easy when you can read "because it was warm" — the right context does most of the work',
  },
  {
    positions: { 3: 0.93, 9: 0.31 },
    note: '"warm" sits at the end of the sentence — no right context exists, so bidirectionality buys almost nothing (0.31 vs the AR pass\'s 0.25)',
  },
];

const loss = (p: number) => -Math.log(p);
const AR_LOSSES = AR_P.map((p) => (p === null ? null : loss(p)));
const AR_TOTAL = AR_LOSSES.reduce<number>((a, l) => a + (l ?? 0), 0);

const C = {
  visible: '#5eead4', // teal — context the prediction reads
  predict: '#6ea8fe', // blue — position being predicted
  blocked: '#7d8590', // gray — hidden by the causal mask
  mask: '#fbbf24', // amber — [MASK] slots
  line: '#30363d',
};

function TokenChip({
  text,
  role,
  lossVal,
  onClick,
  selected,
}: {
  text: string;
  role: 'visible' | 'predict' | 'blocked' | 'mask' | 'plain';
  lossVal?: number | null;
  onClick?: () => void;
  selected?: boolean;
}) {
  const style: Record<string, { border: string; bg: string; color: string; opacity: number }> = {
    visible: { border: C.visible, bg: 'rgba(94,234,212,0.10)', color: '#e6edf3', opacity: 1 },
    predict: { border: C.predict, bg: 'rgba(110,168,254,0.16)', color: '#e6edf3', opacity: 1 },
    blocked: { border: C.line, bg: 'rgba(125,133,144,0.05)', color: C.blocked, opacity: 0.45 },
    mask: { border: C.mask, bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', opacity: 1 },
    plain: { border: C.line, bg: 'rgba(110,168,254,0.04)', color: '#e6edf3', opacity: 1 },
  };
  const s = style[role];
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        disabled={!onClick}
        aria-pressed={onClick ? selected : undefined}
        className={`rounded border px-1.5 py-0.5 font-mono text-xs transition-all ${
          onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
        }`}
        style={{
          borderColor: s.border,
          background: s.bg,
          color: s.color,
          opacity: s.opacity,
          boxShadow: selected ? `0 0 0 2px ${C.mask}55` : undefined,
        }}
      >
        {text}
      </button>
      <div className="h-4">
        <AnimatePresence>
          {lossVal != null && (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-mono text-2xs"
              style={{ color: '#f87171' }}
            >
              {lossVal.toFixed(2)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// The actual attention mask as a T×T grid: row = query position, col = key
// position. A filled cell means that attention edge exists.
function MaskGrid({
  causal,
  highlightRow,
  label,
}: {
  causal: boolean;
  highlightRow: number | null;
  label: string;
}) {
  const cell = 11;
  const pad = 2;
  const size = N * cell + pad * 2;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={
          causal
            ? 'Lower-triangular causal attention mask: each row attends only to columns at or before it'
            : 'Full bidirectional attention mask: every row attends to every column'
        }
      >
        {Array.from({ length: N }, (_, r) =>
          Array.from({ length: N }, (_, c) => {
            const allowed = causal ? c <= r : true;
            const hot = highlightRow === r && allowed;
            return (
              <rect
                key={`${r}-${c}`}
                x={pad + c * cell}
                y={pad + r * cell}
                width={cell - 1.5}
                height={cell - 1.5}
                rx={2}
                fill={
                  hot
                    ? causal
                      ? 'rgba(110,168,254,0.85)'
                      : 'rgba(251,191,36,0.85)'
                    : allowed
                      ? 'rgba(94,234,212,0.28)'
                      : 'rgba(125,133,144,0.07)'
                }
              />
            );
          }),
        )}
      </svg>
      <span className="font-mono text-2xs text-fg-faint">{label}</span>
    </div>
  );
}

export default function ArVsMaskedExplorer() {
  // AR pointer: number of positions predicted so far (0..N-1, predicting 1..9)
  const [arStep, setArStep] = useState(0);
  const [drawIdx, setDrawIdx] = useState(0);
  const [mlmDone, setMlmDone] = useState(false);
  const [selMask, setSelMask] = useState<number | null>(null);

  const draw = MASK_DRAWS[drawIdx];
  const maskedIdx = Object.keys(draw.positions).map(Number);
  const arDone = arStep >= N - 1;
  const predicting = arDone ? null : arStep + 1; // position being predicted next

  const arLossSoFar = useMemo(
    () => AR_LOSSES.slice(0, arStep + 1).reduce<number>((a, l) => a + (l ?? 0), 0),
    [arStep],
  );
  const mlmTotal = maskedIdx.reduce((a, i) => a + loss(draw.positions[i]), 0);

  const redraw = () => {
    setDrawIdx((i) => (i + 1) % MASK_DRAWS.length);
    setMlmDone(false);
    setSelMask(null);
  };

  return (
    <div className="font-sans text-sm">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Autoregressive panel ─────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium uppercase tracking-wider" style={{ color: C.predict }}>
              autoregressive (GPT-style)
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setArStep((s) => Math.min(s + 1, N - 1))}
                disabled={arDone}
                className="rounded border border-accent/60 bg-ink-700 px-2 py-0.5 font-mono text-2xs text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                predict next
              </button>
              <button
                onClick={() => setArStep(N - 1)}
                disabled={arDone}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                run all
              </button>
              <button
                onClick={() => setArStep(0)}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
              >
                reset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map((t, i) => {
              const role =
                predicting !== null && i === predicting
                  ? 'predict'
                  : i <= arStep
                    ? 'visible'
                    : 'blocked';
              return (
                <TokenChip
                  key={i}
                  text={t}
                  role={role}
                  lossVal={i > 0 && i <= arStep ? AR_LOSSES[i] : null}
                />
              );
            })}
          </div>

          <p aria-live="polite" className="mt-1 min-h-8 font-mono text-2xs leading-snug text-fg-muted">
            {predicting !== null ? (
              <>
                predicting <span style={{ color: C.predict }}>&ldquo;{TOKENS[predicting]}&rdquo;</span>{' '}
                from {predicting} left token{predicting > 1 ? 's' : ''} only — p ={' '}
                {AR_P[predicting]!.toFixed(2)}, loss −ln p = {AR_LOSSES[predicting]!.toFixed(2)}.
                Everything to the right is blocked by the causal mask.
              </>
            ) : (
              <>pass complete — a loss landed on every position it could score</>
            )}
          </p>

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
            <MaskGrid causal highlightRow={predicting} label="causal mask (lower-triangular)" />
            <div className="text-right font-mono text-2xs text-fg-muted">
              <p>
                loss terms: <span className="text-fg">{arStep} / {N - 1}</span> positions
              </p>
              <p>
                Σ loss so far: <span className="text-fg">{arLossSoFar.toFixed(2)}</span>
              </p>
              {arDone && (
                <p className="text-fg-faint">mean {(AR_TOTAL / (N - 1)).toFixed(2)} nats/token</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Masked panel ─────────────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium uppercase tracking-wider" style={{ color: C.mask }}>
              masked (BERT-style)
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setMlmDone(true)}
                disabled={mlmDone}
                className="rounded border border-accent/60 bg-ink-700 px-2 py-0.5 font-mono text-2xs text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                predict masks — one pass
              </button>
              <button
                onClick={redraw}
                className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
              >
                re-draw 15%
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map((t, i) => {
              const isMasked = maskedIdx.includes(i);
              const role = isMasked ? 'mask' : selMask !== null ? 'visible' : 'plain';
              return (
                <TokenChip
                  key={`${drawIdx}-${i}`}
                  text={isMasked && !mlmDone ? '[MASK]' : t}
                  role={role}
                  lossVal={isMasked && mlmDone ? loss(draw.positions[i]) : null}
                  onClick={isMasked ? () => setSelMask(selMask === i ? null : i) : undefined}
                  selected={selMask === i}
                />
              );
            })}
          </div>

          <p aria-live="polite" className="mt-1 min-h-8 font-mono text-2xs leading-snug text-fg-muted">
            {selMask !== null ? (
              <>
                predicting <span style={{ color: C.mask }}>&ldquo;{TOKENS[selMask]}&rdquo;</span> at
                position {selMask} — it reads the other {N - 1} positions, both sides at once
                (including the other [MASK], as corrupted input). p ={' '}
                {draw.positions[selMask].toFixed(2)}, loss ={' '}
                {loss(draw.positions[selMask]).toFixed(2)}.
              </>
            ) : (
              <>
                {maskedIdx.length} of {N} tokens hidden (~15%). Click a{' '}
                <span style={{ color: C.mask }}>[MASK]</span> to see what it reads. All predictions
                happen in one parallel pass — no left-to-right order.
              </>
            )}
          </p>

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
            <MaskGrid causal={false} highlightRow={selMask} label="bidirectional mask (full)" />
            <div className="text-right font-mono text-2xs text-fg-muted">
              <p>
                loss terms: <span className="text-fg">{mlmDone ? maskedIdx.length : 0} / {N}</span>{' '}
                positions
              </p>
              <p>
                Σ loss{mlmDone ? ':' : ' (hidden):'}{' '}
                <span className="text-fg">{mlmDone ? mlmTotal.toFixed(2) : '—'}</span>
              </p>
              <p className="text-fg-faint">the other {N - maskedIdx.length} tokens pay no loss</p>
            </div>
          </div>
        </div>
      </div>

      {/* scoreboard */}
      <AnimatePresence>
        {(arDone || mlmDone) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-line bg-ink-900/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
              <p>
                Same sentence, one training pass each:{' '}
                <span style={{ color: C.predict }}>AR scores {N - 1} of {N} positions</span> (every
                token with a left context) vs{' '}
                <span style={{ color: C.mask }}>masked scores {maskedIdx.length} of {N}</span> (only
                the hidden 15%). That is a 4.5× gap in loss signal on this sentence (9 vs 2), and
                ~6.7× in the limit (every position vs the 15% draw) — why masked models need more
                epochs to converge. The bidirectional context is why their fill-in probabilities
                run higher.
              </p>
              <p className="mt-1.5 text-fg-faint">{draw.note}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
