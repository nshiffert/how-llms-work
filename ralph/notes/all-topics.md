# LLM Deep Dive — Session Notes by Topic

These are my notes from a week of voice-based Socratic sessions on LLM and transformer internals. Use them as the source of truth for content level, framing, examples, and what made specific concepts click vs. what stayed fuzzy.

## How to use these notes

For each topic, you'll find:

- **The hook** — the one-sentence framing I responded to
- **Core mechanic** — the explanation that landed, in the language I now use
- **Real numbers** — the specific values that made it click. Reuse these literally in the visualizations.
- **What breaks** — failure modes I explicitly understood
- **Where I got fuzzy** — misconceptions I had and how they got corrected. Build the visualization to specifically target these.
- **Cross-links** — connections to other topics I made out loud
- **Side questions** — real questions I asked during the session. The interview Q&A section should include variants of these.

Two topics (KL divergence, vanishing gradients) are flagged as "needs development" — we ran out of time. Build those pages from first principles in the style of the others.

## Meta-notes about the learner

- Senior PM/engineer with hands-on RAG and vector DB experience from auction platform work
- Reads code faster than prose for mechanics
- Strong intuition, but defaults to vague phrasing on first pass — "small chunks," "faster," "more efficient"
- Pushes back when explanations are incomplete (good signal)
- Wants first principles, not definitions — "why softmax specifically" not "softmax converts logits to probabilities"
- Connects concepts to his own work (auction platform, agentic frameworks)
- Responds well to: real numbers, failure modes, blunt assessment
- Responds poorly to: hand-wavy analogies as primary explanations, "great question" flattery

---

# THE BASICS

## 1. Tokenization

### The hook
The way you chunk text into pieces sets the economics of everything downstream — context window, inference cost, what domains the model is even good at.

### Core mechanic
Tokenization breaks raw text into sub-word units called tokens. Modern LLMs use byte-pair encoding (BPE). The algorithm:

1. Start with every individual character as a token
2. Scan the training corpus for the most frequent adjacent pair of tokens
3. Merge that pair into a new token
4. Repeat — scan the updated corpus, merge the next most frequent pair
5. Stop when vocabulary reaches a target size (50K–150K is standard)

The result is a fixed, deterministic vocabulary. Common words become single tokens. Rare words break into multiple sub-word pieces. Frequent morphemes ("ing", "tion", "un") get their own tokens.

### Real numbers
- Modern vocab sizes: 50K to 150K tokens
- GPT-4 vocabulary: roughly 100K tokens
- Llama vocab: similar range
- "Fantastical" might tokenize as "fan" + "tas" + "ti" + "cal" if those subword units made it into the vocab from training frequency

### What breaks
- **Out-of-domain text destroys efficiency.** Medical terminology, code, non-English languages — they tokenize into many more pieces per sentence because their character sequences are rare in the training distribution. A physics paper uses way more tokens per sentence than a Reddit post.
- **Effective context window shrinks** for unfamiliar domains. If your context is 8K tokens but medical documents tokenize at 2x rate, you've cut effective context in half.
- **Code tokenizes poorly.** Syntax characters don't cluster the way natural language does. Most providers use the same tokenizer for natural language and code and just eat the cost.

### Where I got fuzzy
- First-pass framing: "syllables or short word phrases" — too vague. Tokenizer doesn't pick syllables; it picks frequency-based merges that may or may not align with linguistic units.
- Initial confusion about how the tokenizer "decides" between "fan" and "fa" at inference. It doesn't decide at inference — vocab is fixed during training. The greedy match against the trained vocab determines the split.
- Didn't initially grasp that BPE is iterative — kept thinking it was separate passes for bigrams, then trigrams, etc. It's not. Each pass merges the single most frequent pair, then the next scan finds the next most frequent pair in the now-updated corpus.

### Side questions I asked
- Do code assistants use code-specific tokenizers? (Mostly no. Sometimes preprocessing like minification helps.)
- What's the modern vocab size? (50K–150K is the sweet spot)
- Why does vocab size matter? (Larger vocab = larger embedding table = more memory)

### Cross-links
- Context window (token count = context budget)
- Embeddings (each token gets a row in the embedding table)

### Visualization spec
- Interactive BPE merge animator with step button. Paste text, watch merges happen one at a time.
- Vocabulary panel growing as merges accumulate.
- Real tokenizer demo using `tiktoken` (WASM build for browser) — paste any text, see GPT's actual token split highlighted in alternating colors with token count.

---

## 2. Attention

### The hook
Attention is how the model decides which previous tokens matter for predicting the next one — dynamically, per token, based on learned similarity.

### Core mechanic
For every token position, the model computes three vectors from the token embedding: a **query (Q)**, a **key (K)**, and a **value (V)**. These come from multiplying the embedding by three learned weight matrices.

To compute attention for the current token:

1. Take the current token's query vector Q
2. For each previous token, compute the dot product Q · K — this is the raw "similarity" or "alignment" score
3. **Scale every score by dividing by √d**, where d is the dimension of the key vectors. This prevents the next step from blowing up.
4. Apply softmax to the scaled scores — produces attention weights that sum to 1
5. Take the weighted sum of all the previous tokens' value vectors using those attention weights — that's the output of attention for this position

That output vector is what flows forward to the next layer. It's a blend of information from all previous tokens, but weighted heavily toward the ones that "matter most."

### Real numbers
- Embedding dimension typical example: 768
- √768 ≈ 27.7 (this is the scaling divisor)
- Walkthrough example: raw attention scores of 5, 2, 1
- After scaling and softmax: roughly 0.92, 0.05, 0.02
- So 92% of the output value comes from the highest-scoring token, almost nothing from the third one

### What breaks
- **Without √d scaling**, dot products in high-dimensional spaces get large. Softmax with large inputs produces near-one-hot outputs (numerically unstable, gradients vanish).
- **Without softmax** (or with linear normalization), the model can't sharpen its focus — attention spreads diffusely across all tokens, model can't pick clear "what matters" signals.

