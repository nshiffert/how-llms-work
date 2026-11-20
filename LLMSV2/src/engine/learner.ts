import { useSyncExternalStore } from 'react';
import type { Level, StageId } from './types';

/**
 * The learner model. Everything lives in localStorage; there is no backend.
 *
 * Skill is an Elo-style estimate per lesson (theta, in logits). Item difficulty
 * is hand-seeded by level because one learner cannot calibrate items.
 *   P(correct) = g + (1 - g) * sigmoid(theta - d)      g = guess rate
 *   theta += K * (result - P)                          K = 1 / (1 + 0.15 n)
 * Review uses an SM-2-style schedule per lesson (not per item).
 */

export const LEVEL_DIFFICULTY: Record<Level, number> = { 1: -1, 2: 0, 3: 1.2 };

export interface LessonState {
  theta: number;
  /** Number of scored answers, used to shrink K. */
  n: number;
  status: 'new' | 'started' | 'done';
  /** Beat index reached, so a lesson can be resumed. */
  beat: number;
  hookCorrect?: boolean;
  missions: string[];
  seen: string[];
  /** Question ids last answered wrong; prioritised in review. */
  missed: string[];
  // Review schedule
  ease: number;
  intervalDays: number;
  due: number | null;
  completedAt?: number;
}

export interface LearnerState {
  v: 1;
  placed: boolean;
  stagePrior: Partial<Record<StageId, number>>;
  lessons: Record<string, LessonState>;
  sound: boolean;
  /** Log of recent answers for pacing signals. */
  recent: { ok: boolean; ms: number; t: number }[];
}

const KEY = 'llmsv2.learner';
const DAY = 86_400_000;

const fresh = (): LearnerState => ({
  v: 1,
  placed: false,
  stagePrior: {},
  lessons: {},
  sound: true,
  recent: [],
});

function read(): LearnerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as LearnerState;
      if (s && s.v === 1) return { ...fresh(), ...s };
    }
  } catch {
    /* private mode or corrupt state: start fresh */
  }
  return fresh();
}

let state = read();
const listeners = new Set<() => void>();

function commit(next: LearnerState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useLearner(): LearnerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getLearner = () => state;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function pCorrect(theta: number, level: Level, guess = 0.25) {
  return guess + (1 - guess) * sigmoid(theta - LEVEL_DIFFICULTY[level]);
}

/** 0..1 mastery shown in the UI: chance of getting an apply-level item right without guessing. */
export function mastery(ls: LessonState | undefined) {
  if (!ls || ls.n === 0) return 0;
  return sigmoid(ls.theta * 1.2);
}

export function lessonState(id: string, stage?: StageId): LessonState {
  const existing = state.lessons[id];
  if (existing) return existing;
  return {
    theta: (stage && state.stagePrior[stage]) ?? 0,
    n: 0,
    status: 'new',
    beat: 0,
    missions: [],
    seen: [],
    missed: [],
    ease: 2.3,
    intervalDays: 0,
    due: null,
  };
}

function patchLesson(id: string, stage: StageId | undefined, patch: (l: LessonState) => LessonState) {
  const cur = lessonState(id, stage);
  commit({ ...state, lessons: { ...state.lessons, [id]: patch({ ...cur }) } });
}

export const actions = {
  setPlacement(prior: Partial<Record<StageId, number>>) {
    commit({ ...state, placed: true, stagePrior: prior });
  },
  skipPlacement() {
    commit({ ...state, placed: true });
  },
  toggleSound() {
    commit({ ...state, sound: !state.sound });
  },
  setBeat(id: string, stage: StageId, beat: number) {
    patchLesson(id, stage, (l) => ({ ...l, beat, status: l.status === 'new' ? 'started' : l.status }));
  },
  hook(id: string, stage: StageId, ok: boolean) {
    patchLesson(id, stage, (l) => ({ ...l, hookCorrect: ok, status: l.status === 'new' ? 'started' : l.status }));
  },
  mission(id: string, stage: StageId, missionId: string) {
    const cur = lessonState(id, stage);
    if (cur.missions.includes(missionId)) return;
    patchLesson(id, stage, (l) => ({ ...l, missions: [...l.missions, missionId] }));
  },
  /** Record a scored answer and update the skill estimate. Returns the change in mastery. */
  answer(id: string, stage: StageId, qid: string, level: Level, ok: boolean, ms: number, guess = 0.25) {
    const before = lessonState(id, stage);
    const p = pCorrect(before.theta, level, guess);
    const K = 1 / (1 + 0.15 * before.n);
    const theta = Math.max(-3, Math.min(3.5, before.theta + K * ((ok ? 1 : 0) - p)));
    const after: LessonState = {
      ...before,
      theta,
      n: before.n + 1,
      status: before.status === 'new' ? 'started' : before.status,
      seen: before.seen.includes(qid) ? before.seen : [...before.seen, qid],
      missed: ok ? before.missed.filter((q) => q !== qid) : [...new Set([...before.missed, qid])],
    };
    commit({
      ...state,
      lessons: { ...state.lessons, [id]: after },
      recent: [...state.recent.slice(-11), { ok, ms, t: Date.now() }],
    });
    return mastery(after) - mastery(before);
  },
  /** First completion: schedule the first review for tomorrow. */
  complete(id: string, stage: StageId) {
    patchLesson(id, stage, (l) => ({
      ...l,
      status: 'done',
      beat: 0,
      completedAt: l.completedAt ?? Date.now(),
      intervalDays: l.intervalDays || 1,
      due: l.due ?? Date.now() + DAY,
    }));
  },
  /** SM-2-style update after a review answer on this lesson. */
  reviewed(id: string, ok: boolean) {
    const l = state.lessons[id];
    if (!l) return;
    const ease = Math.max(1.3, l.ease + (ok ? 0.1 : -0.3));
    const intervalDays = ok ? (l.intervalDays < 1 ? 1 : l.intervalDays < 3 ? 3 : Math.round(l.intervalDays * ease)) : 1;
    commit({
      ...state,
      lessons: { ...state.lessons, [id]: { ...l, ease, intervalDays, due: Date.now() + intervalDays * DAY } },
    });
  },
  reset() {
    commit(fresh());
  },
};

export function dueLessons(now = Date.now()): string[] {
  return Object.entries(state.lessons)
    .filter(([, l]) => l.status === 'done' && l.due !== null && l.due <= now)
    .sort((a, b) => (a[1].due ?? 0) - (b[1].due ?? 0))
    .map(([id]) => id);
}

export function daysUntilDue(l: LessonState, now = Date.now()) {
  if (l.due === null) return null;
  return Math.ceil((l.due - now) / DAY);
}
