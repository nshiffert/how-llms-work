import { useEffect, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { LESSONS, STAGES, lessonsIn, stageMeta } from '../engine/curriculum';
import { actions, daysUntilDue, dueLessons, mastery, useLearner } from '../engine/learner';
import { Ring } from '../ui/kit';
import HeroViz from '../ui/HeroViz';

export default function Home() {
  const s = useLearner();
  useEffect(() => {
    document.documentElement.style.setProperty('--hue', '#46e0f0');
    document.title = 'Inside the Machine — how LLMs work';
  }, []);

  const doneCount = LESSONS.filter((l) => s.lessons[l.id]?.status === 'done').length;
  const inProgress = LESSONS.find((l) => s.lessons[l.id]?.status === 'started');
  const nextUp = inProgress ?? LESSONS.find((l) => s.lessons[l.id]?.status !== 'done');
  const due = dueLessons();
  const fresh = doneCount === 0 && !inProgress;
  const nextStage = nextUp ? stageMeta(nextUp.stage) : null;

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <div className="eyebrow">22 lessons · adapts to you · nothing to install</div>
          <h1 style={{ marginTop: 14 }}>
            Follow one prompt <em>through the machine.</em>
          </h1>
          <p className="lede">
            You know what an LLM does. This shows you how: every stage from raw text to the next word, built as
            something you can push, break and predict. It speeds up when you are ahead and slows down when you are not.
          </p>
          <div className="hero-cta">
            {fresh && !s.placed ? (
              <>
                <a className="btn primary" href="#/placement">Find my starting point · 2 min</a>
                <a className="btn" href={`#/lesson/${LESSONS[0].id}`}>Start at lesson 1</a>
              </>
            ) : nextUp ? (
              <a className="btn primary" href={`#/lesson/${nextUp.id}`}>
                {inProgress ? 'Resume' : 'Continue'}: {nextUp.title} →
              </a>
            ) : (
              <a className="btn primary" href="#/review">Run a mixed review →</a>
            )}
            {doneCount > 0 && <span className="dim mono" style={{ fontSize: 13 }}>{doneCount} / {LESSONS.length} complete</span>}
          </div>
        </div>
        <div className="hero-viz"><HeroViz /></div>
      </section>

      {due.length > 0 && (
        <motion.div className="panel glow next-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ '--hue': '#fbbf24' } as CSSProperties}>
          <div>
            <div className="eyebrow">Review due</div>
            <h3>{due.length} {due.length === 1 ? 'topic is' : 'topics are'} ready to be pulled back from memory</h3>
            <p className="muted" style={{ margin: 0 }}>About {Math.min(5, due.length * 2)} mixed questions. Recalling after a gap is what makes it stick.</p>
          </div>
          <a className="btn primary" href="#/review">Start review →</a>
        </motion.div>
      )}

      {!fresh && nextUp && nextStage && (
        <div className="panel next-card" style={{ '--hue': nextStage.hue } as CSSProperties}>
          <div>
            <div className="eyebrow">{inProgress ? 'Pick up where you left off' : 'Up next'} · {nextStage.title}</div>
            <h3>{nextUp.title}</h3>
            <p className="muted" style={{ margin: 0 }}>{nextUp.blurb}</p>
          </div>
          <a className="btn primary" href={`#/lesson/${nextUp.id}`}>{inProgress ? 'Resume' : 'Start'} →</a>
        </div>
      )}

      <div id="map">
        {STAGES.map((st, si) => {
          const ls = lessonsIn(st.id);
          const d = ls.filter((l) => s.lessons[l.id]?.status === 'done').length;
          return (
            <motion.section
              key={st.id}
              className="stage-block"
              style={{ '--hue': st.hue } as CSSProperties}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + si * 0.07 }}
            >
              <div className="stage-head">
                <span className="stage-n">STAGE {st.n}</span>
                <h2>{st.title}</h2>
                <span className="q">{st.question}</span>
                <span className="stage-bar">{d}/{ls.length}</span>
              </div>
              <div className="lesson-grid">
                {ls.map((l) => {
                  const state = s.lessons[l.id];
                  const m = mastery(state);
                  const dueIn = state?.status === 'done' ? daysUntilDue(state) : null;
                  return (
                    <a key={l.id} href={`#/lesson/${l.id}`} className={`lesson-card${nextUp?.id === l.id ? ' is-next' : ''}`}>
                      <Ring value={state?.status === 'done' ? Math.max(m, 0.08) : m} label={state?.status === 'done' ? '✓' : String(LESSONS.indexOf(l) + 1)} />
                      <div>
                        <h3>{l.title}</h3>
                        <p>{l.blurb}</p>
                        <div className="meta">
                          <span>{l.minutes} min</span>
                          {state?.status === 'started' && <span style={{ color: 'var(--hue)' }}>in progress</span>}
                          {state?.status === 'done' && <span>{Math.round(m * 100)}% mastery</span>}
                          {dueIn !== null && dueIn <= 0 && <span className="due">review due</span>}
                          {dueIn !== null && dueIn > 0 && <span>review in {dueIn}d</span>}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </motion.section>
          );
        })}
      </div>

      <h2 style={{ fontSize: 22, margin: '34px 0 10px' }}>How this course teaches</h2>
      <div className="how">
        <div className="panel"><h4>You guess first</h4><p>Every lesson opens with a prediction. Committing to an answer before you see the mechanism makes the explanation land harder, even when the guess is wrong.</p></div>
        <div className="panel"><h4>You touch the mechanism</h4><p>Each lab runs the real computation on real numbers. The goals point you at the behaviours worth noticing instead of leaving you to wander.</p></div>
        <div className="panel"><h4>It tracks what you know</h4><p>Each answer updates a skill estimate per topic. Questions are picked to be hard enough to matter and easy enough to get mostly right.</p></div>
        <div className="panel"><h4>It comes back</h4><p>Finished topics return after a gap, mixed with the ones they are easiest to confuse with. No points, no streaks: just the map filling in.</p></div>
      </div>

      <footer className="foot">
        <span>Progress is saved in this browser only.</span>
        <a href="#/placement">Retake placement</a>
        {doneCount > 0 && <a href="#/review">Practice mix</a>}
        <button onClick={() => { if (window.confirm('Erase all progress in this browser?')) actions.reset(); }}>Reset progress</button>
      </footer>
    </div>
  );
}
