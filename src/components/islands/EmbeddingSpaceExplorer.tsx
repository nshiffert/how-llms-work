import { useEffect, useMemo, useRef, useState } from 'react';
import { DIMS, POINTS, VOCAB, type EmbPoint } from './embeddingSpaceData';

// Embedding-space explorer for the Embeddings lesson. Two coupled views over
// the same REAL data (word2vec 10K sample, 200 dims — see embeddingSpaceData.ts):
//   1. "Trained space" — a 2D PCA projection of 313 words. Click or search a
//      word; its top-8 neighbors are looked up by cosine similarity in the
//      ORIGINAL 200-dim space, so the list is ground truth even where the
//      2D picture lies.
//   2. "Watch training" — the same words, animated from seeded random noise
//      (how every embedding table starts) to their trained positions. Motion
//      is schematic; the endpoints are the real projected vectors. Rare words
//      move slower and stall short — the real reason rare tokens have bad
//      embeddings is exactly this: too few gradient updates to escape init.

const ACCENT = '#6ea8fe'; // selected word (matches theme accent)
const LIVE = '#5eead4'; // neighbors (matches theme live)
const RARE = '#fbbf24'; // stalled rare words in training view
const DOT = 'rgba(148,163,184,0.42)';

// Words labeled at rest so the map is readable before any interaction.
const LANDMARKS = ['king', 'paris', 'three', 'dog', 'physics', 'computer', 'love', 'river', 'monday'];

const byWord = new Map(POINTS.map((p) => [p.w, p]));

// ── deterministic per-word noise for the "before training" positions ─────────
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function initPos(w: string): [number, number] {
  const rnd = mulberry32(hash(w));
  // uniform-ish in a disc — "small Gaussian noise", scaled up to the plot
  const ang = rnd() * Math.PI * 2;
  const rad = Math.sqrt(rnd()) * 0.95;
  return [Math.cos(ang) * rad, Math.sin(ang) * rad];
}

// How far toward its trained position a word gets, as a function of how often
// training actually saw it. Common words (count ≥ 2000 here) go all the way;
// the rarest (~127 occurrences) barely leave their random init.
function trainability(count: number): number {
  if (count >= 2000) return 1;
  return Math.max(0.06, Math.log10(count / 100) / Math.log10(20));
}
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const RAREST = [...POINTS].sort((a, b) => a.c - b.c).slice(0, 4);
const rareSet = new Set(RAREST.map((p) => p.w));

