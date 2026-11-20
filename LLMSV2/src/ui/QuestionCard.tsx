import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Option, Question } from '../engine/types';
import { sfx } from '../engine/sfx';

function shuffled<T>(xs: T[]): T[] {
  const a = xs.map((x, i) => ({ x, i }));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.map((o) => o.x);
}

export function LevelPips({ level }: { level: number }) {
  return (
    <span className="lvl" title={['', 'Recall', 'Apply', 'Stretch'][level]}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={n <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Multiple-choice options with per-option feedback. Used by the opening prediction and by checks. */
export function Choices(props: {
  options: Option[];
  onPick: (opt: Option, ok: boolean) => void;
  /** Keep the given order (for predictions where order carries meaning). */
  ordered?: boolean;
  /** Label for a correct / incorrect verdict. */
  verdict?: (ok: boolean) => string;
  extra?: ReactNode;
}) {
  const opts = useMemo(() => (props.ordered ? props.options : shuffled(props.options)), [props.options, props.ordered]);
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : opts[picked];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picked !== null || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const i = 'abcdef'.indexOf(e.key.toLowerCase());
      if (i >= 0 && i < opts.length) pick(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const ok = !!opts[i].correct;
    ok ? sfx.correct() : sfx.wrong();
    props.onPick(opts[i], ok);
  }

  return (
    <>
      <div className="opts">
        {opts.map((o, i) => {
          let cls = 'opt';
          if (picked !== null) {
            if (o.correct) cls += ' right';
            else if (i === picked) cls += ' wrong';
            else cls += ' fade';
          }
          return (
            <button key={i} className={cls} disabled={picked !== null} onClick={() => pick(i)}>
              <span className="key">{'ABCDEF'[i]}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      {chosen && (
        <motion.div
          className={`feedback ${chosen.correct ? 'ok' : 'no'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
        >
          <b className="verdict">{(props.verdict ?? ((ok) => (ok ? 'Correct' : 'Not quite')))(!!chosen.correct)}</b>
          {chosen.why}
          {!chosen.correct && (
            <div style={{ marginTop: 8 }}>
              <span className="dim">The right answer: </span>
              {opts.find((o) => o.correct)?.why}
            </div>
          )}
          {props.extra}
        </motion.div>
      )}
    </>
  );
}

export function QuestionCard(props: {
  q: Question;
  /** Called once, when the learner commits an answer. */
  onAnswer: (ok: boolean, ms: number, usedHint: boolean) => void;
}) {
  const { q } = props;
  const t0 = useRef(performance.now());
  const [hint, setHint] = useState(false);
  const [val, setVal] = useState('');
  const [numResult, setNumResult] = useState<boolean | null>(null);

  const elapsed = () => performance.now() - t0.current;

  function submitNum() {
    if (q.kind !== 'num' || numResult !== null) return;
    const x = Number(val.replace(/,/g, '').replace(/%$/, ''));
    if (val.trim() === '' || Number.isNaN(x)) return;
    const ok = Math.abs(x - q.answer) <= q.tol;
    setNumResult(ok);
    ok ? sfx.correct() : sfx.wrong();
    props.onAnswer(ok, elapsed(), hint);
  }

  return (
    <div className="panel q-card">
      <div className="q-prompt">{q.prompt}</div>
      {q.kind === 'mcq' ? (
        <Choices options={q.options} onPick={(_, ok) => props.onAnswer(ok, elapsed(), hint)} />
      ) : (
        <>
          <div className="num-row">
            <input
              className="num-in"
              inputMode="decimal"
              autoFocus
              placeholder="your answer"
              value={val}
              disabled={numResult !== null}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNum()}
              aria-label="Numeric answer"
            />
            {q.unit && <span className="muted mono">{q.unit}</span>}
            <button className="btn sm" onClick={submitNum} disabled={numResult !== null || val.trim() === ''}>
              Check
            </button>
          </div>
          {numResult !== null && (
            <motion.div className={`feedback ${numResult ? 'ok' : 'no'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">
              <b className="verdict">
                {numResult ? 'Correct' : `Not quite. The answer is ${q.answer}${q.unit ? ' ' + q.unit : ''}`}
              </b>
              {q.why}
            </motion.div>
          )}
        </>
      )}
      <div className="q-foot">
        <LevelPips level={q.level} />
        <span className="dim mono" style={{ fontSize: 12 }}>{['', 'recall', 'apply', 'stretch'][q.level]}</span>
        {q.hint && !hint && (
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setHint(true)}>
            Need a hint?
          </button>
        )}
      </div>
      {hint && q.hint && (
        <motion.div className="coach" style={{ marginTop: 12, marginBottom: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <b>Hint</b>
          <span>{q.hint}</span>
        </motion.div>
      )}
    </div>
  );
}
