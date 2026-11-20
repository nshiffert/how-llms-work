/**
 * A small, real byte-pair-encoding trainer shared by the tokenization and
 * vocabulary-handling labs. It works on characters instead of bytes, and
 * follows the GPT convention that a space is glued to the front of the word
 * after it. The space is written as SP ("·") so it stays visible in chips.
 */

export const SP = '·';

export interface Word {
  /** Current symbols of this word. Starts as single characters. */
  syms: string[];
}

export interface PairCount {
  a: string;
  b: string;
  count: number;
}

export type Merge = [string, string];

/** "the cat" -> ["the", "·cat"]. Punctuation becomes its own piece. */
export function pretokenize(text: string): string[] {
  const out: string[] = [];
  const re = /\s*(?:[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}])|\s+/gu;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const body = raw.replace(/^\s+/, '');
    const lead = raw.length > body.length ? SP : '';
    if (body === '') {
      if (out.length) out.push(SP);
    } else {
      out.push(lead + body);
    }
  }
  return out;
}

export function toWords(text: string): Word[] {
  return pretokenize(text).map((p) => ({ syms: Array.from(p) }));
}

/** Adjacent pairs inside words, most frequent first. Ties: first seen wins. */
export function countPairs(words: Word[]): PairCount[] {
  const map = new Map<string, PairCount>();
  for (const w of words) {
    for (let i = 0; i < w.syms.length - 1; i++) {
      const key = w.syms[i] + '\u0000' + w.syms[i + 1];
      const hit = map.get(key);
      if (hit) hit.count++;
      else map.set(key, { a: w.syms[i], b: w.syms[i + 1], count: 1 });
    }
  }
  // Array.prototype.sort is stable, so insertion order breaks ties.
  return [...map.values()].sort((x, y) => y.count - x.count);
}

export function mergeSyms(syms: string[], a: string, b: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < syms.length; i++) {
    if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) {
      out.push(a + b);
      i++;
    } else {
      out.push(syms[i]);
    }
  }
  return out;
}

export function applyMerge(words: Word[], a: string, b: string): Word[] {
  return words.map((w) => ({ syms: mergeSyms(w.syms, a, b) }));
}

/** Distinct single characters, in order of first appearance. */
export function baseVocab(words: Word[]): string[] {
  const seen = new Set<string>();
  for (const w of words) for (const s of w.syms) seen.add(s);
  return [...seen];
}

/** Train until `max` merges, or until no pair occurs at least `minCount` times. */
export function train(text: string, max: number, minCount = 1): { base: string[]; merges: Merge[]; counts: number[] } {
  let words = toWords(text);
  const base = baseVocab(words);
  const merges: Merge[] = [];
  const counts: number[] = [];
  while (merges.length < max) {
    const top = countPairs(words)[0];
    if (!top || top.count < minCount) break;
    merges.push([top.a, top.b]);
    counts.push(top.count);
    words = applyMerge(words, top.a, top.b);
  }
  return { base, merges, counts };
}

/** Tokenize new text with the first `k` learned merges, applied in the order they were learned. */
export function encode(text: string, merges: Merge[], k = merges.length): string[][] {
  return pretokenize(text).map((p) => {
    let syms = Array.from(p);
    for (let i = 0; i < k && syms.length > 1; i++) syms = mergeSyms(syms, merges[i][0], merges[i][1]);
    return syms;
  });
}
