# Ralph Progress — LLM Internals Lessons

Single source of truth for the lesson-build loop. The loop (`ralph/loop.sh` → `ralph/PROMPT.md`)
reads this top-to-bottom, picks the **first row whose status is `todo`**, builds that one lesson,
flips it to `done`, commits, and exits. When no `todo` rows remain it writes `ralph/DONE` and stops.

**Status values:** `done` · `todo` · `in_progress` (claimed by the current iteration) · `blocked` (see note).
**Order is pedagogical:** Basics → Math → Generation → Fine-tuning → Advanced, so every cross-linked
topic is authored before (or alongside) the lessons that lean on it. Cross-links resolve against
`src/data/topics.ts`, not page status, so a link to a not-yet-built topic is fine.

**Rule for the loop:** edit ONLY the row you are working on. Set it to `in_progress` at the start of an
iteration and to `done` (with the commit short-sha) at the end. Never touch other rows.

| #  | Slug                     | Category   | Status | Outline                                   | Commit |
|----|--------------------------|------------|--------|-------------------------------------------|--------|
| 0  | tokenization             | basics     | done   | (pre-existing)                            | —      |
| 0  | attention                | basics     | done   | (pre-existing)                            | —      |
| 1  | context-window           | basics     | done   | [outline](outlines/context-window.md)     | 58577e1 |
| 2  | embeddings               | basics     | done   | [outline](outlines/embeddings.md)         | 17d3317 |
| 3  | positional-encoding      | basics     | done   | [outline](outlines/positional-encoding.md)| fc25ffe |
| 4  | softmax                  | math       | done   | [outline](outlines/softmax.md)            | 408cda6 |
| 5  | cross-entropy            | math       | done   | [outline](outlines/cross-entropy.md)      | 643cb2f |
| 6  | kl-divergence            | math       | done   | [outline](outlines/kl-divergence.md)      | 3b547f2 |
| 7  | vanishing-gradients      | math       | done   | [outline](outlines/vanishing-gradients.md)| ffaedc9 |
| 8  | beam-vs-greedy           | generation | done   | [outline](outlines/beam-vs-greedy.md)     | 1fc1be2 |
| 9  | temperature              | generation | done   | [outline](outlines/temperature.md)        | 65df4e3 |
| 10 | top-k-top-p              | generation | done   | [outline](outlines/top-k-top-p.md)        | bb54125 |
| 11 | autoregressive-vs-masked | generation | done   | [outline](outlines/autoregressive-vs-masked.md) | 9616714 |
| 12 | lora                     | finetune   | done   | [outline](outlines/lora.md)               | d5cfce6 |
| 13 | qlora                    | finetune   | todo   | [outline](outlines/qlora.md)              |        |
| 14 | catastrophic-forgetting  | finetune   | todo   | [outline](outlines/catastrophic-forgetting.md) |   |
| 15 | distillation             | finetune   | todo   | [outline](outlines/distillation.md)       |        |
| 16 | vocabulary-handling      | finetune   | todo   | [outline](outlines/vocabulary-handling.md)|        |
| 17 | rag                      | advanced   | todo   | [outline](outlines/rag.md)                |        |
| 18 | chain-of-thought         | advanced   | todo   | [outline](outlines/chain-of-thought.md)   |        |
| 19 | mixture-of-experts       | advanced   | todo   | [outline](outlines/mixture-of-experts.md) |        |
| 20 | zero-shot-vs-few-shot    | advanced   | todo   | [outline](outlines/zero-shot-vs-few-shot.md) |     |

## Blocked notes

_(empty — the loop appends `slug — reason` here if it has to mark a row `blocked`)_
