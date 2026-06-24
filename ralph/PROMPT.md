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

### 10. Finalize
- In `src/data/topics.ts`, flip this topic's `status` from `'planned'` to `'ready'`.
- Confirm the frontmatter: `title`, `hook` (the opening line / top objective), and `crossLinks` all resolve
  to real slugs in `src/data/topics.ts`. The page is served at `/topics/<slug>` by
  `src/pages/topics/[slug].astro` and gets meta description + Open Graph tags via the `SocialMeta`
  component — verify the OG/meta render (the hook is the description). No new routing needed.
- Run `npm run build` one last time to confirm everything is still green.

### 11. Record progress
In `ralph/PROGRESS.md`, set this row's status to `done`. (You'll fill the commit column right after committing.)

### 12. Commit (NEVER push)
Stage and commit everything for this lesson:
`git add -A && git commit` with a message like `Add <Title> lesson (<slug>): mdx, <Island>, viz verified`.
End the commit message body with the trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Then put the commit short-sha into this row's Commit column in `ralph/PROGRESS.md` and amend or make a tiny
follow-up commit so PROGRESS reflects the sha. **Do not push.**

### 13. Stop
You are done with this iteration. Output a one-line summary (`<slug> — done, sha <…>`) and stop. The outer
loop will start the next lesson.
