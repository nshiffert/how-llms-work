import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

// Bespoke island for the Top-k vs Top-p lesson. The same probability-bar
// setup as the Temperature lesson, but the knobs are truncation knobs: a
// top-k slider (fixed count) and a top-p slider (fixed probability mass).
// Two preset next-token distributions — one peaked, one flat — expose the
// core asymmetry: the nucleus adapts to the shape of the distribution while
// top-k keeps the same count regardless. Tokens cut by either rule fade out
// (tagged ×k / ×p); survivors renormalize, and the teal sliver on each kept
// bar is the probability mass it inherits from the deleted tail.

interface Preset {
  id: string;
  label: string;
  prompt: string;
  note: string;
  tokens: { token: string; p: number }[]; // sorted descending, sums to 1.000
}

const PRESETS: Preset[] = [
  {
    id: 'peaked',
    label: 'peaked (confident)',
    prompt: 'The capital of France is',
    note: 'one token dominates — watch the nucleus collapse',
    tokens: [
      { token: 'Paris', p: 0.87 },
      { token: 'the', p: 0.04 },
      { token: 'located', p: 0.025 },
      { token: 'a', p: 0.015 },
      { token: 'one', p: 0.01 },
      { token: 'home', p: 0.008 },
      { token: 'known', p: 0.007 },
      { token: 'France', p: 0.006 },
      { token: 'Lyon', p: 0.005 },
      { token: 'beautiful', p: 0.005 },
      { token: 'situated', p: 0.005 },
      { token: 'Marseille', p: 0.004 },
    ],
  },
  {
    id: 'flat',
    label: 'flat (uncertain)',
    prompt: "For dinner I'm making",
    note: 'no clear favorite — watch the nucleus expand',
    tokens: [
      { token: 'pasta', p: 0.14 },
      { token: 'chicken', p: 0.12 },
      { token: 'a', p: 0.11 },
      { token: 'some', p: 0.1 },
      { token: 'rice', p: 0.09 },
      { token: 'soup', p: 0.08 },
      { token: 'tacos', p: 0.08 },
      { token: 'pizza', p: 0.07 },
      { token: 'curry', p: 0.07 },
      { token: 'salmon', p: 0.06 },
      { token: 'stir-fry', p: 0.05 },
      { token: 'lasagna', p: 0.03 },
    ],
  },
];

const V = PRESETS[0].tokens.length; // both presets share a 12-token toy vocab

interface RowState {
  keptK: boolean;
  keptP: boolean;
  kept: boolean;
  cum: number;
  renorm: number;
}

// Tokens arrive sorted descending. Top-k keeps ranks < k; top-p keeps the
// smallest prefix whose cumulative probability reaches p (the nucleus).
// A token survives only if BOTH rules keep it; survivors renormalize.
function applyTruncation(ps: number[], k: number, p: number): RowState[] {
  const cums: number[] = [];
  let acc = 0;
  for (const x of ps) {
    acc += x;
    cums.push(acc);
  }
  let nucleus = cums.findIndex((c) => c >= p - 1e-9) + 1;
  if (nucleus === 0) nucleus = ps.length;
  const keptMass = ps.reduce((a, x, i) => (i < k && i < nucleus ? a + x : a), 0);
  return ps.map((x, i) => {
    const keptK = i < k;
    const keptP = i < nucleus;
    const kept = keptK && keptP;
    return { keptK, keptP, kept, cum: cums[i], renorm: kept ? x / keptMass : 0 };
  });
}

function fmtPct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

