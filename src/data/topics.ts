// Topic registry — the single source of truth for the landing grid, category
// grouping, and cross-link resolution. A topic becomes a real page only when a
// matching MDX file exists in src/content/topics/<slug>.mdx AND status==='ready'.
// Everything else renders as a "planned" card so the map of the site is complete
// from day one.

export type CategoryId =
  | 'basics'
  | 'finetune'
  | 'generation'
  | 'advanced'
  | 'math';

export interface Category {
  id: CategoryId;
  label: string;
  blurb: string;
}

export interface Topic {
  slug: string;
  title: string;
  /** One-breath hook shown on the card and as the page's opening line. */
  hook: string;
  category: CategoryId;
  status: 'ready' | 'planned';
  /** Short tag describing the headline interaction, shown on the card. */
  viz: string;
}

export const CATEGORIES: Category[] = [
  {
    id: 'basics',
    label: 'The Basics',
    blurb: 'How text becomes vectors, and how vectors attend to each other.',
  },
  {
    id: 'finetune',
    label: 'Fine-tuning',
    blurb: 'Adapting a frozen base model without breaking what it already knows.',
  },
  {
    id: 'generation',
    label: 'Generation',
    blurb: 'Turning a probability distribution into actual tokens.',
  },
  {
    id: 'advanced',
    label: 'Advanced Concepts',
    blurb: 'Retrieval, reasoning, routing, and in-context learning.',
  },
  {
    id: 'math',
    label: 'Math',
    blurb: 'The handful of functions that everything above is built on.',
  },
];

