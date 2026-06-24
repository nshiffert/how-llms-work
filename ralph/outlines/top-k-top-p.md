# Outline: Top-k vs Top-p (`top-k-top-p`)

> **Notes source:** `ralph/notes/all-topics.md` → "13. Top-k vs top-p (nucleus) sampling". Re-read before writing.

## Target frontmatter
```yaml
title: Top-k vs Top-p
category: generation
hook: Top-k keeps a fixed count; top-p keeps a fixed probability mass — one is rigid, one adapts to how confident the model is.
crossLinks: [temperature, softmax, beam-vs-greedy]
```

## Section seeds
1. **What it is** — Sampling from the full vocab lets junk tail tokens slip in; you truncate first. Definition: top-k keeps the K highest-probability tokens; top-p (nucleus) keeps the smallest set whose cumulative probability ≥ p. Both renormalize, then sample.
2. **The mechanic** — Top-k = fixed count, ignores distribution shape; top-p = adaptive count, shrinks when one token dominates and grows when probabilities are diffuse. **Island:** the same probability bars as the temperature page, with a top-k slider and a top-p slider; tokens cut by either fade out; a peaked vs flat preset shows top-p adapting while top-k stays rigid.
3. **Worked example** — **real numbers (verbatim):** top-k K=40/50 common; top-p p=0.9/0.95; often combined (top-k then top-p then temperature). On a peaked distribution show top-p keeping ~2 tokens; on a flat one keeping ~20; top-k=40 keeps 40 regardless. Code: sort, cumulative-sum mask for top-p; slice for top-k; renormalize.
4. **What breaks** — Top-k on a peaked distribution keeps 39 junk alternatives; on a flat distribution clips good candidates. Top-p with a tiny p collapses to near-greedy. Order of operations (temperature before/after truncation) changes results.
5. **Drills (4–6)** — Fixed count vs fixed mass — which adapts and why does that matter? Why combine top-k and top-p? What does top-p do on a very peaked vs very flat distribution? Where does temperature sit relative to truncation? When would top-k actively hurt quality?

## Misconceptions to target
- Treating top-k and top-p as interchangeable — the adaptivity of top-p to distribution shape is the whole point.

## Cross-lesson hooks
- **Name-drop / call back to:** temperature (applied before truncation; shares the bar-chart island), softmax (operates on the resulting probabilities), beam-vs-greedy (deterministic counterpoint to sampling).
- **crossLinks:** temperature, softmax, beam-vs-greedy
