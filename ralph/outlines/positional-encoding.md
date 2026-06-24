# Outline: Positional Encoding (`positional-encoding`)

> **Notes source:** `ralph/notes/all-topics.md` → "5. Positional encoding". Re-read before writing.
> **Flagged by the learner: visual-first.** Build/spec the heatmap island FIRST, then write prose around it.
> Do NOT open with prose.

## Target frontmatter
```yaml
title: Positional Encoding
category: basics
hook: Attention is order-blind by construction, so position has to be injected — as stacked sine waves, learned vectors, or rotations.
crossLinks: [attention, embeddings, context-window]
```

## Section seeds
1. **What it is** — Transformers process all tokens in parallel; without help, "the king is here" and "here is the king" are the same bag. Definition: a position-dependent vector added to each token embedding before attention, so the same token at different positions becomes a different input.
2. **The mechanic** — Sinusoidal: each position → a vector (same dim as the embedding) built from sine/cosine at many frequencies; low freq = coarse position, high freq = fine; deterministic, the model learns to *interpret* it. **Island (lead with this):** stacked heatmap (Y=position, X=dimension, color=value) showing the wave bands; a two-position comparison (pick positions, see line graphs, drag to watch similarity change); a comparison panel sinusoidal vs learned vs RoPE vs ALiBi on the same input.
3. **Worked example** — Notes mark exact numbers "needs development": derive them from the standard formula `PE(pos,2i)=sin(pos/10000^(2i/d))`, `PE(pos,2i+1)=cos(...)`. Compute a few real entries for d=8, pos=0,1,2 and show the vector. Code: the sinusoid generator.
4. **What breaks** — No PE → order-blind (the king/here example). Sinusoidal extrapolates poorly past training length; learned PE is *undefined* past max length (worse). This is why RoPE/ALiBi exist for long context.
5. **Drills (4–6)** — Why is attention order-blind? Where exactly is PE added (before Q/K/V projection)? Sinusoidal vs learned vs RoPE vs ALiBi — one line each. Why does learned PE fail to extrapolate? How does PE choice interact with context window?

## Misconceptions to target
- Sinusoidal patterns are hard from words alone → the heatmap must carry the explanation (global gap #8).

## Cross-lesson hooks
- **Name-drop / call back to:** attention (PE added to embeddings before Q/K/V; attention itself is order-blind), embeddings (PE lives in the same dimensional space, added to the row), context-window (PE choice sets how far you can extrapolate).
- **crossLinks:** attention, embeddings, context-window
