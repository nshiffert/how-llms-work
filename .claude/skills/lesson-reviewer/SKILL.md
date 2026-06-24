---
name: lesson-reviewer
description: Use when asked to review, critique, QA, or assess an LLM-internals lesson in this project (an MDX topic under src/content/topics/), or before publishing or revising one. Covers the lesson prose, interactive widgets, learning objectives, and summary-question drills. Its output is the input to the lesson-writer skill.
---

# Lesson Reviewer

## Overview

Review one lesson (`src/content/topics/<slug>.mdx`) and produce a **Review Report** that the `lesson-writer` skill can act on without re-reading the whole file or re-deriving anything.

**Core principle:** Feedback must be **specific, located, technically verified, and blunt.** A finding the writer cannot execute is not a finding. Praise that isn't actionable is noise — the report exists to drive a revision, not to flatter.

The house voice is mechanics-first, real numbers, no hedging (see the audio-tutor tutor prompt and the existing tokenization lesson for the standard). Review *against that bar*, not against generic "is this nice."

## Lesson anatomy (what you are reviewing)

- **Frontmatter:** `title`, `category` (basics|finetune|generation|advanced|math), `hook` (the one-line framing), `crossLinks[]` (related slugs), `draft`.
- **Body = five `<Section n title tag>` sections**, in order:
  1. **What it is** — the problem it solves + a crisp definition.
  2. **The mechanic** — how it actually works, anchored by interactive `<VizFrame>` widget(s).
  3. **Worked example** — real numbers, tables, runnable code.
  4. **What breaks** — concrete failure modes / where the abstraction leaks.
  5. **Interview pressure test** — `<Drill q>` flashcards (question visible, answer hidden).
- **Learning objectives are implicit:** the `hook` plus each Section's `tag` line. Treat them as the lesson's promises and check they are kept.
- **Summary questions = the Drills** in Section 5.
- **Widgets** are React/Astro islands inside `<VizFrame label caption>` (e.g. `BpeAnimator`, `RealTokenizer`).

## Review criteria

Score every part against these four (1–5; 5 = exemplary):

| Criterion | What it asks of THIS content |
|---|---|
| **Completeness** | Are all five sections present and doing their job? Definition, mechanic, real worked example, failure modes, and drills that span the topic. Nothing important to the topic missing; no dead-end claims. |
| **Clarity** | Define-before-use, one idea at a time, no ambiguous pronouns/jargon, accurate analogies. Could a sharp non-expert follow it once? |
| **Engagement** | Does it open with tension/stakes, use concrete examples, and make the reader *want* the next paragraph? Mechanics-first beats hand-wavy "AI is magic." |
| **Ease of understanding** | Cognitive load: pacing, scaffolding, visual breaks, callouts. Does each widget reduce load or add it? |

## Mandatory checks (do not skip)

- **Verify the technical content.** Recompute the numbers, trace the code, sanity-check every factual claim. A lesson can be beautifully clear and *wrong*. Flag anything you cannot verify as an **Open question**, do not wave it through.
- **Evaluate every widget pedagogically**, not just "it exists": does the `<VizFrame>` actually demonstrate the mechanic in Section 2? Is the `caption` accurate and does it tell the reader what to do and what to notice? Does it map to a real island component? Would a learner come away understanding the mechanic *because* of it?
- **Evaluate the implicit objectives:** does the body deliver what the `hook` and each section `tag` promise? Name any promise the lesson makes and doesn't keep.
- **Evaluate every Drill:** does it test understanding (not recall of a sentence)? Is the hidden answer correct, complete, and blunt? Do the drills together cover the topic's hard parts and likely interview probes?
- **Check cross-links and category** are sensible and resolve to real topics.

## Severity

`BLOCKER` (wrong, broken, or missing core content) · `MAJOR` (real damage to one criterion) · `MINOR` (worth fixing) · `NIT` (polish). Sort findings BLOCKER → NIT.

## Output contract — the Review Report

Emit exactly this structure. The `lesson-writer` consumes it, so every finding needs a stable ID and an executable **Fix**.

```markdown
# Lesson Review: <Title> (<slug>)

**Verdict:** Ship | Revise | Major rework — <one blunt sentence>
**Scores (1–5):** Completeness N · Clarity N · Engagement N · Ease N

## Findings

### F1 · [SEVERITY] · <location> · <criteria affected>
**Problem:** <what's wrong and why it fails the criterion; quote the offending text or name the line/section/widget/drill>
**Fix:** <a concrete directive the writer can execute — change X to Y, add Z covering W, recompute this number, rewrite this drill answer to say…>

### F2 · …

## Strengths (preserve these)
- <specific things that work, so the writer doesn't regress them>

## Open questions (could not verify)
- <factual/technical claims needing author confirmation, with why>
```

Rules for the report:
- **Location is required** on every finding: `Section 3`, `frontmatter.hook`, `VizFrame "GPT-4o tokenizer"`, `Drill 4`, etc.
- **Fix is a directive, not a wish.** "Could be clearer" is rejected; "Section 1 ¶2 uses 'it' three times with different referents — name each (the vocabulary / the token / the model)" is accepted.
- Quote the offending text so the writer can find it.
- Keep Strengths short and specific — their only job is to stop regressions.

## Common mistakes

| Mistake | Do instead |
|---|---|
| Vague feedback ("tighten this up") | Locate it, quote it, give the exact change |
| Praising to soften | House voice is blunt; rank by severity, skip the cushioning |
| Trusting the numbers/code | Recompute and trace every one; flag unverifiable as Open question |
| "Widget is present ✓" | Judge whether it *teaches the mechanic* and whether the caption is right |
| Reviewing prose only | Objectives, widgets, and drills get the same four-criteria scrutiny |
| Findings the writer can't act on | Every finding ends in an executable Fix with a location |
