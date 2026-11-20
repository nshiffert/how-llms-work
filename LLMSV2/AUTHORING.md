# Writing a lesson

A lesson is one file, `src/lessons/<id>.tsx`, that default-exports a `Lesson`
(see `src/engine/types.ts`). The player in `src/pages/LessonPlayer.tsx` turns
it into six beats: Predict → Play → Explain → What breaks → Check → Recap.

**Reference implementation: `src/lessons/attention.tsx`.** Read it in full
before writing anything. Match its structure, density and tone.

## Who the learner is

An adult who uses LLMs and knows the buzzwords, and does not yet know the
mechanics. They are smart and impatient. Define every technical term the first
time it appears, in one clause. Do not assume linear algebra beyond "a vector
is a list of numbers" and "a dot product multiplies matching entries and adds
them up". Math notation belongs in `deeper`, with the plain-words version first.

## Voice

- Mechanism first. Say what the thing does to the numbers, then what that buys.
  Do not open with an analogy.
- Real numbers, never placeholders. Every number you print must be one you
  computed. Compute it in code where you can; otherwise check it by hand twice.
- Short declarative sentences. Plain words. No flattery, no hype, no "simply",
  no "magic", no "powerful". Avoid em dashes; use a full stop or a colon.
- State limits bluntly in `breaks`: what fails, when, and what it costs.
- If a lab simulates behaviour rather than computing it (for example model
  accuracy under few-shot prompting), say "simulated" visibly inside the lab
  and explain what the simulation assumes. Never present invented numbers as
  measurements from a real model.
- Facts must be ones you are sure of. If you are unsure whether a claim about a
  real system is true, leave it out or state it as approximate.

## The parts

### `hook` (the opening prediction)
One question, asked before any teaching, that most learners will get wrong for
an interesting reason. 3-4 options. Each wrong option is a real misconception,
and its `why` names and refutes that misconception in one or two sentences. The
correct option's `why` must read as a standalone explanation, because it is
also shown after a wrong pick under "The right answer:". `reveal` is one
sentence that leads into the lab.

### `Lab` and `missions`
The lab is the centre of the lesson. Rules:

- It runs a real computation on small readable numbers wherever that is
  possible, and the learner changes the inputs directly (drag, click, type).
- It isolates the one mechanism the lesson is about. One strong interaction
  beats four weak ones.
- It moves. Use CSS transitions, SVG, `useRaf` or `useSpring` so that changing
  an input visibly flows through to the output. It should look alive at rest
  if that helps the idea (flowing particles, a pulsing arc), and never be busy
  for its own sake.
- 3-4 missions. Each is a concrete goal ("Raise X until Y happens") that makes
  the learner produce a specific behaviour. Detect it from lab state in a
  `useEffect` and call `complete('<mission id>')`. The `insight` says what they
  should have noticed and why it matters. Order missions so they build.
- Every mission must be reachable. No mission may fire on the lab's initial
  state. Test each one.
- Layout: the lab sits in a column about 780px wide on desktop and must work
  at 360px. Use `display:grid` with `repeat(auto-fit, minmax(260px, 1fr))` for
  side-by-side panels. Wrap any wide SVG in `<div style={{overflowX:'auto'}}>`
  and give the SVG a `minWidth`. Give every SVG `className="viz"` and a
  `viewBox`.
- Use the kit in `src/ui/kit.tsx`: `Slider`, `Seg`, `Bars`, `Stat`, `Tok`,
  `Callout`, `Code`, `M` (KaTeX), `useRaf`, `useSpring`, `softmax`,
  `mulberry32`, and friends. Do not restyle them. Use `var(--hue)` as the
  accent colour (it is set per stage) and the tokens `--fg`, `--fg-2`, `--fg-3`,
  `--line`, `--line-2`, `--panel`, `--panel-2`, `--good`, `--bad`, `--warn`.
  Useful classes from `src/styles/app.css`: `row`, `eyebrow`, `muted`, `dim`,
  `mono`, `lab-grid`, `text-in`, `btn`, `btn sm`, `btn primary`, `panel`.
- Call `sfx.tap()` (from `src/engine/sfx`) on custom button clicks. Sliders and
  `Seg` already make sound.
- No new npm dependencies. `framer-motion` and `katex` are available.
  `gpt-tokenizer` is available but large: only load it with a dynamic
  `import()` inside an effect.

### `explain`
- `core`: the mechanism in at most 180 words, referring back to what the lab
  showed. Always visible.
- `worked`: one example carried through with real numbers, step by step, plus
  3-8 lines of code in a `<Code>` block when code makes it clearer. Opened
  automatically for learners who need it.
- `deeper`: 3-4 short `<h3>` sections for learners who are ahead: the math, why
  the design is the way it is, what real systems do. Opened automatically for
  learners who are ahead.

### `breaks`
3-4 failure modes, each a short title plus two or three blunt sentences.

### `questions`
At least 7, with at least two at each level:

- Level 1 (recall): state the mechanism.
- Level 2 (apply): run it on numbers or a new case. Include at least one `num`
  question with a computed answer and a sensible `tol`.
- Level 3 (stretch): an edge case, a "what happens if you remove X", or a
  transfer to a setting the lesson did not show.

Rules for multiple choice: exactly one `correct`; 4 options; every wrong option
is a named misconception with a `why` that refutes it; the correct `why` stands
alone; options are of similar length so the longest is not always the answer;
order does not matter (the player shuffles). Give level 2 and 3 questions a
`hint` that points at the method and never contains the answer. Question ids
are `<short lesson prefix>-<n>` and unique within the lesson.

Do not ask about anything the lesson did not teach.

### `takeaways`
3-4 single sentences the learner should be able to say from memory.

## Before you finish

1. `npx tsc --noEmit` reports no errors in your files.
2. Open the lesson in the dev server (`npm run dev`, then
   `#/lesson/<id>`) at desktop width and at 390px. Check there are no console
   errors, nothing overflows or overlaps, and the lab reads clearly.
3. Complete every mission by hand, and confirm none fires on the lab's initial state.
4. Re-read every number in the prose and questions against a calculation.
