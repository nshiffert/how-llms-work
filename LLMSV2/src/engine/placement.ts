import type { McqQuestion, StageId } from './types';

/**
 * One apply-level question per stage. A correct answer raises the starting
 * skill estimate for that stage (which opens fast lanes and deeper material);
 * "not sure" or a wrong answer starts the stage in guided mode.
 */
export const PLACEMENT: { stage: StageId; q: McqQuestion }[] = [
  {
    stage: 'text',
    q: {
      id: 'pl-text', kind: 'mcq', level: 2,
      prompt: 'A model has never seen the made-up word "glorptastic". What does it receive when you type it?',
      options: [
        { text: 'Several ids for smaller pieces of the word, such as "gl", "orp", "tastic"', correct: true, why: 'Subword tokenizers always fall back to smaller known pieces, down to single bytes if needed.' },
        { text: 'A special "unknown word" id', why: 'That was true of older word-level systems. Subword tokenizers can spell out anything from smaller pieces.' },
        { text: 'One id per letter, always', why: 'Only if no larger piece matches. Common fragments like "tastic" are usually single tokens.' },
        { text: 'A brand-new id created for that word', why: 'The vocabulary is frozen before training. Nothing is added at run time.' },
      ],
    },
  },
  {
    stage: 'machine',
    q: {
      id: 'pl-machine', kind: 'mcq', level: 2,
      prompt: 'You double the length of a prompt. Roughly what happens to the number of token-to-token comparisons in one attention layer?',
      options: [
        { text: 'It quadruples', correct: true, why: 'Every token is compared with every token, so the count grows with the square of the length.' },
        { text: 'It doubles', why: 'That would be true if each token were compared with a fixed number of others. Attention compares all pairs.' },
        { text: 'It stays the same', why: 'More tokens means more pairs to compare.' },
        { text: 'It grows exponentially', why: 'Quadratic, not exponential: n tokens give n × n pairs.' },
      ],
    },
  },
  {
    stage: 'learning',
    q: {
      id: 'pl-learning', kind: 'mcq', level: 2,
      prompt: 'During training, the model gives the correct next token a probability of 0.5. Then, on another example, 0.01. How do the two losses compare?',
      options: [
        { text: 'The second is far larger: loss is −log(p), about 0.69 versus 4.6', correct: true, why: 'Cross-entropy is the negative log of the probability given to the right answer, so confident misses are punished steeply.' },
        { text: 'The second is 50 times larger, in proportion to the probabilities', why: 'The loss is logarithmic in the probability, not proportional to it.' },
        { text: 'They are equal, because both answers were "wrong"', why: 'There is no right/wrong threshold. The loss depends on how much probability the right token got.' },
        { text: 'It depends on which wrong tokens got the remaining probability', why: 'With one correct answer, only the probability on that answer enters the loss.' },
      ],
    },
  },
  {
    stage: 'speaking',
    q: {
      id: 'pl-speaking', kind: 'mcq', level: 2,
      prompt: 'You lower the temperature from 1.0 to 0.2. What happens to the next-token distribution?',
      options: [
        { text: 'It sharpens: the top token takes much more of the probability', correct: true, why: 'Dividing the scores by a small number stretches the gaps between them, and softmax turns bigger gaps into bigger ratios.' },
        { text: 'It flattens: tokens become more equally likely', why: 'That is what raising the temperature does.' },
        { text: 'The ranking of tokens changes', why: 'Dividing every score by the same positive number never changes their order.' },
        { text: 'Low-probability tokens are removed entirely', why: 'That is top-k or top-p. Temperature rescales; it never sets anything to exactly zero.' },
      ],
    },
  },
  {
    stage: 'adapting',
    q: {
      id: 'pl-adapting', kind: 'mcq', level: 2,
      prompt: 'LoRA fine-tunes a model while training only a tiny fraction of its parameters. How?',
      options: [
        { text: 'It freezes each weight matrix and learns a small low-rank matrix product that is added to it', correct: true, why: 'The update is B·A, two thin matrices whose product has the same shape as the frozen weight.' },
        { text: 'It trains only the last layer', why: 'LoRA adapters are usually attached to attention matrices throughout the network.' },
        { text: 'It picks the most important 1% of existing weights and trains those', why: 'No existing weight is changed. The trainable parameters are new ones added beside the frozen matrix.' },
        { text: 'It compresses the model to 4-bit first', why: 'That is the extra step QLoRA adds. Plain LoRA does not quantize.' },
      ],
    },
  },
  {
    stage: 'steering',
    q: {
      id: 'pl-steering', kind: 'mcq', level: 2,
      prompt: 'A RAG system answers a question about a document published yesterday. Where did that knowledge come from?',
      options: [
        { text: 'Text was retrieved at question time and placed in the prompt', correct: true, why: 'Retrieval puts the facts into the context window. The weights are untouched.' },
        { text: 'The model was fine-tuned on the document overnight', why: 'RAG involves no weight updates.' },
        { text: 'The embedding model memorized the document', why: 'The embedding model only turns text into vectors for search. The text itself sits in an index.' },
        { text: 'The model searched its own weights more thoroughly', why: 'Knowledge that postdates training is not in the weights at all.' },
      ],
    },
  },
];

export const NOT_SURE = { text: 'Not sure yet', why: 'Fair. That stage will start in guided mode.' };
