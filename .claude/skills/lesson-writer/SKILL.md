---
name: lesson-writer
description: Use when writing a new LLM-internals lesson or revising an existing one in this project (an MDX topic under src/content/topics/), especially when acting on a lesson-reviewer Review Report. Covers the five-section template, house voice, frontmatter schema, and the Section / VizFrame / Drill components.
---

# Lesson Writer

## Overview

Write or revise one lesson at `src/content/topics/<slug>.mdx` to the project's five-section template and house voice.

**Core principle:** Teach **how it actually works and where it breaks**, mechanics-first, with **real numbers, not placeholders**, in a blunt voice that respects a sharp reader. The model of the standard is the existing `tokenization.mdx` — match its altitude, not a generic explainer.

## Two modes

**Revising from a Review Report (default when one exists):** the report is a contract.
- Resolve **every** finding by ID. For each `F#`, either **apply** the Fix, or **push back** with a concrete technical reason (see superpowers:receiving-code-review — verify, don't comply blindly; don't silently drop a finding).
- Do not regress anything listed under **Strengths**.
- End your work with a short resolution log: `F1 applied — … · F2 pushed back — …`.

**Writing fresh:** follow the template contract below section by section.

## Template contract (the five sections, in order)

Each `<Section n title tag>` must do its job — not just exist:

1. **What it is** — open with the tension/stakes, state the problem it solves, then a crisp **Definition** callout. Define every term before using it.
2. **The mechanic** — explain how it works, anchored by at least one interactive `<VizFrame>` widget whose `caption` says what to do and what to notice. The prose and the widget must teach the *same* mechanic.
3. **Worked example** — real corpus/inputs, **actual computed numbers**, a table or stepped trace, and runnable code (Python/`tiktoken`-style). No "scores are X, Y, Z."
4. **What breaks** — concrete failure modes as a tight bulleted list; name the real-world symptom for each.
5. **Interview pressure test** — 4–6 `<Drill q>` flashcards. Questions probe understanding and likely interview angles; hidden answers are correct, complete, and blunt, and connect to other topics by name where relevant.

## Frontmatter schema

```yaml
---
title: <Topic>
category: basics | finetune | generation | advanced | math
hook: <one-line framing — this is the page's opening line AND its implicit top-level objective>
crossLinks: [<related-slug>, …]   # must resolve to real topics in src/data/topics.ts
draft: false                       # omit or false to publish; true hides it
---
```

The `hook` plus each Section's `tag` ARE the lesson's learning objectives — make them real promises the body keeps.

## Components (import what you use)

```mdx
import Section from '../../components/topic/Section.astro';
import Drill from '../../components/topic/Drill.astro';
import VizFrame from '../../components/topic/VizFrame.astro';
import <Island> from '../../components/islands/<Island>.tsx';

<Section n={2} title="The mechanic" tag="Count pairs → merge → repeat">
  …prose…
  <VizFrame label="…" caption="what to do + what to notice">
    <Island client:visible />        {/* or client:only="react" for browser-only islands */}
  </VizFrame>
</Section>

<Drill q="Probing question?">Blunt, correct answer. Connects to [other topic] by name.</Drill>
```

Callouts use the existing pattern — a bordered `div` with `border-l-accent` (definition) or `border-l-live` (aside); copy the markup from `tokenization.mdx`. Cross-links render automatically from frontmatter; do not hand-write them.

## House voice rules

- Real numbers, computed and shown — never placeholders.
- One idea per paragraph; define before use.
- Blunt and concrete; cut hedging and "AI is magic." Lead with the mechanic.
- Show what breaks for every concept.
- Connect across topics by name (it reinforces the curriculum web).

## Validate before claiming done

- `npm run build` passes (MDX compiles, every component/island imported, frontmatter matches the schema).
- Numbers recomputed, code traced, drill answers correct.
- If revising: every Review Report finding is resolved (applied or reasoned-down) and Strengths intact.

## Common mistakes

| Mistake | Do instead |
|---|---|
| Placeholder numbers ("X, Y, Z") | Compute and show the real values |
| Hedgy, generic explainer voice | Blunt, mechanics-first; match `tokenization.mdx` |
| Widget that doesn't match the prose | Prose and `<VizFrame>` teach the same mechanic; caption says what to notice |
| Drills that test recall of a sentence | Probe understanding and interview angles; correct, blunt answers |
| Silently dropping a review finding | Resolve every `F#`: apply or push back with a reason |
| Forgetting an import or mis-typing the schema | Run `npm run build` and fix until green |
