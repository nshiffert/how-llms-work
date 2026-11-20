import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LESSONS, lessonMeta, stageMeta } from '../engine/curriculum';
import { actions, dueLessons, getLearner, pCorrect } from '../engine/learner';
import type { LessonMeta, Question } from '../engine/types';
import { QuestionCard } from '../ui/QuestionCard';
import { go } from '../router';

const SESSION = 5;

/**
 * Pick which lessons to review. Due lessons come first; then, for each, a
 * completed look-alike is pulled in next to it, because mixing confusable
 * topics is where interleaving helps.
 */
function pickLessons(): string[] {
  const s = getLearner();
  const doneIds = LESSONS.filter((l) => s.lessons[l.id]?.status === 'done').map((l) => l.id);
  const due = dueLessons();
  const base = due.length ? due : [...doneIds].sort((a, b) => (s.lessons[a].due ?? 0) - (s.lessons[b].due ?? 0));
  const out: string[] = [];
  for (const id of base) {
    if (out.length >= SESSION) break;
    if (!out.includes(id)) out.push(id);
    const twin = lessonMeta(id)?.confusable?.find((c) => doneIds.includes(c) && !out.includes(c));
    if (twin && out.length < SESSION) out.push(twin);
  }
  return out;
}

function pickQuestion(meta: LessonMeta, bank: Question[]): Question {
  const ls = getLearner().lessons[meta.id];
  const missed = bank.filter((q) => ls.missed.includes(q.id));
  if (missed.length) return missed[0];
  const unseen = bank.filter((q) => !ls.seen.includes(q.id));
  const pool = unseen.length ? unseen : bank;
  // Closest to an 80% predicted success rate, with a little randomness to vary repeats.
  return pool
    .map((q) => ({ q, c: Math.abs(pCorrect(ls.theta, q.level) - 0.8) + Math.random() * 0.1 }))
    .sort((a, b) => a.c - b.c)[0].q;
}

export default function Review() {
  const [items, setItems] = useState<{ meta: LessonMeta; q: Question }[] | null>(null);
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [right, setRight] = useState(0);

  useEffect(() => {
    let live = true;
    const ids = pickLessons();
    Promise.all(
      ids.map(async (id) => {
        const meta = lessonMeta(id)!;
        const mod = await meta.load();
        return { meta, q: pickQuestion(meta, mod.default.questions) };
      }),
    ).then((xs) => live && setItems(xs));
    return () => { live = false; };
  }, []);

  if (!items) return <div className="center-screen"><div><div className="spinner" />Building your review…</div></div>;
  if (items.length === 0)
    return (
      <div className="center-screen">
        <div>
          <h2 style={{ color: 'var(--fg)', marginBottom: 8 }}>Nothing to review yet</h2>
          <p>Finish a lesson and it will come back here after a gap.</p>
          <a className="btn" href="#/" style={{ marginTop: 14 }}>Back to the map</a>
        </div>
      </div>
    );

  if (i >= items.length)
    return (
      <div className="narrow beat" style={{ paddingTop: 50, textAlign: 'center' }}>
        <div className="eyebrow">Review complete</div>
        <h1 style={{ fontSize: 42, margin: '10px 0' }}>{right} of {items.length} from memory</h1>
        <p className="muted" style={{ maxWidth: '52ch', margin: '0 auto' }}>
          Topics you recalled move further out. Anything you missed returns tomorrow. Either way the next review is already scheduled.
        </p>
        <div className="beat-nav" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => go('/')}>Back to the map →</button></div>
      </div>
    );

  const { meta, q } = items[i];
  const sm = stageMeta(meta.stage);
  return (
    <div className="narrow beat" style={{ paddingTop: 36, ['--hue' as any]: sm.hue }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">Mixed review · {i + 1} of {items.length}</div>
        <a className="btn ghost sm" href="#/">Exit</a>
      </div>
      <h1 style={{ fontSize: 28, margin: '10px 0 6px' }}>Pull it back from memory</h1>
      <p className="sub">Topics are shuffled on purpose. Working out which idea a question is about is part of the practice.</p>
      <>
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
          <QuestionCard
            q={q}
            onAnswer={(ok, ms) => {
              actions.answer(meta.id, meta.stage, q.id, q.level, ok, ms);
              actions.reviewed(meta.id, ok);
              if (ok) setRight((r) => r + 1);
              setAnswered(true);
            }}
          />
        </motion.div>
      </>
      <div className="beat-nav">
        <span className="dim" style={{ fontSize: 14 }}>
          {answered && <>From <a href={`#/lesson/${meta.id}`}>{meta.title}</a></>}
        </span>
        {answered && (
          <button className="btn primary" onClick={() => { setAnswered(false); setI(i + 1); }}>
            {i === items.length - 1 ? 'Finish →' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  );
}
