import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { LabProps, Lesson } from '../engine/types';
import { Bars, Callout, Code, Stat, tokHue, useSpring } from '../ui/kit';
import { sfx } from '../engine/sfx';
import { SP, applyMerge, baseVocab, countPairs, encode as toyEncode, toWords, type Merge, type PairCount, type Word } from './tokenization.bpe';

/* ------------------------------------------------------------------ *
 * Lab, part A: a real byte-pair-encoding trainer on an 11-word corpus.
 * Pair counts and merges are computed, never scripted.
 * Lab, part B: the real GPT-4o tokenizer (o200k_base) on whatever the
 * learner types. It is loaded on demand because the vocabulary is big.
 * ------------------------------------------------------------------ */

const CORPUS = 'the cat sat on the mat the cat ate the hat';

/** Every state the trainer can reach: TRAJ[k] is the corpus after k merges. */
const TRAJ: { words: Word[]; pairs: PairCount[] }[] = (() => {
  const out: { words: Word[]; pairs: PairCount[] }[] = [];
  let words = toWords(CORPUS);
  for (;;) {
    const pairs = countPairs(words);
    out.push({ words, pairs });
    if (!pairs.length) break;
    words = applyMerge(words, pairs[0].a, pairs[0].b);
  }
  return out;
})();
const BASE = baseVocab(TRAJ[0].words);
const MERGES: Merge[] = TRAJ.slice(0, -1).map((s) => [s.pairs[0].a, s.pairs[0].b]);
const MAX_K = MERGES.length;
const TOY_VOCAB = [...BASE, ...MERGES.map(([a, b]) => a + b)];
const corpusLen = (ws: Word[]) => ws.reduce((s, w) => s + w.syms.length, 0);

const show = (s: string) => s.replace(/ /g, SP).replace(/\n/g, '⏎').replace(/\t/g, '⇥');

interface Enc {
  encode: (s: string) => number[];
  decode: (ids: number[]) => string;
}
interface Piece {
  id: number | null;
  /** The exact text this token stands for. */
  s: string;
}

const EXAMPLES = ['hello hello', 'antidisestablishmentarianism', '3.14159265358979 + 2.71828182845905', '東京タワーに行きました'];

const chip = {
  fontFamily: 'var(--mono)', fontSize: 15, padding: '4px 7px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'rgba(255,255,255,0.045)', color: '#fff', whiteSpace: 'pre' as const, lineHeight: 1.3, display: 'inline-block',
};

