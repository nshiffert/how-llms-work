import { useCallback, useEffect, useState } from 'react';

/**
 * Real token counts for the prompt-steering labs. The cl100k_base tokenizer
 * (the one GPT-4 uses) is loaded lazily; until it arrives, counts fall back to
 * the usual rough estimate of one token per four characters and `exact` is false.
 */
type CountFn = (text: string) => number;
let cached: CountFn | null = null;
let pending: Promise<CountFn> | null = null;

function load(): Promise<CountFn> {
  if (!pending) {
    pending = import('gpt-tokenizer/encoding/cl100k_base').then((m) => {
      cached = (t: string) => (t ? m.countTokens(t) : 0);
      return cached;
    });
  }
  return pending;
}

export function useTokenCount(): { count: CountFn; exact: boolean } {
  const [fn, setFn] = useState<CountFn | null>(() => cached);
  useEffect(() => {
    if (fn) return;
    let live = true;
    load().then((f) => { if (live) setFn(() => f); }).catch(() => {});
    return () => { live = false; };
  }, [fn]);
  const estimate = useCallback((t: string) => Math.ceil(t.length / 4), []);
  return { count: fn ?? estimate, exact: !!fn };
}
