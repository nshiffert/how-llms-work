/**
 * The belief rule behind the few-shot lab. This is a SIMULATION with a stated
 * rule, not a measurement of any model: each demonstration in the prompt adds
 * fixed amounts of evidence (in logits) and a softmax turns the totals into a
 * distribution over three possible outputs.
 */

export type Sentiment = 'pos' | 'neg';
export type Label = 'KIV' | 'ZOR';

export interface Example {
  id: string;
  text: string;
  sentiment: Sentiment;
}

/** The house scheme the instruction never states: positive → KIV, negative → ZOR. */
export const TRUE_LABEL: Record<Sentiment, Label> = { pos: 'KIV', neg: 'ZOR' };
export const other = (l: Label): Label => (l === 'KIV' ? 'ZOR' : 'KIV');

export const POOL: Example[] = [
  { id: 'n1', sentiment: 'neg', text: 'Arrived cracked and support never replied.' },
  { id: 'p1', sentiment: 'pos', text: 'Setup took two minutes and it just works.' },
  { id: 'n2', sentiment: 'neg', text: 'Stopped charging after a week.' },
  { id: 'p2', sentiment: 'pos', text: 'Best purchase I have made this year.' },
  { id: 'n3', sentiment: 'neg', text: 'Too loud, and the app keeps crashing.' },
  { id: 'p3', sentiment: 'pos', text: 'Quiet, fast, and the battery lasts for days.' },
];

export const TEST = { text: 'The screen flickers and the battery died in two days.', sentiment: 'neg' as Sentiment };
export const CORRECT: Label = TRUE_LABEL[TEST.sentiment];
export const INSTRUCTION = 'Tag each customer review with its house code.';

/** Evidence weights, in logits. Chosen for illustration. */
export const W = {
  otherStart: 4.0, // with no examples, free text ("negative", a sentence) is the likely output
  format: 1.2, // each example lowers "other": it shows the answer is a bare code
  freq: 0.5, // each example carrying a label makes that label more likely, whatever the input
  match: 1.4, // each example whose review resembles the test review supports the label it carries
  recency: 0.4, // the label of the last example gets a small extra push
};

export interface Shot {
  ex: Example;
  label: Label; // the label as shown in the prompt (may be flipped)
}

export interface Belief {
  logits: { KIV: number; ZOR: number; other: number };
  parts: Record<Label, { freq: number; match: number; recency: number }>;
  p: { KIV: number; ZOR: number; other: number };
}

export function belief(shots: Shot[]): Belief {
  const parts: Belief['parts'] = { KIV: { freq: 0, match: 0, recency: 0 }, ZOR: { freq: 0, match: 0, recency: 0 } };
  shots.forEach((s, i) => {
    parts[s.label].freq += W.freq;
    if (s.ex.sentiment === TEST.sentiment) parts[s.label].match += W.match;
    if (i === shots.length - 1) parts[s.label].recency += W.recency;
  });
  const sum = (l: Label) => parts[l].freq + parts[l].match + parts[l].recency;
  const logits = { KIV: sum('KIV'), ZOR: sum('ZOR'), other: W.otherStart - W.format * shots.length };
  const m = Math.max(logits.KIV, logits.ZOR, logits.other);
  const e = { KIV: Math.exp(logits.KIV - m), ZOR: Math.exp(logits.ZOR - m), other: Math.exp(logits.other - m) };
  const z = e.KIV + e.ZOR + e.other;
  return { logits, parts, p: { KIV: e.KIV / z, ZOR: e.ZOR / z, other: e.other / z } };
}

export function buildPrompt(shots: Shot[]): string {
  return (
    INSTRUCTION +
    '\n\n' +
    shots.map((s) => `Review: ${s.ex.text}\nCode: ${s.label}\n\n`).join('') +
    `Review: ${TEST.text}\nCode:`
  );
}
