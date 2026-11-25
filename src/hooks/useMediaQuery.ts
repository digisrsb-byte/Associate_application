import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. Defaults to `false` during SSR / first paint
 * when `window` is unavailable, then syncs on mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True below Tailwind `lg` (1024px) — phone / small tablet layouts. */
export function useIsCompactLayout(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
