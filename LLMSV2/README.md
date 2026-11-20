# Inside the Machine (LLMSV2)

An adaptive, hands-on course on LLM internals: 22 lessons that follow one prompt
through the machine. Static site, no backend; learner state lives in
`localStorage`.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then writes a static site to dist/
npm run preview    # serves dist/ on :4174
```

`dist/` is plain HTML/CSS/JS with relative asset paths and hash routing, so it
can be copied to any static host (Cloudflare Pages included) with no rewrites.

## How it is put together

| Path | What it holds |
|---|---|
| `src/engine/curriculum.ts` | The six stages and 22 lessons, in teaching order |
| `src/engine/types.ts` | The `Lesson` shape every lesson file exports |
| `src/engine/learner.ts` | Learner model: per-lesson skill estimate, review schedule, persistence |
| `src/engine/adapt.ts` | Pacing rules: lane choice, question selection, pace signals |
| `src/engine/placement.ts` | The six placement questions |
| `src/pages/LessonPlayer.tsx` | Runs a lesson: Predict → Play → Explain → What breaks → Check → Recap |
| `src/pages/Review.tsx` | Spaced, mixed review sessions |
| `src/ui/kit.tsx` | Shared controls and helpers for labs |
| `src/lessons/<id>.tsx` | One file per lesson: content plus its interactive lab |

`AUTHORING.md` is the guide for writing or revising a lesson.

## How it adapts

- **Placement** (optional, six questions) sets a starting skill estimate per stage.
- **Skill estimate**: each lesson keeps an Elo-style score, updated on every
  scored answer, with a correction for guessing on multiple choice.
- **Lanes**: a correct opening prediction plus a strong estimate offers a fast
  lane straight to the harder questions; a miss opens the worked example by
  default.
- **Question choice**: the next check question is the one whose predicted
  success rate is closest to 80%, nudged up after a correct answer and down
  after a miss. Checking stops early once two apply-level answers in a row are
  right.
- **Pace signals**: runs of fast correct answers, fast wrong answers, or
  repeated misses trigger a short coaching note and a way back to the lab.
- **Review**: finished lessons return on an expanding schedule (1 day, 3 days,
  then multiplied by an ease factor), mixed with the lessons they are most
  easily confused with.

The 80% target and the timing thresholds are heuristics, not settled science.
