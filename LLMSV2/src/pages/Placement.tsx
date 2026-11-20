import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PLACEMENT, NOT_SURE } from '../engine/placement';
import { STAGES, stageMeta } from '../engine/curriculum';
import { actions } from '../engine/learner';
import type { StageId } from '../engine/types';
import { Choices } from '../ui/QuestionCard';
import { go } from '../router';

export default function Placement() {
  const [i, setI] = useState(0);
  const [res, setRes] = useState<Partial<Record<StageId, boolean>>>({});
  const [answered, setAnswered] = useState(false);
  const finished = i >= PLACEMENT.length;
  // Shuffle once per question, keeping "Not sure yet" last.
  const opts = useMemo(() => {
    if (i >= PLACEMENT.length) return [];
    const a = PLACEMENT[i].q.options.slice();
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return [...a, NOT_SURE];
  }, [i]);

  function finish(r: Partial<Record<StageId, boolean>>) {
    const prior: Partial<Record<StageId, number>> = {};
    for (const s of STAGES) prior[s.id] = r[s.id] ? 0.9 : -0.4;
    actions.setPlacement(prior);
  }

  if (finished) {
    const strong = STAGES.filter((s) => res[s.id]);
    return (
      <div className="narrow beat" style={{ paddingTop: 40 }}>
        <div className="eyebrow">Placement done</div>
        <h1 style={{ fontSize: 40, margin: '10px 0 14px' }}>Here is your starting point</h1>
        <div className="lesson-grid" style={{ marginBottom: 20 }}>
          {STAGES.map((s) => (
            <div key={s.id} className="panel" style={{ padding: 14, borderColor: res[s.id] ? s.hue : undefined }}>
              <div className="stage-n" style={{ color: s.hue }}>{s.n}. {s.title}</div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                {res[s.id] ? 'Ahead: fast lane and deeper material open by default.' : 'Guided: worked examples open by default.'}
              </div>
            </div>
          ))}
        </div>
        <p className="muted">
          {strong.length === 0
            ? 'Everything starts guided. That is the right place to begin, and the course will speed up as soon as you show you are ahead.'
            : `You are already ahead in ${strong.map((s) => s.title).join(', ')}. This is only a starting estimate; every answer you give updates it.`}
        </p>
        <div className="beat-nav"><span /><button className="btn primary" onClick={() => go('/')}>Open the map →</button></div>
      </div>
    );
  }

  const { stage, q } = PLACEMENT[i];
  const sm = stageMeta(stage);
  return (
    <div className="narrow beat" style={{ paddingTop: 40, ['--hue' as any]: sm.hue }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">Placement · {i + 1} of {PLACEMENT.length} · {sm.title}</div>
        <button className="btn ghost sm" onClick={() => { actions.skipPlacement(); go('/'); }}>Skip placement</button>
      </div>
      <h1 style={{ fontSize: 30, margin: '10px 0 6px' }}>Six questions to set your pace</h1>
      <p className="sub">Not a test. "Not sure yet" is a useful answer: it tells the course where to slow down.</p>
      <>
        <motion.div key={q.id} className="panel q-card glow" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
          <div className="q-prompt">{q.prompt}</div>
          <Choices
            ordered
            options={opts}
            verdict={(ok) => (ok ? 'Correct' : 'Noted')}
            onPick={(_, ok) => {
              const r = { ...res, [stage]: ok };
              setRes(r);
              setAnswered(true);
              if (i === PLACEMENT.length - 1) finish(r);
            }}
          />
        </motion.div>
      </>
      <div className="beat-nav">
        <span />
        {answered && (
          <button className="btn primary" onClick={() => { setAnswered(false); setI(i + 1); }}>
            {i === PLACEMENT.length - 1 ? 'See my starting point →' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  );
}
