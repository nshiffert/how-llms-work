/**
 * Data and geometry for the embeddings lab.
 * FINAL is a hand-placed 2D layout, built so that related words share a
 * direction from the origin and so that a few offsets repeat exactly:
 * royal = [0.08, 0.34], female = [0.24, -0.06], capital = [0.18, -0.22].
 * Real embeddings are learned and have hundreds or thousands of dimensions.
 */

export type Vec = [number, number];
export type GroupId = 'people' | 'places' | 'animals' | 'actions';

export interface WordPoint {
  w: string;
  g: GroupId;
  /** Hand-placed final position. */
  f: Vec;
}

export const GROUPS: { id: GroupId; label: string; color: string }[] = [
  { id: 'people', label: 'people', color: '#fbbf24' },
  { id: 'places', label: 'countries and capitals', color: '#46e0f0' },
  { id: 'animals', label: 'animals', color: '#4ade80' },
  { id: 'actions', label: 'actions', color: '#f472b6' },
];

export const WORDS: WordPoint[] = [
  { w: 'man', g: 'people', f: [0.3, 0.42] },
  { w: 'woman', g: 'people', f: [0.54, 0.36] },
  { w: 'king', g: 'people', f: [0.38, 0.76] },
  { w: 'queen', g: 'people', f: [0.62, 0.7] },
  { w: 'boy', g: 'people', f: [0.2, 0.26] },
  { w: 'girl', g: 'people', f: [0.44, 0.2] },
  { w: 'prince', g: 'people', f: [0.28, 0.6] },
  { w: 'princess', g: 'people', f: [0.52, 0.54] },

  { w: 'France', g: 'places', f: [0.5, -0.22] },
  { w: 'Paris', g: 'places', f: [0.68, -0.44] },
  { w: 'Japan', g: 'places', f: [0.3, -0.46] },
  { w: 'Tokyo', g: 'places', f: [0.48, -0.68] },
  { w: 'Italy', g: 'places', f: [0.74, -0.12] },
  { w: 'Rome', g: 'places', f: [0.92, -0.34] },
  { w: 'Egypt', g: 'places', f: [0.14, -0.62] },
  { w: 'Cairo', g: 'places', f: [0.32, -0.84] },

  { w: 'cat', g: 'animals', f: [-0.55, 0.42] },
  { w: 'dog', g: 'animals', f: [-0.44, 0.54] },
  { w: 'lion', g: 'animals', f: [-0.76, 0.3] },
  { w: 'tiger', g: 'animals', f: [-0.86, 0.44] },
  { w: 'horse', g: 'animals', f: [-0.66, 0.66] },
  { w: 'wolf', g: 'animals', f: [-0.36, 0.74] },
  { w: 'bird', g: 'animals', f: [-0.82, 0.7] },

  { w: 'run', g: 'actions', f: [-0.5, -0.4] },
  { w: 'walk', g: 'actions', f: [-0.66, -0.34] },
  { w: 'jump', g: 'actions', f: [-0.38, -0.56] },
  { w: 'swim', g: 'actions', f: [-0.56, -0.62] },
  { w: 'eat', g: 'actions', f: [-0.8, -0.52] },
  { w: 'drink', g: 'actions', f: [-0.88, -0.7] },
  { w: 'sleep', g: 'actions', f: [-0.68, -0.8] },
];

export const INDEX: Record<string, number> = Object.fromEntries(WORDS.map((p, i) => [p.w, i]));

/** Seeded random start: every coordinate uniform in [-0.9, 0.9], plus a per-word start delay. */
export function noiseLayout(rand: () => number): { start: Vec[]; delay: number[] } {
  const start: Vec[] = [];
  const delay: number[] = [];
  for (let i = 0; i < WORDS.length; i++) {
    start.push([rand() * 1.8 - 0.9, rand() * 1.8 - 0.9]);
    delay.push(rand() * 0.3);
  }
  return { start, delay };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Displayed positions at training progress t in [0, 1]. An interpolation, not a training run. */
export function layoutAt(t: number, start: Vec[], delay: number[]): Vec[] {
  return WORDS.map((p, i) => {
    const local = Math.max(0, Math.min(1, (t - delay[i]) / 0.7));
    const e = smooth(local);
    return [start[i][0] + (p.f[0] - start[i][0]) * e, start[i][1] + (p.f[1] - start[i][1]) * e];
  });
}

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
export const norm = (a: Vec) => Math.hypot(a[0], a[1]);
export const cosine = (a: Vec, b: Vec) => {
  const d = norm(a) * norm(b);
  return d < 1e-9 ? 0 : dot(a, b) / d;
};

/** A − B + C, and the other words ranked by straight-line distance to the result. */
export function analogy(pos: Vec[], a: number, b: number, c: number) {
  const mid: Vec = [pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]];
  const res: Vec = [mid[0] + pos[c][0], mid[1] + pos[c][1]];
  const ranked = pos
    .map((p, i) => ({ i, d: Math.hypot(p[0] - res[0], p[1] - res[1]) }))
    .filter((x) => x.i !== a && x.i !== b && x.i !== c)
    .sort((x, y) => x.d - y.d);
  return { mid, res, ranked };
}
