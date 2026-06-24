# Outline: LoRA (`lora`)

> **Notes source:** `ralph/notes/all-topics.md` → "6. LoRA (Low-Rank Adaptation)". Re-read before writing.

## Target frontmatter
```yaml
title: LoRA
category: finetune
hook: You don’t need to move all 768×768 weights — a rank-8 detour through B·A captures the update with ~2% of the parameters.
crossLinks: [qlora, catastrophic-forgetting, embeddings]
```

## Section seeds
1. **What it is** — Full fine-tuning updates billions of weights; that's expensive and risky. Definition: LoRA freezes the base weight W and learns two small matrices B (d×r) and A (r×d) so the *update* is approximated by B·A; at inference the effective weight is **W + B·A**.
2. **The mechanic** — Train only B and A with small rank r; the additive low-rank detour captures the meaningful part of the update because fine-tuning updates are intrinsically low-rank. **Island:** matrix decomposition visualizer — full W (768×768) beside B (768×r) and A (r×768), an r slider, the live parameter count, and an animation of the B·A product reconstructing the update.
3. **Worked example** — **real numbers (verbatim):** full fine-tune of a 7B model = all ~7B params; LoRA r=8 on a 768-dim layer = 768×8 + 8×768 ≈ 12K params/matrix — a ~50,000× reduction; total LoRA params ≈ 0.1–1% of base. Code: `W_eff = W + B @ A`; param-count formula `2*d*r` vs `d*d`.
4. **What breaks** — High r defeats the purpose (you're approaching full fine-tune). LoRA can't make arbitrarily large behavior changes — big domain shifts may still need full fine-tuning. Stacked adapters can interfere if not composed carefully.
5. **Drills (4–6)** — Is LoRA a standalone model or an additive modification to existing weights? Why does low rank work at all (intrinsic low rank of updates)? What's the param count for r=8 on a 768×768 layer vs full? When LoRA vs full fine-tune? What happens as r → full dimension?

## Misconceptions to target
- LoRA is **on top of a frozen base** (W + B·A), not a standalone model — the island must make the additive relationship unmistakable (global gap #6).
- Why low-rank approximations work — needs the "intrinsic low rank of weight updates" explanation.

## Cross-lesson hooks
- **Name-drop / call back to:** catastrophic-forgetting (LoRA solves it as a side effect — base weights barely move), qlora (LoRA on a quantized base), embeddings (one example of a weight matrix LoRA can adapt).
- **crossLinks:** qlora, catastrophic-forgetting, embeddings
