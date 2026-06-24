# Outline: Softmax (`softmax`)

> **Notes source:** `ralph/notes/all-topics.md` → "19. Softmax in attention (and elsewhere)". Re-read before writing.

## Target frontmatter
```yaml
title: Softmax
category: math
hook: The function that turns any vector of scores into a probability distribution — and exaggerates the winner on the way.
crossLinks: [attention, temperature, cross-entropy, distillation]
```

## Section seeds
1. **What it is** — Models produce real-valued scores (logits); decisions need a probability distribution. Definition: `softmax(s_i) = e^(s_i) / Σ_j e^(s_j)` — outputs in (0,1), sum to 1, differentiable everywhere. The *sharpness* (winner-takes-most) is the whole point.
2. **The mechanic** — Exponentiate, then normalize; exponentiation amplifies score gaps. **Island:** three draggable input bars (scores) → live output probabilities; a toggle for **softmax vs linear normalization** side by side so the reader *feels* exponentiation amplify differences; a built-in temperature slider (the cross-link to the temperature page).
3. **Worked example** — **real numbers (verbatim):** scores 5, 2, 1 → e^5≈148, e^2≈7.4, e^1≈2.7 → sum 158.1 → 0.94, 0.05, 0.017. Contrast linear-norm of the same: /8 → 0.625, 0.25, 0.125 (much flatter). Code: numpy softmax with the max-subtraction trick.
4. **What breaks** — Without √d scaling before softmax (in attention) dot products saturate → near one-hot, gradients vanish. Very large negative scores → ~0 probability (contribute nothing). Naive `exp` overflows → real impls subtract the max first (mathematically identical).
5. **Drills (4–6)** — Why exponentiate instead of linear-normalize? Does dividing inputs by a scalar (temperature, √d) break sum-to-1? (No.) Why subtract the max in practice? Why softmax specifically (max-entropy, differentiable, smooth)? Where does softmax do its most important job (attention)?

## Misconceptions to target
- Why exponentiation *specifically* — only lands via the linear-normalization contrast.
- Scaling inputs never breaks the sum-to-1 property — softmax always renormalizes.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (the sharpening step in Q·K→softmax→ΣV), temperature (a softmax pre-scaling), cross-entropy (usually applied to softmax outputs), distillation (KL on softmax outputs is the distillation loss).
- **crossLinks:** attention, temperature, cross-entropy, distillation
