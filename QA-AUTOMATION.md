# QA automation guide

This document accompanies any black-box testable commit. It tells a QA Manager
where the site runs, how it is laid out, and what state it keeps, so a test
plan can be written per commit without reading the source.

The site under test is **Inside the Machine**, an adaptive course on LLM
internals. Its source is in `LLMSV2/`. The older Astro site in the repo root
(`src/`, `astro.config.mjs`) is no longer deployed.

## Environments

| Environment | URL | What it serves |
|---|---|---|
| Production | https://learning-llms.rightspeedlabs.com | The latest deploy to the `main` branch of the Cloudflare Pages project `learning-llms` |
| Per-deploy snapshot | `https://<hash>.learning-llms.pages.dev` | One immutable copy per deploy. The URL is printed by the deploy command and listed in the Cloudflare Pages dashboard |
| Branch preview | `https://<branch>.learning-llms.pages.dev` | A deploy made with `--branch=<branch>` instead of `main`. Does not touch production |
| Local preview | http://localhost:4174 | The production build served from `LLMSV2/dist` |
| Local dev | http://localhost:5173 | Vite dev server with hot reload. Not for sign-off |

Deploys are manual. Nothing deploys on push, so a commit is only testable on a
hosted URL after someone deploys it. The commit author should put the URL to
test in the commit or hand-off note.

To produce a preview for a commit without touching production:

```
cd LLMSV2
npm install
npm run build
npx wrangler pages deploy dist --project-name=learning-llms --branch=<branch-name>
```

To test locally:

```
cd LLMSV2
npm install
npm run build && npm run preview     # http://localhost:4174
```

There is no backend, no login, no API and no database. The site is static
files. Every environment behaves the same apart from its URL.

## Routes

Routing uses the URL hash, so every page is the same HTML file.

| Route | Page | Notes |
|---|---|---|
| `/#/` | Home (the map) | Any unknown hash also lands here |
| `/#/placement` | Placement | Six optional questions |
| `/#/lesson/<id>` | Lesson player | `<id>` is one of the 22 lesson ids below. An unknown id shows Home |
| `/#/review` | Review | Shows an empty state until at least one lesson is finished |

Redirects from the previous site, served by the host (302):

| Old URL | Goes to |
|---|---|
| `/topics/<id>` and `/topics/<id>/` | `/#/lesson/<id>` |
| `/audio-tutor`, `/glossary`, `/interview-drills` | `/` |

Redirects only work on hosted environments. The local preview does not apply
them.

## Layout

### Top bar (every page)

- Brand link "Inside the Machine": goes to Home.
- "Map": goes to Home.
- "Review": goes to Review.
- "Sound effects on / off": toggles click and answer sounds. Below 600px wide
  only the speaker icon shows. There is no narration or other audio.

### Home

Top to bottom:

1. Hero with a looping animation and the main call to action. A first-time
   visitor is offered Placement or the first lesson.
2. "Review due" card. Only present when at least one finished lesson is due.
3. "Up next" card: the next unfinished lesson.
4. The map: six stages, each a row of lesson cards with a progress ring.
   Clicking a card opens that lesson. No lesson is locked.
5. "How this teaches" panel.
6. Footer with "Reset progress", which shows a browser confirm dialog and then
   erases all saved state.

### Placement

Six multiple-choice questions, one per stage, each with a "Not sure yet"
option listed last. The other options are shuffled on every visit. Finishing
sets a starting skill level per stage and shows a result screen that marks each
stage "Ahead" or "Guided", with a button to open the map. Placement can be
skipped from any question.

### Lesson player

Header: back link to the map, stage pill, estimated minutes, and a lane pill
("fast lane" or "guided") when one applies. Below it, a six-step bar. A step
is clickable once it has been reached.

Every lesson has the same six steps:

| # | Step | What is on screen |
|---|---|---|
| 1 | Predict | One unscored multiple-choice question. After answering, feedback and a button to continue. A learner with a strong record who answers correctly is also offered "Skip to the hard questions" |
| 2 | Play | An interactive lab, a sticky strip showing the current goal, and a list of 4 goals. A goal ticks itself when the learner produces the described behaviour in the lab, and then reveals a note |
| 3 | Explain | The explanation, plus two collapsible sections: "Worked example" and "Go deeper". Which ones start open depends on the learner's record |
| 4 | What breaks | 3 to 4 failure modes |
| 5 | Check | 3 to 6 scored questions, one at a time, multiple choice or numeric. Each has per-option feedback. Harder questions have a hint button |
| 6 | Recap | Check score, takeaways, and a link to the next lesson |

