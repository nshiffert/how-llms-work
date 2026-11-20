/** Real linear algebra for the LoRA lab: a seeded, approximately low-rank matrix and its SVD. */

export type Mat = number[][];

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

function gauss(rand: () => number) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** k orthonormal vectors of length n (Gram-Schmidt on seeded Gaussian vectors). */
function orthonormal(n: number, k: number, rand: () => number): Mat {
  const out: Mat = [];
  for (let j = 0; j < k; j++) {
    const v = Array.from({ length: n }, () => gauss(rand));
    for (const u of out) {
      const d = v.reduce((s, x, i) => s + x * u[i], 0);
      for (let i = 0; i < n; i++) v[i] -= d * u[i];
    }
    const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    out.push(v.map((x) => x / len));
  }
  return out;
}

/**
 * The "ideal update": a sum of rank-1 pieces whose strengths halve each time,
 * plus a little noise, so it is approximately (not exactly) low-rank.
 */
export function makeDelta(n = 16, seed = 7, pieces = 8, decay = 0.5, noise = 0.04): Mat {
  const rand = prng(seed);
  const U = orthonormal(n, pieces, rand);
  const V = orthonormal(n, pieces, rand);
  const D: Mat = Array.from({ length: n }, () => Array(n).fill(0));
  for (let k = 0; k < pieces; k++) {
    const s = 10 * Math.pow(decay, k);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i][j] += s * U[k][i] * V[k][j];
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i][j] += noise * gauss(rand);
  return D;
}

/** Singular value decomposition by one-sided Jacobi rotations. Returns columns of U and V as arrays, S descending. */
export function svd(M: Mat): { U: Mat; S: number[]; V: Mat } {
  const m = M.length;
  const n = M[0].length;
  const A = M.map((r) => r.slice());
  const V: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += A[i][p] * A[i][p];
          beta += A[i][q] * A[i][q];
          gamma += A[i][p] * A[i][q];
        }
        if (Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
        off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta));
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const x = A[i][p], y = A[i][q];
          A[i][p] = c * x - s * y;
          A[i][q] = s * x + c * y;
        }
        for (let i = 0; i < n; i++) {
          const x = V[i][p], y = V[i][q];
          V[i][p] = c * x - s * y;
          V[i][q] = s * x + c * y;
        }
      }
    }
    if (off < 1e-13) break;
  }
  const cols = Array.from({ length: n }, (_, j) => {
    const s = Math.sqrt(A.reduce((acc, r) => acc + r[j] * r[j], 0));
    return { s, u: A.map((r) => (s > 0 ? r[j] / s : 0)), v: V.map((r) => r[j]) };
  }).sort((a, b) => b.s - a.s);
  return { U: cols.map((c) => c.u), S: cols.map((c) => c.s), V: cols.map((c) => c.v) };
}

export const frob = (M: Mat) => Math.sqrt(M.reduce((s, r) => s + r.reduce((t, x) => t + x * x, 0), 0));

/**
 * Best rank-r factorisation: B = first r left vectors scaled by their strengths (n×r),
 * A = first r right vectors (r×n). The error is computed from the actual difference.
 */
export function factor(D: Mat, dec: { U: Mat; S: number[]; V: Mat }, r: number) {
  const n = D.length;
  const B: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: r }, (_, k) => dec.U[k][i] * dec.S[k]));
  const A: Mat = Array.from({ length: r }, (_, k) => dec.V[k].slice());
  const BA: Mat = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0;
      for (let k = 0; k < r; k++) s += B[i][k] * A[k][j];
      return s;
    }),
  );
  const E: Mat = D.map((row, i) => row.map((x, j) => x - BA[i][j]));
  return { B, A, BA, E, err: frob(E) / frob(D) };
}
