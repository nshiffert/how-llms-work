# Outline: Context Window (`context-window`)

> **Notes source:** `ralph/notes/all-topics.md` → "3. Context windows". Re-read before writing.

## Target frontmatter
```yaml
title: Context Window
category: basics
hook: Attention is all-pairs, so doubling the context quadruples the cost — the wall every long-context trick is trying to climb.
crossLinks: [attention, rag, tokenization]
```

## Section seeds
1. **What it is** — The context window is the token budget; the reason it's finite is cost, not an arbitrary cap. Definition: the max number of tokens the model can attend over at once, bounded by the N² attention matrix that must fit in VRAM.
2. **The mechanic** — Attention computes a dot product for every pair of the N tokens → N² work per layer per head. **Island:** drag a context-length slider from 1K→128K and watch the dot-product count and attention-matrix memory grow as N² (a "fills-in" heatmap whose area is the cost); side-by-side dense vs sparse vs sliding-window so the reader sees what sparsity buys and loses.
3. **Worked example** — **real numbers (verbatim):** 4K → 16M dot products/layer/head; 8K → 64M; 32K → 1B; 128K → 16B. Show the ×4-per-doubling table. Code: a tiny loop computing `N*N` and the bytes for an `N×N` fp16 matrix.
4. **What breaks** — VRAM exhaustion is the hard wall *before* compute (correct the "CPU-bound" guess). Local/sparse attention scales but drops long-range dependencies. Coherence collapses when a document is truncated mid-stream.
5. **Drills (4–6)** — Why quadratic, not linear? What runs out first, compute or memory? How does GPT-4 reach 128K without changing the attention math (flash attention, KV caching, bigger GPUs)? What does sliding-window attention trade away? Why does an out-of-domain document eat your budget faster (tie to tokenization)?

## Misconceptions to target
- "Becomes CPU-bound" → it's GPU **VRAM** that blows up first.
- *Why* attention is quadratic — unpack "every token attends to every other token" explicitly.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (the N² comes from the Q·K matrix), tokenization (token count = budget; out-of-domain tokens cost more), RAG (the workaround — retrieve instead of stuffing).
- **crossLinks:** attention, rag, tokenization
