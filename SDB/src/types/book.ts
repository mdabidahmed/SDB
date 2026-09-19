/**
 * Types for the data contract defined in `/CONTRACT.md`.
 *
 * These mirror the contract one-to-one. They are the integration boundary with
 * the content-extraction pipeline, so nothing here may be loosened or renamed
 * without also changing CONTRACT.md.
 *
 * Invariant that governs every renderer in this app: **book text is verbatim**.
 * No consumer of these types may transform, re-case, trim, smart-quote or
 * truncate any `text`, `title`, `items[]`, `caption`, `headers[]` or `rows[][]`
 * value. They are rendered exactly as they arrive.
 */

export type BlockType = 'paragraph' | 'list' | 'figure' | 'table' | 'code' | 'heading';

export interface ParagraphBlock {
  readonly type: 'paragraph';
  readonly text: string;
}

export interface ListBlock {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly items: readonly string[];
  /**
   * First printed ordinal when an ordered list does not begin at 1, else `null`.
   * The book continues numbering across an intervening figure, so this MUST be
   * forwarded to `<ol start>` — renumbering from 1 misprints the book.
   */
  readonly start: number | null;
}

export interface FigureBlock {
  readonly type: 'figure';
  /** Web path under `public/`, e.g. `/figures/fig-1-1.png`. */
  readonly src: string;
  readonly alt: string;
  /** `null` when the figure has no printed caption. */
  readonly caption: string | null;
  /** Intrinsic pixel dimensions, used to reserve space and avoid layout shift. */
  readonly width: number;
  readonly height: number;
  readonly page: number;
}

export interface TableBlock {
  readonly type: 'table';
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface CodeBlock {
  readonly type: 'code';
  readonly text: string;
  readonly language: string | null;
}

/** Sub-headings *below* topic level. The topic's own heading is never a block. */
export interface HeadingBlock {
  readonly type: 'heading';
  readonly level: number;
  readonly text: string;
}

export type Block =
  | ParagraphBlock
  | ListBlock
  | FigureBlock
  | TableBlock
  | CodeBlock
  | HeadingBlock;

export interface Topic {
  /** Slug, unique within its chapter. */
  readonly id: string;
  /** Verbatim heading text. */
  readonly title: string;
  /** True for the leading topic holding prose before the first bold heading. */
  readonly isIntro: boolean;
  readonly blocks: readonly Block[];
}

export interface Chapter {
  /** Stable slug used in the URL, e.g. `chapter-1`. */
  readonly id: string;
  /** `null` for front/back matter (FORWARD, AFTERWORD). */
  readonly number: number | null;
  /** Verbatim, *without* the `CHAPTER n: ` prefix. */
  readonly title: string;
  /** Verbatim, exactly as printed, e.g. `CHAPTER 1: SCALE FROM ZERO…`. */
  readonly fullTitle: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly topics: readonly Topic[];
}

export interface Book {
  readonly title: string;
  readonly author: string;
  /** ISO-8601 timestamp of the extraction run. */
  readonly generatedAt: string;
  readonly chapters: readonly Chapter[];
}

/* -------------------------------------------------------------------------- */
/* Derived indexes (`src/data/toc.json`, `src/data/search.json`)               */
/* -------------------------------------------------------------------------- */

export interface TocTopic {
  readonly id: string;
  readonly title: string;
}

export interface TocChapter {
  readonly id: string;
  readonly number: number | null;
  readonly title: string;
  readonly fullTitle: string;
  readonly topics: readonly TocTopic[];
}

export type Toc = readonly TocChapter[];

export interface SearchRecord {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly topicId: string;
  readonly topicTitle: string;
  /** Plain text of the topic, for matching. */
  readonly text: string;
}

export type SearchIndex = readonly SearchRecord[];
