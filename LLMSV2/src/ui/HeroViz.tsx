import { useRef, useState } from 'react';
import { STAGES } from '../engine/curriculum';
import { softmax, useRaf } from './kit';

/**
 * The course in one looping picture: a prompt is cut into tokens, the tokens
 * become vectors, the vectors attend to each other, and a distribution over
 * the next token comes out and one token is sampled.
 */
const PROMPT = ['The', ' cat', ' sat', ' on', ' the'];
const NEXT = [' mat', ' sofa', ' floor', ' roof', ' moon'];
const LOGITS = [3.1, 2.2, 1.7, 0.6, -0.4];
const W = 560;
const H = 450;
const CYCLE = 9;

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export default function HeroViz() {
  const [t, setT] = useState(0);
  const last = useRef(0);
  useRaf((time) => {
    // ~30fps is plenty and keeps the page cool.
    if (time - last.current < 0.033) return;
    last.current = time;
    setT(time % CYCLE);
  });

  const xs = PROMPT.map((_, i) => 112 + i * 80);
  const pTok = seg(t, 0.2, 1.4); // chips appear
  const pVec = seg(t, 1.6, 2.8); // chips fall into vectors
  const pAtt = seg(t, 3.0, 4.6); // attention arcs
  const pOut = seg(t, 4.8, 6.0); // bars grow
  const pPick = seg(t, 6.6, 7.4); // sample
  const fade = 1 - seg(t, 8.3, 9);
  const probs = softmax(LOGITS);
  const att = [0.08, 0.34, 0.3, 0.2, 0.08];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Animation: a prompt becomes tokens, vectors, attention, and a next-token distribution" style={{ opacity: fade }}>
      <defs>
        <linearGradient id="hv-g" x1="0" x2="1">
          <stop offset="0" stopColor="#46e0f0" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <filter id="hv-glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* stage labels down the left */}
      {['tokens', 'vectors', 'attention', 'scores → words'].map((s, i) => (
        <text key={s} x={14} y={[50, 122, 222, 300][i]} fill="#7a819e" fontSize="11" fontFamily="var(--mono)" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
          opacity={[pTok, pVec, pAtt, pOut][i] * 0.9}>{s}</text>
      ))}

      {/* tokens */}
      {PROMPT.map((w, i) => {
        const a = seg(pTok, i * 0.15, i * 0.15 + 0.4);
        return (
          <g key={i} opacity={a} transform={`translate(${xs[i]}, ${80 - (1 - a) * 14})`}>
            <rect x={-34} y={-15} width={68} height={30} rx={8} fill={STAGES[i % 6].hue} fillOpacity={0.16} stroke={STAGES[i % 6].hue} strokeOpacity={0.7} />
            <text textAnchor="middle" y={5} fill="#fff" fontSize="14" fontFamily="var(--mono)">{w.trim()}</text>
          </g>
        );
      })}

      {/* vectors: a column of cells per token */}
      {PROMPT.map((_, i) => (
        <g key={i} opacity={pVec} transform={`translate(${xs[i] - 9}, ${130 + (1 - pVec) * -30})`}>
          {[0, 1, 2, 3].map((k) => {
            const v = Math.sin(i * 2.1 + k * 1.7 + t * 0.8) * 0.5 + 0.5;
            return <rect key={k} y={k * 12} width={18} height={10} rx={2.5} fill={STAGES[i % 6].hue} fillOpacity={0.2 + v * 0.75} />;
          })}
        </g>
      ))}

      {/* attention arcs: the last token gathers from the others */}
      {PROMPT.map((_, i) => {
        if (i === 4) return null;
        const x1 = xs[i], x2 = xs[4], y = 195;
        const d = `M ${x1} ${y} C ${x1} ${y + 70 + (4 - i) * 6}, ${x2} ${y + 70 + (4 - i) * 6}, ${x2} ${y}`;
        return (
          <path key={i} d={d} fill="none" stroke="url(#hv-g)" strokeWidth={1 + att[i] * 14} strokeLinecap="round"
            strokeOpacity={pAtt * (0.25 + att[i] * 1.8)} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - pAtt} filter="url(#hv-glow)" />
        );
      })}
      {/* travelling pulses */}
      {pAtt > 0.9 && PROMPT.slice(0, 4).map((_, i) => {
        const u = (t * 0.55 + i * 0.23) % 1;
        const x1 = xs[i], x2 = xs[4], y = 195, c = y + 70 + (4 - i) * 6;
        const b = (a: number, p1: number, p2: number, d2: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3 * d2;
        return <circle key={i} cx={b(x1, x1, x2, x2)} cy={b(y, c, c, y)} r={2 + att[i] * 6} fill="#fff" opacity={0.85 * (1 - pPick * 0.6)} />;
      })}

      {/* output distribution */}
      {NEXT.map((w, i) => {
        const y = 318 + i * 24;
        const picked = i === 0 && pPick > 0;
        return (
          <g key={w} opacity={pOut * (pPick > 0 && i !== 0 ? 1 - pPick * 0.65 : 1)}>
            <text x={150} y={y + 4} textAnchor="end" fill={picked ? '#fff' : '#b4bad3'} fontSize="13" fontFamily="var(--mono)">{w.trim()}</text>
            <rect x={160} y={y - 8} width={300} height={15} rx={5} fill="#fff" fillOpacity={0.05} />
            <rect x={160} y={y - 8} width={300 * (probs[i] / probs[0]) * pOut} height={15} rx={5} fill="url(#hv-g)" filter={picked ? 'url(#hv-glow)' : undefined} />
            <text x={470} y={y + 4} fill="#7a819e" fontSize="11" fontFamily="var(--mono)">{(probs[i] * 100).toFixed(0)}%</text>
          </g>
        );
      })}
      {/* connector from the last token down to the distribution */}
      <path d={`M ${xs[4]} 200 L ${xs[4]} 286 L 310 286 L 310 304`} fill="none" stroke="#a78bfa" strokeOpacity={0.5 * pOut} strokeDasharray="3 5" />

      {/* sampled token flies up to join the prompt */}
      {pPick > 0 && (
        <g transform={`translate(${150 + (xs[4] + 80 - 150) * pPick}, ${322 + (80 - 322) * pPick})`} opacity={pPick}>
          <rect x={-30} y={-15} width={60} height={30} rx={8} fill="#f472b6" fillOpacity={0.25} stroke="#f472b6" filter="url(#hv-glow)" />
          <text textAnchor="middle" y={5} fill="#fff" fontSize="14" fontFamily="var(--mono)">mat</text>
        </g>
      )}
    </svg>
  );
}