### Where I got fuzzy
- Initial framing as "frequency counting" — significant misconception. Attention isn't tallying token frequencies. It's computing pairwise relevance dynamically for every position.
- Confused dot product with cosine similarity. Dot product is element-wise multiplication summed — it captures *both* direction alignment and magnitude. Cosine similarity normalizes for magnitude. Attention uses dot product (not cosine) because softmax already handles normalization, and magnitude differences carry useful signal in high-dimensional spaces.
- Lost track of the "weighted average of values" step — kept jumping straight from softmax to "the model picks a token." The output is a *blended vector*, not a token. Token selection happens at the final output layer after all attention layers.
- Why "matters most" needed to be quantified: it literally means "has the highest softmax weight after Q · K scaling."

### Side questions I asked
- Difference between dot product and cosine similarity? (Dot product = element-wise sum, sensitive to magnitude. Cosine = normalized, magnitude-invariant.)
- Why softmax specifically and not linear normalization? (Sharpness — exponentiation amplifies differences.)
- Why divide by √d? (Keeps dot products in a stable range before softmax.)

### Cross-links
- Softmax (the sharpening step)
- Embeddings (Q, K, V are derived from token embeddings)
- Context window (attention is quadratic in context length)
- Positional encoding (added to embeddings before Q, K, V are computed)
- Mixture of Experts (attention happens within or across expert blocks)

### Visualization spec
- **The centerpiece visualization for the entire site.** Get this right.
- Input: a 5-token sentence
- Animated steps:
  1. Show Q, K, V vectors computed for each token (small bar charts)
  2. For a selected query position, animate Q · K dot product against each previous token — cell-by-cell multiplication accumulating into the score
  3. Show scaling by √d (the division)
  4. Animate the softmax sharpening — connect to the Softmax topic page
  5. Animate the weighted sum of V vectors using attention weights — show the blend
- Heatmap of the full attention matrix on the side
- Let user click any token to see attention for that position

---

## 3. Context windows

### The hook
Attention is quadratic in context length, so context windows aren't free — every doubling quadruples the cost.

### Core mechanic
The attention mechanism computes a dot product between every pair of tokens in the context. For N tokens, that's N × N = N² dot products per layer, per attention head.

Memory and compute scale quadratically:
- 4K tokens → 16M dot products per layer per head
- 8K tokens → 64M
- 32K tokens → 1B
- 128K tokens → 16B

That's why doubling context length quadruples cost, not doubles it. The attention matrix itself has to be held in memory.

### Real numbers
- 4K context: 16 million attention computations per layer per head
- 8K context: 64 million
- GPT-4 supports 128K — primarily through bigger GPUs and smarter memory management (e.g., flash attention, KV caching), not fundamentally different attention math.

### What breaks
- **VRAM exhaustion** is the hard wall before compute. You run out of memory holding the attention matrix.
- **Local/sparse attention** (only attend to recent tokens, or every Nth token) gets you scaling but loses long-range dependencies.
- **Coherent long-form output** suffers when context is artificially truncated mid-document.

### Where I got fuzzy
- Initial guess: "becomes CPU bound." It's not CPU — it's GPU memory (VRAM) that blows up first.
- Wasn't immediately clear *why* attention is quadratic. The "every token attends to every other token" intuition needed unpacking.

### Side questions I asked
- Why can't we just attend to a few recent tokens? (You can — local attention. But you lose long-range info.)
- How do models like GPT-4 handle 128K? (Bigger GPUs, memory tricks like flash attention, KV caching. Not fundamentally different attention.)

### Cross-links
- Attention (quadratic comes from the Q·K matrix size)
- RAG (the workaround: retrieve relevant chunks instead of stuffing everything in context)
- Tokenization (token count = context budget; out-of-domain tokens consume more budget)

### Visualization spec
- Live attention matrix size chart: drag context length from 1K to 128K, watch dot product count and memory grow as N²
- Compare dense vs sparse vs sliding-window attention side by side
- Heatmap of an actual attention matrix that "fills in" as context grows

---

## 4. Embeddings

### The hook
Embeddings are how the model represents tokens as vectors in a continuous space where semantic relationships become geometric ones.

### Core mechanic
The embedding table is a learned lookup. For a vocabulary of 50,000 tokens, you have 50,000 rows, each row a vector (e.g., 768 dimensions).

- **At initialization**, every vector is random (typically small Gaussian noise)
- **During training**, backpropagation updates these vectors *in place* — they're not mapped to new vectors, they get moved through the embedding space
- Tokens that appear in similar contexts get pulled toward similar positions
- By the end of training, "king" and "queen" sit near each other in the embedding space; "run" and "running" sit near each other; etc.

For multi-token phrases (e.g., for RAG), you can:
- Average the token embeddings
- Take the embedding of the last token
- Run the whole phrase through the model and use an output-layer representation (most common in production RAG)

### Real numbers
- Embedding dimension: 768 is standard for medium models, 4096+ for large models
- Vocabulary size: 50K–150K, so the embedding table is e.g. 50K × 768 = ~38M parameters just for token embeddings

### What breaks
- **Embedding table size** grows linearly with vocabulary, eating memory
- **Tokens that appear rarely in training** end up with poorly trained embeddings — they're still close to their random initialization
- **Fine-tuning can shift embeddings** in ways that break general performance (catastrophic forgetting territory)

### Where I got fuzzy
- Wasn't sure whether random vectors get **updated in place** or get **mapped to new vectors via some learned function**. Answer: updated in place. Backprop directly modifies the embedding table.
- Didn't initially distinguish single-token embeddings from sentence/phrase embeddings. Different mechanisms for each.