export default function TopKTopPExplorer() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [k, setK] = useState(5);
  const [p, setP] = useState(0.9);

  const preset = PRESETS[presetIdx];
  const other = PRESETS[1 - presetIdx];

  const rows = useMemo(
    () => applyTruncation(preset.tokens.map((t) => t.p), k, p),
    [preset, k, p],
  );
  const otherKept = useMemo(
    () => applyTruncation(other.tokens.map((t) => t.p), k, p).filter((r) => r.kept).length,
    [other, k, p],
  );

  const keptCount = rows.filter((r) => r.kept).length;
  const keptMass = rows.reduce((a, r, i) => a + (r.kept ? preset.tokens[i].p : 0), 0);
  const nucleusSize = rows.filter((r) => r.keptP).length;

  return (
    <div className="font-sans text-sm">
      {/* Preset toggle + prompt */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-faint">
          distribution
        </span>
        {PRESETS.map((pr, i) => (
          <button
            key={pr.id}
            onClick={() => setPresetIdx(i)}
            title={pr.note}
            className={`rounded border px-2 py-0.5 font-mono text-2xs transition-colors ${
              presetIdx === i
                ? 'border-accent bg-ink-700 text-fg'
                : 'border-line bg-ink-700/60 text-fg-muted hover:border-accent hover:text-fg'
            }`}
          >
            {pr.label}
          </button>
        ))}
      </div>
      <div className="mb-3 rounded-lg border border-line bg-ink-900/40 px-3 py-2 font-mono text-sm">
        <span className="text-fg-muted">{preset.prompt}</span>
        <span className="ml-1 inline-block h-4 w-2 translate-y-0.5 animate-pulse rounded-sm bg-accent" />
      </div>

      {/* Truncation controls */}
      <div className="mb-1 flex items-center gap-3">
        <span className="w-16 shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          top-k
        </span>
        <input
          type="range"
          min={1}
          max={V}
          step={1}
          value={k}
          onChange={(e) => setK(parseInt(e.target.value, 10))}
          aria-label="top-k count"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="tabular w-28 shrink-0 text-right font-mono text-sm text-live">
          {k === V ? `k = ${V} (off)` : `k = ${k}`}
        </span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <span className="w-16 shrink-0 text-2xs font-medium uppercase tracking-wider text-fg-faint">
          top-p
        </span>
        <input
          type="range"
          min={0.5}
          max={1}
          step={0.01}
          value={p}
          onChange={(e) => setP(parseFloat(e.target.value))}
          aria-label="top-p threshold"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="tabular w-28 shrink-0 text-right font-mono text-sm text-live">
          {p >= 0.999 ? 'p = 1.00 (off)' : `p = ${p.toFixed(2)}`}
        </span>
      </div>

      {/* Truncated distribution */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-medium text-fg">
            sort ↓ · cut · renormalize
          </span>
          <span className="font-mono text-2xs tabular text-live">
            survivors: Σ = 1.00
          </span>
        </div>
        <div className="space-y-1.5">
          {preset.tokens.map((t, i) => {
            const r = rows[i];
            return (
              <div key={t.token} className={`flex items-center gap-2 ${r.kept ? '' : 'opacity-40'}`}>
                <span className="w-20 shrink-0 truncate text-right font-mono text-xs text-fg-muted">
                  {t.token}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-600">
                  {/* inherited mass after renormalizing (kept tokens only) */}
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ background: '#5eead4' }}
                    animate={{ width: `${(r.kept ? r.renorm : t.p) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  />
                  {/* original probability, drawn on top */}
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      background: r.kept ? 'rgba(110,168,254,0.9)' : 'rgba(110,168,254,0.35)',
                    }}
                    animate={{ width: `${t.p * 100}%` }}
                    transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  />
                </div>
                <span className="tabular w-12 shrink-0 text-right font-mono text-2xs text-fg-faint">
                  Σ {(r.cum * 100).toFixed(0)}%
                </span>
                <span className="tabular w-28 shrink-0 text-right font-mono text-xs">
                  {r.kept ? (
                    <>
                      <span className="text-fg-muted">{fmtPct(t.p)}</span>
                      <span className="text-fg-faint"> → </span>
                      <span className="text-fg">{fmtPct(r.renorm)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-fg-faint line-through">{fmtPct(t.p)}</span>
                      <span className="ml-1 text-fg-faint">
                        {!r.keptK && '×k'}
                        {!r.keptK && !r.keptP && ' '}
                        {!r.keptP && '×p'}
                      </span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          kept <span className="font-mono text-fg-muted">{keptCount} of {V}</span> — nucleus wanted{' '}
          <span className="font-mono text-fg-muted">{nucleusSize}</span>, top-k allowed{' '}
          <span className="font-mono text-fg-muted">{Math.min(k, V)}</span> · deleted tail mass{' '}
          <span className="font-mono text-fg-muted">{fmtPct(1 - keptMass)}</span>, inherited by the
          survivors (the <span className="text-live">teal</span> sliver) · same k and p on the{' '}
          <button
            onClick={() => setPresetIdx(1 - presetIdx)}
            className="font-mono text-accent underline decoration-dotted underline-offset-2 hover:text-fg"
          >
            {other.label}
          </button>{' '}
          preset keep <span className="font-mono text-fg-muted">{otherKept}</span> — top-p adapts,
          top-k doesn't.
        </p>
      </div>
    </div>
  );
}
