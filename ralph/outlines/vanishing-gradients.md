# Outline: Vanishing Gradients (`vanishing-gradients`)

> **Notes source:** `ralph/notes/all-topics.md` → "22. Vanishing gradients".
> **Flagged: NOT covered in the voice sessions.** Build from first principles in the same style as the
> others, using the scaffolding the notes provide.

## Target frontmatter
```yaml
title: Vanishing Gradients
category: math
hook: Stack enough layers and the backward signal decays to nothing — residual connections are the highway that let it survive.
crossLinks: [attention, cross-entropy]
```

## Section seeds
1. **What it is** — Deep nets stalled for decades; the cause was the backward pass, not the forward one. Definition: in backprop the gradient is a product of many per-layer partial derivatives; if each factor < 1, the product shrinks toward zero with depth and early layers stop learning.
2. **The mechanic** — Chain rule multiplies many sub-1 terms (sigmoid/tanh derivatives peak at 0.25/1); residual connections add an identity path whose derivative is 1 (a gradient "highway"); layer norm keeps activation scales sane; attention gives direct distant-token paths (no long sequential chain like RNNs). **Island:** animated gradient flow through a 20-layer net with toggles for residual / layer-norm / attention; watch per-layer gradient magnitudes — off: die at early layers; on: survive to every layer.
3. **Worked example** — Compute it: 20 layers each multiplying gradient by 0.5 → 0.5^20 ≈ 9.5e-7 (dead); with a residual identity path the signal passes ~intact. Show the magnitude-per-layer table both ways. Code: cumulative product of per-layer factors.
4. **What breaks** — Pre-transformer deep feedforward nets couldn't exceed ~10–20 layers. RNNs with sigmoid/tanh couldn't learn long-range dependencies (gradients vanished through time). The exploding-gradient twin (factors > 1) → why clipping exists.
5. **Drills (4–6)** — Why does depth cause vanishing (product of sub-1 derivatives)? How exactly does a residual connection fix it? Why did RNNs suffer on long sequences? Role of ReLU vs sigmoid/tanh? How does attention sidestep the sequential-chain problem?

## Misconceptions to target
- Thinking it's a forward-pass / capacity problem — it's the **backward** product of derivatives. More layers makes it worse, not better.

## Cross-lesson hooks
- **Name-drop / call back to:** attention (one of the fixes — direct long-range paths), cross-entropy (the loss whose gradient is being propagated back).
- **crossLinks:** attention, cross-entropy
