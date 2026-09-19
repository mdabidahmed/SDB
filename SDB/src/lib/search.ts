import type { SearchIndex, SearchRecord } from '@/types/book';

export interface Segment {
  readonly text: string;
  readonly match: boolean;
}

export interface SearchHit {
  readonly record: SearchRecord;
  readonly score: number;
  readonly titleSegments: readonly Segment[];
  readonly snippet: readonly Segment[];
  /** True when the snippet starts mid-sentence, so the UI can show a leading `…`. */
  readonly snippetClipped: boolean;
}

export interface ChapterGroup {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly hits: readonly SearchHit[];
}

const MAX_RESULTS = 40;
const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 190;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const tokenize = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

/**
 * Splits `text` into matched / unmatched segments. Only ever slices the
 * original string, so highlighted book text stays character-identical.
 */
export const highlight = (text: string, terms: readonly string[]): readonly Segment[] => {
  if (terms.length === 0) return [{ text, match: false }];

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const found of text.matchAll(pattern)) {
    const index = found.index;
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), match: false });
    segments.push({ text: found[0], match: true });
    lastIndex = index + found[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
};

const firstMatchIndex = (haystack: string, terms: readonly string[]): number => {
  let best = -1;
  for (const term of terms) {
    const index = haystack.indexOf(term);
    if (index !== -1 && (best === -1 || index < best)) best = index;
  }
  return best;
};

const countOccurrences = (haystack: string, term: string): number => {
  let count = 0;
  let index = haystack.indexOf(term);
  while (index !== -1 && count < 20) {
    count += 1;
    index = haystack.indexOf(term, index + term.length);
  }
  return count;
};

const buildSnippet = (
  record: SearchRecord,
  terms: readonly string[],
): { segments: readonly Segment[]; clipped: boolean } => {
  const lower = record.text.toLowerCase();
  const found = firstMatchIndex(lower, terms);
  const rawStart = found === -1 ? 0 : Math.max(0, found - SNIPPET_BEFORE);
  // Back up to a word boundary so the preview does not start mid-word.
  const spaceBefore = rawStart === 0 ? 0 : record.text.lastIndexOf(' ', rawStart) + 1;
  const start = spaceBefore > 0 ? spaceBefore : rawStart;
  const slice = record.text.slice(start, start + SNIPPET_LENGTH);
  return { segments: highlight(slice, terms), clipped: start > 0 };
};

export const searchBook = (index: SearchIndex, query: string): readonly ChapterGroup[] => {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const record of index) {
    const title = record.topicTitle.toLowerCase();
    const chapter = record.chapterTitle.toLowerCase();
    const body = record.text.toLowerCase();

    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const inTitle = title.includes(term);
      const inChapter = chapter.includes(term);
      const bodyHits = countOccurrences(body, term);
      if (!inTitle && !inChapter && bodyHits === 0) {
        matchedAll = false;
        break;
      }
      if (title.startsWith(term)) score += 40;
      if (inTitle) score += 25;
      if (inChapter) score += 8;
      score += Math.min(bodyHits, 10) * 2;
    }

    if (!matchedAll) continue;

    const snippet = buildSnippet(record, terms);
    hits.push({
      record,
      score,
      titleSegments: highlight(record.topicTitle, terms),
      snippet: snippet.segments,
      snippetClipped: snippet.clipped,
    });
  }

  hits.sort((a, b) => b.score - a.score);

  const groups = new Map<string, { chapterTitle: string; hits: SearchHit[] }>();
  for (const hit of hits.slice(0, MAX_RESULTS)) {
    const existing = groups.get(hit.record.chapterId);
    if (existing) existing.hits.push(hit);
    else groups.set(hit.record.chapterId, { chapterTitle: hit.record.chapterTitle, hits: [hit] });
  }

  return Array.from(groups, ([chapterId, group]) => ({
    chapterId,
    chapterTitle: group.chapterTitle,
    hits: group.hits,
  }));
};

export const flattenGroups = (groups: readonly ChapterGroup[]): readonly SearchHit[] =>
  groups.flatMap((group) => group.hits);
