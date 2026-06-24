# Lesson card image prompts

Image-generation prompts for the topic cards on the home page. Files go in
`public/images/<slug>-demo.png` (the card markup references `/images/<slug>-demo.png`
and hides the `<img>` if it 404s, so cards look fine until an image is dropped in).

**Render target:** 16:9, ~1280×720.

**Shared style DNA** (keep every prompt consistent with these):
near-black background · electric cyan + magenta/pink accents · IBM Plex Mono
labels · clean technical aesthetic · no people · no stock-illustration or
generic "AI" clichés. Use "Dark UI render" for interface-like vizzes (sliders,
bars, trees, pipelines) and "Dark abstract render" for conceptual data-viz
(heatmaps, landscapes, scatters, flow).

> Images currently display on the "Playable Now" featured cards (the `ready`
> topics). If you want them on the curriculum-grid cards too, say so and I'll
> wire the `<img>` into those cards.

---

## The Basics

`images/tokenization-demo.png` *(existing)* — "Dark UI render of a BPE tokenizer animator: the word 'tokenization' splitting into colored subword token chips, merge steps shown as connecting lines, electric cyan accents on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/attention-demo.png` *(existing)* — "Dark abstract render of a transformer self-attention heatmap: a grid of glowing cells ranging cyan-to-magenta by intensity, token labels along both axes, faint arc connections between tokens, near-black background, electric cyan + magenta accents."

`images/context-window-demo.png` — "Dark abstract render of a context-window cost explorer: a large square attention matrix as a grid that grows and fills with glowing cells, an overlaid curve bending sharply upward to show quadratic memory and FLOPs, small side-by-side panels contrasting dense, sliding-window, and sparse attention patterns, electric cyan-to-magenta cells on near-black, IBM Plex Mono axis and metric labels, clean technical aesthetic, no people."

`images/embeddings-demo.png` — "Dark abstract render of an embedding space: a 2D scatter of glowing token points settling into semantic clusters, a selected word linked by faint lines to its nearest neighbors, subtle depth and parallax suggesting a 3D projection, electric cyan and magenta points on near-black, IBM Plex Mono token labels, clean technical aesthetic, no people."

`images/positional-encoding-demo.png` — "Dark UI render of sinusoidal positional encodings: a stacked heatmap with position on the vertical axis and dimension on the horizontal axis, interleaving sine-wave bands at increasing frequencies, color ranging cyan-to-magenta by value, a small inset line graph of two position vectors, near-black background, IBM Plex Mono axis labels, clean technical aesthetic, no people."

## Fine-tuning

`images/lora-demo.png` — "Dark UI render of a LoRA low-rank decomposition: a large dense weight matrix W beside one thin tall matrix and one thin wide matrix whose product approximates it, the tiny low-rank slice highlighted in electric cyan against the dimmer full matrix, a rank slider and a parameter-count readout, magenta accents on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/qlora-demo.png` — "Dark UI render of weight quantization: a single fp32 weight value snapping onto a coarse int4 grid of discrete levels, a histogram of quantization error beneath it, and a bar chart comparing fp32, fp16, int8, and int4 memory footprints, electric cyan bars and magenta error bars on near-black, IBM Plex Mono numeric labels, clean technical aesthetic, no people."

`images/catastrophic-forgetting-demo.png` — "Dark abstract render of a 2D loss landscape: a contour map with two basins labeled task A and task B, a glowing trajectory of weights drifting out of one basin toward the other, a faint trail showing task A's loss climbing as task B's drops, electric cyan contours with a magenta trajectory on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/distillation-demo.png` — "Dark UI render of teacher-student distillation: two stacked model blocks with a token flowing through both, a soft probability bar distribution emitted by the teacher and a matching one by the student, a shrinking KL-divergence gauge between them, electric cyan teacher bars and magenta student bars on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/vocabulary-handling-demo.png` — "Dark UI render comparing vocabulary sizes: the same sentence tokenized four ways at 1K, 32K, 100K, and 250K vocab, each row showing differently sized colored token chips and a token-count readout, a rare word visibly shattering into more pieces at the small vocab, electric cyan-to-magenta chips on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

## Generation

`images/beam-vs-greedy-demo.png` — "Dark UI render of a beam-search tree: a branching graph of token nodes expanding left to right, the chosen beam paths glowing electric cyan, pruned branches fading to gray, cumulative log-probability scores along the edges, a magenta highlight on the top hypothesis, near-black background, IBM Plex Mono token and score labels, clean technical aesthetic, no people."

`images/temperature-demo.png` — "Dark UI render of a temperature-controlled next-token distribution: a bar chart of token probabilities shown both sharply peaked at low temperature and flattened toward uniform at high temperature, a temperature slider, electric cyan bars with a magenta highlighted top token on near-black, IBM Plex Mono token labels, clean technical aesthetic, no people."

`images/top-k-top-p-demo.png` — "Dark UI render of top-k versus top-p sampling: a sorted bar chart of token probabilities with a cutoff line, tokens beyond the kept set faded out, a shaded nucleus region marking the cumulative probability mass, electric cyan kept bars and dimmed magenta discarded bars on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/autoregressive-vs-masked-demo.png` — "Dark UI render contrasting two language-model objectives: on the left a sentence generated left to right with only past tokens visible, on the right the same sentence with random masked tokens being filled using context from both sides, visible tokens in electric cyan and hidden ones in dim magenta, near-black background, IBM Plex Mono token labels, clean technical aesthetic, no people."

