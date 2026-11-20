/** Real quantization arithmetic for the QLoRA lab. */

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

export const BLOCK = 64;

/**
 * `count` bell-shaped weights (seeded Gaussian), processed the way block-wise
 * quantizers do: each block of 64 is divided by its largest magnitude, so every
 * value lands in [-1, 1]. Returns the scaled weights.
 */
export function makeWeights(count = 4096, seed = 11): Float64Array {
  const rand = prng(seed);
  const w = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.max(1e-12, rand());
    w[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }
  for (let b = 0; b < count; b += BLOCK) {
    let mx = 0;
    for (let i = b; i < Math.min(count, b + BLOCK); i++) mx = Math.max(mx, Math.abs(w[i]));
    for (let i = b; i < Math.min(count, b + BLOCK); i++) w[i] /= mx;
  }
  return w;
}

/** Inverse of the standard normal CDF (Acklam's rational approximation, error below 1.2e-9). */
export function probit(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -probit(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export type Scheme = 'even' | 'normal';

/**
 * 2^bits levels in [-1, 1], ascending.
 * even:   equal gaps.
 * normal: the centres of 2^bits equal-probability slices of a bell curve,
 *         rescaled so the outermost levels sit at -1 and +1.
 */
export function makeLevels(bits: number, scheme: Scheme): Float64Array {
  const n = 2 ** bits;
  const L = new Float64Array(n);
  if (scheme === 'even') {
    for (let i = 0; i < n; i++) L[i] = -1 + (2 * i) / (n - 1);
  } else {
    for (let i = 0; i < n; i++) L[i] = probit((i + 0.5) / n);
    const top = L[n - 1];
    for (let i = 0; i < n; i++) L[i] /= top;
  }
  return L;
}

/** Index of the nearest level (levels ascending). */
export function nearest(L: Float64Array, x: number): number {
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (L[mid] <= x) lo = mid; else hi = mid;
  }
  return x - L[lo] <= L[hi] - x ? lo : hi;
}

/** Snap every weight to its nearest level. Returns mean squared error and how many weights landed on each level. */
export function quantize(w: Float64Array, L: Float64Array) {
  const counts = new Float64Array(L.length);
  let se = 0;
  for (let i = 0; i < w.length; i++) {
    const k = nearest(L, w[i]);
    counts[k]++;
    se += (w[i] - L[k]) ** 2;
  }
  return { mse: se / w.length, counts };
}

export const variance = (w: Float64Array) => {
  let m = 0;
  for (const x of w) m += x;
  m /= w.length;
  let v = 0;
  for (const x of w) v += (x - m) ** 2;
  return v / w.length;
};
