import { useMemo, useState } from 'react';
import { encode, decode } from 'gpt-tokenizer/encoding/o200k_base';

// The trained vocab applied to real text. This is GPT-4o's actual tokenizer
// (o200k_base), running entirely client-side — no API. We encode the text to
// token ids, then recover each token's exact surface string by decoding growing
// prefixes and diffing, which stays correct even when a token is a partial
// multi-byte sequence.

const MAX_CHARS = 1200;

const PRESETS: { label: string; text: string }[] = [
  { label: 'English', text: 'The quick brown fox jumps over the lazy dog.' },
  { label: 'Code', text: 'def fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)' },
  { label: 'Numbers', text: 'Invoice #1234567890 — total $48,250.75 due 2026-06-24.' },
  { label: 'Multilingual', text: 'こんにちは世界 · Привет, мир · مرحبا بالعالم' },
  { label: 'Rare word', text: 'antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis' },
];

// Low-alpha cycling backgrounds so adjacent tokens are always distinguishable.
const COLORS = [
  'rgba(110,168,254,0.20)',
  'rgba(94,234,212,0.18)',
  'rgba(182,146,246,0.20)',
  'rgba(245,168,94,0.18)',
];

function tokenize(text: string) {
  const ids = encode(text);
  const pieces: string[] = [];
  let prev = '';
  for (let i = 0; i < ids.length; i++) {
    const cur = decode(ids.slice(0, i + 1));
    pieces.push(cur.slice(prev.length));
    prev = cur;
  }
  return { ids, pieces };
}

export default function RealTokenizer() {
  const [text, setText] = useState(PRESETS[0].text);
  const [showIds, setShowIds] = useState(false);

  const { ids, pieces } = useMemo(() => tokenize(text.slice(0, MAX_CHARS)), [text]);
  const chars = [...text.slice(0, MAX_CHARS)].length;
  const ratio = ids.length ? chars / ids.length : 0;

  return (
    <div className="font-sans text-sm">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setText(p.text)}
            className="rounded-md border border-line px-2 py-0.5 text-2xs text-fg-muted hover:border-accent/40 hover:text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={3}
        className="mb-3 w-full resize-y rounded-lg border border-line bg-ink-900 px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/50"
      />

      {/* Stats */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-2xs">
        <span className="text-fg-muted">
          <span className="text-fg-faint">chars</span> {chars}
        </span>
        <span className="text-live">
          <span className="text-fg-faint">tokens</span> {ids.length}
        </span>
        <span className="text-fg-muted">
          <span className="text-fg-faint">chars / token</span> {ratio.toFixed(2)}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-fg-faint">
          <input
            type="checkbox"
            checked={showIds}
            onChange={(e) => setShowIds(e.target.checked)}
            className="accent-[#6ea8fe]"
          />
          show ids
        </label>
      </div>

      {/* Token render */}
      <div className="rounded-lg border border-line bg-ink-900/50 p-3 leading-7">
        {pieces.map((piece, i) => {
          const newline = piece.includes('\n');
          return (
            <span key={i} className="inline">
              <span
                title={`id ${ids[i]}`}
                className="rounded-[3px] font-mono text-xs text-fg"
                style={{
                  background: COLORS[i % COLORS.length],
                  padding: '2px 1px',
                  whiteSpace: 'pre-wrap',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
                }}
              >
                {piece.replace(/\n/g, '↵')}
              </span>
              {showIds && (
                <span className="mx-0.5 align-super text-[0.55rem] text-fg-faint">
                  {ids[i]}
                </span>
              )}
              {newline && <br />}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-fg-faint">
        Each shaded box is one token. Notice leading spaces belong to the
        following word, numbers shatter into 3-digit chunks, and non-Latin
        scripts cost far more tokens per character — that ratio is what your API
        bill and your context budget are spent on.
      </p>
    </div>
  );
}
