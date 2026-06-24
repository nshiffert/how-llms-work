# Ralph Loop: Build the 20 Remaining Lessons — Design

**Date:** 2026-06-24
**Status:** Approved-pending-review

## Goal

Autonomously build the 20 remaining LLM-internals lessons (22 topics total; `tokenization`
and `attention` already `ready`) using a headless "Ralph loop": a stateless prompt run
repeatedly by an outer shell loop, one lesson per iteration, each driven by a brief
outline distilled from the user's Socratic session notes.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Execution | Headless shell loop: `while …; do claude -p "$(cat ralph/PROMPT.md)" …; done` |
| Outline source | The rich notes already at `ralph/notes/all-topics.md` |
| Island quality | Full bespoke interactive island per lesson (match `BpeAnimator`/`SoftmaxBars`) |
| Topic order | Pedagogical: Basics → Math → Generation → Fine-tuning → Advanced |
| "Chrome test" step | Headless substitute: `scripts/verify-lesson.mjs` (Playwright when available, static fallback otherwise) |

## Artifacts

```
ralph/
  PROGRESS.md          # single source of truth: the todo table, pedagogical order, status + outline link + commit
  PROMPT.md            # the stateless loop prompt (the heart of Ralph) — one lesson per run
  loop.sh              # outer while loop; stops when no `todo` remains or DONE sentinel exists
  outlines/
    _TEMPLATE.md       # outline skeleton
    <slug>.md          # 20 briefs, each distilled from the matching notes section
  notes/
    all-topics.md      # (exists) the user's source-of-truth Socratic notes
  logs/                # per-iteration logs + island screenshots
  DONE                 # sentinel file written when all topics are done
scripts/
  verify-lesson.mjs    # serve dist + headless smoke test for one slug
docs/superpowers/specs/
  2026-06-24-ralph-lesson-loop-design.md   # this file
```

## Build order (PROGRESS.md rows; tokenization/attention already done)

1. context-window · 2. embeddings · 3. positional-encoding  *(Basics)*
4. softmax · 5. cross-entropy · 6. kl-divergence · 7. vanishing-gradients  *(Math)*
8. beam-vs-greedy · 9. temperature · 10. top-k-top-p · 11. autoregressive-vs-masked  *(Generation)*
12. lora · 13. qlora · 14. catastrophic-forgetting · 15. distillation · 16. vocabulary-handling  *(Fine-tuning)*
17. rag · 18. chain-of-thought · 19. mixture-of-experts · 20. zero-shot-vs-few-shot  *(Advanced)*

Cross-links may point at topics not yet `ready` — they resolve against the `src/data/topics.ts`
registry, not page status, so order does not gate them.

## Outline format (`ralph/outlines/<slug>.md`)

Brief but self-contained; Ralph also re-reads the matching `ralph/notes/all-topics.md` section.

- **Notes pointer** — the heading in `all-topics.md` this distills (full-fidelity source).
- **Target frontmatter** — `title`, `category`, `hook`, `crossLinks[]`.
- **Section seeds (1–5)** — one or two lines each: the tension/definition; **the island spec**
  (what the bespoke widget must show/do — the critical bit, copied/condensed from the notes'
  "Visualization spec"); the **real numbers** to use in the worked example (copied verbatim from
  notes); failure modes; 4–6 drill seeds (seeded from the notes' "Side questions" + "Where I got fuzzy").
- **Misconceptions to target** — from the notes' "Where I got fuzzy" and the global "Gaps to drill" list.
- **Cross-lesson hooks** — which topics to name-drop / call back to, which to `crossLink`. This is how
  the cross-lesson web is represented across briefs.

## The loop prompt (`ralph/PROMPT.md`) — one lesson per run, stateless

1. Read `PROGRESS.md`. Pick the first row with status `todo`. If none → write `ralph/DONE`, stop.
   Set that row to `in_progress`.
2. Read the topic's `ralph/outlines/<slug>.md` **and** the referenced `ralph/notes/all-topics.md` section.
3. **Plan** the lesson and the island.
4. **Write**: invoke the `lesson-writer` skill → author `src/content/topics/<slug>.mdx` and build the
   bespoke island in `src/components/islands/`.
5. `npm run build` until green.
6. **Review**: invoke the `lesson-reviewer` skill → Review Report.
7. **Re-write**: invoke `lesson-writer` again, resolving every finding (apply or push back with a reason).
8. `npm run build` green again.
9. **Verify**: `node scripts/verify-lesson.mjs <slug>` — builds, serves `dist/`, loads `/topics/<slug>`,
   asserts the island hydrated (island root has child nodes), fails on console errors, screenshots to
   `ralph/logs/<slug>.png`. Loop fixes and retries on failure.
10. **Finalize**: flip the topic to `status: 'ready'` in `src/data/topics.ts`; confirm `title`, `hook`,
    `crossLinks`; ensure meta description + OG tags via the existing `SocialMeta` component; URL = slug
    (already routed by `pages/topics/[slug].astro`).
11. Update `PROGRESS.md` row → `done` with the commit short-sha.
12. `git add -A && git commit` — **never push**.
13. Stop. The outer loop restarts fresh for the next topic.

If any step fails irrecoverably, set the row to `blocked` with a one-line reason, commit progress, and stop
so the loop moves on / surfaces it.

## loop.sh

```bash
while PROGRESS.md still contains a `todo` row AND ralph/DONE absent AND iter < CAP:
    claude -p "$(cat ralph/PROMPT.md)" --dangerously-skip-permissions   # autonomy for edits+build+commit
    tee ralph/logs/iter-N.log
```

Hard iteration cap (e.g. 25) as a runaway backstop. **Autonomy:** headless `claude -p` has no human to
answer prompts, and `--permission-mode acceptEdits` only auto-approves file *edits*, not the npm/git/node
*commands* each iteration runs — so the default is `--dangerously-skip-permissions` (overridable via the
`PERMS` env var if you instead set up a `.claude/settings.local.json` allowlist for the specific commands).
A deliberate trust decision, documented loudly in the script header. The loop never pushes.

## Verification substitute (`scripts/verify-lesson.mjs`)

- If Playwright + chromium are installed: real headless load of `/topics/<slug>`, assert the
  `astro-island` for the lesson's island has hydrated (non-empty), collect `console` errors / page
  errors, write `ralph/logs/<slug>.png`, exit non-zero on any error.
- Otherwise (graceful fallback): assert `npm run build` produced `dist/topics/<slug>/index.html`
  containing the expected `astro-island` marker and no `<MDXError>`; print the one-liner to enable the
  full check (`npx playwright install chromium`). Exit 0 on pass.

## Non-goals

- No pushing to remote (explicit).
- No design-system unification (the landing/inner split is known and out of scope).
- No new lesson *topics* beyond the 22 already in the registry.
```