function TokenizationLab({ complete }: LabProps) {
  /* ---------- part A ---------- */
  const [k, setK] = useState(0);
  const { words, pairs } = TRAJ[k];
  const top = pairs[0];
  const fresh = k > 0 ? MERGES[k - 1][0] + MERGES[k - 1][1] : null;
  const len = corpusLen(words);
  const lenSpring = useSpring(len, 0.25);

  useEffect(() => {
    // "·the" occurs three times; it becomes one chip on the fourth merge.
    if (k > 0 && words.filter((w) => w.syms.length === 1 && w.syms[0] === SP + 'the').length >= 2) complete('word');
  }, [k, words, complete]);

  /* ---------- part B ---------- */
  const [text, setText] = useState('The tokenizer splits text into pieces.');
  const [enc, setEnc] = useState<Enc | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    import('gpt-tokenizer/encoding/o200k_base')
      .then((m) => {
        if (!alive) return;
        setEnc({ encode: (s) => m.encode(s), decode: (ids) => m.decode(ids) });
        setStatus('ready');
      })
      .catch(() => alive && setStatus('failed'));
    return () => { alive = false; };
  }, [attempt]);

  const pieces: Piece[] = useMemo(() => {
    if (status === 'ready' && enc) {
      try {
        return enc.encode(text).map((id) => ({ id, s: enc.decode([id]) }));
      } catch {
        return [];
      }
    }
    if (status === 'failed') {
      // Fallback: the toy tokenizer from part A, fully trained.
      return toyEncode(text, MERGES).flat().map((s) => {
        const id = TOY_VOCAB.indexOf(s);
        return { id: id < 0 ? null : id, s: s.split(SP).join(' ') };
      });
    }
    return [];
  }, [text, enc, status]);

  const nWords = text.trim() ? text.trim().split(/\s+/).length : 0;
  const nChars = Array.from(text).length;

  useEffect(() => {
    // Missions describe the real tokenizer; the toy fallback must not complete them.
    if (status !== 'ready' || !pieces.length) return;
    const t = text.trim();
    if (t && !/\s/.test(t) && /\p{L}/u.test(t) && pieces.length >= 3) complete('rare');
    const set = new Set(pieces.map((p) => p.s));
    if (pieces.some((p) => /^\p{L}+$/u.test(p.s) && set.has(' ' + p.s))) complete('space');
    if (pieces.length >= 8 && pieces.length >= 2 * nWords) complete('dense');
  }, [pieces, text, nWords, complete, status]);

  return (
    <div className="lab-grid">
      {/* ================= A ================= */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">A · train a tokenizer on 11 words</div>
        <span className="dim mono" style={{ fontSize: 12 }}>{SP} = a space, glued to the word after it</span>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--bg)', padding: '12px 12px 8px', minHeight: 96 }}>
        {words.map((w, wi) => {
          // Which chips will the next merge join? Same left-to-right scan the merge uses.
          const hot = new Set<number>();
          if (top) {
            for (let i = 0; i < w.syms.length - 1; i++) {
              if (w.syms[i] === top.a && w.syms[i + 1] === top.b) { hot.add(i); hot.add(i + 1); i++; }
            }
          }
          return (
            <span key={wi} style={{ display: 'inline-flex', gap: 2, margin: '0 10px 8px 0', verticalAlign: 'top' }}>
              {w.syms.map((s, si) => {
                const mi = TOY_VOCAB.indexOf(s) - BASE.length;
                const c = mi >= 0 ? tokHue(mi) : null;
                const isFresh = s === fresh;
                return (
                  <motion.span
                    layout
                    key={`${si}:${s}`}
                    initial={isFresh ? { scale: 0.4, opacity: 0.2 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 20 }}
                    style={{
                      ...chip,
                      background: c ? `color-mix(in srgb, ${c} ${isFresh ? 42 : 20}%, transparent)` : chip.background,
                      borderColor: hot.has(si) ? 'var(--hue)' : c ? `color-mix(in srgb, ${c} 60%, transparent)` : 'var(--line-2)',
                      boxShadow: hot.has(si) ? '0 0 0 1px var(--hue), 0 0 14px -2px var(--hue)' : isFresh ? `0 0 16px -2px ${c}` : 'none',
                      transition: 'box-shadow .3s, border-color .3s, background .5s',
                    }}
                  >
                    {s}
                  </motion.span>
                );
              })}
            </span>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button
            className="btn primary"
            disabled={!top}
            onClick={() => { sfx.tap(); setK(Math.min(MAX_K, k + 1)); }}
          >
            {top ? <>Merge the top pair <span className="mono">{top.a} + {top.b}</span></> : 'Nothing left to merge'}
          </button>
          <button className="btn sm" disabled={k === 0} onClick={() => { sfx.tap(); setK(Math.max(0, k - 1)); }}>Undo</button>
          <button className="btn sm" disabled={k === 0} onClick={() => { sfx.tap(); setK(0); }}>Reset</button>
        </div>
        <span className="dim" style={{ fontSize: 13 }}>
          {top
            ? top.count > 1
              ? <>The glowing chips are the {top.count} places it occurs.</>
              : <>Every remaining pair occurs once. Merging now only memorizes single words.</>
            : <>Every word is one token.</>}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>adjacent pairs, most frequent first</div>
          {pairs.length ? (
            <Bars
              items={pairs.slice(0, 6).map((p, i) => ({
                label: `${p.a} + ${p.b}`, value: p.count, text: `×${p.count}`,
                color: i === 0 ? undefined : 'color-mix(in srgb, var(--hue) 38%, transparent)',
              }))}
              max={TRAJ[0].pairs[0].count}
              labelWidth={92}
            />
          ) : (
            <div className="dim" style={{ fontSize: 14 }}>No pairs left: no word has two tokens in it.</div>
          )}
          {pairs.length > 6 && <div className="dim mono" style={{ fontSize: 12, marginTop: 6 }}>+ {pairs.length - 6} more pairs</div>}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>vocabulary (id → token)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {TOY_VOCAB.slice(0, BASE.length + k).map((s, id) => {
              const c = id >= BASE.length ? tokHue(id - BASE.length) : null;
              return (
                <motion.span
                  key={id}
                  initial={id >= BASE.length ? { scale: 0.4, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  className="mono"
                  style={{
                    fontSize: 13, padding: '2px 7px', borderRadius: 7, whiteSpace: 'pre',
                    border: `1px solid ${c ? `color-mix(in srgb, ${c} 55%, transparent)` : 'var(--line)'}`,
                    background: c ? `color-mix(in srgb, ${c} 16%, transparent)` : 'transparent',
                  }}
                >
                  <span className="dim" style={{ fontSize: 11 }}>{id} </span>
                  <span style={{ color: '#fff' }}>{s}</span>
                </motion.span>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Stat label="vocabulary size" value={BASE.length + k} hot />
            <Stat label="corpus length, in tokens" value={Math.round(lenSpring)} />
          </div>
        </div>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} />

      {/* ================= B ================= */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">B · the real GPT-4o tokenizer</div>
        <span className="dim mono" style={{ fontSize: 12 }}>
          {status === 'ready' ? 'o200k_base · about 200,000 tokens' : status === 'loading' ? 'loading…' : 'toy tokenizer (fallback)'}
        </span>
      </div>

      <textarea
        className="text-in"
        rows={2}
        value={text}
        spellCheck={false}
        aria-label="Text to tokenize"
        onChange={(e) => setText(e.target.value)}
        style={{ resize: 'vertical', lineHeight: 1.5 }}
      />
      <div className="row" style={{ gap: 6 }}>
        <span className="dim" style={{ fontSize: 13 }}>Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="btn sm mono"
            style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => { sfx.tap(); setText(ex); }}
          >
            {ex.length > 22 ? ex.slice(0, 20) + '…' : ex}
          </button>
        ))}
      </div>

      {status === 'failed' && (
        <Callout warn>
          The GPT-4o vocabulary could not be loaded. The chips below come from the toy tokenizer of part A instead, with
          all {MAX_K} merges applied. Its ids are positions in that {TOY_VOCAB.length}-entry vocabulary, and a character it
          never saw has no id.{' '}
          <button className="btn sm" onClick={() => { sfx.tap(); setAttempt(attempt + 1); }}>Retry</button>
        </Callout>
      )}

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--bg)', padding: 12, minHeight: 84 }}>
        {status === 'loading' ? (
          <div className="row dim" style={{ fontSize: 14, minHeight: 58 }}>
            <span className="spinner" style={{ margin: 0, width: 20, height: 20 }} />
            Loading the GPT-4o vocabulary…
          </div>
        ) : pieces.length === 0 ? (
          <div className="dim" style={{ fontSize: 14 }}>Type something above.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 4px' }}>
            {pieces.map((p, i) => {
              const c = tokHue(i);
              return (
                <motion.span
                  key={`${i}:${p.id}:${p.s}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 24) * 0.012 }}
                  style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                  title={JSON.stringify(p.s)}
                >
                  <span style={{ ...chip, background: `color-mix(in srgb, ${c} 20%, transparent)`, borderColor: `color-mix(in srgb, ${c} 55%, transparent)` }}>
                    {show(p.s)}
                  </span>
                  <span className="mono dim" style={{ fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{p.id ?? 'none'}</span>
                </motion.span>
              );
            })}
          </div>
        )}
      </div>

      <div className="row">
        <Stat label="tokens" value={status === 'loading' ? '…' : pieces.length} hot />
        <Stat label="characters" value={nChars} />
        <Stat label="words" value={nWords} />
        <Stat label="characters per token" value={pieces.length ? (nChars / pieces.length).toFixed(1) : '…'} />
      </div>
      <div className="dim" style={{ fontSize: 13 }}>
        The number under each chip is the token id. That list of ids is everything the model receives.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const lesson: Lesson = {
  id: 'tokenization',
  hook: {
    prompt: (
      <>
        You send GPT-4o the single word <code>strawberry</code>. What does the model itself receive?
      </>
    ),
    options: [
      {
        text: 'Three integers, standing for the pieces “st”, “raw” and “berry”',
        correct: true,
        why: 'The tokenizer cuts text into pieces from a fixed list and sends each piece’s id: here 302, 1618 and 19772. The cuts follow frequency in the tokenizer’s training text, not meaning or syllables.',
      },
      {
        text: 'Ten characters: s, t, r, a, w, b, e, r, r, y',
        why: 'The model never receives letters. Feeding characters would make every sequence several times longer, so text is cut into larger pieces first.',
      },
      {
        text: 'One integer, because every dictionary word has its own entry',
        why: 'There is no dictionary of words. Common strings get one id, but at the start of a text “strawberry” is not one of them. With a space in front it is.',
      },
      {
        text: 'Three integers, one per syllable: “straw”, “ber”, “ry”',
        why: 'The tokenizer knows nothing about syllables or grammar. It only knows which strings were frequent when it was built, and those cuts are “st”, “raw”, “berry”.',
      },
    ],
    reveal: 'Next you will build a small tokenizer by hand, then run the real GPT-4o one on your own text.',
  },
  Lab: TokenizationLab,
  missions: [
    {
      id: 'word',
      text: 'In part A, keep merging the top pair until “·the” is a single chip.',
      insight:
        'It took four merges: a+t, t+h, th+e, then ·+the. Nobody told the algorithm that “the” is a word. It only counted which neighbours appear together most often, and a frequent word fell out as one token. The corpus shrank from 42 tokens to 25 while the vocabulary grew from 10 to 14.',
    },
    {
      id: 'rare',
      text: 'In part B, type one made-up or rare word (no spaces) that splits into 3 or more tokens.',
      insight:
        'A word the tokenizer never merged whole is spelled out of smaller pieces it does have. Nothing is ever “unknown”: in the worst case the pieces are single bytes. The price is that one word now takes several positions in the sequence.',
    },
    {
      id: 'space',
      text: 'Type the same word twice with a space between, such as “hello hello”, and compare the two ids.',
      insight:
        'The space belongs to the token after it, so “hello” (24912) and “ hello” (40617) are different ids, and “Hello” (13225) is a third. To the model these are unrelated integers until training teaches it that they behave alike.',
    },
    {
      id: 'dense',
      text: 'Find a text with at least 8 tokens and at least twice as many tokens as words. Try long numbers, code, or another language.',
      insight:
        'Merges were learned from text dominated by English, so anything else is covered by fewer and shorter pieces. Context limits and prices are counted in tokens, so this text costs more and fills the context window faster than the same number of English words.',
    },
  ],
  explain: {
    core: (
      <>
        <p>
          A model works on integers. A <strong>tokenizer</strong> is the fixed procedure that turns text into a list of
          integer ids, and back. Each id names one <em>token</em>: a piece of text from a fixed list called the{' '}
          <em>vocabulary</em>.
        </p>
        <p>The vocabulary is built by byte-pair encoding (BPE), the loop you ran in part A:</p>
        <ol>
          <li>Start with every text split into its smallest units. GPT-style tokenizers use the 256 possible bytes.</li>
          <li>Count every adjacent pair of tokens across the training text.</li>
          <li>Glue the most frequent pair into one new token and add it to the vocabulary.</li>
          <li>Repeat until the vocabulary reaches a chosen size. GPT-4o’s has about 200,000 entries.</li>
        </ol>
        <p>
          To tokenize new text, the same merges are replayed in the order they were learned. Frequent strings end up as
          one token. Rare strings stay in several pieces.
        </p>
        <Callout>
          All of this runs before the model is trained and is then frozen. The model never sees letters. It sees ids, and
          learns what each id means only from the ids that surround it.
        </Callout>
      </>
    ),
    worked: (
      <>
        <p>
          The corpus from part A is <code>the cat sat on the mat the cat ate the hat</code>. A space is glued to the word
          after it and written <code>·</code>, so the corpus starts as 42 single-character tokens drawn from 10 distinct
          characters.
        </p>
        <table>
          <thead>
            <tr><th>merge</th><th>top pair</th><th>count</th><th>new token</th><th>corpus length</th><th>vocabulary</th></tr>
          </thead>
          <tbody>
            <tr><td>start</td><td></td><td></td><td></td><td>42</td><td>10</td></tr>
            <tr><td>1</td><td>a + t</td><td>6</td><td>at</td><td>36</td><td>11</td></tr>
            <tr><td>2</td><td>t + h</td><td>4</td><td>th</td><td>32</td><td>12</td></tr>
            <tr><td>3</td><td>th + e</td><td>4</td><td>the</td><td>28</td><td>13</td></tr>
            <tr><td>4</td><td>· + the</td><td>3</td><td>·the</td><td>25</td><td>14</td></tr>
          </tbody>
        </table>
        <p>
          Each merge removes one token for every place the pair occurred: 42 − 6 = 36, then 36 − 4 = 32. The pair{' '}
          <code>a + t</code> wins first because it sits inside cat (twice), sat, mat, ate and hat: 6 occurrences. At merge 2,{' '}
          <code>t + h</code> and <code>h + e</code> tie at 4, and the one seen first wins.
        </p>
        <p>
          To tokenize the new word <code>that</code> with these merges, replay them in order: <code>t h a t</code> →{' '}
          <code>t h at</code> → <code>th at</code>. Two tokens, even though “that” never appeared in the corpus.
        </p>
        <Code>{`
tokens = list(text_bytes)                   # start from single bytes
while len(vocab) < target_size:
    pairs = count_adjacent_pairs(tokens)    # {(a, b): how often}
    a, b  = max(pairs, key=pairs.get)       # most frequent pair
    tokens = replace_every(tokens, (a, b), a + b)
    vocab.append(a + b)                     # one new id per merge
`}</Code>
      </>
    ),
    deeper: (
      <>
        <h3>Bytes, not characters</h3>
        <p>
          GPT-style tokenizers start from the 256 byte values of UTF-8 text instead of from letters. Any string in any script,
          including emoji, is some sequence of bytes, so every input can be encoded and there is no “unknown word”
          token. GPT-2’s vocabulary is exactly that: 256 bytes + 50,000 merges + 1 special end-of-text token = 50,257.
        </p>
        <h3>Why the space sticks to the next word</h3>
        <p>
          Text is first cut at word boundaries with the space kept at the front of each word, and merges never cross those
          cuts. That is why “ hello” and “hello” are separate tokens. It lets the ids be turned back into the exact
          original text, spaces included, with no extra rules.
        </p>
        <h3>Encoding is deterministic</h3>
        <p>
          Given a merge list, one string always produces the same ids. There is no model and no probability involved: the
          learned merges are applied in priority order until none fits. Decoding is a table lookup followed by joining
          the pieces.
        </p>
        <h3>Tokens are the unit of cost</h3>
        <p>
          Context windows, rate limits and prices are all counted in tokens. For ordinary English one token is roughly 4
          characters, or about three quarters of a word. That ratio is an average for English prose only. Part B showed
          how far it can move.
        </p>
      </>
    ),
  },
  breaks: [
    {
      title: 'The model cannot see spelling',
      body: '“strawberry” arrives as 302, 1618, 19772, or as the single id 101830 when a space comes first. Neither contains the letter r. Counting letters, reversing words and rhyming all depend on the model having memorized how each token is spelled.',
    },
    {
      title: 'One word, several unrelated ids',
      body: '“hello”, “ hello” and “Hello” are ids 24912, 40617 and 13225. The model has to learn from data that they mean the same thing. Odd capitalization or a missing space can push a prompt onto rarer, less well-learned tokens.',
    },
    {
      title: 'Numbers are cut at arbitrary places',
      body: '3.14159265358979 becomes 3 | . | 141 | 592 | 653 | 589 | 79. The cuts do not line up with place value, and a different number is cut differently. This is one reason digit-by-digit arithmetic is hard for language models.',
    },
    {
      title: 'Text unlike the training text costs more',
      body: 'The 11-character Japanese sentence 東京タワーに行きました takes 8 tokens, about 1.4 characters per token against roughly 4 for English. Other languages, code and identifiers use up context and budget faster.',
    },
  ],
  questions: [
    {
      id: 'tok-1', kind: 'mcq', level: 1,
      prompt: 'What does one step of byte-pair-encoding training do?',
      options: [
        { text: 'Merges the most frequent adjacent pair of tokens into one new token', correct: true, why: 'Count neighbours, glue the commonest pair, add it to the vocabulary. Repeating that is the whole algorithm.' },
        { text: 'Finds the most frequent whole word and gives it its own token', why: 'BPE never looks at words as units. Whole-word tokens appear only as the result of several pair merges.' },
        { text: 'Splits the longest token into two shorter and more common tokens', why: 'BPE only ever merges. It starts from the smallest units and builds upward.' },
        { text: 'Adjusts token boundaries to reduce the model’s prediction error', why: 'The model does not exist yet. The tokenizer is built from pair counts alone, before any training of the network.' },
      ],
    },
    {
      id: 'tok-2', kind: 'mcq', level: 1,
      prompt: 'After tokenization, what is passed into the model?',
      options: [
        { text: 'A list of integer ids, one for each token in the text', correct: true, why: 'The ids are all the model gets. Each one selects an entry of the vocabulary; the characters are gone.' },
        { text: 'The characters of the text, grouped into chunks', why: 'The chunks are replaced by their ids. The model has no access to the characters inside a token.' },
        { text: 'One id per word, with rare words mapped to “unknown”', why: 'Tokens are sub-word pieces, and byte-level BPE never needs an unknown token: any text can be spelled from bytes.' },
        { text: 'The raw UTF-8 bytes of the text, one integer per byte', why: 'Bytes are only the starting point for building the vocabulary. The model receives the merged token ids.' },
      ],
    },
    {
      id: 'tok-3', kind: 'num', level: 2,
      prompt: <>A BPE trainer is given the two words <code>banana</code> and <code>band</code>, split into letters. How many times does the pair <code>a + n</code> occur?</>,
      answer: 3, tol: 0,
      why: <>banana has the pairs b+a, a+n, n+a, a+n, n+a: two a+n. band has b+a, a+n, n+d: one more. Total <strong>3</strong>. b+a and n+a each occur 2 times, so a+n is merged first.</>,
      hint: 'Write out every adjacent pair of letters in each word, then count.',
    },
    {
      id: 'tok-4', kind: 'num', level: 2,
      prompt: 'A corpus is 42 tokens long. The most frequent pair occurs 6 times, with no overlaps, and is merged. How many tokens long is the corpus now?',
      answer: 36, tol: 0,
      why: <>Each occurrence turns two tokens into one, removing one token: 42 − 6 = <strong>36</strong>. The vocabulary grew by exactly 1.</>,
      hint: 'Each place the pair occurs loses one token.',
    },
    {
      id: 'tok-5', kind: 'mcq', level: 2,
      prompt: <>A tokenizer learned three merges, in this order: <code>a+t</code>, <code>t+h</code>, <code>th+e</code>. How does it split the new word <code>that</code>?</>,
      options: [
        { text: 'th | at', correct: true, why: 'Replay the merges in order. a+t gives t h at. t+h gives th at. th+e does not apply. Two tokens.' },
        { text: 't | h | a | t', why: 'Merges apply to any text, not only to words from the training corpus. Both a+t and t+h occur here.' },
        { text: 'that', why: 'No merge ever produced “that”. A token exists only if some merge created it.' },
        { text: 't | hat', why: 'There is no merge that makes “hat”. The only way to join h is the t+h merge, which gives “th”.' },
      ],
      hint: 'Start from single letters and apply each merge in the order it was learned.',
    },
    {
      id: 'tok-6', kind: 'mcq', level: 2,
      prompt: 'In GPT-4o’s tokenizer, “hello” is id 24912 and “ hello” (with a leading space) is id 40617. What follows?',
      options: [
        { text: 'The two ids are unrelated until training links them', correct: true, why: 'Ids are just indices. Nothing in the tokenizer links 24912 to 40617; any relation between them is learned during training.' },
        { text: 'The model strips the space first, so both reach it as 24912', why: 'Nothing is stripped. The space is part of the token, which is how the exact text can be rebuilt from the ids.' },
        { text: 'The ids are close together because the strings are similar', why: 'Id order reflects when a merge was learned, not meaning or spelling. Nearby ids are not similar tokens.' },
        { text: 'The second is sent as two tokens: a space and then “hello”', why: 'The lab showed one token. Frequent words have a merged version that includes the leading space.' },
      ],
      hint: 'Ask what an id is: a measurement of the text, or a position in a list?',
    },
    {
      id: 'tok-7', kind: 'mcq', level: 3,
      prompt: 'A byte-level BPE tokenizer meets a word that never appeared in its training text. What happens?',
      options: [
        { text: 'It is spelled from smaller known pieces, down to bytes', correct: true, why: 'All 256 bytes are in the vocabulary, so any string can be encoded. Unseen words just take more tokens.' },
        { text: 'It is replaced by a special “unknown” token', why: 'That was the behaviour of older word-level vocabularies. Starting from bytes removes the need for it.' },
        { text: 'A new token is created for it and added to the vocabulary', why: 'The vocabulary is frozen once the tokenizer is built. Using the tokenizer never changes it.' },
        { text: 'The tokenizer picks the closest known word instead', why: 'Tokenization is exact and reversible. It never substitutes different text.' },
      ],
      hint: 'What is the smallest unit the vocabulary always contains?',
    },
    {
      id: 'tok-8', kind: 'mcq', level: 3,
      prompt: 'Why do language models often miscount the letters in a word such as “strawberry”?',
      options: [
        { text: 'The word arrives as a few ids, and no id exposes its letters', correct: true, why: 'The input is 302, 1618, 19772, or one id with a leading space. To count letters the model must have memorized each token’s spelling.' },
        { text: 'The tokenizer drops repeated letters to shorten the sequence', why: 'Tokenization loses nothing. Decoding the ids gives back the exact string, double r included.' },
        { text: 'The model reads letter by letter and loses its place in long words', why: 'It never reads letters at all. That is the problem, not a slip in attention.' },
        { text: 'Counting needs a calculator, and models cannot do any arithmetic', why: 'Counting to three is not the obstacle. The model simply has no direct view of the characters.' },
      ],
      hint: 'Look at what the model receives for this word. Is there an r in it?',
    },
    {
      id: 'tok-9', kind: 'mcq', level: 3,
      prompt: 'Two prompts are each 2,000 characters long. One is English prose, the other is a random hexadecimal string. Which uses more tokens, and why?',
      options: [
        { text: 'The hex string: few learned merges match random characters', correct: true, why: 'Merges exist for strings that were frequent in training text. Random hex has few long frequent substrings, so it is covered by many small pieces.' },
        { text: 'Neither: token count depends only on the number of characters', why: 'Characters per token varies with content. Part B showed 5.4 for its English sentence and 1.4 for the Japanese one.' },
        { text: 'The English prose: it has more distinct words to look up', why: 'Common words are exactly what the merges compress best, often into one token each.' },
        { text: 'The hex string: digits and letters a to f are missing from the vocabulary', why: 'Every byte is in the vocabulary. The characters are present; long merged pieces for them are not.' },
      ],
      hint: 'Which text contains more of the strings that were frequent when the merges were learned?',
    },
  ],
  takeaways: [
    'A tokenizer turns text into integer ids from a fixed vocabulary, and the model sees only those ids.',
    'Byte-pair encoding builds the vocabulary by repeatedly merging the most frequent adjacent pair, starting from bytes.',
    'Frequent strings become one token, rare ones split into several, and a leading space or capital letter changes the id.',
    'The tokenizer is fixed before training, and limits and prices are counted in its tokens, not in words or characters.',
  ],
};

export default lesson;
