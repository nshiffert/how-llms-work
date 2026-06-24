# Outline: <Title> (`<slug>`)

> **Notes source:** `ralph/notes/all-topics.md` → section "<heading>". Re-read it before writing —
> it is the source of truth on level, framing, and the real numbers. This outline is the distilled
> contract; the notes are the full fidelity.

**Brief by design.** The `lesson-writer` skill does the heavy lifting. This file exists to (a) lock the
frontmatter + cross-lesson web and (b) point at the exact numbers/misconceptions/island the notes demand.

## Target frontmatter
```yaml
title: <Title>
category: basics | finetune | generation | advanced | math
hook: <one-line framing — the page's opening line and implicit top objective>
crossLinks: [<slug>, <slug>]   # must exist in src/data/topics.ts
```

## Section seeds (the five-section template)
1. **What it is** — <the tension/stakes to open on> · Definition: <the crisp one-liner>.
2. **The mechanic** — <how it works in one line> · **Island:** <what the bespoke widget must show/do —
   from the notes' "Visualization spec">.
3. **Worked example** — **use these real numbers (verbatim from notes):** <numbers>. <table/trace + code>.
4. **What breaks** — <failure modes, one bullet each, with the real-world symptom>.
5. **Drills (4–6)** — seeds: <questions, drawn from notes' "Side questions" + "Where I got fuzzy">.

## Misconceptions to target (build the lesson to kill these)
- <from notes "Where I got fuzzy" and the global "Gaps and weak spots to drill" list>

## Cross-lesson hooks (the curriculum web)
- **Name-drop / call back to:** <topics to reference by name in prose>
- **crossLinks:** <the slugs that go in frontmatter>
