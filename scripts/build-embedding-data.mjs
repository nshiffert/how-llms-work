// Regenerates src/components/islands/embeddingSpaceData.ts from the public
// word2vec 10K sample that ships with the TensorFlow Embedding Projector.
//
// Usage:
//   mkdir -p /tmp/emb && cd /tmp/emb
//   curl -sLO https://raw.githubusercontent.com/tensorflow/embedding-projector-standalone/master/oss_data/word2vec_10000_200d_tensors.bytes
//   curl -sLO https://raw.githubusercontent.com/tensorflow/embedding-projector-standalone/master/oss_data/word2vec_10000_200d_labels.tsv
//   node scripts/build-embedding-data.mjs /tmp/emb
//
// What it does: picks 75 anchor words in 12 semantic groups, finds each
// anchor's top-8 cosine neighbors over the FULL 10K vocabulary, unions
// anchors + top-6 neighbors into the plotted set (~313 words), computes
// top-8 neighbors for every plotted word, PCA-projects the 200-dim unit
// vectors of that set to 2D, and emits the whole thing as a typed TS module.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = process.argv[2] ?? '/tmp/emb';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(repoRoot, 'src/components/islands/embeddingSpaceData.ts');

const N = 10000, D = 200;
const buf = readFileSync(join(dataDir, 'word2vec_10000_200d_tensors.bytes'));
const raw = new Float32Array(buf.buffer, buf.byteOffset, N * D);

const lines = readFileSync(join(dataDir, 'word2vec_10000_200d_labels.tsv'), 'utf8')
  .trim().split('\n').slice(1);
const words = lines.map((l) => l.split('\t')[0]);
const counts = lines.map((l) => parseInt(l.split('\t')[1], 10));
const idx = new Map(words.map((w, i) => [w, i]));

const norms = new Float32Array(N);
for (let i = 0; i < N; i++) {
  let s = 0;
  for (let d = 0; d < D; d++) s += raw[i * D + d] ** 2;
  norms[i] = Math.sqrt(s);
}
const cos = (a, b) => {
  let s = 0;
  for (let d = 0; d < D; d++) s += raw[a * D + d] * raw[b * D + d];
  return s / (norms[a] * norms[b]);
};

// Curated anchors in clear semantic groups (all present in the 10K vocab).
const GROUPS = {
  royalty: ['king', 'queen', 'prince', 'princess', 'emperor'],
  family: ['man', 'woman', 'father', 'mother', 'son', 'daughter', 'brother', 'sister'],
  motion: ['run', 'running', 'walk', 'walking', 'walked', 'ran'],
  countries: ['france', 'germany', 'italy', 'japan', 'china', 'russia', 'england'],
  cities: ['paris', 'london', 'berlin', 'tokyo', 'moscow', 'rome'],
  numbers: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  time: ['monday', 'saturday', 'friday', 'sunday', 'january', 'june', 'october'],
  animals: ['dog', 'cat', 'horse', 'bird', 'fish', 'lion', 'bear'],
  science: ['physics', 'chemistry', 'biology', 'mathematics', 'science'],
  tech: ['computer', 'software', 'internet', 'digital', 'machine'],
  emotion: ['good', 'bad', 'happy', 'love', 'fear', 'anger'],
  water: ['water', 'river', 'sea', 'ocean', 'lake'],
};

const missing = Object.values(GROUPS).flat().filter((w) => !idx.has(w));
if (missing.length) throw new Error(`missing from vocab: ${missing.join(', ')}`);

function topK(i, k) {
  const sims = [];
  for (let j = 0; j < N; j++) {
    if (j === i || words[j] === 'UNK') continue;
    sims.push([j, cos(i, j)]);
  }
  sims.sort((a, b) => b[1] - a[1]);
  return sims.slice(0, k);
}

const anchorSet = new Map();
for (const [g, ws] of Object.entries(GROUPS)) for (const w of ws) anchorSet.set(w, g);

