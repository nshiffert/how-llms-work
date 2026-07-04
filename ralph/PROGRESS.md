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
| 2  | embeddings               | basics     | done   | [outline](outlines/embeddings.md)         | d21ebd6 |
| 3  | positional-encoding      | basics     | todo   | [outline](outlines/positional-encoding.md)|        |
| 4  | softmax                  | math       | todo   | [outline](outlines/softmax.md)            |        |
| 5  | cross-entropy            | math       | todo   | [outline](outlines/cross-entropy.md)      |        |
| 6  | kl-divergence            | math       | todo   | [outline](outlines/kl-divergence.md)      |        |
| 7  | vanishing-gradients      | math       | todo   | [outline](outlines/vanishing-gradients.md)|        |
| 8  | beam-vs-greedy           | generation | todo   | [outline](outlines/beam-vs-greedy.md)     |        |
| 9  | temperature              | generation | todo   | [outline](outlines/temperature.md)        |        |
| 10 | top-k-top-p              | generation | todo   | [outline](outlines/top-k-top-p.md)        |        |
| 11 | autoregressive-vs-masked | generation | todo   | [outline](outlines/autoregressive-vs-masked.md) |  |
| 12 | lora                     | finetune   | todo   | [outline](outlines/lora.md)               |        |
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