## Advanced Concepts

`images/rag-demo.png` — "Dark UI render of a RAG pipeline: a horizontal flow of stages — query, embedding vector, vector-similarity search over a grid of document chunks, top-k retrieved chunks, injected prompt, and a generated answer — connected by glowing arrows, the retrieved chunks highlighted electric cyan with magenta accents on near-black, IBM Plex Mono stage labels, clean technical aesthetic, no people."

`images/chain-of-thought-demo.png` — "Dark UI render of chain-of-thought reasoning: two side-by-side panels, left a single direct answer, right a vertical chain of intermediate reasoning steps where each step's tokens feed the next, the reasoning trail glowing electric cyan with magenta highlights on key steps, near-black background, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/mixture-of-experts-demo.png` — "Dark UI render of a mixture-of-experts layer: a token entering a gating network that lights up the top two of eight expert blocks, routing lines glowing bright to the selected experts and dim to the rest, weighted outputs recombining downstream, electric cyan active experts and magenta gating weights on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/zero-shot-vs-few-shot-demo.png` — "Dark UI render of in-context learning: a prompt builder stacking zero, one, three, and five demonstration examples above a query, a rising accuracy curve alongside, and the context window visibly filling as examples are added, electric cyan example blocks and a magenta accuracy line on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

## Math

`images/softmax-demo.png` — "Dark UI render of the softmax function: three draggable input score bars feeding a row of output probability bars that sum to one, the largest input exaggerated into a dominant probability, a temperature control, electric cyan input bars and magenta output bars on near-black, IBM Plex Mono numeric labels, clean technical aesthetic, no people."

`images/cross-entropy-demo.png` — "Dark UI render of cross-entropy loss: a predicted probability bar distribution beside a one-hot target, with a steep negative-log curve plotting how the loss explodes as the probability on the correct class drops toward zero, electric cyan bars and a magenta loss curve on near-black, IBM Plex Mono axis labels, clean technical aesthetic, no people."

`images/kl-divergence-demo.png` — "Dark abstract render of KL divergence: two overlaid probability distributions P and Q as smooth curves with the gap between them shaded, a readout showing the asymmetric KL value flipping when P and Q swap, electric cyan for P and magenta for Q on near-black, IBM Plex Mono labels, clean technical aesthetic, no people."

`images/vanishing-gradients-demo.png` — "Dark abstract render of gradient flow through a deep network: twenty stacked layers with a backward signal entering bright at the output and fading toward black by the early layers, a parallel path with residual skip connections keeping the signal glowing electric cyan all the way through, magenta accents on near-black, IBM Plex Mono layer labels, clean technical aesthetic, no people."

## Social / Open Graph cards

These get the `SOCIAL_SUFFIX` (legible title text, centered safe composition)
instead of the lesson `STYLE_SUFFIX`. Used as link-preview images, ~1200×630
crop. Filenames must start with `social-`.

`images/social-home.png` — "A bold, premium social-share hero card for an interactive site that teaches how large language models work. Centered, set a large headline in a clean geometric sans-serif reading exactly 'HOW LLMs WORK' in bright white, and directly beneath it a smaller IBM Plex Mono subtitle reading exactly 'Learn how modern AI actually works'. Behind the text, a low-contrast glowing transformer self-attention motif — a tilted 3D grid of cyan-to-magenta cells with faint connecting arcs between token nodes — kept dim so the headline stays dominant. Electric cyan and magenta neon accents on a deep near-black background."

`images/social-audio-tutor.png` — "A bold, premium social-share hero card for a voice-based AI tutoring tool. Centered, set a large headline in a clean geometric sans-serif reading exactly 'AUDIO TUTOR' in bright white, and directly beneath it a smaller IBM Plex Mono subtitle reading exactly 'Learn LLM internals by voice'. To one side, a glowing magenta-to-cyan audio waveform and concentric voice rings radiating outward suggesting spoken conversation, kept low-contrast so the headline stays dominant. Magenta and electric cyan neon accents on a deep near-black background."
