import { useSyncExternalStore } from 'react';

/** Hash router: works on any static host with no rewrite rules. */
const path = () => window.location.hash.replace(/^#/, '') || '/';

export function useRoute(): string {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    path,
  );
}

export function go(to: string) {
  window.location.hash = to;
  window.scrollTo({ top: 0 });
}
