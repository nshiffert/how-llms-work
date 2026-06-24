# Outline: QLoRA (`qlora`)

> **Notes source:** `ralph/notes/all-topics.md` → "7. QLoRA (Quantized LoRA)". Re-read before writing.

## Target frontmatter
```yaml
title: QLoRA
category: finetune
hook: Quantize the frozen base to 4-bit, keep the tiny adapters in full precision — fine-tune a 65B model on one GPU.
crossLinks: [lora, distillation, vanishing-gradients]
```

## Section seeds
1. **What it is** — Sometimes the wall is memory, not compute. Definition: QLoRA = LoRA on top of a base model **quantized to 4-bit**; the base is frozen *and* compressed, only the LoRA adapters stay in full precision.
2. **The mechanic** — Round each frozen weight to int4 so the base fits in VRAM; train full-precision adapters on top. **Island:** a single fp32 weight animating its rounding to int4; a quantization-error histogram across a weight matrix; a memory bar chart fp32 vs fp16 vs int8 vs int4 base + the small adapters.
3. **Worked example** — **real numbers (verbatim):** bytes/param — fp32=4, fp16=2, int8=1, int4=0.5 (8× smaller than fp32). A 7B model: fp32=28GB → int4=3.5GB → now fine-tunable on a 16GB consumer GPU. Code: a toy uniform int4 quantizer (scale + round + clamp) and the error.
4. **What breaks** — Quantization error accumulates — an int4 base is less accurate than fp16. Some tasks degrade more than others; sensitive math reasoning is hit hardest.
5. **Drills (4–6)** — What does QLoRA quantize and what stays full precision? Why does it enable single-GPU fine-tuning of huge models? Compute bytes: 7B at int4? Is QLoRA for specific domains or resource limits? What's the accuracy cost of 4-bit?

## Misconceptions to target
- QLoRA is **resource-constrained, not domain-specific** — frame the whole page around hardware/VRAM limits, not specialized vocabularies (global gap #7).

## Cross-lesson hooks
- **Name-drop / call back to:** lora (QLoRA is LoRA on a quantized base — read that first), distillation (an alternative route to a cheaper deployable model), vanishing-gradients/precision (why adapters stay full precision).
- **crossLinks:** lora, distillation, vanishing-gradients
