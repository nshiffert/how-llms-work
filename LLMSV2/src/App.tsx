import { lessonMeta } from './engine/curriculum';
import { actions, useLearner } from './engine/learner';
import { useRoute } from './router';
import Home from './pages/Home';
import LessonPlayer from './pages/LessonPlayer';
import Placement from './pages/Placement';
import Review from './pages/Review';

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <path d="M9 16L23 8M9 16L23 24M9 16H23" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="9" cy="16" r="4" fill="#46e0f0" />
      <circle cx="23" cy="8" r="3" fill="#a78bfa" />
      <circle cx="23" cy="16" r="3" fill="#fbbf24" />
      <circle cx="23" cy="24" r="3" fill="#f472b6" />
    </svg>
  );
}

export default function App() {
  const route = useRoute();
  const s = useLearner();
  const m = route.match(/^\/lesson\/([\w-]+)/);
  const meta = m ? lessonMeta(m[1]) : undefined;

  let page;
  if (meta) page = <LessonPlayer meta={meta} />;
  else if (route.startsWith('/placement')) page = <Placement />;
  else if (route.startsWith('/review')) page = <Review key={route} />;
  else page = <Home />;

  return (
    <>
      <div className="topbar">
        <div className="wrap topbar-in">
          <a className="brand" href="#/"><Mark /> Inside the Machine</a>
          <span className="spacer" />
          <a className="btn ghost sm" href="#/">Map</a>
          <a className="btn ghost sm" href="#/review">Review</a>
          <button className="btn ghost sm sound-btn" onClick={actions.toggleSound} aria-pressed={s.sound} aria-label={s.sound ? 'Sound effects on. Click to mute.' : 'Sound effects off. Click to unmute.'} title="Click and answer sounds. There is no narration.">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {s.sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6m0-6-5 6" />}
            </svg>
            <span className="sound-label">Sound effects {s.sound ? 'on' : 'off'}</span>
          </button>
        </div>
      </div>
      <main>{page}</main>
    </>
  );
}
