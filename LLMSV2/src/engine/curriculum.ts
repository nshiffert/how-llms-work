import type { LessonMeta, StageMeta, StageId } from './types';

/**
 * The curriculum follows one prompt through the machine: text goes in, the
 * network transforms it, training shapes the network, sampling turns scores
 * into words, fine-tuning adapts it, and prompting steers it.
 */

export const STAGES: StageMeta[] = [
  { id: 'text', n: 1, title: 'Text in', question: 'How does a sentence become numbers?', hue: '#46e0f0' },
  { id: 'machine', n: 2, title: 'The machine', question: 'What happens to those numbers inside?', hue: '#a78bfa' },
  { id: 'learning', n: 3, title: 'Learning', question: 'How did the weights get that way?', hue: '#fbbf24' },
  { id: 'speaking', n: 4, title: 'Speaking', question: 'How do scores become words?', hue: '#f472b6' },
  { id: 'adapting', n: 5, title: 'Adapting', question: 'How do you change a trained model?', hue: '#4ade80' },
  { id: 'steering', n: 6, title: 'Steering', question: 'How do you change it without training?', hue: '#60a5fa' },
];

export const LESSONS: LessonMeta[] = [
  // 1. Text in
  {
    id: 'tokenization', title: 'Tokenization', stage: 'text', minutes: 8,
    blurb: 'The model never sees letters. It sees integer ids chosen by a merge algorithm that ran before training.',
    confusable: ['vocabulary-handling'],
    load: () => import('../lessons/tokenization'),
  },
  {
    id: 'vocabulary-handling', title: 'Vocabulary Handling', stage: 'text', minutes: 7,
    blurb: 'Vocabulary size trades sequence length against table size, and decides how rare words shatter.',
    confusable: ['tokenization'],
    load: () => import('../lessons/vocabulary-handling'),
  },
  {
    id: 'embeddings', title: 'Embeddings', stage: 'text', minutes: 8,
    blurb: 'A lookup table that starts as noise and ends up encoding meaning as direction and distance.',
    confusable: ['positional-encoding'],
    load: () => import('../lessons/embeddings'),
  },
  {
    id: 'positional-encoding', title: 'Positional Encoding', stage: 'text', minutes: 8,
    blurb: 'Attention cannot see order, so position has to be injected: added waves, learned vectors, or rotations.',
    confusable: ['embeddings'],
    load: () => import('../lessons/positional-encoding'),
  },
  // 2. The machine
  {
    id: 'softmax', title: 'Softmax', stage: 'machine', minutes: 7,
    blurb: 'Exponentiate, then normalize: any list of scores becomes a probability distribution.',
    confusable: ['temperature'],
    load: () => import('../lessons/softmax'),
  },
  {
    id: 'attention', title: 'Attention', stage: 'machine', minutes: 10,
    blurb: 'Each token rebuilds itself as a weighted blend of the others. The weights come from dot products through a softmax.',
    confusable: ['context-window'],
    load: () => import('../lessons/attention'),
  },
  {
    id: 'context-window', title: 'Context Window', stage: 'machine', minutes: 7,
    blurb: 'Attention compares every pair of tokens, so doubling the context quadruples the work.',
    confusable: ['attention'],
    load: () => import('../lessons/context-window'),
  },
  {
    id: 'vanishing-gradients', title: 'Vanishing Gradients', stage: 'machine', minutes: 8,
    blurb: 'A gradient is a long product. Factors below 1 shrink it to nothing unless a residual path lets it through.',
    load: () => import('../lessons/vanishing-gradients'),
  },
  {
    id: 'mixture-of-experts', title: 'Mixture of Experts', stage: 'machine', minutes: 7,
    blurb: 'A router sends each token to a few of many experts: more parameters, about the same compute per token.',
    load: () => import('../lessons/mixture-of-experts'),
  },
  // 3. Learning
  {
    id: 'cross-entropy', title: 'Cross-entropy Loss', stage: 'learning', minutes: 7,
    blurb: 'The loss is the negative log of the probability the model gave the right answer. Nothing else counts.',
    confusable: ['kl-divergence'],
    load: () => import('../lessons/cross-entropy'),
  },
  {
    id: 'kl-divergence', title: 'KL Divergence', stage: 'learning', minutes: 8,
    blurb: 'The extra surprise from using one distribution in place of another. It is not symmetric.',
    confusable: ['cross-entropy'],
    load: () => import('../lessons/kl-divergence'),
  },
  {
    id: 'autoregressive-vs-masked', title: 'Autoregressive vs Masked', stage: 'learning', minutes: 7,
    blurb: 'The same block, two training games: predict the next token, or fill blanks using both sides.',
    load: () => import('../lessons/autoregressive-vs-masked'),
  },
  // 4. Speaking
  {
    id: 'temperature', title: 'Temperature', stage: 'speaking', minutes: 7,
    blurb: 'One number divides the scores before softmax and reshapes the whole distribution.',
    confusable: ['top-k-top-p', 'softmax'],
    load: () => import('../lessons/temperature'),
  },
  {
    id: 'top-k-top-p', title: 'Top-k vs Top-p', stage: 'speaking', minutes: 7,
    blurb: 'Two ways to cut the tail: keep a fixed number of tokens, or keep a fixed amount of probability.',
    confusable: ['temperature'],
    load: () => import('../lessons/top-k-top-p'),
  },
  {
    id: 'beam-vs-greedy', title: 'Beam Search vs Greedy', stage: 'speaking', minutes: 8,
    blurb: 'Greedy commits to the best next token. Beam search keeps several partial sentences alive.',
    load: () => import('../lessons/beam-vs-greedy'),
  },
  // 5. Adapting
  {
    id: 'catastrophic-forgetting', title: 'Catastrophic Forgetting', stage: 'adapting', minutes: 7,
    blurb: 'Training on task B moves the weights out of the region task A needed.',
    load: () => import('../lessons/catastrophic-forgetting'),
  },
  {
    id: 'lora', title: 'LoRA', stage: 'adapting', minutes: 8,
    blurb: 'Freeze the big matrix and learn a small low-rank correction beside it.',
    confusable: ['qlora'],
    load: () => import('../lessons/lora'),
  },
  {
    id: 'qlora', title: 'QLoRA', stage: 'adapting', minutes: 7,
    blurb: 'Store the frozen base in 4 bits and train full-precision adapters on top of it.',
    confusable: ['lora'],
    load: () => import('../lessons/qlora'),
  },
  {
    id: 'distillation', title: 'Distillation', stage: 'adapting', minutes: 7,
    blurb: 'A small model learns from a large one’s full probability distribution, not just its top answer.',
    load: () => import('../lessons/distillation'),
  },
  // 6. Steering
  {
    id: 'zero-shot-vs-few-shot', title: 'Zero-shot vs Few-shot', stage: 'steering', minutes: 7,
    blurb: 'Examples in the prompt change behavior with no weight update at all.',
    confusable: ['chain-of-thought'],
    load: () => import('../lessons/zero-shot-vs-few-shot'),
  },
  {
    id: 'chain-of-thought', title: 'Chain-of-Thought', stage: 'steering', minutes: 7,
    blurb: 'Reasoning written out becomes context the model can read on the next step.',
    confusable: ['zero-shot-vs-few-shot'],
    load: () => import('../lessons/chain-of-thought'),
  },
  {
    id: 'rag', title: 'RAG', stage: 'steering', minutes: 9,
    blurb: 'Fetch relevant text at question time and put it in the prompt, instead of storing it in weights.',
    load: () => import('../lessons/rag'),
  },
];

export const lessonMeta = (id: string) => LESSONS.find((l) => l.id === id);
export const stageMeta = (id: StageId) => STAGES.find((s) => s.id === id)!;
export const lessonsIn = (stage: StageId) => LESSONS.filter((l) => l.stage === stage);
export const lessonIndex = (id: string) => LESSONS.findIndex((l) => l.id === id);
