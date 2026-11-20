import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Lesson, LessonMeta, Level, Question } from '../engine/types';
import { LESSONS, lessonIndex, stageMeta } from '../engine/curriculum';
import { actions, lessonState, mastery, useLearner } from '../engine/learner';
import { checksDone, chooseLane, nextQuestion, paceSignal, type Lane } from '../engine/adapt';
import { sfx } from '../engine/sfx';
import { Choices, QuestionCard } from '../ui/QuestionCard';
import { Fold, Ring } from '../ui/kit';
import { go } from '../router';

const BEATS = ['Predict', 'Play', 'Explain', 'What breaks', 'Check', 'Recap'] as const;

export default function LessonPlayer({ meta }: { meta: LessonMeta }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setLesson(null);
    setErr(false);
    meta.load().then((m) => live && setLesson(m.default), () => live && setErr(true));
    return () => { live = false; };
  }, [meta]);

  const stage = stageMeta(meta.stage);
  useEffect(() => {
    document.documentElement.style.setProperty('--hue', stage.hue);
    document.title = `${meta.title} — Inside the Machine`;
  }, [stage.hue, meta.title]);

  if (err) return <div className="center-screen"><div>This lesson failed to load. <a href="#/">Back to the map</a></div></div>;
  if (!lesson) return <div className="center-screen"><div><div className="spinner" />Loading {meta.title}…</div></div>;
  return <Player key={meta.id} meta={meta} lesson={lesson} />;
}

