# Outline: Beam Search vs Greedy (`beam-vs-greedy`)

> **Notes source:** `ralph/notes/all-topics.md` → "11. Beam search vs greedy decoding". Re-read before writing.

## Target frontmatter
```yaml
title: Beam Search vs Greedy
category: generation
hook: Greedy commits to the locally-best token and can’t take it back; beam keeps k hypotheses alive to escape that trap.
crossLinks: [temperature, top-k-top-p, autoregressive-vs-masked]
```

## Section seeds
1. **What it is** — Once the model gives a next-token distribution, you still have to *choose*. Definition: greedy = take the argmax each step (myopic, can't undo); beam search = keep K running hypotheses ranked by **cumulative sequence probability**, pick the best whole sequence at the end.
2. **The mechanic** — Beam: expand each of K candidates over the vocab → K×V continuations → keep top K by cumulative log-prob → repeat → pick the highest at EOS. Greedy = beam width 1. **Island:** animated search tree, beam-width slider (1/3/5/10); nodes expand with cumulative scores, pruned paths fade gray, the chosen path stays green.
3. **Worked example** — **real numbers (verbatim):** beam width 3–10 in production translation/summarization; greedy = width 1. Hand-trace a small tree: show a step where greedy's locally-best first token leads to a worse total than a beam-kept alternative ("mat" vs "rug" sentence). Code: a beam step that scores cumulative log-prob and prunes to top K.
4. **What breaks** — Greedy gets locally trapped. Beam is **deterministic** → bad for creative tasks. Beam favors "safe"/bland high-probability sequences (length-normalization is the patch).
5. **Drills (4–6)** — Is the tracked probability per-token or whole-sequence? (Whole.) After expanding 3 candidates do you keep 3 each (9) or top 3 overall? (Top 3 overall.) When greedy, when beam, when sampling? Why isn't beam good for creativity? Greedy as a special case of beam?

## Misconceptions to target
- "Beam search = creative" — **wrong**: beam is deterministic and tends to *safe* output. Kill this up front; point to temperature/top-k/top-p for diversity (global gap #10).
- Beam's probability is **cumulative across the whole sequence**, not per-token (the learner's "aha").

## Cross-lesson hooks
- **Name-drop / call back to:** temperature + top-k-top-p (the sampling alternatives for diversity), autoregressive-vs-masked (decoding operates on autoregressive generation).
- **crossLinks:** temperature, top-k-top-p, autoregressive-vs-masked
