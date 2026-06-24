# Outline: Mixture of Experts (`mixture-of-experts`)

> **Notes source:** `ralph/notes/all-topics.md` → "17. Mixture of Experts (MoE)". Re-read before writing.

## Target frontmatter
```yaml
title: Mixture of Experts
category: advanced
hook: A gating network routes each token to a few experts out of many — more parameters, roughly constant compute per token.
crossLinks: [attention, distillation, context-window]
```

## Section seeds
1. **What it is** — You want enormous capacity without enormous per-token cost. Definition: replace each feedforward layer with N expert networks plus a small **gating network** that routes every token to its top-k experts (usually k=2); total params huge, active params per token small.
2. **The mechanic** — Gating net takes a token's representation → routing probabilities over N experts → top-k experts run → outputs weighted-summed by gating scores → forward. Attention stays shared/unified; only the feedforward becomes MoE. **Island:** gating animation — token in, gating bar chart over N experts, top-k light up, token flows through them in parallel, outputs combine; plus a sequence view showing different experts activating for different tokens.
3. **Worked example** — One token: show gating logits → softmax → top-2 selection → weighted combine. Tabulate "total params vs active params" for, e.g., 8 experts top-2 (active ≈ 2/8 of expert params). Code: gating softmax + top-k mask + weighted sum of expert outputs.
4. **What breaks** — Load imbalance (a few experts hog tokens) → auxiliary load-balancing loss. Routing instability during training. Cross-machine sharding adds communication cost (different tokens take different hardware paths).
5. **Drills (4–6)** — What's the router called (gating network)? Training or inference — when does routing happen? (Both.) What flows into an expert and out (one token representation in, transformed representation out — not a prediction)? How does attention interact with MoE (stays unified; FFN becomes MoE)? Why decouple capacity from per-token compute?

## Misconceptions to target
- MoE is an **architectural** routing mechanism, **not** "personas collaborating" (that's multi-agent/debate). Open the page by killing this (global gap #5).
- The expert **transforms**, it doesn't predict — prediction is the final output layer after all blocks.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (shared across experts; MoE swaps the feedforward), distillation (an alternative efficiency path), context-window/compute (MoE decouples capacity from per-token cost).
- **crossLinks:** attention, distillation, context-window