function Player({ meta, lesson }: { meta: LessonMeta; lesson: Lesson }) {
  const learner = useLearner();
  const ls = learner.lessons[meta.id] ?? lessonState(meta.id, meta.stage);
  const stage = stageMeta(meta.stage);
  const startTheta = useRef(ls.theta);
  const startMastery = useRef(mastery(ls));

  const [beat, setBeatRaw] = useState(() => (ls.status === 'started' ? Math.min(ls.beat, 4) : 0));
  const [maxBeat, setMaxBeat] = useState(() => (ls.status === 'done' ? 5 : beat));
  const [lane, setLane] = useState<Lane>(() => (ls.hookCorrect === undefined ? 'standard' : chooseLane(ls, ls.hookCorrect)));
  const [hookDone, setHookDone] = useState(false);
  const [session, setSession] = useState<{ right: number; total: number } | null>(null);

  const lastMove = useRef(0);
  const setBeat = useCallback((b: number) => {
    // A double-click on "next" must not skip a whole beat.
    const now = performance.now();
    if (now - lastMove.current < 400) return;
    lastMove.current = now;
    setBeatRaw(b);
    setMaxBeat((m) => Math.max(m, b));
    if (b < 5) actions.setBeat(meta.id, meta.stage, b);
    sfx.whoosh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [meta.id, meta.stage]);

  const done = useMemo(() => new Set(ls.missions), [ls.missions]);
  const complete = useCallback((mid: string) => {
    if (lessonState(meta.id, meta.stage).missions.includes(mid)) return;
    if (!lesson.missions.some((m) => m.id === mid)) return;
    actions.mission(meta.id, meta.stage, mid);
    sfx.mission();
  }, [meta.id, meta.stage, lesson.missions]);

  const idx = lessonIndex(meta.id);
  const next = LESSONS[idx + 1];

  return (
    <div className="narrow" style={{ '--hue': stage.hue } as CSSProperties}>
      <header className="lesson-top">
        <div className="row">
          <a href="#/" className="btn ghost sm" style={{ paddingLeft: 0 }}>← Map</a>
          <span className="pill">{stage.n}. {stage.title}</span>
          <span className="pill muted">{meta.minutes} min</span>
          {lane === 'fast' && <span className="pill">fast lane</span>}
          {lane === 'guided' && <span className="pill">guided</span>}
        </div>
        <h1>{meta.title}</h1>
        <nav className="steps" aria-label="Lesson steps">
          {BEATS.map((b, i) => (
            <button
              key={b}
              className={`step${i === beat ? ' on' : i < beat || i <= maxBeat ? ' done' : ''}`}
              disabled={i > maxBeat}
              onClick={() => i <= maxBeat && i !== beat && setBeat(i)}
              aria-current={i === beat ? 'step' : undefined}
            >
              <i />
              <span>{b}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Enter-only: never wait on the old beat's exit, which can hang while a lab is mid-animation. */}
      <>
        <motion.section
          key={beat}
          className="beat"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {beat === 0 && (
            <>
              <h2>Before anything else: take a guess</h2>
              <p className="sub">Guessing first makes the answer stick, even when the guess is wrong. This one is not scored.</p>
              <div className="panel q-card glow">
                <div className="q-prompt">{lesson.hook.prompt}</div>
                <Choices
                  options={lesson.hook.options}
                  verdict={(ok) => (ok ? 'Good call' : 'A reasonable guess, and wrong')}
                  onPick={(_, ok) => {
                    actions.hook(meta.id, meta.stage, ok);
                    setLane(chooseLane(lessonState(meta.id, meta.stage), ok));
                    setHookDone(true);
                  }}
                  extra={<div style={{ marginTop: 10, color: 'var(--fg)' }}>{lesson.hook.reveal}</div>}
                />
              </div>
              {hookDone && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
                  {lane === 'fast' && (
                    <div className="coach" style={{ marginTop: 16 }}>
                      <b>Pace</b>
                      <span>
                        You called it, and your record in this stage is strong. You can jump straight to the harder
                        questions and come back to the lab only if they bite.
                      </span>
                    </div>
                  )}
                  <div className="beat-nav">
                    <span />
                    <div className="row">
                      {lane === 'fast' && (
                        <button className="btn" onClick={() => setBeat(4)}>Skip to the hard questions</button>
                      )}
                      <button className="btn primary" onClick={() => setBeat(1)}>See it happen →</button>
                    </div>
                  </div>
                </motion.div>
              )}
              {!hookDone && ls.hookCorrect !== undefined && (
                <div className="beat-nav"><span /><button className="btn" onClick={() => setBeat(1)}>Skip, I've done this →</button></div>
              )}
            </>
          )}

          {beat === 1 && (
            <>
              <h2>Play with the mechanism</h2>
              <p className="sub">Nothing here is scored. Work through the goals below; each one unlocks what you should have noticed.</p>
              <GoalStrip lesson={lesson} done={done} />
              <div className="lab"><lesson.Lab complete={complete} done={done} /></div>
              <div className="missions">
                {lesson.missions.map((m) => {
                  const d = done.has(m.id);
                  return (
                    <div key={m.id} className={`mission${d ? ' done' : ''}`}>
                      <span className="box">✓</span>
                      <div>
                        <div className="goal">{m.text}</div>
                        <AnimatePresence>
                          {d && (
                            <motion.div className="insight" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                              {m.insight}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="beat-nav">
                <span className="dim mono" style={{ fontSize: 13 }}>{done.size} / {lesson.missions.length} goals</span>
                <button className={`btn${done.size >= lesson.missions.length ? ' primary' : ''}`} onClick={() => setBeat(2)}>
                  {done.size >= lesson.missions.length ? 'Now the explanation →' : 'Skip ahead →'}
                </button>
              </div>
            </>
          )}

          {beat === 2 && (
            <>
              <h2>What you just saw</h2>
              <p className="sub">The mechanism in plain terms, then as much depth as you want.</p>
              <div className="prose">{lesson.explain.core}</div>
              <Fold title="Worked example, with real numbers" tag={lane === 'guided' ? 'opened for you' : undefined} defaultOpen={lane === 'guided' || ls.theta < 0}>
                {lesson.explain.worked}
              </Fold>
              <Fold title="Go deeper" tag={lane === 'fast' || ls.theta > 0.9 ? 'opened for you' : 'optional'} defaultOpen={lane === 'fast' || ls.theta > 0.9}>
                {lesson.explain.deeper}
              </Fold>
              <div className="beat-nav">
                <button className="btn ghost" onClick={() => setBeat(1)}>← Back to the lab</button>
                <button className="btn primary" onClick={() => setBeat(3)}>Where it breaks →</button>
              </div>
            </>
          )}

          {beat === 3 && (
            <>
              <h2>Where it breaks</h2>
              <p className="sub">Knowing the failure modes is what separates understanding from recognition.</p>
              <div className="breaks">
                {lesson.breaks.map((b, i) => (
                  <motion.div key={i} className="break-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                    <h4>{b.title}</h4>
                    <div>{b.body}</div>
                  </motion.div>
                ))}
              </div>
              <div className="beat-nav">
                <button className="btn ghost" onClick={() => setBeat(2)}>← Explanation</button>
                <button className="btn primary" onClick={() => setBeat(4)}>Check yourself →</button>
              </div>
            </>
          )}

          {beat === 4 && (
            <CheckBeat
              meta={meta}
              lesson={lesson}
              lane={lane}
              onBack={(b) => setBeat(b)}
              onDone={(right, total) => {
                setSession({ right, total });
                actions.complete(meta.id, meta.stage);
                sfx.complete();
                setBeat(5);
              }}
            />
          )}

          {beat === 5 && (
            <>
              <div className="summary-hero">
                <Ring className="big-ring" size={150} value={mastery(ls)} label={`${Math.round(mastery(ls) * 100)}%`} />
                <h2>{meta.title}: done</h2>
                <p className="muted" style={{ marginTop: 8 }}>
                  {recapLine(session, mastery(ls), startMastery.current, startTheta.current !== ls.theta && ls.n > (session?.total ?? 0))}
                </p>
              </div>
              {mastery(ls) < 0.5 && (
                <div className="coach">
                  <b>Pace</b>
                  <span>
                    This one has not settled yet, and that is normal on a first pass. The fastest fix is ten more minutes in the
                    lab with the goals you skipped, or wait for tomorrow's review.{' '}
                    <button className="btn sm" onClick={() => setBeat(1)}>Back to the lab</button>
                  </span>
                </div>
              )}
              <h3 style={{ marginTop: 18 }}>Say these out loud. If you can, you own it.</h3>
              <ul className="takeaways" style={{ padding: 0 }}>
                {lesson.takeaways.map((t, i) => <li key={i}><span>{t}</span></li>)}
              </ul>
              <div className="coach">
                <b>Next</b>
                <span>
                  This lesson comes back for a short review in {ls.intervalDays <= 1 ? 'a day' : `${ls.intervalDays} days`}, mixed with
                  the topics it is easiest to confuse it with. Recalling it after a gap is what makes it last.
                </span>
              </div>
              <div className="beat-nav">
                <a className="btn ghost" href="#/">← Back to the map</a>
                {next ? (
                  <button className="btn primary" onClick={() => go(`/lesson/${next.id}`)}>Next: {next.title} →</button>
                ) : (
                  <a className="btn primary" href="#/">You finished the whole machine →</a>
                )}
              </div>
            </>
          )}
        </motion.section>
      </>
    </div>
  );
}

/** The current goal, pinned above the lab so it stays in view while the learner works. */
function GoalStrip({ lesson, done }: { lesson: Lesson; done: ReadonlySet<string> }) {
  const i = lesson.missions.findIndex((m) => !done.has(m.id));
  if (lesson.missions.length === 0) return null;
  return (
    <div className="goal-strip" aria-live="polite">
      <b>{i === -1 ? 'All goals done' : `Goal ${i + 1} of ${lesson.missions.length}`}</b>
      <>
        <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {i === -1 ? 'Keep playing, or move on to the explanation.' : lesson.missions[i].text}
        </motion.span>
      </>
    </div>
  );
}

function recapLine(session: { right: number; total: number } | null, m: number, before: number, hadHistory: boolean) {
  const score = session ? `You got ${session.right} of ${session.total} check questions right. ` : '';
  if (hadHistory) {
    const pts = Math.round((m - before) * 100);
    if (pts >= 3) return `${score}Your estimated mastery rose ${pts} points this session.`;
    if (pts <= -3) return `${score}Your estimate dropped ${-pts} points, so the next review will target what slipped.`;
    return `${score}Your estimate held steady.`;
  }
  return `${score}The ring is the course's estimate of how reliably you can apply this. Every later answer updates it.`;
}

function CheckBeat(props: { meta: LessonMeta; lesson: Lesson; lane: Lane; onBack: (beat: number) => void; onDone: (right: number, total: number) => void }) {
  const { meta, lesson, lane } = props;
  const learner = useLearner();
  const floor: Level = lane === 'fast' ? 2 : 1;
  const [asked, setAsked] = useState<string[]>([]);
  const [results, setResults] = useState<{ ok: boolean; level: Level }[]>([]);
  const [answered, setAnswered] = useState(false);
  const [q, setQ] = useState<Question | null>(() =>
    nextQuestion(lesson.questions, [], lessonState(meta.id, meta.stage), null, floor),
  );
  const lastFast = useRef(false);

  const finished = answered && checksDone(results, lesson.questions.length);
  const signal = answered ? paceSignal(learner) : null;
  const missStreak = results.length >= 2 && results.slice(-2).every((r) => !r.ok);

  function onAnswer(ok: boolean, ms: number, usedHint: boolean) {
    if (!q || answered) return;
    lastFast.current = ms < 9000;
    // A hinted correct answer is weaker evidence: score it as a harder-to-miss item by treating guess rate as higher.
    const guess = q.kind === 'mcq' ? 1 / q.options.length : 0.02;
    actions.answer(meta.id, meta.stage, q.id, q.level, ok, ms, usedHint && ok ? Math.max(guess, 0.5) : guess);
    setResults((r) => [...r, { ok, level: q.level }]);
    setAsked((a) => [...a, q.id]);
    setAnswered(true);
  }

  function advance() {
    if (!q) return;
    const last = results[results.length - 1];
    const nq = nextQuestion(lesson.questions, asked, lessonState(meta.id, meta.stage), { ok: last.ok, fast: lastFast.current, level: last.level }, floor);
    if (!nq) return finish();
    setQ(nq);
    setAnswered(false);
    sfx.tap();
  }

  const right = results.filter((r) => r.ok).length;
  const finish = () => props.onDone(results.filter((r) => r.ok).length, results.length);

  return (
    <>
      <h2>Check yourself</h2>
      <p className="sub">
        Answer from memory. The difficulty moves with you: get one right and the next is harder, miss one and it eases off.
      </p>
      {signal === 'cruising' && !finished && (
        <div className="coach"><b>Pace</b><span>Three quick correct answers in a row. Raising the difficulty so this stays worth your time.</span></div>
      )}
      {signal === 'guessing' && (
        <div className="coach"><b>Pace</b><span>Those last answers came very fast. Slow down and try to predict the answer before you read the options.</span></div>
      )}
      {(signal === 'stuck' || missStreak) && signal !== 'guessing' && (
        <div className="coach">
          <b>Pace</b>
          <span>
            Two misses in a row means the explanation did not land yet, which is on the lesson, not on you.{' '}
            <button className="btn sm" onClick={() => props.onBack(2)}>Reopen the worked example</button>{' '}
            <button className="btn sm" onClick={() => props.onBack(1)}>Back to the lab</button>
          </span>
        </div>
      )}
      {q && (
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
          <QuestionCard q={q} onAnswer={onAnswer} />
        </motion.div>
      )}
      <div className="beat-nav">
        <span className="dim mono" style={{ fontSize: 13 }}>
          {results.length === 0 ? `question 1` : `${right} of ${results.length} right`}
        </span>
        {answered && (
          finished
            ? <button className="btn primary" onClick={finish}>Finish the lesson →</button>
            : <button className="btn primary" onClick={advance}>Next question →</button>
        )}
      </div>
    </>
  );
}
