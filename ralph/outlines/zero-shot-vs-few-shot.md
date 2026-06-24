# Outline: Zero-shot vs Few-shot (`zero-shot-vs-few-shot`)

> **Notes source:** `ralph/notes/all-topics.md` → "18. Zero-shot vs few-shot learning". Re-read before writing.

## Target frontmatter
```yaml
title: Zero-shot vs Few-shot
category: advanced
hook: Examples in the prompt are weight-free learning — accuracy climbs as you spend context on demonstrations.
crossLinks: [attention, context-window, chain-of-thought]
```

## Section seeds
1. **What it is** — You can adapt behavior without touching weights. Definition: zero-shot describes the task in words and relies on pretraining; few-shot puts a handful of input→output examples in the prompt and the model continues the pattern.
2. **The mechanic** — Few-shot examples enter the context window; attention treats them as relevant context and the model recognizes the pattern **in a single forward pass** — "in-context learning," no gradient updates. **Island:** prompt builder — add 0/1/3/5 examples before a query, show classification accuracy climbing (pre-computed results), and the context-window consumption growing with each example.
3. **Worked example** — A small translation/classification task: show the zero-shot prompt, then 1-shot and 3-shot prompts (English→French pairs), and the accuracy curve. Tabulate tokens consumed per added example. Code: build the few-shot prompt string and count tokens.
4. **What breaks** — Examples eat the context budget (tie to context-window). Poorly chosen or biased examples mislead (ordering effects). Diminishing returns past a few examples. It's not real "learning" — nothing persists beyond the prompt.
5. **Drills (4–6)** — Why does few-shot work with frozen weights (in-context learning via attention)? What does "in-context learning" mean precisely? Zero-shot vs few-shot — when each? What's the cost of more examples (context budget)? How does CoT relate (often done few-shot)?

## Misconceptions to target
- "Few-shot updates the model" — it does **not**; weights are frozen, the examples just become attended context for one forward pass.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (in-context learning is fundamentally an attention phenomenon), context-window (examples consume budget), chain-of-thought (CoT is often few-shot with example reasoning chains).
- **crossLinks:** attention, context-window, chain-of-thought