export const TOPICS: Topic[] = [
  // ── The Basics ──────────────────────────────────────────────
  {
    slug: 'tokenization',
    title: 'Tokenization',
    hook: 'Models never see text — they see integer ids carved out by a merge algorithm that ran once, long before you typed anything.',
    category: 'basics',
    status: 'ready',
    viz: 'Step-through BPE merge animator',
  },
  {
    slug: 'attention',
    title: 'Attention',
    hook: 'Every token rewrites itself as a weighted blend of the tokens it decides are relevant — and the weights are just scaled dot products run through a softmax.',
    category: 'basics',
    status: 'ready',
    viz: 'Q·K → scale → softmax → ΣV, stepped',
  },
  {
    slug: 'context-window',
    title: 'Context Window',
    hook: 'Attention is all-pairs, so doubling the context quadruples the cost — the wall every long-context trick is trying to climb.',
    category: 'basics',
    status: 'planned',
    viz: 'Quadratic cost explorer',
  },
  {
    slug: 'embeddings',
    title: 'Embeddings',
    hook: 'A lookup table that starts as noise and ends up encoding meaning as geometry — direction is semantics.',
    category: 'basics',
    status: 'planned',
    viz: '2D projection + nearest-neighbor search',
  },
  {
    slug: 'positional-encoding',
    title: 'Positional Encoding',
    hook: 'Attention is order-blind by construction, so position has to be injected — as stacked sine waves, learned vectors, or rotations.',
    category: 'basics',
    status: 'planned',
    viz: 'Sinusoid heatmap + RoPE/ALiBi compare',
  },

  // ── Fine-tuning ─────────────────────────────────────────────
  {
    slug: 'lora',
    title: 'LoRA',
    hook: 'You don’t need to move all 768×768 weights — a rank-8 detour through B·A captures the update with ~2% of the parameters.',
    category: 'finetune',
    status: 'planned',
    viz: 'W + B·A decomposition, rank slider',
  },
  {
    slug: 'qlora',
    title: 'QLoRA',
    hook: 'Quantize the frozen base to 4-bit, keep the tiny adapters in full precision — fine-tune a 65B model on one GPU.',
    category: 'finetune',
    status: 'planned',
    viz: 'fp32→int4 rounding + memory bars',
  },
  {
    slug: 'catastrophic-forgetting',
    title: 'Catastrophic Forgetting',
    hook: 'Chase task B’s minimum with full fine-tuning and the weights walk straight out of task A’s basin.',
    category: 'finetune',
    status: 'planned',
    viz: '2D loss-landscape drift animation',
  },
  {
    slug: 'distillation',
    title: 'Distillation',
    hook: 'The teacher’s soft distribution carries more signal than the hard label — the student learns the dog-vs-cat uncertainty, not just the answer.',
    category: 'finetune',
    status: 'planned',
    viz: 'Teacher→student KL shrinking',
  },
  {
    slug: 'vocabulary-handling',
    title: 'Vocabulary Handling',
    hook: 'Vocab size is a dial between sequence length and embedding-table size — and it decides how a rare word shatters.',
    category: 'finetune',
    status: 'planned',
    viz: 'Same text, four vocab sizes',
  },

  // ── Generation ──────────────────────────────────────────────
  {
    slug: 'beam-vs-greedy',
    title: 'Beam Search vs Greedy',
    hook: 'Greedy commits to the locally-best token and can’t take it back; beam keeps k hypotheses alive to escape that trap.',
    category: 'generation',
    status: 'planned',
    viz: 'Search tree, beam-width slider',
  },
  {
    slug: 'temperature',
    title: 'Temperature',
    hook: 'One scalar divides the logits before softmax — and reshapes the entire next-token distribution from spiky to flat.',
    category: 'generation',
    status: 'planned',
    viz: 'Distribution reshape + live samples',
  },
  {
    slug: 'top-k-top-p',
    title: 'Top-k vs Top-p',
    hook: 'Top-k keeps a fixed count; top-p keeps a fixed probability mass — one is rigid, one adapts to how confident the model is.',
    category: 'generation',
    status: 'planned',
    viz: 'Truncation on the probability bars',
  },
  {
    slug: 'autoregressive-vs-masked',
    title: 'Autoregressive vs Masked',
    hook: 'Same transformer block, two training objectives: predict the next token left-to-right, or fill blanks using both sides.',
    category: 'generation',
    status: 'planned',
    viz: 'Parallel left-to-right vs fill-in',
  },

  // ── Advanced ────────────────────────────────────────────────
  {
    slug: 'rag',
    title: 'RAG',
    hook: 'Don’t bake the knowledge into weights — retrieve it at query time and paste it into the prompt. The failure mode is the lesson.',
    category: 'advanced',
    status: 'planned',
    viz: 'Retrieve→inject→generate pipeline',
  },
  {
    slug: 'chain-of-thought',
    title: 'Chain-of-Thought',
    hook: 'The intermediate tokens aren’t decoration — each step becomes context that anchors the next, turning one hard hop into many easy ones.',
    category: 'advanced',
    status: 'planned',
    viz: 'Direct vs step-by-step, side by side',
  },
  {
    slug: 'mixture-of-experts',
    title: 'Mixture of Experts',
    hook: 'A gating network routes each token to a few experts out of many — more parameters, roughly constant compute per token.',
    category: 'advanced',
    status: 'planned',
    viz: 'Per-token gating + expert activation',
  },
  {
    slug: 'zero-shot-vs-few-shot',
    title: 'Zero-shot vs Few-shot',
    hook: 'Examples in the prompt are weight-free learning — accuracy climbs as you spend context on demonstrations.',
    category: 'advanced',
    status: 'planned',
    viz: 'Prompt builder + accuracy curve',
  },

  // ── Math ────────────────────────────────────────────────────
  {
    slug: 'softmax',
    title: 'Softmax',
    hook: 'The function that turns any vector of scores into a probability distribution — and exaggerates the winner on the way.',
    category: 'math',
    status: 'planned',
    viz: 'Draggable score bars + temperature',
  },
  {
    slug: 'cross-entropy',
    title: 'Cross-entropy Loss',
    hook: 'The loss is just the negative log of the probability you put on the right answer — and the log is why being confidently wrong is catastrophic.',
    category: 'math',
    status: 'planned',
    viz: 'Drag p(correct), watch −log p',
  },
  {
    slug: 'kl-divergence',
    title: 'KL Divergence',
    hook: 'A directed distance between two distributions — asymmetric on purpose, and lurking inside RLHF, distillation, and VI.',
    category: 'math',
    status: 'planned',
    viz: 'Reshape P, Q — watch the asymmetry',
  },
  {
    slug: 'vanishing-gradients',
    title: 'Vanishing Gradients',
    hook: 'Stack enough layers and the backward signal decays to nothing — residual connections are the highway that let it survive.',
    category: 'math',
    status: 'planned',
    viz: '20-layer gradient flow, residual toggle',
  },
];

export const CATEGORY_COLOR: Record<CategoryId, string> = {
  basics: 'var(--cat-basics)',
  finetune: 'var(--cat-finetune)',
  generation: 'var(--cat-generation)',
  advanced: 'var(--cat-advanced)',
  math: 'var(--cat-math)',
};

export function topicsByCategory(cat: CategoryId): Topic[] {
  return TOPICS.filter((t) => t.category === cat);
}

export function getTopic(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}
