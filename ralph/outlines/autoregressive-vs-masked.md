# Outline: Autoregressive vs Masked (`autoregressive-vs-masked`)

> **Notes source:** `ralph/notes/all-topics.md` → "14. Autoregressive vs masked language models". Re-read before writing.

## Target frontmatter
```yaml
title: Autoregressive vs Masked
category: generation
hook: Same transformer block, two training objectives: predict the next token left-to-right, or fill blanks using both sides.
crossLinks: [attention, embeddings, rag]
```

## Section seeds
1. **What it is** — Same architecture, two jobs decided by the training objective. Definition: autoregressive (GPT-style) predicts the next token from the left context only (causal mask); masked (BERT-style) hides ~15% of tokens and predicts them using both sides (bidirectional).
2. **The mechanic** — AR: loss at **every** position (next-token); causal mask blocks attending to the future. Masked: loss only at **masked** positions; full bidirectional attention. **Island:** two parallel animations of the same sentence — left, AR predicts left-to-right seeing only past (causal mask shown); right, masked has random tokens hidden and predicted from both directions. Color-code visible vs hidden per step.
3. **Worked example** — Take one sentence; show the causal attention mask (lower-triangular) vs the masked-LM setup (15% `[MASK]`). Tabulate where loss is computed in each. Code: build a causal mask vs a random 15% mask over token indices.
4. **What breaks** — AR can't see the future → can't be a bidirectional encoder for understanding. Masked models can't generate sequentially → not for free-form generation. Using the wrong one for the job (a masked model won't write; an AR model is a weaker pure embedder).
5. **Drills (4–6)** — Where is loss computed in each (every position vs masked positions)? Causal vs bidirectional attention — which goes with which? Which generates, which embeds-for-retrieval, and why? Can you hybridize? (Yes — encoder-decoder; bidirectional read + AR generate.) Why can only AR models do chain-of-thought?

## Misconceptions to target
- Thinking the architecture differs — it's the **objective + attention mask** that differ, not the block.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (causal vs bidirectional masking is the hinge), embeddings (masked models typically produce sentence embeddings), RAG (masked-style embedders retrieve; AR models generate), chain-of-thought (only AR can do it).
- **crossLinks:** attention, embeddings, rag
