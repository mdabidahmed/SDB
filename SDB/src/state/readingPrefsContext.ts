import { createContext, useContext } from 'react';

export type ReaderFontFamily = 'sans' | 'serif' | 'mono';
export type ReaderFontWeight = 'normal' | 'medium' | 'semibold' | 'bold';

export interface ReadingPrefs {
  readonly fontScale: number;
  readonly fontFamily: ReaderFontFamily;
  readonly fontWeight: ReaderFontWeight;
  /** Hex color, or `null` to use the theme's default text color. */
  readonly textColor: string | null;
}

export const DEFAULT_READING_PREFS: ReadingPrefs = {
  fontScale: 1,
  fontFamily: 'sans',
  fontWeight: 'normal',
  textColor: null,
};

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.1;

export const FONT_FAMILY_OPTIONS: readonly {
  readonly id: ReaderFontFamily;
  readonly label: string;
  readonly cssValue: string;
}[] = [
  { id: 'sans', label: 'Sans', cssValue: 'var(--font-sans)' },
  {
    id: 'serif',
    label: 'Serif',
    cssValue: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
  },
  { id: 'mono', label: 'Mono', cssValue: 'var(--font-mono)' },
];

export const FONT_WEIGHT_OPTIONS: readonly {
  readonly id: ReaderFontWeight;
  readonly label: string;
  readonly cssValue: string;
}[] = [
  { id: 'normal', label: 'Normal', cssValue: 'var(--weight-normal)' },
  { id: 'medium', label: 'Medium', cssValue: 'var(--weight-medium)' },
  { id: 'semibold', label: 'Semibold', cssValue: 'var(--weight-semibold)' },
  { id: 'bold', label: 'Bold', cssValue: 'var(--weight-bold)' },
];

/** 12 preset text colors the reader can apply to lesson content. */
export const READING_COLOR_PALETTE: readonly { readonly label: string; readonly value: string }[] = [
  { label: 'Slate', value: '#14181f' },
  { label: 'Charcoal', value: '#2b2f38' },
  { label: 'Crimson', value: '#9c1f34' },
  { label: 'Rust', value: '#b3441c' },
  { label: 'Amber', value: '#8a5a06' },
  { label: 'Olive', value: '#5c6b1f' },
  { label: 'Forest', value: '#0a7d55' },
  { label: 'Teal', value: '#0d7a72' },
  { label: 'Ocean', value: '#0f5fa8' },
  { label: 'Indigo', value: '#3f4bb0' },
  { label: 'Plum', value: '#7a3f9e' },
  { label: 'Rose', value: '#a83266' },
];

export const READING_PREFS_STORAGE_KEY = 'sdi.readingPrefs';

export interface ReadingPrefsContextValue {
  /** Last saved preferences (what the page renders with outside the settings panel). */
  readonly prefs: ReadingPrefs;
  /** Applies preferences to the page immediately without persisting them. */
  readonly previewPrefs: (next: ReadingPrefs) => void;
  /** Persists preferences and makes them the new saved baseline. */
  readonly commitPrefs: (next: ReadingPrefs) => void;
}

export const ReadingPrefsContext = createContext<ReadingPrefsContextValue | null>(null);

export const useReadingPrefs = (): ReadingPrefsContextValue => {
  const value = useContext(ReadingPrefsContext);
  if (!value) throw new Error('useReadingPrefs must be used inside <ReadingPrefsProvider>');
  return value;
};
