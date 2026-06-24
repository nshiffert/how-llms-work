# Outline: Catastrophic Forgetting (`catastrophic-forgetting`)

> **Notes source:** `ralph/notes/all-topics.md` → "8. Catastrophic forgetting". Re-read before writing.

## Target frontmatter
```yaml
title: Catastrophic Forgetting
category: finetune
hook: Chase task B’s minimum with full fine-tuning and the weights walk straight out of task A’s basin.
crossLinks: [lora, embeddings, cross-entropy]
```

## Section seeds
1. **What it is** — Fine-tuning on a new task can erase old competence. Definition: gradient descent on the new loss surface moves weights toward the new task's minimum with no regard that those same weights encoded general knowledge — the old knowledge gets overwritten.
2. **The mechanic** — The optimizer only sees the new loss; weights good for "general English" get displaced by weights good for "medical QA." **Island:** a 2D loss landscape with two minima (task A = pretraining, task B = fine-tune target). Animate full fine-tuning: weights drift to B's minimum while A's loss climbs. Then LoRA: weights barely move, both losses stay reasonable.
3. **Worked example** — Show a toy 2-parameter model with two quadratic bowls; step SGD toward B and tabulate A-loss rising each step; then constrain movement (LoRA-style) and show A-loss held. Code: two loss functions + a gradient-descent loop printing both losses per step.
4. **What breaks** — Model forgets everything outside the fine-tuning domain; out-of-distribution performance collapses; general reasoning/common sense degrade.
5. **Drills (4–6)** — Why does the optimizer overwrite useful weights? Does a bigger model fix it? (No — capacity isn't the problem; unconstrained updates are.) How does LoRA prevent it? What are EWC and replay? Why do small LR + early stopping help?

## Misconceptions to target
- "Need a bigger model" — bigger models forget too. The problem is **unconstrained weight updates**, not capacity.

## Cross-lesson hooks
- **Name-drop / call back to:** lora (the natural solution — base weights barely move), embeddings (fine-tuning can shift embeddings and break general performance), cross-entropy (the new-task loss being descended).
- **crossLinks:** lora, embeddings, cross-entropy
