import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_READING_PREFS,
  FONT_FAMILY_OPTIONS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_WEIGHT_OPTIONS,
  READING_PREFS_STORAGE_KEY,
  ReadingPrefsContext,
  type ReadingPrefs,
} from '@/state/readingPrefsContext';

const isFontFamily = (value: unknown): value is ReadingPrefs['fontFamily'] =>
  typeof value === 'string' && FONT_FAMILY_OPTIONS.some((option) => option.id === value);

const isFontWeight = (value: unknown): value is ReadingPrefs['fontWeight'] =>
  typeof value === 'string' && FONT_WEIGHT_OPTIONS.some((option) => option.id === value);

const readStoredPrefs = (): ReadingPrefs => {
  try {
    const raw = localStorage.getItem(READING_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_READING_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_READING_PREFS;
    const candidate = parsed as Record<string, unknown>;

    const fontScale =
      typeof candidate.fontScale === 'number' &&
      candidate.fontScale >= FONT_SCALE_MIN &&
      candidate.fontScale <= FONT_SCALE_MAX
        ? candidate.fontScale
        : DEFAULT_READING_PREFS.fontScale;
    const fontFamily = isFontFamily(candidate.fontFamily)
      ? candidate.fontFamily
      : DEFAULT_READING_PREFS.fontFamily;
    const fontWeight = isFontWeight(candidate.fontWeight)
      ? candidate.fontWeight
      : DEFAULT_READING_PREFS.fontWeight;
    const textColor =
      typeof candidate.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.textColor)
        ? candidate.textColor
        : null;

    return { fontScale, fontFamily, fontWeight, textColor };
  } catch {
    return DEFAULT_READING_PREFS;
  }
};

const applyToDocument = (prefs: ReadingPrefs): void => {
  const root = document.documentElement.style;
  root.setProperty('--reader-font-scale', String(prefs.fontScale));
  root.setProperty(
    '--reader-font-family',
    FONT_FAMILY_OPTIONS.find((option) => option.id === prefs.fontFamily)?.cssValue ?? 'var(--font-sans)',
  );
  root.setProperty(
    '--reader-font-weight',
    FONT_WEIGHT_OPTIONS.find((option) => option.id === prefs.fontWeight)?.cssValue ?? 'var(--weight-normal)',
  );
  if (prefs.textColor) {
    root.setProperty('--reader-text-color', prefs.textColor);
  } else {
    root.removeProperty('--reader-text-color');
  }
};

export const ReadingPrefsProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const [prefs, setPrefs] = useState<ReadingPrefs>(readStoredPrefs);

  useEffect(() => {
    applyToDocument(prefs);
    // Only re-run when the saved baseline changes; live previews apply themselves directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewPrefs = useCallback((next: ReadingPrefs) => {
    applyToDocument(next);
  }, []);

  const commitPrefs = useCallback((next: ReadingPrefs) => {
    applyToDocument(next);
    setPrefs(next);
    try {
      localStorage.setItem(READING_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled; the preference still applies for this session */
    }
  }, []);

  const value = useMemo(() => ({ prefs, previewPrefs, commitPrefs }), [prefs, previewPrefs, commitPrefs]);

  return <ReadingPrefsContext.Provider value={value}>{children}</ReadingPrefsContext.Provider>;
};
