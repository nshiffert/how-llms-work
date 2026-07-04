import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Temperature lesson. A fixed prompt prefix, the
// model's next-token distribution rendered as probability bars, and one
// temperature slider (0.1 → 2.0, plus a T=0 greedy preset). Dragging the
// slider re-shapes the bars live — softmax(logits/T) — and five completions
// sampled at the current temperature update below, so the reader sees the
// distribution change AND what that does to actual sampled text. The prefix
// is the same toy LM as the Beam Search vs Greedy lesson, now sampled
// instead of argmax'd.

const PREFIX = 'The cat sat on the';

interface NextToken {
  token: string;
  p: number; // base probability at T = 1
  cont: { text: string; p: number }[]; // second-step continuations, base probs
}

const NEXT: NextToken[] = [
  {
    token: 'mat',
    p: 0.32,
    cont: [
      { text: ' and purred.', p: 0.4 },
      { text: ' and slept.', p: 0.3 },
      { text: ', waiting.', p: 0.2 },
      { text: ' again.', p: 0.1 },
    ],
  },
  {
    token: 'rug',
    p: 0.24,
    cont: [
      { text: ' and purred.', p: 0.6 },
      { text: ' and slept.', p: 0.25 },
      { text: ' by the fire.', p: 0.1 },
      { text: ' again.', p: 0.05 },
    ],
  },
  {
    token: 'couch',
    p: 0.15,
    cont: [
      { text: ' and stretched.', p: 0.45 },
      { text: ' and slept.', p: 0.3 },
      { text: ', purring.', p: 0.25 },
    ],
  },
  {
    token: 'floor',
    p: 0.1,
    cont: [
      { text: ' and yawned.', p: 0.4 },
      { text: ', bored.', p: 0.35 },
      { text: ' and waited.', p: 0.25 },
    ],
  },
  {
    token: 'windowsill',
    p: 0.08,
    cont: [
      { text: ' to watch birds.', p: 0.55 },
      { text: ' in the sun.', p: 0.45 },
    ],
  },
  {
    token: 'keyboard',
    p: 0.06,
    cont: [
      { text: ' and typed gibberish.', p: 0.6 },
      { text: ' mid-meeting.', p: 0.4 },
    ],
  },
  {
    token: 'roof',
    p: 0.04,
    cont: [
      { text: ' at midnight.', p: 0.55 },
      { text: ' and yowled.', p: 0.45 },
    ],
  },
  {
    token: 'moon',
    p: 0.01,
    cont: [{ text: ', somehow.', p: 1.0 }],
  },
];

const PRESETS: { label: string; t: number; note: string }[] = [
  { label: '0 (greedy)', t: 0, note: 'the singularity — implementations argmax instead' },
  { label: '0.1', t: 0.1, note: 'near-deterministic' },
  { label: '0.7', t: 0.7, note: 'typical conversational' },
  { label: '1.0', t: 1, note: 'identity — the raw distribution' },
  { label: '1.5', t: 1.5, note: 'wandering' },
  { label: '2.0', t: 2, note: 'approaching uniform' },
];

// softmax(logits / T) where logits = ln(base p)  ⟺  p^(1/T), renormalized.
// T = 0 is handled as the limit: all mass on the argmax (what real APIs do).
function tempProbs(ps: number[], T: number): number[] {
  if (T <= 0) {
    const top = ps.indexOf(Math.max(...ps));
    return ps.map((_, i) => (i === top ? 1 : 0));
  }
  const w = ps.map((p) => Math.pow(p, 1 / T));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

function sampleIndex(probs: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (u < acc) return i;
  }
  return probs.length - 1;
}

function fmtPct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

