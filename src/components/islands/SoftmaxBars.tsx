import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { scaleLinear } from 'd3';

// Placeholder island for the Attention "mechanic" section. It is a real,
// working softmax-with-temperature demo (the exact step that lives inside
// attention), built specifically to prove the island pipeline end to end:
//   React state + Framer Motion animation + a D3 scale, all hydrating from a
//   static build. Phase 2 replaces this with the full Q/K/V walkthrough.

const TOKENS = ['The', 'cat', 'sat', 'on', 'mat'];
const BASE_SCORES = [1.2, 3.8, 0.4, 2.1, 0.9]; // pretend Q·K/√d scores

function softmax(scores: number[], temp: number): number[] {
  const t = Math.max(temp, 0.01);
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export default function SoftmaxBars() {
  const [temp, setTemp] = useState(1);
  const probs = useMemo(() => softmax(BASE_SCORES, temp), [temp]);

  // D3 scale: probability -> bar width in %. Proves d3 bundles into the island.
  const width = useMemo(() => scaleLinear().domain([0, 1]).range([0, 100]), []);
  const top = probs.indexOf(Math.max(...probs));

  return (
    <div className="font-sans">
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="temp" className="text-xs font-medium text-fg-muted">
          temperature
        </label>
        <input
          id="temp"
          type="range"
          min={0.1}
          max={2}
          step={0.05}
          value={temp}
          onChange={(e) => setTemp(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-500 accent-[#6ea8fe]"
        />
        <span className="tabular w-12 text-right font-mono text-sm text-live">
          {temp.toFixed(2)}
        </span>
      </div>

      <div className="space-y-1.5">
        {TOKENS.map((tok, i) => (
          <div key={tok} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-right font-mono text-xs text-fg-muted">
              {tok}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-ink-600">
              <motion.div
                className="absolute inset-y-0 left-0 rounded"
                style={{
                  background:
                    i === top ? '#5eead4' : 'rgba(110,168,254,0.55)',
                }}
                animate={{ width: `${width(probs[i])}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              />
            </div>
            <span className="tabular w-14 text-right font-mono text-xs text-fg">
              {(probs[i] * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-fg-faint">
        Same scores{' '}
        <code className="rounded bg-ink-600 px-1 font-mono text-fg-muted">
          [{BASE_SCORES.join(', ')}]
        </code>
        . Low temperature sharpens toward the winner; high temperature flattens
        toward uniform. This is the softmax inside step&nbsp;4 of attention.
      </p>
    </div>
  );
}
