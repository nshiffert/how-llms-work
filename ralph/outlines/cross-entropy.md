# Outline: Cross-entropy Loss (`cross-entropy`)

> **Notes source:** `ralph/notes/all-topics.md` → "20. Cross-entropy loss". Re-read before writing.

## Target frontmatter
```yaml
title: Cross-entropy Loss
category: math
hook: The loss is just the negative log of the probability you put on the right answer — and the log is why being confidently wrong is catastrophic.
crossLinks: [softmax, kl-divergence, distillation]
```

## Section seeds
1. **What it is** — Training needs a single number for "how wrong was this prediction." Definition: for true class c and predicted distribution p, `loss = −log(p_c)` — the negative log of the probability mass on the correct answer.
2. **The mechanic** — Only the correct class's probability matters; the −log curve punishes low confidence brutally and rewards high confidence cheaply. **Island:** bar chart of predicted distribution vs one-hot ground truth; drag the predicted probability of the correct class 0.01→0.99 and watch the loss number; overlay the −log(p) curve so the asymmetry is visible.
3. **Worked example** — **real numbers (verbatim):** p_c=0.99 → 0.01; 0.7 → 0.36; 0.1 → 2.3; 0.01 → 4.6; 0.001 → 6.9. Token example: true="cat"; [cat .7, dog .2, bird .1]→0.36; [cat .01,…]→4.6; [cat .99,…]→0.01. Note LM loss averages −log over every token position. Code: `-np.log(p_correct)`.
4. **What breaks** — Confidently wrong (tiny p on the truth) → huge loss; this is the gradient pressure that makes models calibrate. A single 0-probability on the actual token → infinite loss (why you never hard-zero a vocab entry).
5. **Drills (4–6)** — Why log, not linear error? Why does confidently-wrong cost so much more than slightly-wrong? What's the "label" in language modeling (the next token — self-supervised)? Relationship to entropy and KL (CE = entropy(P) + KL(P‖Q))? Why pair it with softmax?

## Misconceptions to target
- Unfamiliar term → ground it with the concrete −log(0.7)≈0.36 ladder before any theory.

## Cross-lesson hooks
- **Name-drop / call back to:** softmax (CE is almost always applied to softmax outputs), kl-divergence (CE = entropy of truth + KL(P‖Q)), distillation (CE/KL between teacher and student).
- **crossLinks:** softmax, kl-divergence, distillation