const chosen = new Map();
for (const [w, g] of anchorSet) chosen.set(w, g);
const neighborLists = {};
for (const [w] of anchorSet) {
  const nb = topK(idx.get(w), 8);
  neighborLists[w] = nb;
  for (const [j] of nb.slice(0, 6)) if (!chosen.has(words[j])) chosen.set(words[j], null);
}
const dataset = [...chosen.keys()];
for (const w of dataset) if (!neighborLists[w]) neighborLists[w] = topK(idx.get(w), 8);

// PCA to 2D on the plotted subset: center the unit vectors, take the top-2
// eigenvectors of X^T X via power iteration with deflation.
const M = dataset.length;
const X = new Float64Array(M * D);
for (let m = 0; m < M; m++) {
  const i = idx.get(dataset[m]);
  for (let d = 0; d < D; d++) X[m * D + d] = raw[i * D + d] / norms[i];
}
const mean = new Float64Array(D);
for (let m = 0; m < M; m++) for (let d = 0; d < D; d++) mean[d] += X[m * D + d] / M;
for (let m = 0; m < M; m++) for (let d = 0; d < D; d++) X[m * D + d] -= mean[d];

function powerIter(deflate) {
  let v = new Float64Array(D).map((_, d) => Math.sin(d + 1)); // deterministic init
  for (let it = 0; it < 200; it++) {
    const Xv = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      let s = 0;
      for (let d = 0; d < D; d++) s += X[m * D + d] * v[d];
      Xv[m] = s;
    }
    const w = new Float64Array(D);
    for (let m = 0; m < M; m++) for (let d = 0; d < D; d++) w[d] += X[m * D + d] * Xv[m];
    if (deflate) {
      let dp = 0;
      for (let d = 0; d < D; d++) dp += w[d] * deflate[d];
      for (let d = 0; d < D; d++) w[d] -= dp * deflate[d];
    }
    const n = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    v = w.map((x) => x / n);
  }
  return v;
}
const pc1 = powerIter(null);
const pc2 = powerIter(pc1);

const coords = dataset.map((w, m) => {
  let x = 0, y = 0;
  for (let d = 0; d < D; d++) {
    x += X[m * D + d] * pc1[d];
    y += X[m * D + d] * pc2[d];
  }
  return [x, y];
});
const maxAbs = Math.max(...coords.flat().map(Math.abs));
const sc = coords.map(([x, y]) => [+(x / maxAbs).toFixed(3), +(y / maxAbs).toFixed(3)]);

const points = dataset.map((w, m) => ({
  w,
  g: chosen.get(w),
  x: sc[m][0],
  y: sc[m][1],
  c: counts[idx.get(w)],
  nn: neighborLists[w].map(([j, s]) => [words[j], +s.toFixed(3)]),
}));

const header = `// Real word2vec embeddings — the 10,000-word × 200-dim public sample shipped with
// the TensorFlow Embedding Projector (oss_data/word2vec_10000_200d_*).
// GENERATED by scripts/build-embedding-data.mjs — edit and rerun that, not this.
// 75 curated anchor words in 12 semantic groups, plus each anchor's top cosine
// neighbors over the FULL 10K vocabulary (union = ${points.length} words).
//   x, y — PCA projection of the 200-dim unit vectors to 2D
//   nn   — top-8 nearest neighbors by cosine in the ORIGINAL 200-dim space
//   c    — the word's corpus frequency from the sample's labels file
// Neighbor similarities are real, verbatim: cos(king,queen)=0.689, cos(run,running)=0.736.

export interface EmbPoint {
  /** the word */
  w: string;
  /** anchor group id, or null if the word entered as someone's neighbor */
  g: string | null;
  x: number;
  y: number;
  /** corpus frequency in the 10K sample */
  c: number;
  /** top-8 neighbors in full 200-dim space: [word, cosine] */
  nn: [string, number][];
}

export const DIMS = ${D};
export const VOCAB = ${N};

export const POINTS: EmbPoint[] = ${JSON.stringify(points)};
`;
writeFileSync(outPath, header);
console.log(`wrote ${outPath} — ${points.length} points, ${header.length} bytes`);
console.log('spot checks:');
for (const w of ['king', 'run', 'paris']) {
  const p = points.find((p) => p.w === w);
  console.log(` ${w} ->`, p.nn.slice(0, 4).map(([n, s]) => `${n}:${s}`).join('  '));
}