export default function EmbeddingSpaceExplorer() {
  const [mode, setMode] = useState<'space' | 'train'>('space');
  const [selected, setSelected] = useState<string>('king');
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setPlaying(false);
          return 1;
        }
        return Math.min(1, p + 0.012);
      });
    }, 30);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const sel = byWord.get(selected);
  const neighborSet = useMemo(() => new Set((sel?.nn ?? []).map(([w]) => w)), [sel]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = POINTS.filter((p) => p.w.startsWith(q)).map((p) => p.w);
    const contains = POINTS.filter((p) => !p.w.startsWith(q) && p.w.includes(q)).map((p) => p.w);
    return [...starts, ...contains].slice(0, 6);
  }, [query]);

  const e = easeInOut(progress);
  const pos = (p: EmbPoint): [number, number] => {
    if (mode === 'space') return [p.x, -p.y];
    const [x0, y0] = initPos(p.w);
    const m = trainability(p.c) * e;
    return [x0 + (p.x - x0) * m, y0 + (-p.y - y0) * m];
  };

  return (
    <div className="font-sans text-sm">
      {/* Mode toggle + stat line */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['space', 'Trained space'],
            ['train', 'Watch training'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-line bg-ink-900/40 text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-2xs tabular text-fg-faint">
          word2vec sample · {VOCAB.toLocaleString()} words · {DIMS} dims · {POINTS.length} plotted (PCA→2D)
        </span>
      </div>

      {mode === 'space' && (
        <div className="relative mb-3">
          <input
            type="text"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && suggestions.length) {
                setSelected(suggestions[0]);
                setQuery('');
              }
            }}
            placeholder="search one of the plotted words — try queen, walking, tokyo…"
            className="w-full rounded-lg border border-line bg-ink-900/60 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-ink-800 shadow-lg">
              {suggestions.map((w) => (
                <button
                  key={w}
                  onClick={() => {
                    setSelected(w);
                    setQuery('');
                  }}
                  className="block w-full px-3 py-1.5 text-left font-mono text-xs text-fg-muted hover:bg-ink-700 hover:text-fg"
                >
                  {w}
                </button>
              ))}
            </div>
          )}
          {query.trim() && suggestions.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-ink-800 px-3 py-1.5 text-xs text-fg-faint">
              not one of the {POINTS.length} plotted words
            </div>
          )}
        </div>
      )}

      {mode === 'train' && (
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => {
              if (progress >= 1) setProgress(0);
              setPlaying((p) => !p);
            }}
            className="shrink-0 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
          >
            {playing ? 'Pause' : progress >= 1 ? 'Replay' : 'Train'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={progress}
            onChange={(ev) => {
              setPlaying(false);
              setProgress(parseFloat(ev.target.value));
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
          />
          <span className="w-24 shrink-0 text-right font-mono text-2xs tabular text-fg-faint">
            {progress === 0 ? 'random init' : progress >= 1 ? 'trained' : `step ${Math.round(progress * 100)}%`}
          </span>
        </div>
      )}

      <div className={mode === 'space' ? 'grid gap-3 md:grid-cols-[1fr_230px]' : ''}>
        {/* Scatter */}
        <svg
          viewBox="-1.18 -1.18 2.36 2.36"
          className="w-full rounded-lg border border-line bg-ink-900/50"
          role="img"
          aria-label="2D projection of word embeddings"
        >
          {/* neighbor connection lines */}
          {mode === 'space' &&
            sel &&
            sel.nn.map(([w]) => {
              const p = byWord.get(w);
              if (!p) return null;
              return (
                <line
                  key={w}
                  x1={sel.x}
                  y1={-sel.y}
                  x2={p.x}
                  y2={-p.y}
                  stroke={LIVE}
                  strokeWidth={0.004}
                  opacity={0.5}
                />
              );
            })}

          {POINTS.map((p) => {
            const [x, y] = pos(p);
            const isSel = mode === 'space' && p.w === selected;
            const isNb = mode === 'space' && neighborSet.has(p.w);
            const isRare = mode === 'train' && rareSet.has(p.w);
            const fill = isSel ? ACCENT : isNb ? LIVE : isRare ? RARE : DOT;
            const r = isSel ? 0.028 : isNb || isRare ? 0.02 : 0.013;
            const labeled =
              hovered !== p.w &&
              (isSel ||
                isNb ||
                isRare ||
                (LANDMARKS.includes(p.w) && (mode === 'space' || progress >= 1)));
            return (
              <g key={p.w}>
                <circle cx={x} cy={y} r={r} fill={fill} pointerEvents="none" />
                {/* oversized transparent hit area so tiny dots are hoverable */}
                <circle
                  cx={x}
                  cy={y}
                  r={0.034}
                  fill="transparent"
                  className={mode === 'space' ? 'cursor-pointer' : undefined}
                  onMouseEnter={() => setHovered(p.w)}
                  onMouseLeave={() => setHovered((h) => (h === p.w ? null : h))}
                  onClick={mode === 'space' ? () => setSelected(p.w) : undefined}
                />
                {labeled && (
                  <text
                    x={x > 0.7 ? x - 0.035 : x + 0.035}
                    textAnchor={x > 0.7 ? 'end' : 'start'}
                    y={y + 0.018}
                    fontSize={isSel ? 0.062 : 0.05}
                    fontFamily="ui-monospace, monospace"
                    fill={isSel ? ACCENT : isNb ? LIVE : isRare ? RARE : 'rgba(148,163,184,0.55)'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {p.w}
                  </text>
                )}
              </g>
            );
          })}

          {/* hover label — drawn last so it sits above every dot */}
          {(() => {
            const hp = hovered ? byWord.get(hovered) : undefined;
            if (!hp) return null;
            const [x, y] = pos(hp);
            const isSel = mode === 'space' && hp.w === selected;
            const isNb = mode === 'space' && neighborSet.has(hp.w);
            const isRare = mode === 'train' && rareSet.has(hp.w);
            const color = isSel ? ACCENT : isNb ? LIVE : isRare ? RARE : '#e2e8f0';
            const flip = x > 0.7;
            return (
              <g pointerEvents="none">
                <circle cx={x} cy={y} r={0.024} fill="none" stroke={color} strokeWidth={0.006} />
                <text
                  x={flip ? x - 0.04 : x + 0.04}
                  textAnchor={flip ? 'end' : 'start'}
                  y={y + 0.018}
                  fontSize={0.058}
                  fontFamily="ui-monospace, monospace"
                  fill={color}
                  stroke="rgba(9,11,16,0.85)"
                  strokeWidth={0.014}
                  paintOrder="stroke"
                >
                  {hp.w}
                  <tspan fill="rgba(148,163,184,0.8)" fontSize={0.042}>
                    {` ${hp.c.toLocaleString()}×`}
                  </tspan>
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Neighbor panel (trained space only) */}
        {mode === 'space' && sel && (
          <div className="rounded-lg border border-line bg-ink-900/40 p-3">
            <div className="mb-2 text-2xs uppercase tracking-wider text-fg-faint">
              nearest to <span className="font-mono normal-case text-accent">{sel.w}</span> — cosine in
              full {DIMS}-dim space
            </div>
            <div className="space-y-1.5">
              {sel.nn.map(([w, s]) => {
                const plotted = byWord.has(w);
                return (
                  <button
                    key={w}
                    onClick={plotted ? () => setSelected(w) : undefined}
                    className={`block w-full text-left ${plotted ? 'cursor-pointer' : 'cursor-default'}`}
                    title={plotted ? `jump to ${w}` : `${w} is in the 10K vocab but not among the ${POINTS.length} plotted words`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-xs ${plotted ? 'text-fg' : 'text-fg-faint'}`}>
                        {w}
                        {!plotted && <span className="ml-1 text-2xs text-fg-faint">(not plotted)</span>}
                      </span>
                      <span className="font-mono text-2xs tabular text-fg-muted">{s.toFixed(3)}</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-ink-500">
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${Math.max(0, (s - 0.3) / 0.7) * 100}%`, background: LIVE }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-2xs leading-snug text-fg-faint">
              The list is computed in the original {DIMS}-dim space; the plot is a lossy 2D shadow.
              When they disagree, believe the list.
            </p>
          </div>
        )}
      </div>

      {mode === 'train' && (
        <p className="mt-2 text-2xs leading-snug text-fg-faint">
          Endpoints are the real projected vectors; the paths are schematic. The{' '}
          <span style={{ color: RARE }}>amber words</span> are the rarest in this sample (
          {RAREST.map((p) => `${p.w} ${p.c}×`).join(', ')}, vs 1,061,396× for “the”) — shown
          stalling short of a trained position, which is exactly what happens to rare tokens:
          too few gradient updates to move far from random init.
        </p>
      )}
    </div>
  );
}
