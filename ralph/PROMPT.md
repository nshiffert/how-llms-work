# Ralph Loop Prompt — Build ONE Lesson

You are one iteration of an autonomous loop building the LLM Internals learning center. Each run of this
prompt builds **exactly one lesson end-to-end, commits it, and stops.** An outer shell loop
(`ralph/loop.sh`) will invoke you again for the next one. Do not try to build more than one lesson.

Work from the repo root: `/Users/nicholasshiffert/Source/LearningLLMs`.

## Ground rules
- **One lesson per run.** Pick a single topic, finish it, commit, stop.
- **Never `git push`.** Commit locally only.
- **Real numbers, not placeholders.** Match the bar set by `src/content/topics/tokenization.mdx`.
- **Use the project skills.** `lesson-writer` writes/revises; `lesson-reviewer` reviews. Invoke them via the
  Skill tool — do not freehand the lesson without them.
- If you get irrecoverably stuck, mark the topic `blocked` in `ralph/PROGRESS.md` with a one-line reason,
  commit that, and stop. Do not thrash.

## Steps

### 1. Claim a topic
Read `ralph/PROGRESS.md`. Find the **first row whose status is `todo`** (top-down — this preserves the
pedagogical order). If there are none, create the file `ralph/DONE` with a one-line summary and **stop —
you are finished.** Otherwise, set that row's status to `in_progress` and save `PROGRESS.md`. Note the
`slug`, `category`, and outline path.

### 2. Load the brief
Read `ralph/outlines/<slug>.md` AND the section of `ralph/notes/all-topics.md` it points to. The notes are
the source of truth on level, framing, the real numbers, and the visualization spec. Read the existing
`src/content/topics/tokenization.mdx` and `src/content/topics/attention.mdx` once for the house standard,
and skim `src/components/islands/` for reusable island patterns (D3, framer-motion, the `astro-code` class).

### 3. Plan
Think through: the five-section structure for this topic, the exact numbers you'll show (recompute them),
and the bespoke interactive island the notes demand — what it shows, what the user does, what they should
notice. The island is a React component in `src/components/islands/<Name>.tsx`, mounted in a `<VizFrame>`.

### 4. Write (lesson-writer skill)
Invoke the **lesson-writer** skill. Author `src/content/topics/<slug>.mdx` to the five-section template and
the frontmatter schema, and build the bespoke island in `src/components/islands/`. Honor the outline's
frontmatter (`title`, `category`, `hook`, `crossLinks`), the misconceptions-to-target, and the
cross-lesson hooks (name the related topics in prose; put the right slugs in `crossLinks`).

### 5. Build green
Run `npm run build`. Fix every MDX/import/island/schema error until it passes. Do not proceed until green.

### 6. Review (lesson-reviewer skill)
Invoke the **lesson-reviewer** skill on `src/content/topics/<slug>.mdx`. Produce the Review Report
(findings with IDs + executable fixes, strengths, open questions).

### 7. Re-write (lesson-writer skill)
Invoke the **lesson-writer** skill again, treating the Review Report as a contract: resolve **every**
finding by ID (apply, or push back with a concrete technical reason), and do not regress any Strength.
End with the short resolution log the skill specifies.

### 8. Build green again
Run `npm run build`. Fix until it passes.

### 9. Verify the island actually works (the "Chrome test" substitute)
Run `node scripts/verify-lesson.mjs <slug>`. It serves `dist/`, loads `/topics/<slug>`, asserts the
lesson's island hydrated, fails on console/page errors, and writes a screenshot to `ralph/logs/<slug>.png`.
If it fails, fix the lesson/island and return to step 8. (If Playwright isn't installed it runs a static
fallback check and tells you how to enable the full one — that's acceptable.)

### 10. Finalize — publish + wire up the navigation web
- **Homepage link.** In `src/data/topics.ts`, flip this topic's `status` from `'planned'` to `'ready'`.
  This is what publishes it on the homepage: `src/pages/index.astro` renders a real clickable
  `<a href="/topics/<slug>">` card ONLY for `ready` topics (planned ones are greyed-out `<div>`s).
  After the rebuild in this step, confirm the topic's card on the built homepage is now a live link (it
  appears in its category grid, and in the "Playable now" strip if it's among the first ready topics).
- **Outgoing cross-links.** Confirm this lesson's frontmatter `crossLinks` all resolve to real slugs in
  `src/data/topics.ts`. They render automatically as the "This connects to" section via the `CrossLinks`
  component — do not hand-write that section.
- **Bidirectional cross-links (do not skip — this is how other lessons link back to this one).** The
  `CrossLinks` section renders ONLY from a lesson's OWN frontmatter, so a link is one-way unless both
  lessons list each other. Make every connection involving this lesson mutual, across the lessons that
  already exist on disk (`src/content/topics/*.mdx`, including `tokenization` and `attention`):
  1. **Outbound reciprocity:** for each slug `S` in THIS lesson's `crossLinks`, if `src/content/topics/S.mdx`
     exists and its frontmatter `crossLinks` does NOT include this slug, add this slug to `S`'s `crossLinks`.
  2. **Inbound reciprocity:** grep every existing `src/content/topics/*.mdx` for frontmatter `crossLinks`
     that include this slug; for each such lesson `Y` not already in THIS lesson's `crossLinks`, add `Y`.
  Result: at this point, every edge between this lesson and an already-built lesson points both ways.
  Edges to not-yet-built lessons get reciprocated when those lessons run this same step. Adding a back-link
  to an earlier, already-committed lesson is expected and safe (it is additive — it does not regress that
  lesson's review). Skip a reciprocal link only if it is genuinely nonsensical pedagogically; default to
  adding it.
- **Meta/OG.** The page is served at `/topics/<slug>` by `src/pages/topics/[slug].astro` and gets the meta
  description + Open Graph tags via the `SocialMeta` component (the `hook` is the description). Verify they
  render. No new routing needed.
- Run `npm run build` one last time to confirm everything — this lesson, the homepage card, and every
  edited back-link target — is still green.

### 11. Record progress
In `ralph/PROGRESS.md`, set this row's status to `done`. (You'll fill the commit column right after committing.)

### 12. Commit (NEVER push)
Stage and commit everything for this lesson:
`git add -A && git commit` with a message like `Add <Title> lesson (<slug>): mdx, <Island>, viz verified`.
(The commit will also include `src/data/topics.ts` and any sibling `*.mdx` files you touched to add
reciprocal back-links — that's expected; mention it in the message body if more than one or two.)
End the commit message body with the trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Then put the commit short-sha into this row's Commit column in `ralph/PROGRESS.md` and amend or make a tiny
follow-up commit so PROGRESS reflects the sha. **Do not push.**

### 13. Stop
You are done with this iteration. Output a one-line summary (`<slug> — done, sha <…>`) and stop. The outer
loop will start the next lesson.
