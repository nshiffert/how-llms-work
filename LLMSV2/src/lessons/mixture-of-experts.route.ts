/**
 * Routing maths for the Mixture of Experts lab. Pure functions, no React.
 *
 * Every token has a fixed, seeded vector of 32 router scores (standard normal
 * numbers standing in for what a learned router would output). The router's
 * decision is computed for real: add the skew bias, softmax over the first N
 * scores, keep the k largest, renormalise the kept weights.
 */

export const BATCH = 512;
export const MAX_EXPERTS = 32;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SCORES[t][e]: router score of token t for expert e, before any skew. */
export const SCORES: number[][] = (() => {
  const r = prng(20240611);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: BATCH }, () => Array.from({ length: MAX_EXPERTS }, gauss));
})();

/**
 * How much the skew control favours each expert. Only the first four are
 * favoured, so the same experts are favoured at every N.
 */
export const PREF: number[] = Array.from({ length: MAX_EXPERTS }, (_, e) => [0.35, 1, 0.1, 0.6][e] ?? 0);

export interface Routing {
  /** chosen[t] = indices of the k experts token t is sent to, best first. */
  chosen: number[][];
  /** load[e] = number of tokens in the batch that expert e processed. */
  load: number[];
  /** Bias the load-balancing pressure added to each expert's score (all zero when it is off). */
  corr: number[];
}

function topK(logits: number[], k: number): number[] {
  const idx = logits.map((_, i) => i);
  idx.sort((a, b) => logits[b] - logits[a]);
  return idx.slice(0, k);
}

export function logitsFor(t: number, n: number, skew: number, corr: number[]): number[] {
  const s = SCORES[t % BATCH];
  const out = new Array<number>(n);
  for (let e = 0; e < n; e++) out[e] = s[e] + skew * PREF[e] + corr[e];
  return out;
}

function assign(n: number, k: number, skew: number, corr: number[]) {
  const load = new Array<number>(n).fill(0);
  const chosen: number[][] = [];
  for (let t = 0; t < BATCH; t++) {
    const c = topK(logitsFor(t, n, skew, corr), k);
    chosen.push(c);
    for (const e of c) load[e]++;
  }
  return { chosen, load };
}

/**
 * Routes the whole batch. With `balance` on, it imitates what a load-balancing
 * loss does during training: any expert above its fair share has its router
 * bias pushed down, any expert below has it pushed up, repeated until the
 * loads settle.
 */
export function route(n: number, k: number, skew: number, balance: boolean): Routing {
  const corr = new Array<number>(n).fill(0);
  if (balance && k < n) {
    const fair = (BATCH * k) / n;
    for (let step = 0; step < 120; step++) {
      const { load } = assign(n, k, skew, corr);
      const lr = 0.6 / (1 + step * 0.05);
      for (let e = 0; e < n; e++) corr[e] -= lr * (load[e] / fair - 1);
    }
  }
  return { ...assign(n, k, skew, corr), corr };
}

export function softmaxOf(logits: number[]): number[] {
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / s);
}
