import { applyMerge, baseVocab, countPairs, mergeSyms, pretokenize, toWords, type Merge } from './tokenization.bpe';

/** Toy training corpus for the vocabulary-size lab. Small on purpose: every count is checkable. */
export const CORPUS =
  'the cook walked into the kitchen and looked at the stove. the soup was cooking slowly on the stove. ' +
  'the cook tasted the soup and added salt. then the cook tasted the soup again and added more salt. ' +
  'a waiter walked into the kitchen and asked for the soup. the cook looked at the waiter and said the soup was not ready. ' +
  'the waiter waited and watched the cook. the cook was cooking the soup slowly and tasting it again and again. ' +
  'then the cook added pepper and stirred the soup. the waiter asked again and the cook said wait. ' +
  'the waiter walked back to the tables and talked to the guests. the guests were waiting for the soup and they were not happy. ' +
  'the cook stirred the soup and tasted it and said it was ready. the waiter walked into the kitchen and the cook handed the waiter the soup. ' +
  'the waiter carried the soup to the tables and the guests tasted it. the guests looked at the waiter and said the soup was salty. ' +
  'the waiter walked back into the kitchen and the cook looked at the soup and tasted it again. ' +
  'the cook said the soup was not salty and the waiter said the guests were not happy. ' +
  'the cook started cooking a new soup slowly and the waiter waited again.';

/** The last word never appears in the corpus. */
export const SAMPLE = 'the waiter said the soup was overcooked';
export const RARE_INDEX = 6;

export interface Snapshot {
  /** Number of merges applied. */
  k: number;
  vocab: number;
  /** Sample sentence, one symbol list per word. */
  sample: string[][];
  sampleLen: number;
  corpusLen: number;
  /** Vocabulary entries that occur at most twice when the corpus is tokenized at this size. */
  rare: number;
  /** Vocabulary entries that no longer occur at all. */
  dead: number;
  /** The merge that produced this snapshot (undefined at k = 0). */
  merge?: Merge;
  mergeCount?: number;
}

/** Trains BPE to exhaustion on CORPUS and records the state after every merge. */
export function buildSnapshots(): { base: string[]; merges: Merge[]; snaps: Snapshot[]; corpusWords: number; corpusChars: number } {
  // A space is put in front of both texts so the first word is treated like every other word.
  let words = toWords(' ' + CORPUS);
  const base = baseVocab(words);
  const merges: Merge[] = [];
  let sample = pretokenize(' ' + SAMPLE).map((p) => Array.from(p));
  const vocab = [...base];
  const snaps: Snapshot[] = [];
  const snap = (merge?: Merge, mergeCount?: number) => {
    const seen = new Map<string, number>();
    let corpusLen = 0;
    for (const w of words) for (const s of w.syms) { seen.set(s, (seen.get(s) ?? 0) + 1); corpusLen++; }
    let rare = 0, dead = 0;
    for (const v of vocab) { const c = seen.get(v) ?? 0; if (c <= 2) rare++; if (c === 0) dead++; }
    snaps.push({
      k: merges.length, vocab: vocab.length, sample, sampleLen: sample.reduce((s, w) => s + w.length, 0),
      corpusLen, rare, dead, merge, mergeCount,
    });
  };
  snap();
  for (;;) {
    const top = countPairs(words)[0];
    if (!top) break;
    merges.push([top.a, top.b]);
    vocab.push(top.a + top.b);
    words = applyMerge(words, top.a, top.b);
    sample = sample.map((w) => mergeSyms(w, top.a, top.b));
    snap([top.a, top.b], top.count);
  }
  return { base, merges, snaps, corpusWords: words.length, corpusChars: snaps[0].corpusLen };
}
