/**
 * A real, tiny retrieval pipeline for the RAG lab: tokenise, TF-IDF, cosine.
 * Nothing here is simulated. Real systems replace the TF-IDF vector with one
 * produced by a learned embedding model; the rest of the pipeline is the same.
 */

export interface Chunk {
  id: string;
  title: string;
  text: string;
}

export const CORPUS: Chunk[] = [
  { id: 'hours', title: 'Support hours', text: 'Support office hours are Monday to Friday, 9am to 6pm Eastern. The office is closed on public holidays.' },
  { id: 'ship-std', title: 'Standard shipping', text: 'Standard shipping takes 3 to 5 business days. Orders over $50 ship free.' },
  { id: 'ship-exp', title: 'Express shipping', text: 'Express shipping takes 1 to 2 business days and costs $12. Express orders placed before noon ship the same day.' },
  { id: 'ship-intl', title: 'International orders', text: 'International orders ship to Canada and the UK. Delivery takes 7 to 14 business days. Duties are paid by the customer.' },
  { id: 'warranty', title: 'Warranty', text: 'All tents and backpacks carry a 2 year warranty against defects in materials and stitching. Damage from normal wear is not covered.' },
  { id: 'repairs', title: 'Repairs', text: 'Gear that is out of warranty can be repaired in our workshop for a flat fee of $25 plus parts. Repairs take about 3 weeks.' },
  { id: 'returns', title: 'Returns (current)', text: 'Unused items can be returned within 30 days of delivery for a full refund. Return shipping is free with the prepaid label.' },
  { id: 'returns-old', title: 'Returns (2022 archive)', text: 'Items can be returned within 14 days of delivery for a refund. The customer pays for return shipping.' },
  { id: 'exchange', title: 'Exchanges', text: 'To swap an item for a different size, start an exchange within 30 days. The replacement ships once the carrier scans the original.' },
  { id: 'payment', title: 'Payment', text: 'We accept Visa, Mastercard, PayPal and gift cards. Gift cards cannot be used to buy other gift cards.' },
];

const STOP = new Set(
  ('a an and are as at be by can do does for from have how i if in is it my of on or our that the there to we what when ' +
    'where which who will with you your not no so than then this was were am me us they them their its about into out up ' +
    'get got any some all would could should did much many long take takes').split(' '),
);

/** Lowercase, split on anything that is not a letter or digit, drop stop words, strip a plural "s". */
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOP.has(w))
    .map(stem);
}
export function stem(w: string): string {
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
/** Every word of the raw text, with whether it survived and what it became. */
export function explainTokens(text: string, vocab: Map<string, number>) {
  return text
    .split(/[^A-Za-z0-9$']+/)
    .filter(Boolean)
    .map((raw) => {
      const lw = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!lw || STOP.has(lw)) return { raw, term: null as string | null, status: 'stop' as const };
      const term = stem(lw);
      return { raw, term, status: vocab.has(term) ? ('hit' as const) : ('oov' as const) };
    });
}

export interface Index {
  vocab: Map<string, number>; // term -> dimension
  terms: string[];
  idf: number[];
  vectors: number[][]; // one TF-IDF vector per chunk
}

export function buildIndex(chunks: Chunk[]): Index {
  const docs = chunks.map((c) => tokenise(c.title + ' ' + c.text));
  const vocab = new Map<string, number>();
  for (const d of docs) for (const t of d) if (!vocab.has(t)) vocab.set(t, vocab.size);
  const terms = [...vocab.keys()];
  const df = new Array(terms.length).fill(0);
  for (const d of docs) for (const t of new Set(d)) df[vocab.get(t)!]++;
  // Smoothed inverse document frequency: rare terms count for more.
  const idf = df.map((n) => Math.log((chunks.length + 1) / (n + 1)) + 1);
  const vectors = docs.map((d) => vectorise(d, vocab, idf));
  return { vocab, terms, idf, vectors };
}

function vectorise(tokens: string[], vocab: Map<string, number>, idf: number[]): number[] {
  const v = new Array(idf.length).fill(0);
  for (const t of tokens) {
    const i = vocab.get(t);
    if (i !== undefined) v[i] += idf[i]; // term count × idf
  }
  return v;
}

export function embedQuery(q: string, index: Index): number[] {
  return vectorise(tokenise(q), index.vocab, index.idf);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export interface Preset {
  id: string;
  label: string;
  q: string;
  /** The chunk that holds the correct, current answer. */
  truth: string;
}

export const PRESETS: Preset[] = [
  { id: 'std', label: 'Standard shipping', q: 'How long does standard shipping take?', truth: 'ship-std' },
  { id: 'syn', label: 'Money back (synonym)', q: 'Can I get my money back on an order?', truth: 'returns' },
  { id: 'lex', label: 'Refund (handbook wording)', q: 'Can I get a full refund on an order?', truth: 'returns' },
  { id: 'pay', label: 'Delivery charge', q: 'Do I pay for delivery on a big order?', truth: 'ship-std' },
  { id: 'ret', label: 'Return window', q: 'How many days do I have to return an item?', truth: 'returns' },
];

/** Pairs of chunks that state different answers to the same question. */
export const CONFLICTS: [string, string][] = [['returns', 'returns-old']];