Behaviour a tester should expect:

- Moving between steps is instant. A second click within 0.4 seconds is
  ignored, so automated clicks need a short pause between step changes.
- The lab is different in every lesson (sliders, draggable bars, text inputs,
  buttons, clickable tokens). Goals cannot complete on the lab's initial state.
- Multiple-choice options are shuffled on each attempt. Keys A to F select an
  option.
- Numeric answers accept a tolerance. Commas are ignored.
- The Check step picks questions adaptively, so two runs can show different
  questions in a different order. It ends early after two correct answers in a
  row at the middle difficulty or above, and never runs past six questions.
- Short coaching notes can appear in Check after fast or repeated wrong
  answers, with buttons back to the lab or the worked example.
- Leaving a lesson part-way and returning resumes at the step reached.

### Review

Up to five questions drawn from finished lessons that are due, mixed with
questions from closely related lessons. Finished lessons become due after
1 day, then 3 days, then at growing intervals. If lessons are finished but none
is due, opening Review directly still builds a session from the finished
lessons. With no finished lessons, the page shows an empty state and a link
back to the map.

## Curriculum

22 lessons in six stages. The id is the last part of the lesson URL.

| Stage | Lesson ids |
|---|---|
| 1. Text in | `tokenization`, `vocabulary-handling`, `embeddings`, `positional-encoding` |
| 2. The machine | `softmax`, `attention`, `context-window`, `vanishing-gradients`, `mixture-of-experts` |
| 3. Learning | `cross-entropy`, `kl-divergence`, `autoregressive-vs-masked` |
| 4. Speaking | `temperature`, `top-k-top-p`, `beam-vs-greedy` |
| 5. Adapting | `catastrophic-forgetting`, `lora`, `qlora`, `distillation` |
| 6. Steering | `zero-shot-vs-few-shot`, `chain-of-thought`, `rag` |

## State and test data

All learner state is in the browser's `localStorage` under one key,
`llmsv2.learner`. It holds placement results, per-lesson progress and skill
estimates, the review schedule and the sound setting.

- **Clean start:** clear site data, or use a fresh browser profile, or click
  "Reset progress" on Home.
- **State is per browser and per origin.** Production, each preview URL and
  localhost each keep their own copy. Nothing syncs between devices.
- **Seeding a state:** an automated test can write a JSON value to
  `llmsv2.learner` before the page loads to start from a known point, for
  example a lesson already at the Play step. The shape is defined in
  `LLMSV2/src/engine/learner.ts`.
- **Time-dependent behaviour:** review due dates use the browser clock. To test
  review without waiting a day, override the clock in the test browser or seed
  a past due date.

## Things that vary between runs

A test plan should not assert on these exactly:

- Order of multiple-choice options.
- Which Check and Review questions appear, and how many.
- Which lane a learner is placed in, and which Explain sections start open.
- Animation timing. Labs animate; wait for the settled state before asserting.

## Network and loading

- The first load fetches one HTML file, one script bundle, one stylesheet and
  fonts. Each lesson's code loads the first time that lesson opens.
- Four lessons load a tokenizer file on demand when their lab starts:
  `tokenization` (about 1 MB compressed) and `zero-shot-vs-few-shot`,
  `chain-of-thought` and `rag` (about 0.4 MB compressed). Token counts in those
  labs appear after it loads. In `tokenization`, three of the four goals cannot
  complete until it has loaded.
- Nothing is sent to a server. There are no analytics calls from the app.

## Supported surfaces

- Checked in automated runs at 1280px and 390px wide in Chromium: all 22
  lessons can be walked from Predict to Recap with no console errors and no
  horizontal scroll.
- Not yet checked: Safari, Firefox, real touch devices (dragging in labs), and
  screen readers.

## What to put in a per-commit hand-off

So the QA Manager can scope a plan quickly, each testable commit should state:

1. The URL to test.
2. Which routes or lesson ids changed.
3. Which of the six steps are affected, or whether the change is site-wide
   (top bar, Home, Placement, Review, navigation, saved state).
4. Whether saved state from before the commit must keep working.
5. Anything in the change that depends on timing, randomness or the clock.
