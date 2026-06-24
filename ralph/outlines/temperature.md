# Outline: Temperature (`temperature`)

> **Notes source:** `ralph/notes/all-topics.md` → "12. Temperature". Re-read before writing.

## Target frontmatter
```yaml
title: Temperature
category: generation
hook: One scalar divides the logits before softmax — and reshapes the entire next-token distribution from spiky to flat.
crossLinks: [softmax, top-k-top-p, beam-vs-greedy]
```

## Section seeds
1. **What it is** — You want a dial between predictable and diverse output. Definition: temperature T rescales logits before softmax — `softmax(logits / T)` — changing the *shape* of the next-token distribution, never breaking sum-to-1.
2. **The mechanic** — Low T magnifies logit gaps → peaked → near-deterministic; high T shrinks gaps → flatter → more diverse, eventually incoherent; T=1 is identity. **Island:** next-token probability bars for a fixed prompt prefix, a temperature slider 0.1→2.0 sharpening/flattening the bars live, and 5 sampled completions at the current T below.
3. **Worked example** — **real numbers (verbatim):** T=0.1 deterministic/repetitive; T=0.7–1.0 typical conversational; T>1.5 wandering. Reuse softmax's scores (5,2,1): show the distribution at T=0.5 vs 1 vs 2 numerically. Code: `softmax(logits / T)`.
4. **What breaks** — T=0 is a divide-by-zero singularity → implementations treat it as greedy/argmax. Very high T → ~uniform sampling → incoherent. Very low T → repetitive, formulaic loops.
5. **Drills (4–6)** — Where in the pipeline does T apply (before softmax, like √d scaling)? Does dividing by T break sum-to-1? (No — softmax renormalizes.) Why does a scalar reshape the distribution (exponentiation)? What's T=0 in practice? T vs top-k/top-p — different knobs?

## Misconceptions to target
- Dividing by T does **not** disrupt the softmax sum-to-1 property — it only changes the shape.

## Cross-lesson hooks
- **Name-drop / call back to:** softmax (temperature is literally a softmax pre-scaling — same place as attention's √d), top-k-top-p (usually combined with temperature), beam-vs-greedy (the deterministic alternative).
- **crossLinks:** softmax, top-k-top-p, beam-vs-greedy