export default function TemperatureExplorer() {
  const [temp, setTemp] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [samples, setSamples] = useState<{ tokenIdx: number; text: string }[]>([]);

  const probs = useMemo(() => tempProbs(NEXT.map((n) => n.p), temp), [temp]);

  const entropy = useMemo(
    () => -probs.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0),
    [probs],
  );
  const effChoices = Math.exp(entropy);
  const topIdx = probs.indexOf(Math.max(...probs));
  const ratioTop2 = probs[1] > 1e-12 ? probs[0] / probs[1] : Infinity;

  // Sampling is impure, so it lives in an effect — SSR and hydration render
  // the same empty list, then the client draws.
  useEffect(() => {
    const draws = Array.from({ length: 5 }, () => {
      const i = sampleIndex(probs, Math.random());
      const contProbs = tempProbs(NEXT[i].cont.map((c) => c.p), temp);
      const j = sampleIndex(contProbs, Math.random());
      return { tokenIdx: i, text: `${NEXT[i].token}${NEXT[i].cont[j].text}` };
    });
    setSamples(draws);
  }, [probs, temp, nonce]);

  const uniqueCount = new Set(samples.map((s) => s.text)).size;

  return (
    <div className="font-sans text-sm">
      {/* Prompt prefix */}
      <div className="mb-3 rounded-lg border border-line bg-ink-900/40 px-3 py-2 font-mono text-sm">
        <span className="text-fg-muted">{PREFIX}</span>
        <span className="ml-1 inline-block h-4 w-2 translate-y-0.5 animate-pulse rounded-sm bg-accent" />
      </div>

      {/* Temperature control */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          temperature
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setTemp(p.t)}
            title={p.note}
            className={`rounded border px-2 py-0.5 font-mono text-2xs transition-colors ${
              temp === p.t
                ? 'border-accent bg-ink-700 text-fg'
                : 'border-line bg-ink-700/60 text-fg-muted hover:border-accent hover:text-fg'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="range"
          min={0.1}
          max={2}
          step={0.05}
          value={Math.max(temp, 0.1)}
          onChange={(e) => setTemp(parseFloat(e.target.value))}
          aria-label="temperature T"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="tabular w-24 shrink-0 text-right font-mono text-sm text-live">
          {temp === 0 ? 'T = 0' : `T = ${temp.toFixed(2)}`}
        </span>
      </div>

      {/* Next-token distribution */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-medium text-fg">
            {temp === 0 ? 'argmax(logits) — no distribution left' : 'softmax(logits / T)'}
          </span>
          <span className="font-mono text-2xs tabular text-live">Σ = 1.00</span>
        </div>
        <div className="space-y-1.5">
          {NEXT.map((n, i) => {
            const p = probs[i];
            const faded = p < 0.001;
            return (
              <div key={n.token} className={`flex items-center gap-2 ${faded ? 'opacity-40' : ''}`}>
                <span className="w-24 shrink-0 truncate text-right font-mono text-xs text-fg-muted">
                  {n.token}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-600">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ background: i === topIdx ? '#5eead4' : 'rgba(110,168,254,0.55)' }}
                    animate={{ width: `${Math.min(p, 1) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  />
                </div>
                <span className="tabular w-14 shrink-0 text-right font-mono text-xs text-fg">
                  {fmtPct(p)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          {temp === 0 ? (
            <>
              T = 0 divides by zero, so implementations switch to greedy decoding: 100% on the
              argmax, every other token gets exactly nothing.
            </>
          ) : (
            <>
              <span className="font-mono text-fg-muted">{NEXT[0].token}</span> is{' '}
              <span className="font-mono text-fg-muted">
                {Number.isFinite(ratioTop2) ? `${ratioTop2.toFixed(1)}×` : '∞'}
              </span>{' '}
              more likely than <span className="font-mono text-fg-muted">{NEXT[1].token}</span>{' '}
              (base ratio 1.3×) · sampling among ≈{' '}
              <span className="font-mono text-fg-muted">{effChoices.toFixed(1)}</span> effective
              choices (e^entropy, max 8). Ranking never changes — only the shares do.
            </>
          )}
        </p>
      </div>

      {/* Sampled completions */}
      <div className="mt-3 rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-medium text-fg">
            5 completions sampled at {temp === 0 ? 'T = 0' : `T = ${temp.toFixed(2)}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xs tabular text-fg-faint">
              {samples.length ? `${uniqueCount} unique` : ''}
            </span>
            <button
              onClick={() => setNonce((n) => n + 1)}
              className="rounded border border-line bg-ink-700/60 px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
            >
              resample ↻
            </button>
          </div>
        </div>
        <div className="space-y-1 font-mono text-xs leading-relaxed">
          {samples.length === 0 ? (
            <div className="text-fg-faint">sampling…</div>
          ) : (
            samples.map((s, i) => (
              <div key={`${nonce}-${temp}-${i}`} className="text-fg-muted">
                <span className="text-fg-faint">{PREFIX} </span>
                <span className={s.tokenIdx === 0 ? 'text-live' : 'text-accent'}>
                  {NEXT[s.tokenIdx].token}
                </span>
                <span className="text-fg">{s.text.slice(NEXT[s.tokenIdx].token.length)}</span>
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          Temperature applies at every step of the loop, not just the first token. First tokens
          are <span className="text-live">teal</span> when the sampler took the model's top choice
          and <span className="text-accent">blue</span> when it didn't — raise T and watch the
          blue take over. At T = 0.1 the draws are usually one repetitive answer; past T ≈ 1.5
          the keyboard, the roof, and the moon start showing up.
        </p>
      </div>
    </div>
  );
}
