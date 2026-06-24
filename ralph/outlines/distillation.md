# Outline: Distillation (`distillation`)

> **Notes source:** `ralph/notes/all-topics.md` → "9. Model distillation". Re-read before writing.

## Target frontmatter
```yaml
title: Distillation
category: finetune
hook: The teacher’s soft distribution carries more signal than the hard label — the student learns the dog-vs-cat uncertainty, not just the answer.
crossLinks: [kl-divergence, cross-entropy, qlora]
```

## Section seeds
1. **What it is** — You want a big model's quality at a small model's cost. Definition: train a small **student** to match a large **teacher's** output probability distribution (soft labels), not just the hard ground-truth label.
2. **The mechanic** — The teacher runs over data producing full soft distributions; the student is trained to match them via KL (or cross-entropy) against the teacher, not the one-hot label; the soft distribution carries the "probably cat, slightly small-dog" nuance the label lacks. **Island:** teacher-student diagram — a token flows through both in parallel, teacher emits a soft distribution, student tries to match, and the KL between them shrinks across training steps.
3. **Worked example** — **real numbers (verbatim):** teacher distribution cat 0.7, dog 0.2, bird 0.1. Show a student starting far off, the KL term-by-term, and the divergence shrinking. Tie ~90% of teacher quality at ~10× speed; this is how "mini/haiku/flash/lite" variants are made. Code: KL(teacher‖student) over a 3-class example.
4. **What breaks** — Student capacity caps how much it can absorb (can't match a far larger teacher perfectly). Distilling only on in-distribution data → student inherits teacher's blind spots and misses the long tail. Temperature on the soft labels matters (too low = back to hard labels).
5. **Drills (4–6)** — Why are soft labels more informative than hard labels? What loss compares student to teacher (KL/cross-entropy)? Is this how "mini" models are made? Where does temperature enter? What caps the student's quality?

## Misconceptions to target
- New term for the learner — anchor with "teacher-student" + "soft labels" + the cat/dog/bird numbers before any theory.

## Cross-lesson hooks
- **Name-drop / call back to:** kl-divergence (the loss comparing distributions — KL(teacher‖student)), cross-entropy (alternative/related distillation loss), qlora (another path to a smaller deployable model), softmax (the soft distribution is a softmax output).
- **crossLinks:** kl-divergence, cross-entropy, qlora
