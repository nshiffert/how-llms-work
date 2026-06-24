# Outline: RAG (`rag`)

> **Notes source:** `ralph/notes/all-topics.md` → "15. RAG (Retrieval-Augmented Generation)". Re-read before writing.
> Learner has hands-on RAG / vector-DB experience (auction platform) — pitch at a practitioner, lead with the failure modes.

## Target frontmatter
```yaml
title: RAG
category: advanced
hook: Don’t bake the knowledge into weights — retrieve it at query time and paste it into the prompt. The failure mode is the lesson.
crossLinks: [embeddings, context-window, autoregressive-vs-masked]
```

## Section seeds
1. **What it is** — Facts in weights are lossy, stale, and un-updatable. Definition: RAG retrieves relevant documents at query time and injects them into the prompt, so the model answers from text in context rather than from memorized weights.
2. **The mechanic** — Ingest→chunk; embed chunks→vector DB; at query time embed the question with the same model; retrieve nearest chunks (cosine), often hybridized with keyword/BM25; stuff top-k into the prompt; generate. **Island:** full pipeline animation query→embedding→similarity search→top-k chunks→prompt injection→generation; plus a failure mode where the query matches nothing well, retrieval returns junk, and the model hallucinates.
3. **Worked example** — Walk a concrete query: embed it, score cosine vs 4–5 chunk vectors, pick top-k, show the assembled prompt. Use small explicit vectors so the cosine numbers are real. Code: cosine similarity + top-k selection over a handful of chunk embeddings.
4. **What breaks** — Retrieval failure → hallucination from thin context. Chunk-size mismatch (too small loses context; too large wastes budget). Embedding drift (better model, stale index). Operational complexity (vector DB, embedding pipeline, retrieval latency).
5. **Drills (4–6)** — Why does RAG beat fine-tuning for *facts* (verbatim in context, easy updates, bounded hallucination)? When fine-tune instead (behavior/format, not facts)? What embedder type retrieves (masked/bidirectional)? Cosine vs dot product here? How does chunk size trade off? What's the #1 failure mode?

## Misconceptions to target
- RAG changes *facts available in context*, not model *behavior* — fine-tuning is for behavior. Make the boundary explicit.

## Cross-lesson hooks
- **Name-drop / call back to:** embeddings (the foundation of semantic retrieval), context-window (retrieved chunks consume the budget — the reason chunking matters), autoregressive-vs-masked (masked-style embedders retrieve; AR models generate).
- **crossLinks:** embeddings, context-window, autoregressive-vs-masked
