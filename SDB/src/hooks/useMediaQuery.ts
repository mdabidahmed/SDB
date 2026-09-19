import { useEffect, useState } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
};

/** Matches the `1023px` sidebar breakpoint in `AppShell.module.css`. */
export const useIsCompact = (): boolean => useMediaQuery('(max-width: 1023px)');
