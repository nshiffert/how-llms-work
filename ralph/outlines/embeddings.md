# Outline: Embeddings (`embeddings`)

> **Notes source:** `ralph/notes/all-topics.md` → "4. Embeddings". Re-read before writing.

## Target frontmatter
```yaml
title: Embeddings
category: basics
hook: A lookup table that starts as noise and ends up encoding meaning as geometry — direction is semantics.
crossLinks: [tokenization, attention, positional-encoding, rag]
```

## Section seeds
1. **What it is** — Tokens are integer ids; the model needs vectors. Definition: a learned lookup table with one row (e.g. 768-dim) per vocabulary token; the row IS the token's meaning, expressed as a position in continuous space.
2. **The mechanic** — Rows start as small Gaussian noise; backprop moves them **in place** (not via a learned mapping); tokens seen in similar contexts get pulled together. **Island:** a 2D/3D projection (pre-computed UMAP/t-SNE) of real embeddings — search a word, see nearest neighbors; plus a training animation of vectors snapping from random noise into semantic clusters.
3. **Worked example** — **real numbers (verbatim):** dim 768 (medium) / 4096+ (large); vocab 50K–150K; embedding table 50K × 768 ≈ 38M params. Show "king"/"queen" and "run"/"running" as nearby. Code: index a NumPy table by token id; cosine nearest-neighbors.
4. **What breaks** — Table size grows linearly with vocab (memory). Rare tokens stay near their random init (poorly trained). Fine-tuning can shift embeddings and break general performance (→ catastrophic forgetting).
5. **Drills (4–6)** — In place vs mapped-to-new-vectors? Single-token vs sentence/phrase embedding (average / last-token / full forward pass)? Is "running" one token or two (depends on BPE)? Why does direction encode meaning? Why do rare tokens have bad embeddings?

## Misconceptions to target
- Random vectors are **updated in place** by backprop, not mapped through a learned function.
- Token embeddings vs sentence/phrase embeddings are **different mechanisms** — make the distinction explicit (global gap #9).

## Cross-lesson hooks
- **Name-drop / call back to:** tokenization (tokens are what get embedded; vocab size sets table size), attention (Q/K/V are linear projections of embeddings), positional-encoding (added to embeddings before attention), RAG (sentence embeddings are the retrieval backbone).
- **crossLinks:** tokenization, attention, positional-encoding, rag