### Side questions I asked
- Is random initialization arbitrary, or is there a smarter init? (You could initialize semantically similar tokens close together, but random works fine — training does the work.)
- How do you embed a multi-token phrase? (Average, last token, or full model forward pass.)
- "King" — is that one token or multiple? (Likely one token, since it's a common word. "Running" might be one token or "run" + "ning" depending on BPE merges.)

### Cross-links
- Tokenization (tokens are what get embedded; vocab size determines embedding table size)
- Attention (Q, K, V are linear projections of embeddings)
- Positional encoding (positional vectors get added to embeddings before attention)
- RAG (sentence embeddings are the backbone of retrieval)

### Visualization spec
- 2D or 3D projection (pre-computed UMAP/t-SNE) of real token embeddings from a public model. Search for a word, see nearest neighbors. Drag to rotate (3D) or pan (2D).
- Training animation: vectors starting as random noise, snapping into semantic clusters across training steps.

---

## 5. Positional encoding

> **Flagged: I wanted this taught with strong visuals. Build the visualization first, then write the prose around it.**

### The hook
Transformers process all tokens in parallel — they don't read left to right — so word order has to be injected into the input somehow.

### Core mechanic
You add a position-dependent vector to each token embedding before it enters attention. Same token at different positions = different inputs to the model.

Original approach (sinusoidal):
- Each position gets a vector with the same dimension as the token embedding
- The vector is built from sine and cosine functions at multiple frequencies
- Low-frequency components encode coarse position; high-frequency components encode fine position
- The pattern is deterministic — not learned. The model learns to *interpret* the pattern during training.

Modern alternatives:
- **Learned positional embeddings** — trained vectors, one per position. Doesn't generalize beyond training-time max length.
- **RoPE (Rotary Positional Embedding)** — rotates Q and K vectors based on position. Generalizes better to longer contexts.
- **ALiBi** — adds a position-dependent bias directly to attention scores.

### Real numbers
*Needs development. Specific sinusoidal frequencies and example position vectors should come from the visualization.*

### What breaks
- **Without positional encoding**, the model treats "the king is here" and "here is the king" as identical inputs (same token bag)
- **Sinusoidal encodings don't extrapolate well** beyond training-time context lengths
- **Learned positional embeddings extrapolate even worse** — they're undefined past the max training length

### Where I got fuzzy
- The mechanism itself — flagged for visual learning. Sinusoidal patterns are hard to grasp from verbal description alone.

### Cross-links
- Attention (positional encoding gets added to embeddings before Q/K/V projection)
- Embeddings (positional vectors live in the same dimensional space)
- Context window (positional encoding choice affects how far you can extrapolate)

### Visualization spec
- **Stacked heatmap**: position on Y axis, dimension on X axis, color is encoding value. Watch the wave patterns at different frequencies stack.
- **Two-position comparison**: pick positions, see their encoding vectors as line graphs. Drag positions, watch similarity change.
- **Comparison panel**: sinusoidal vs learned vs RoPE vs ALiBi, same input.

---

# FINE-TUNING

## 6. LoRA (Low-Rank Adaptation)

### The hook
LoRA lets you fine-tune a large model by training a tiny number of additional parameters that get added to the frozen base model's weights.

### Core mechanic
Full fine-tuning updates every parameter in the base model — billions of values. LoRA freezes the base model and instead learns two small matrices, B and A, such that their product B · A approximates the *change* you would have made to a weight matrix W.

So instead of training the full W (e.g., 768 × 768), you train:
- B: 768 × r
- A: r × 768

Where r (the "rank") is small — typically 4, 8, or 16. At inference, the effective weight is W + B·A.

### Real numbers
- Full fine-tune: train all ~7B parameters of a 7B model
- LoRA with r=8 on a 768-dim attention layer: train 768 × 8 + 8 × 768 = ~12K params per matrix — a 50,000× reduction
- Total LoRA params usually 0.1–1% of base model

### What breaks
- **High rank starts to defeat the purpose** — too large r and you might as well full fine-tune
- **LoRA can't make arbitrarily large changes to model behavior** — for huge domain shifts, full fine-tuning may still win
- **Multiple stacked LoRA adapters** can interfere with each other if not carefully composed

### Why low rank works
Weight updates during fine-tuning are *intrinsically low rank* — the meaningful changes don't need full dimensionality to capture. A small B·A product can approximate the useful part of a fine-tuning update.

### Where I got fuzzy
- Initially unclear whether LoRA is a standalone model or a layer on top of the base. Answer: it's an additive modification to existing weights, applied at inference.
- Why low rank approximations work at all — needed the "intrinsic low rank of weight updates" explanation.

### Side questions I asked
- Can you train bigger LoRA matrices? (Yes, but at some point you're just doing full fine-tuning. Sweet spot is r=4 to 16.)
- LoRA vs full fine-tuning — when use each? (LoRA for cheap iteration. Full fine-tune for major domain shift.)

### Cross-links
- Catastrophic forgetting (LoRA solves it as a side effect — base weights barely move)
- QLoRA (LoRA on top of a quantized base)

### Visualization spec
- Matrix decomposition visualizer: show full W (e.g., 768×768) next to B (768×r) and A (r×768). Slider for r. Watch parameter count vs reconstruction quality tradeoff.
- Animate the multiplication of B·A.

---

## 7. QLoRA (Quantized LoRA)

### The hook
QLoRA is LoRA plus quantization — for when memory, not compute, is your constraint.

### Core mechanic
The base model is quantized to lower precision (typically 4-bit) before LoRA adapters are trained on top. The base model's weights are frozen *and* compressed; only the LoRA adapter matrices remain in full precision.

This makes it possible to fine-tune very large models on consumer-grade GPUs — you fit the quantized base in VRAM, then train tiny full-precision adapters on top.

### Real numbers
- fp32 (full precision): 4 bytes per parameter
- fp16 (half precision): 2 bytes
- int8: 1 byte
- int4: 0.5 bytes (so 8× smaller than fp32)
- A 7B model in fp32 = 28GB. In int4 = 3.5GB. Now you can fine-tune it on a 16GB consumer GPU.

### What breaks
- **Quantization error** accumulates — int4 base model is less accurate than fp16
- **Some tasks degrade more than others** with 4-bit quantization — sensitive math reasoning is particularly affected

### Where I got fuzzy
- Initially thought QLoRA was for "very specific domains." It's not domain-specific. It's resource-constrained. Use it when you can't fit the base model in memory at higher precision.

### Cross-links
- LoRA (QLoRA is LoRA on a quantized base)
- Distillation (an alternative path to a smaller deployable model)

### Visualization spec
- Quantization animation: a single weight in fp32, animate the rounding to int4.
- Quantization error histogram across a full weight matrix.
- Memory comparison bar chart: fp32 vs fp16 vs int8 vs int4 base + LoRA adapters.

---

## 8. Catastrophic forgetting

### The hook
Fine-tuning a model on a new task can erase what it already knew. The weights that encoded the original knowledge get overwritten.

### Core mechanic
Fine-tuning is gradient descent on a new loss surface. The optimizer doesn't know or care that the current weights also encode useful general knowledge. It just moves weights toward configurations that minimize loss on the new data.

The weights that were good for "general English language modeling" get displaced by weights that are good for "medical question answering" — and the displacement can be severe enough that the model loses its general competence.

### What breaks (this *is* the failure mode for the section above)
- The model forgets how to write about anything other than the fine-tuning domain
- Performance on out-of-distribution prompts collapses
- Common sense and general reasoning degrade

### How to avoid it
- **LoRA / parameter-efficient fine-tuning** — base weights barely move
- **Elastic weight consolidation** — penalize updates to weights that were important for the original task (Fisher information matrix tells you which ones)
- **Replay** — mix in original-distribution data during fine-tuning
- **Small learning rates** with careful early stopping

### Where I got fuzzy
- Initial guess for the fix: "need a bigger model." Bigger models can forget too — capacity isn't the problem. The problem is *unconstrained weight updates*.

### Cross-links
- LoRA (the natural solution)
- Fine-tuning broadly

### Visualization spec
- 2D loss landscape with two minima — task A (pre-training) and task B (fine-tuning target). Animate full fine-tuning: weights drift toward task B's minimum, task A's loss climbs. Then show LoRA: weights barely move, both losses stay reasonable.

---

## 9. Model distillation

### The hook
Train a smaller "student" model to mimic the behavior of a larger "teacher" — capture most of the capability at a fraction of the inference cost.

### Core mechanic
- The teacher model runs over training data and produces output probability distributions (not just predicted tokens — the *soft* distribution over all possible next tokens).
- The student model is trained to *match those distributions* via KL divergence (or cross-entropy) against the teacher's outputs, rather than against raw ground truth labels.
- The teacher's soft distribution carries nuance the labels don't — "this is probably a cat, but slightly might be a small dog" is more informative than the one-hot label "cat".

### Real numbers
*Use teacher distribution example: cat 0.7, dog 0.2, bird 0.1. Show the student trying to match this and the KL divergence shrinking over training.*

### Business reason
- Smaller model = faster inference, lower cost, lower latency
- Often 90%+ of teacher quality at 10× speed
- This is how families of "mini" / "haiku" / "flash" / "lite" models are typically produced

### Where I got fuzzy
- Wasn't initially familiar with the term — needed the framing of "teacher-student" and "soft labels."

### Side questions I asked
- Is this what DeepSeek did? (Close — distillation is the broader pattern. The "mini" variants from every major lab are distilled.)

### Cross-links
- KL divergence (the loss function that compares student to teacher)
- Cross-entropy (used as part of the distillation loss)
- QLoRA (alternative path to a smaller deployable model)

### Visualization spec
- Teacher-student diagram. Token flows through both models in parallel. Teacher outputs soft distribution. Student tries to match. Show KL divergence between distributions shrinking as training progresses.

---

## 10. Vocabulary handling

### The hook
You can't represent every possible word — modern vocab caps at ~150K and accepts that rare/domain text will tokenize inefficiently.

### Core mechanic
BPE builds a vocab from training data frequencies. You set a cap (say 100K), the algorithm merges pairs until the vocab reaches that size, then stops.

At inference, tokens outside this vocab don't get a special "unknown" token — they get broken down into smaller sub-word units (potentially down to individual characters), each of which *is* in the vocab.

Custom domain-specific vocabularies are technically possible but rarely worth the engineering cost. Most teams just accept the inefficiency on rare words.

### What breaks
- Domain-specific text (medical, legal, code, non-English) tokenizes 2–3× longer than general English
- That eats your context window
- Rare proper nouns split into many tiny tokens

### Cross-links
- Tokenization (vocab is the output of BPE training)
- Context window (token count = context budget)
- Embeddings (each vocab token gets an embedding row)

### Visualization spec
- Side-by-side tokenization of the same text at vocab sizes 1K, 32K, 100K, 250K. Show token count, memory cost, OOV behavior on a rare word.

---

# GENERATION

## 11. Beam search vs greedy decoding

### The hook
Greedy picks the most likely next token at every step. Beam search keeps multiple candidate sequences alive and picks the best whole sequence at the end.

### Core mechanic — greedy
At each generation step, pick the token with the highest probability. Append it. Repeat.
Fast, deterministic, but myopic. Can get trapped in locally good but globally suboptimal paths.

### Core mechanic — beam search
Maintain a set of K candidate sequences ("the beam") at all times.

At each step:
1. For each of the K candidates, compute probabilities for *every* possible next token
2. From this expanded set of K × vocab_size possible continuations, keep the top K *by cumulative sequence probability*
3. Repeat until done (e.g., end-of-sequence token, or max length)

At the end, pick the single candidate with the highest cumulative probability.

### Real numbers
- Beam width: typically 3–10 in production translation/summarization
- Greedy = beam width of 1
- The probability being tracked is **cumulative across the whole sequence**, not just the latest token

### What breaks
- **Greedy** gets locally trapped: "The cat sat on the mat" might always emerge even when "The cat sat on the rug" would lead to a better overall sentence.
- **Beam search is deterministic** — bad for creative tasks where you want diversity.
- **Beam search tends to produce "safe" outputs** — high-probability sequences are often bland.

### When to use each
- **Greedy**: chatbots, real-time applications, latency-sensitive
- **Beam search**: machine translation, summarization, tasks with a "correct" output

### Where I got fuzzy
- Initial impression: beam search is for creative writing. **Wrong** — beam search is deterministic and tends toward safe outputs. For creativity you want sampling (temperature, top-k, top-p).
- Took a moment to grasp that beam search's probability is *cumulative across the whole sequence*, not just per-token. This was an "aha" moment.

### Side questions I asked
- After expanding 3 candidates, do we keep 3 from each (9 total) or 3 across all expansions? (Top 3 across all expansions — globally pruned.)
- Is the probability for the whole sentence or just the last word? (Whole sentence. This is the key insight.)

### Cross-links
- Temperature, top-k, top-p (sampling-based alternatives for when you want diversity)
- Autoregressive generation (this is what these decoding strategies operate on)

### Visualization spec
- Animated search tree. Prompt input, beam width slider (1 = greedy, 3, 5, 10). Watch nodes expand, cumulative probability scores update, pruned paths fade to gray, chosen path stays in green.

---

## 12. Temperature

### The hook
Temperature controls how peaked or flat the model's next-token probability distribution is — and therefore how predictable or diverse its outputs are.

### Core mechanic
Before applying softmax to the logits, divide them all by a temperature value T:

`softmax(logits / T)`

- **Low T (e.g., 0.1)**: the logits get magnified. Differences between scores blow up, softmax becomes very peaked, the highest-probability token almost always wins. Output becomes near-deterministic.
- **High T (e.g., 2.0)**: the logits shrink toward zero. Differences flatten, softmax becomes more uniform, lower-probability tokens get real chance of being picked. Output becomes diverse, sometimes incoherent.
- **T = 1.0**: identity — no rescaling.

The probabilities still sum to 1 regardless of T because softmax normalizes.

### Real numbers
- T = 0.1: highly deterministic, repeats common patterns
- T = 0.7 to 1.0: typical conversational range, balances coherence and variety
- T > 1.5: noticeably wandering, more "creative" but often nonsensical

### What breaks
- **T = 0** is a singularity (division by zero) — implementations typically treat it as greedy decoding (just pick the argmax)
- **Very high T** produces incoherent output as the model effectively samples uniformly
- **Very low T** produces repetitive, formulaic output

### Where I got fuzzy
- Briefly confused about whether dividing by T disrupts the softmax sum-to-1 property. **It doesn't** — softmax always sums to 1 regardless of input scaling. Temperature only changes the *shape* of the distribution.

### Side questions I asked
- Where exactly in the pipeline does temperature apply? (Before softmax, in the same place as the √d scaling for attention — both are scalar divisions on the logits.)
- Why does dividing by a scalar affect the distribution? (Because softmax exponentiates — and exponentiating different-magnitude inputs produces dramatically different output distributions.)

### Cross-links
- Softmax (temperature is literally a softmax pre-scaling)
- Top-k, top-p (often combined with temperature)
- Beam search (alternative deterministic strategy)

### Visualization spec
- Bar chart of next-token probabilities for a fixed prompt prefix. Drag temperature slider from 0.1 to 2.0. Watch bars sharpen and flatten in real time. Below the chart, sample 5 completions at the current temperature.

---

## 13. Top-k vs top-p (nucleus) sampling

### The hook
Both are ways to truncate the tail of the probability distribution before sampling — keep only the candidates worth considering and pick from those.

### Core mechanic — top-k
Sort all tokens by probability. Keep only the top K. Renormalize. Sample from those K.

Fixed count of candidates. Doesn't adapt to the shape of the distribution.

### Core mechanic — top-p (nucleus)
Sort all tokens by probability descending. Sum probabilities until the cumulative reaches the threshold p (e.g., 0.9). Keep that "nucleus" of tokens. Renormalize. Sample from the nucleus.

Adaptive — the number of candidates shrinks when one token dominates and expands when probabilities are diffuse.

### Real numbers
- Top-k: K = 40 or 50 are common defaults
- Top-p: p = 0.9 or 0.95 are common
- Often combined: first apply top-k, then top-p, then sample with temperature

### When to use each
- **Top-k**: simple, predictable cost
- **Top-p**: better quality because it adapts — if one token is overwhelmingly likely, you don't artificially keep 40 weird alternatives in play
- **Both, combined**: top-p quality with top-k as a safety cap

### Cross-links
- Temperature (typically applied before truncation)
- Softmax (operates on the resulting probabilities)
- Autoregressive generation

### Visualization spec
- Same probability bar chart as the temperature topic. Two toggles: top-k slider, top-p slider. Tokens cut off by either fade out. Show how top-p adapts to distribution shape and top-k stays rigid.

---

## 14. Autoregressive vs masked language models

### The hook
Autoregressive models generate text token by token left-to-right. Masked models fill in blanks anywhere in a sequence. Same transformer architecture, different training objectives, different jobs.

### Core mechanic — autoregressive (GPT-style)
Training: predict the next token given all previous tokens. Loss is cross-entropy on the predicted next token at every position.
Inference: feed in a prompt, model predicts the next token, append it to the input, predict the next one, repeat.

### Core mechanic — masked (BERT-style)
Training: randomly mask ~15% of tokens in the input. Predict the masked tokens using context from *both* sides (left and right).
Inference: not for generation — for understanding. Embed sentences, classify, find similarities.

### What each is good at
- **Autoregressive**: generation. Chat, completion, writing, code. Anything where the output is a sequence.
- **Masked**: understanding. Classification, semantic similarity, embedding for retrieval. Better at "what does this mean?" because it sees both sides.

### Modern hybrids
Most production systems combine elements:
- The "reading" phase of a long-document RAG system uses bidirectional-style processing
- The "generation" phase is always autoregressive
- Encoder-decoder models (T5, original transformer) literally have both architectures stacked

### Side questions I asked
- Can you have a hybrid? (Yes — modern systems use bidirectional-style understanding for reading, autoregressive for generation.)
- Key training differences? (Loss is computed at *every position* for autoregressive (next-token prediction), only at *masked positions* for masked models.)

### Cross-links
- Attention (both architectures use it, but masked models use bidirectional attention while autoregressive models use causal attention — a token can only attend to previous tokens)
- Embeddings (masked models are typically what generate sentence embeddings for RAG)
- RAG (typically uses masked-style embedders for retrieval, autoregressive models for generation)

### Visualization spec
- Two parallel animations of the same sentence. Left: autoregressive model predicts tokens left-to-right, only seeing past context (causal mask). Right: masked model has random tokens hidden, predicts them using context from both directions. Color-code visible vs hidden tokens at each step.

---

# ADVANCED CONCEPTS

## 15. RAG (Retrieval-Augmented Generation)

### The hook
Instead of trying to bake facts into model weights, retrieve relevant documents at query time and put them in the model's context.

### Core mechanic
1. **Ingest**: chunk your documents into pieces (paragraphs, sections — depends on use case)
2. **Embed**: pass each chunk through an embedding model, store the resulting vectors in a vector database
3. **Query**: at runtime, embed the user's question with the same embedding model
4. **Retrieve**: find the chunks with embeddings most similar to the query (typically cosine similarity)
5. **Generate**: stuff the top-k retrieved chunks into the prompt as context, ask the LLM to answer using that context

Often supplemented with keyword search (BM25, etc.) — a hybrid retriever combining semantic and lexical match.

### Why it beats fine-tuning for facts
- **Facts are in the database, verbatim.** They go into context as text. The LLM reads them and answers from them.
- **Fine-tuning encodes facts in weights**, which is lossy and can drift over time.
- **Updates are easy** — add new documents to the index. Fine-tuning requires re-training.
- **Hallucination is bounded** by what's in the retrieved context.

### What breaks
- **Retrieval failures** — query doesn't match any chunk well, model hallucinates from thin context
- **Chunk size mismatches** — too small, you lose context; too large, you stuff irrelevant text and waste budget
- **Embedding drift** — embedding model improves, but your indexed embeddings are stale
- **Operational complexity** — you now maintain a vector DB, an embedding pipeline, latency budgets for retrieval, etc.

### When to use fine-tuning instead
- When you want to change *behavior* (tone, format, reasoning style) rather than *facts*
- When facts genuinely don't change and embedding them is cheaper than retrieval at inference

### Cross-links
- Embeddings (the foundation of semantic retrieval)
- Context window (retrieved chunks consume the budget)
- Masked models (typical embedders are masked-style — bidirectional understanding)

### Visualization spec
- Full pipeline animation: query → embedding → vector similarity search → top-k chunks retrieved → injected into prompt → LLM generates answer. Each stage animated.
- Failure mode: query that doesn't match any chunk well. Watch retrieval return junk. Watch LLM hallucinate.

---

## 16. Chain-of-Thought (CoT) prompting

### The hook
Ask the model to "think step by step" before answering, and it gets dramatically better at multi-step reasoning — not because the model changed, but because the intermediate tokens anchor the reasoning.

### Core mechanic
Standard prompting: ask a question, get an answer.
CoT prompting: ask a question, ask the model to show its reasoning, then arrive at an answer.

The mechanism: each token the model generates becomes part of the context for predicting the next token. When the model writes out "Step 1: ... Step 2: ..." those intermediate tokens become attention targets for the final answer token. The model can effectively use them as a scratchpad.

This is not built into the architecture. It's a behavior that emerges from how attention works combined with the right prompt.

### CoT vs agentic loops (this distinction was important)
- **CoT**: single forward pass. Intermediate reasoning tokens are generated *within* the same generation. The model never pauses or interacts with anything external.
- **Agentic loop**: multiple passes. Model generates output, an external system acts on it (calls a tool, queries a database), result comes back as new context, model generates again. Multiple distinct generation calls.

### Where I got fuzzy
- Initially thought CoT was the same as agentic loops because both seem to involve "the model thinks before answering." The distinction is whether external action happens between generations.
- Also briefly thought CoT was a built-in model capability rather than a prompting technique that exploits attention's properties.

### Side questions I asked
- Is CoT built into the model, or is it just a prompt trick? (Prompt trick — but the model learns during training that reasoning-style continuations lead to correct answers, so it's good at the trick.)
- How is this different from agentic loops? (One pass vs multiple passes with external actions in between.)

### Cross-links
- Attention (CoT works because intermediate tokens become attended-over context)
- Autoregressive generation (only autoregressive models can do CoT — masked models don't generate sequentially)

### Visualization spec
- Side-by-side completion of a multi-step problem. Left: direct answer (often wrong). Right: "let's think step by step" — show tokens generating one at a time, each step's tokens highlighted as attention targets for the final answer.

---

## 17. Mixture of Experts (MoE)

### The hook
Instead of one giant feedforward network processing every token, have many smaller "expert" networks and a router that sends each token to just a few of them. Massive total capacity, but only a fraction activates per token.

### Core mechanic
Replace each feedforward layer in the transformer with:
- **A gating network** — a small neural net that takes a token's representation and outputs routing probabilities over N experts
- **N expert networks** — each a normal feedforward layer
- Each token gets routed to the **top-k experts** (usually k=2) based on the gating scores
- The expert outputs are combined (weighted by gating scores) and passed forward

Attention layers are typically shared across experts — the MoE substitution happens in the feedforward portion of each transformer block.

### Why every frontier model uses it
- **Total parameter count can be huge** (e.g., trillions) without inference becoming prohibitively expensive
- **Active parameters per token** stays manageable (only the routed-to experts run)
- Effectively decouples model capacity from per-token compute cost

### Where I got fuzzy
- Initial framing as "models given different personas that collaborate." That's a different thing entirely (multi-agent systems, debate-style prompting). MoE is an **architectural** mechanism, not a prompting pattern.
- Wasn't initially clear whether routing happens at training time or inference time. **Both** — gating is learned during training, applied during inference.
- Wasn't clear what flows through an expert. **One token's representation in, one transformed representation out** — same shape as input/output. Experts are functions; gating is the router.
- Asked whether tokens in a generation could come from different GPUs. **Yes** — large MoE deployments shard experts across machines, so different tokens take different paths through different hardware.

### Side questions I asked
- Is this during inference or training? (Both — gating learned during training, used at inference.)
- What's the router called? (Gating network.)
- How does attention interact with MoE? (Attention typically stays unified; only the feedforward becomes MoE.)
- What goes into an expert and what comes out? (A single token representation in, transformed representation out.)
- Does the expert make the prediction? (No — the expert just transforms. Prediction happens at the final output layer after all transformer blocks.)

### Cross-links
- Attention (attention layers are typically shared/unified across experts; MoE applies to the feedforward portion)
- Distillation (an alternative path to efficient inference)

### Visualization spec
- Gating animation. Token comes in. Gating network outputs routing probabilities (bar chart over N experts). Top-k experts light up. Token flows through those experts in parallel. Outputs weighted-summed using gating scores. Pass forward.
- Sequence view: watch different experts activate for different tokens — e.g., expert 3 for code-like tokens, expert 7 for natural language.

---

## 18. Zero-shot vs few-shot learning

### The hook
Zero-shot: tell the model what you want, no examples. Few-shot: show it a few examples of input-output pairs before asking.

### Core mechanic — zero-shot
Just describe the task in natural language: "Translate the following English to French: ..."
Relies entirely on the model's pretraining to know what the task is.

### Core mechanic — few-shot
Include a few example input-output pairs in the prompt before the actual query:
```
English: hello → French: bonjour
English: cat → French: chat
English: bird → French: ?
```
The model sees the pattern and continues it.

### Why few-shot works (the deep version)
The model's weights don't change. But few-shot examples become part of the context window. Attention treats those examples as relevant context for the prediction. The model recognizes the pattern *in-context* and produces a continuation that fits.

This is sometimes called **in-context learning** — the model "learns" the task from examples in the prompt, within a single forward pass. No gradient updates. Purely an emergent property of how attention uses context.

### When to use each
- **Zero-shot**: well-known tasks the model has surely seen during training
- **Few-shot**: domain-specific formats, custom reasoning styles, anything where the task framing is unusual or you want a specific output shape

### Cross-links
- Attention (in-context learning is fundamentally an attention phenomenon)
- Context window (few-shot examples consume budget)
- Chain-of-Thought (CoT is itself often done few-shot — show example reasoning chains in the prompt)

### Visualization spec
- Prompt builder. Add 0, 1, 3, 5 examples before a query. Show accuracy on a classification task (use pre-computed results). Show context window consumption growing with each example.

---

# MATH

## 19. Softmax in attention (and elsewhere)

### The hook
Softmax converts arbitrary real-valued scores into a sharp, normalized probability distribution. The sharpness is the whole point.

### Core mechanic
Given scores s_1, s_2, ..., s_n:

`softmax(s_i) = e^(s_i) / sum_j(e^(s_j))`

Each output is between 0 and 1. The outputs sum to 1. The function is differentiable everywhere, so it works inside a backprop-trained model.

### Real numbers (use these in the visualization)
- Input scores: 5, 2, 1
- After exponentiation: e^5 ≈ 148, e^2 ≈ 7.4, e^1 ≈ 2.7
- Sum: 158.1
- Probabilities: 148/158.1 ≈ 0.94, 7.4/158.1 ≈ 0.05, 2.7/158.1 ≈ 0.017

Compare to **linear normalization** (just divide by sum without exponentiating):
- Input scores: 5, 2, 1
- Sum: 8
- "Probabilities": 0.625, 0.25, 0.125
- Much less sharp — the differences are preserved proportionally, not amplified.

That sharpness — the "winner takes most" property — is what makes attention work.

### What breaks
- **Without √d scaling before softmax** in attention: dot products in high-dim spaces get large, softmax saturates, you get effectively one-hot outputs and gradients vanish.
- **With very large negative scores**: corresponding probabilities go to zero, contributing nothing.
- **Numerical implementation**: practical softmax subtracts the max score before exponentiating to avoid overflow. Mathematically equivalent, numerically stable.

### Why softmax specifically
- Comes from information theory — maximum entropy distribution given a constraint that outputs sum to 1
- Differentiable everywhere
- Smooth — small input changes produce small output changes
- Other choices (squaring, taking log, hardmax) either don't give probabilities, aren't differentiable, or don't amplify differences enough

### Where I got fuzzy
- Why exponentiation specifically — needed the contrast with linear normalization to feel the difference.
- Whether dividing inputs by a scalar (temperature, √d) disrupts the sum-to-1 property. **No** — softmax always normalizes regardless of input scaling.

### Cross-links
- Attention (where softmax does its most important job)
- Temperature (scales inputs before softmax)
- Cross-entropy loss (often paired with softmax)
- Distillation (KL divergence on softmax outputs is the standard distillation loss)

### Visualization spec
- Three input bars (scores). Drag them. Watch output probabilities respond in real time.
- Toggle: softmax vs linear normalization side by side. Feel how exponentiation amplifies differences.
- Built-in temperature slider for the cross-link to the temperature topic.

---

## 20. Cross-entropy loss

### The hook
Cross-entropy measures how wrong your predicted probability distribution is compared to the truth. It's the standard loss for classification and language modeling.

### Core mechanic
For a single example with true class c and predicted probability distribution p:

`loss = -log(p_c)`

Where p_c is the predicted probability of the *correct* class.

- If you predicted 0.99 on the correct class: -log(0.99) ≈ 0.01 — tiny loss
- If you predicted 0.7: -log(0.7) ≈ 0.36 — small loss
- If you predicted 0.1: -log(0.1) ≈ 2.3 — significant loss
- If you predicted 0.01: -log(0.01) ≈ 4.6 — large loss
- If you predicted 0.001: -log(0.001) ≈ 6.9 — huge loss

The log scale matters: very low probabilities on the correct answer get punished much more than slightly low ones. The model is pushed hard to be confident on the right answers.

For language modeling: the "correct class" is the actual next token from the training data. The model's output distribution is its predicted probability over the vocabulary. Cross-entropy averages over every token position in the training data.

### Real numbers (use these in the visualization)
- True next token: "cat"
- Model prediction: cat 0.7, dog 0.2, bird 0.1 → loss = -log(0.7) ≈ 0.36
- Model prediction: cat 0.01, dog 0.5, bird 0.49 → loss = -log(0.01) ≈ 4.6
- Model prediction: cat 0.99, dog 0.005, bird 0.005 → loss = -log(0.99) ≈ 0.01

### Information-theoretic interpretation
Cross-entropy measures the *expected number of bits* you'd need to encode samples from the true distribution using a code optimized for your predicted distribution. If your predictions match reality, this is just the entropy of the true distribution (the minimum possible). If they diverge, you waste bits. The waste is the loss.

### Where I got fuzzy
- Wasn't a familiar term — needed the framing of "how wrong is the prediction" and the concrete -log(0.7) ≈ 0.36 type examples to feel it.
- Asked whether training is supervised — yes, for language modeling, the "label" is just the next token in the training data, which is self-supervised in the sense that you don't need human labels.

### Cross-links
- Softmax (cross-entropy is almost always applied to softmax outputs)
- KL divergence (closely related — cross-entropy = entropy of truth + KL divergence between truth and prediction)
- Distillation (cross-entropy or KL between teacher and student distributions)

### Visualization spec
- Bar chart of predicted distribution vs one-hot ground truth. Drag the predicted probability for the correct class from 0.01 to 0.99. Loss number updates in real time. Plot the -log curve so users can see the brutal asymmetry.

---

## 21. KL divergence

> **Flagged: this topic was not covered in our voice sessions. Build from first principles in the same style as the others.**

### Suggested hook
KL divergence measures how different one probability distribution is from another. It shows up everywhere two distributions need to be compared — distillation, RLHF, variational inference.

### Required content for development
- Definition: KL(P || Q) = sum_i P(i) * log(P(i) / Q(i))
- Interpretation: expected "extra bits" needed to encode samples from P using a code optimized for Q
- Asymmetry: KL(P || Q) ≠ KL(Q || P) in general. Build intuition for why.
- Where it shows up:
  - **Distillation**: student tries to match teacher's distribution → KL(teacher || student)
  - **RLHF / DPO**: keep the fine-tuned model close to the base → KL(fine-tuned || base) as a penalty
  - **Variational autoencoders**: regularize latent distribution toward a prior
- Connection to cross-entropy: cross-entropy = entropy(P) + KL(P || Q), so minimizing cross-entropy with fixed P is equivalent to minimizing KL.

### Real numbers to develop
*Show two simple distributions side by side. Drag one to reshape it. KL updates in real time. Flip the direction (P||Q vs Q||P) to show asymmetry.*

### What breaks
- KL is unbounded when Q assigns zero probability to an event P considers possible (division by zero in the log)
- Asymmetry can mislead — make sure you're computing the direction you intend

### Cross-links
- Cross-entropy (very closely related)
- Distillation (KL is the standard distillation loss)
- Softmax (KL typically applied to softmax outputs)

### Visualization spec
- Two distributions, P and Q. Drag points on either one to reshape them. Watch KL(P || Q) update. Flip direction to get KL(Q || P) — different number. Annotate where each direction shows up in practice.

---

## 22. Vanishing gradients

> **Flagged: this topic was not covered in our voice sessions. Build from first principles in the same style as the others.**

### Suggested hook
Deep networks struggled to train for decades because gradients shrank exponentially as they propagated backward through layers. Transformers' architecture sidesteps this — residual connections, layer norm, and attention all play a role.

### Required content for development
- The problem: during backprop, gradients are products of many partial derivatives. If each is less than 1, the product shrinks toward zero as depth increases. Early layers stop learning.
- Where it killed earlier architectures: vanilla deep feedforward nets, RNNs with sigmoid/tanh activations.
- How transformers fixed it:
  - **Residual connections**: gradient has a "highway" path that doesn't get multiplied by tiny derivatives
  - **Layer normalization**: keeps activations at sane scales throughout the network, prevents derivative collapse
  - **Attention**: provides direct paths between distant tokens (no need for gradients to flow through long sequential chains the way RNNs required)
  - **ReLU and variants**: derivative is exactly 1 in the active region, doesn't shrink gradients the way sigmoid/tanh do

### Real numbers to develop
*Pick a 20-layer network. Show gradient magnitude at each layer during backprop. Without residuals: gradients exponentially decay to near-zero at early layers. Add residuals: gradients survive. Add layer norm: gradients stay healthy. Add attention: long-range info flows freely.*

### What breaks
- Pre-transformer deep architectures struggled to go beyond ~10-20 layers
- RNNs couldn't learn long-range dependencies because gradients vanished through the time dimension

### Cross-links
- Attention (one of the key fixes)
- Cross-entropy (the loss whose gradient is doing the propagating)

### Visualization spec
- Animated gradient flow through a 20-layer network. Toggle residual connections, layer norm, attention on/off. Watch gradient magnitudes at each layer. Without any of the fixes: gradients die at early layers. With all three: gradients reach every layer healthy.

---

# Gaps and weak spots to drill in the lessons

These are the specific places I struggled most. The visualizations should specifically target these misconceptions.

1. **Attention as "frequency counting" vs pairwise relevance** — I initially framed attention as tracking how often tokens appear. The visualization needs to make the "pairwise dot product per query position" crystal clear.

2. **Where exactly the √d scaling goes** — I sometimes lose track of *where* in the attention pipeline √d shows up. Show it explicitly between dot product and softmax.

3. **The "weighted sum of V vectors" step** — I keep skipping past this. The attention output is a *blended vector*, not a token choice. Build the visualization to dwell on this step.

4. **CoT vs agentic loops** — Build the lesson with an explicit side-by-side. Single forward pass vs multiple passes with external action between.

5. **MoE as architecture, not prompting** — make sure the page opens by killing the "personas collaborating" misconception.

6. **LoRA as on-top-of-frozen-base, not standalone** — visualize W + B·A so the additive relationship is unmistakable.

7. **QLoRA as resource-constrained, not domain-specific** — frame the page around hardware limits, not specialized vocabularies.

8. **Sinusoidal positional encoding** — I flagged this for visual-first treatment. Don't open with prose. Open with the heatmap.

9. **Sentence/phrase embeddings vs token embeddings** — make the distinction explicit in the embeddings page.

10. **Beam search is deterministic** — kill the "beam search = creative" misconception up front. Pair it with temperature/sampling for the diversity counterpoint.

# Recurring style requests across all topics

- Open with mechanics, not metaphors
- Real numbers in every example (use the ones above where given)
- "What breaks" section is mandatory, not optional
- Cross-links are mandatory — name them explicitly at the bottom
- Interview-style stress questions on every page (3-5 of them, collapsible)
- Audio mode: I learned this through voice, so prose should read aloud naturally — no markdown formatting in the explanatory text
