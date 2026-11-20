import type { ComponentType, ReactNode } from 'react';

export type StageId = 'text' | 'machine' | 'learning' | 'speaking' | 'adapting' | 'steering';

/** 1 = recall the mechanism, 2 = apply it to numbers or a new case, 3 = edge case / transfer. */
export type Level = 1 | 2 | 3;

export interface Option {
  text: ReactNode;
  correct?: boolean;
  /**
   * Feedback shown when this option is picked. For a wrong option it must name
   * the misconception behind the choice and refute it, not just say "incorrect".
   */
  why: ReactNode;
}

export interface McqQuestion {
  id: string;
  kind: 'mcq';
  level: Level;
  prompt: ReactNode;
  options: Option[];
  /** A nudge shown on request before answering. Never contains the answer. */
  hint?: ReactNode;
}

export interface NumQuestion {
  id: string;
  kind: 'num';
  level: Level;
  prompt: ReactNode;
  answer: number;
  /** Absolute tolerance. */
  tol: number;
  unit?: string;
  /** Worked solution shown after answering. */
  why: ReactNode;
  hint?: ReactNode;
}

export type Question = McqQuestion | NumQuestion;

export interface Mission {
  id: string;
  /** An instruction the learner can act on in the lab, phrased as a goal. */
  text: string;
  /** What the learner should have noticed. Shown once the mission is done. */
  insight: ReactNode;
}

export interface LabProps {
  /** Call when the learner achieves a mission. Safe to call repeatedly. */
  complete: (missionId: string) => void;
  done: ReadonlySet<string>;
}

export interface Lesson {
  id: string;
  /** Opening prediction. Answered before any teaching; never counts against the learner. */
  hook: {
    prompt: ReactNode;
    options: Option[];
    /** One or two sentences shown after the guess that bridge into the lab. */
    reveal: ReactNode;
  };
  Lab: ComponentType<LabProps>;
  missions: Mission[];
  explain: {
    /** The mechanism in under ~180 words. Always shown. */
    core: ReactNode;
    /** Step-by-step example with real numbers. Opened automatically for learners who need it. */
    worked: ReactNode;
    /** Extra depth for learners who are ahead: the math, the edge, the "why this design". */
    deeper: ReactNode;
  };
  /** Failure modes. Blunt and specific. */
  breaks: { title: string; body: ReactNode }[];
  /** At least 6: two per level. */
  questions: Question[];
  /** 3-4 single-sentence statements the learner should be able to reproduce. */
  takeaways: string[];
}

export interface LessonMeta {
  id: string;
  title: string;
  stage: StageId;
  /** One line, mechanism-first. */
  blurb: string;
  minutes: number;
  /** Lessons that look alike and get confused; used to interleave review. */
  confusable?: string[];
  load: () => Promise<{ default: Lesson }>;
}

export interface StageMeta {
  id: StageId;
  n: number;
  title: string;
  question: string;
  hue: string;
}
