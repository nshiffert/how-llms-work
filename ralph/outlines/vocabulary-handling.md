# Outline: Vocabulary Handling (`vocabulary-handling`)

> **Notes source:** `ralph/notes/all-topics.md` → "10. Vocabulary handling". Re-read before writing.

## Target frontmatter
```yaml
title: Vocabulary Handling
category: finetune
hook: Vocab size is a dial between sequence length and embedding-table size — and it decides how a rare word shatters.
crossLinks: [tokenization, context-window, embeddings]
```

## Section seeds
1. **What it is** — You can't give every possible word its own token. Definition: the vocabulary is the fixed set of tokens BPE produces up to a size cap (~50K–150K); anything outside it is reconstructed from smaller sub-word pieces, never an `[UNK]`.
2. **The mechanic** — BPE merges frequent pairs until the cap, then stops; at inference, out-of-vocab text decomposes into in-vocab sub-words (down to bytes if needed). Bigger vocab = shorter sequences but a bigger embedding table; smaller vocab = the reverse. **Island:** tokenize the same text at vocab sizes 1K / 32K / 100K / 250K side by side — show token count, embedding-table memory, and how a rare word shatters into more pieces at small vocab.
3. **Worked example** — **real numbers (verbatim):** cap ~100K typical; domain text (medical/legal/code/non-English) tokenizes 2–3× longer than general English. Tabulate a rare proper noun split into N pieces at each vocab size, and the embedding-table cost (vocab × dim). Code: count tokens per vocab size on a sample string.
4. **What breaks** — Domain/rare text tokenizes 2–3× longer → eats the context budget. Rare proper nouns split into many tiny tokens. Custom domain vocabularies are possible but rarely worth the engineering cost — teams just eat the inefficiency.
5. **Drills (4–6)** — What's the trade-off bigger vs smaller vocab? Why no `[UNK]` in BPE models? Why does domain text cost more tokens? When is a custom vocabulary worth it? How does vocab size touch both sequence length and memory?

## Misconceptions to target
- Expecting an explicit unknown token — modern BPE has none; the fallback is sub-word/byte decomposition.

## Cross-lesson hooks
- **Name-drop / call back to:** tokenization (vocab is the output of BPE training — read that first), context-window (token count = budget; longer tokenization shrinks effective context), embeddings (each vocab token gets an embedding row).
- **crossLinks:** tokenization, context-window, embeddings
