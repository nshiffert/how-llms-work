import { useMemo, useState } from 'react';
import bpeRanks from 'gpt-tokenizer/esm/bpeRanks/o200k_base';
import { O200K_TOKEN_SPLIT_REGEX } from 'gpt-tokenizer/esm/encodingParams/constants';

// The same text tokenized at five vocabulary caps. The engine is the REAL
// o200k_base merge list (GPT-4o's tokenizer) truncated at rank < cap — which
// is exactly the tokenizer you would have gotten by stopping BPE training at
// that vocabulary size, because BPE adds merges in frequency order. At the
// full cap this reproduces tiktoken's output token-for-token (verified against
// gpt-tokenizer's encode()).

const MAX_CHARS = 280;
const FULL = bpeRanks.length; // 199,998 mergeable ranks

// byte-string (latin1) -> rank, built once at module load (client:only island)
const textEncoder = new TextEncoder();
const RANKS = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < bpeRanks.length; i++) {
    const v = bpeRanks[i];
    if (v == null) continue;
    const bytes = typeof v === 'string' ? textEncoder.encode(v) : Uint8Array.from(v as number[]);
    m.set(String.fromCharCode(...bytes), i);
  }
  return m;
})();

const CAPS: { cap: number; label: string; note: string }[] = [
  { cap: 1_000, label: '1K', note: 'toy' },
  { cap: 8_000, label: '8K', note: 'small' },
  { cap: 32_000, label: '32K', note: 'Llama-2 era' },
  { cap: 100_000, label: '100K', note: 'GPT-4 era' },
  { cap: FULL, label: '200K', note: 'full o200k' },
];

const PRESETS: { label: string; text: string }[] = [
  {
    label: 'Plain English',
    text: 'The patient came in short of breath after walking, with a history of heart failure.',
  },
  {
    label: 'Clinical note',
    text: 'Pt c/o SOB w/ DOE. PMH: HFrEF (EF 25%), CKD3b, T2DM. Meds: sacubitril/valsartan 97/103mg BID.',
  },
  {
    label: 'Rare drug name',
    text: 'Started pembrolizumab after nivolumab failed; consider atezolizumab next.',
  },
  {
    label: 'Code',
    text: 'const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });',
  },
  { label: 'Japanese', text: '患者は歩行後に息切れを訴え、心不全の既往歴があった。' },
];

const COLORS = [
  'rgba(110,168,254,0.20)',
  'rgba(94,234,212,0.18)',
  'rgba(182,146,246,0.20)',
  'rgba(245,168,94,0.18)',
];

// Greedy lowest-rank merge over one pre-tokenized piece, ignoring every merge
// whose rank is >= cap — i.e. every vocabulary entry "after training stopped".
function encodePiece(bytes: Uint8Array, cap: number): string[] {
  let parts: string[] = Array.from(bytes, (b) => String.fromCharCode(b));
  while (parts.length > 1) {
    let best = -1;
    let bestRank = Infinity;
    for (let i = 0; i < parts.length - 1; i++) {
      const r = RANKS.get(parts[i] + parts[i + 1]);
      if (r !== undefined && r < cap && r < bestRank) {
        bestRank = r;
        best = i;
      }
    }
    if (best < 0) break;
    parts = [...parts.slice(0, best), parts[best] + parts[best + 1], ...parts.slice(best + 2)];
  }
  return parts;
}

function encodeCapped(text: string, cap: number): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(O200K_TOKEN_SPLIT_REGEX)) {
    out.push(...encodePiece(textEncoder.encode(m[0]), cap));
  }
  return out;
}

// A token is a latin1 byte-string; render it as text if its bytes are valid
// UTF-8, else as hex — those hex chips ARE the byte-level fallback (no [UNK]).
const strictDecoder = new TextDecoder('utf-8', { fatal: true });
function renderToken(latin1: string): { text: string; isBytes: boolean } {
  const bytes = Uint8Array.from([...latin1].map((c) => c.charCodeAt(0)));
  try {
    return { text: strictDecoder.decode(bytes), isBytes: false };
  } catch {
    return {
      text: [...bytes].map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      isBytes: true,
    };
  }
}

function tableMemory(vocab: number): string {
  const mb = (vocab * 4096 * 2) / 1e6; // dim 4096, fp16
  return mb >= 1000 ? (mb / 1000).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
}

export default function VocabSizeExplorer() {
  const [text, setText] = useState(PRESETS[1].text);

  const rows = useMemo(() => {
    const t = text.slice(0, MAX_CHARS);
    return CAPS.map(({ cap, label, note }) => ({
      cap,
      label,
      note,
      tokens: encodeCapped(t, cap),
    }));
  }, [text]);

  const chars = [...text.slice(0, MAX_CHARS)].length;
  const fullCount = rows[rows.length - 1].tokens.length || 1;

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
        rows={2}
        className="mb-3 w-full resize-y rounded-lg border border-line bg-ink-900 px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/50"
      />

      <div className="space-y-3">
        {rows.map(({ cap, label, note, tokens }) => {
          const inflation = tokens.length / fullCount;
          return (
            <div key={cap} className="rounded-lg border border-line bg-ink-900/50">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-1.5 font-mono text-2xs">
                <span className="font-semibold text-fg">
                  vocab {label}
                  <span className="ml-1.5 font-normal text-fg-faint">({note})</span>
                </span>
                <span className="text-live">
                  <span className="text-fg-faint">tokens</span> {tokens.length}
                </span>
                <span className="text-fg-muted">
                  <span className="text-fg-faint">chars/tok</span>{' '}
                  {(chars / (tokens.length || 1)).toFixed(2)}
                </span>
                <span className={inflation > 1.01 ? 'text-cat-generation' : 'text-fg-muted'}>
                  {inflation > 1.01 ? `+${Math.round((inflation - 1) * 100)}% longer` : 'baseline'}
                </span>
                <span className="ml-auto text-fg-muted">
                  <span className="text-fg-faint">embed table</span> {tableMemory(cap)}
                </span>
              </div>
              <div className="px-3 py-2 leading-6">
                {tokens.map((tok, i) => {
                  const { text: t, isBytes } = renderToken(tok);
                  return (
                    <span
                      key={i}
                      className={
                        'rounded-[3px] font-mono text-xs ' +
                        (isBytes ? 'text-cat-generation' : 'text-fg')
                      }
                      style={{
                        background: isBytes ? 'rgba(245,168,94,0.12)' : COLORS[i % COLORS.length],
                        padding: '1px 1px',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
                      }}
                    >
                      {t.replace(/\n/g, '↵')}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-fg-faint">
        Every row is the same merge list — GPT-4o's real o200k_base — cut off at a smaller
        vocabulary cap, which is exactly what stopping BPE training earlier produces. Reading
        top to bottom: sequence gets shorter, embedding table gets bigger (shown at dim 4096,
        fp16). Amber hex chips are tokens that fell all the way back to raw bytes — the
        fallback that makes an <code>[UNK]</code> token unnecessary.
      </p>
    </div>
  );
}
