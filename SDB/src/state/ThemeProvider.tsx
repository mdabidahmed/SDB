import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { THEME_STORAGE_KEY, ThemeContext, type Theme } from '@/state/themeContext';

/** Reads what the inline bootstrap in `index.html` already resolved. */
const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const hasStoredPreference = (): boolean => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark';
  } catch {
    return false;
  }
};

export const ThemeProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  /** Follow the OS until the reader states a preference of their own. */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      if (!hasStoredPreference()) setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next = previous === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* storage disabled; the theme still applies for this session */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
