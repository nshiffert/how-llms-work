# Outline: Chain-of-Thought (`chain-of-thought`)

> **Notes source:** `ralph/notes/all-topics.md` → "16. Chain-of-Thought (CoT) prompting". Re-read before writing.

## Target frontmatter
```yaml
title: Chain-of-Thought
category: advanced
hook: The intermediate tokens aren’t decoration — each step becomes context that anchors the next, turning one hard hop into many easy ones.
crossLinks: [attention, autoregressive-vs-masked, zero-shot-vs-few-shot]
```

## Section seeds
1. **What it is** — One hard reasoning hop is unreliable; many small ones aren't. Definition: prompting the model to produce intermediate reasoning before the answer — and the reasoning works because each generated token becomes attended-over context for the next.
2. **The mechanic** — Every token the model emits joins the context; "Step 1… Step 2…" tokens become attention targets for the final answer token — a scratchpad the model builds for itself. Not architectural; an emergent behavior of autoregressive generation + attention. **Island:** side-by-side completion of a multi-step problem — left, direct answer (often wrong); right, "let's think step by step" generating tokens one at a time with each step highlighted as an attention target for the final answer.
3. **Worked example** — A multi-step arithmetic/word problem: show the direct answer failing and the stepwise trace succeeding, with the same model. Tabulate how the answer token attends to the intermediate steps. Code: two prompts (direct vs CoT) and the resulting token sequences.
4. **What breaks** — Only autoregressive models can do it (sequential generation required). Steps can be confidently wrong and compound. Longer chains burn context budget. CoT ≠ agentic loop (no external action between tokens).
5. **Drills (4–6)** — Why do intermediate tokens help (attention over them)? Is CoT built into the model or a prompt technique? CoT vs agentic loop — what's the dividing line (single forward pass vs multiple passes with external actions)? Why can't a masked model do CoT? How does CoT interact with few-shot?

## Misconceptions to target
- CoT vs agentic loops — build the explicit side-by-side: **single forward pass** vs **multiple passes with external action between** (global gap #4).
- CoT is a prompting technique exploiting attention, **not** a built-in capability.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (intermediate tokens become attended context — the whole mechanism), autoregressive-vs-masked (only AR can do CoT), zero-shot-vs-few-shot (CoT is often done few-shot with example reasoning chains).
- **crossLinks:** attention, autoregressive-vs-masked, zero-shot-vs-few-shot
