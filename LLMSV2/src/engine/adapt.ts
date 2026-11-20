import type { Level, Question } from './types';
import { pCorrect, type LearnerState, type LessonState } from './learner';

/**
 * Pacing rules. These are heuristics, and the UI says so: the research behind
 * "aim for roughly 80% success" is suggestive for humans, not settled.
 */

export const TARGET_P = 0.8;
export const MIN_CHECKS = 3;
export const MAX_CHECKS = 6;

export type Lane = 'guided' | 'standard' | 'fast';

/** Which path through the lesson to offer after the opening prediction. */
export function chooseLane(ls: LessonState, hookCorrect: boolean): Lane {
  if (hookCorrect && ls.theta >= 0.6) return 'fast';
  if (!hookCorrect && ls.theta <= -0.3) return 'guided';
  return hookCorrect ? 'standard' : 'guided';
}

const guessRate = (q: Question) => (q.kind === 'mcq' ? 1 / q.options.length : 0.02);

/**
 * Pick the next check question: among unasked items, the one whose predicted
 * success is closest to the target, nudged by what just happened.
 */
export function nextQuestion(
  bank: Question[],
  asked: string[],
  ls: LessonState,
  last: { ok: boolean; fast: boolean; level: Level } | null,
  floor: Level = 1,
): Question | null {
  const pool = bank.filter((q) => !asked.includes(q.id));
  if (pool.length === 0) return null;

  // Staircase nudge: a fast correct answer means the last item was too easy.
  let want: Level | null = null;
  if (last) {
    if (last.ok) want = Math.min(3, last.level + 1) as Level;
    else want = Math.max(1, last.level - 1) as Level;
  }
  if (want !== null && want < floor) want = floor;

  const scored = pool.map((q) => {
    const p = pCorrect(ls.theta, q.level, guessRate(q));
    let cost = Math.abs(p - TARGET_P);
    if (want !== null) cost += q.level === want ? -0.25 : Math.abs(q.level - want) * 0.12;
    if (q.level < floor) cost += 0.5;
    // Prefer items never seen in an earlier attempt.
    if (ls.seen.includes(q.id)) cost += 0.08;
    return { q, cost };
  });
  scored.sort((a, b) => a.cost - b.cost);
  return scored[0].q;
}

/** Stop checking once the evidence is in: enough items, and the last ones were at or above apply level. */
export function checksDone(results: { ok: boolean; level: Level }[], bankSize: number): boolean {
  if (results.length >= Math.min(MAX_CHECKS, bankSize)) return true;
  if (results.length < MIN_CHECKS) return false;
  const lastTwo = results.slice(-2);
  return lastTwo.every((r) => r.ok && r.level >= 2);
}

export type PaceSignal = 'cruising' | 'guessing' | 'stuck' | null;

/** Read the last few answers for a boredom / overload signal. */
export function paceSignal(s: LearnerState): PaceSignal {
  const r = s.recent.slice(-3);
  if (r.length < 2) return null;
  const fast = (ms: number) => ms < 9000;
  if (r.length === 3 && r.every((x) => x.ok && fast(x.ms))) return 'cruising';
  const last2 = r.slice(-2);
  if (last2.every((x) => !x.ok && x.ms < 4000)) return 'guessing';
  if (last2.every((x) => !x.ok)) return 'stuck';
  return null;
}
