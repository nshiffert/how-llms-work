# Outline: KL Divergence (`kl-divergence`)

> **Notes source:** `ralph/notes/all-topics.md` → "21. KL divergence".
> **Flagged: NOT covered in the voice sessions.** Build from first principles in the same style as the
> others, using the scaffolding the notes provide. Keep the house bar (real numbers, what breaks).

## Target frontmatter
```yaml
title: KL Divergence
category: math
hook: A directed distance between two distributions — asymmetric on purpose, and lurking inside RLHF, distillation, and VI.
crossLinks: [cross-entropy, distillation, softmax]
```

## Section seeds
1. **What it is** — You constantly need "how far is distribution Q from distribution P." Definition: `KL(P‖Q) = Σ_i P(i)·log(P(i)/Q(i))` — the expected *extra* bits to encode samples from P using a code built for Q. Zero iff P=Q; never negative.
2. **The mechanic** — It weights the log-ratio by P, which is why it's directional. **Island:** two distributions P and Q as draggable bars; reshape either and watch KL update live; a flip button to swap to KL(Q‖P) showing a *different* number; annotate which direction each real use (distillation, RLHF penalty) employs.
3. **Worked example** — Build concrete numbers: e.g. P=[0.7,0.2,0.1], Q=[0.5,0.3,0.2] → compute KL(P‖Q) and KL(Q‖P) term-by-term and show they differ. Tie to distillation's teacher/student [cat .7, dog .2, bird .1]. Code: `np.sum(P*np.log(P/Q))`.
4. **What breaks** — Unbounded/∞ when Q assigns 0 to an event P allows (log of ÷0) — the practical reason for smoothing/temperature. Asymmetry misleads if you compute the wrong direction (mode-covering vs mode-seeking).
5. **Drills (4–6)** — Why is KL asymmetric, and what does each direction prefer? Relationship to cross-entropy (CE = entropy(P) + KL(P‖Q); minimizing CE with fixed P = minimizing KL)? Where does KL show up (distillation KL(teacher‖student); RLHF/DPO KL penalty vs base; VAE prior)? Why does a zero in Q blow it up?

## Misconceptions to target
- Treating KL as a symmetric "distance" — it isn't; the visualization's flip button must make this visceral.

## Cross-lesson hooks
- **Name-drop / call back to:** cross-entropy (the exact algebraic relationship), distillation (KL is the standard distillation loss), softmax (KL is applied to softmax outputs).
- **crossLinks:** cross-entropy, distillation, softmax
