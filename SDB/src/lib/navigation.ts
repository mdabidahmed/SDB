/**
 * Pure navigation selectors over the table of contents.
 *
 * Kept free of React so they can be reasoned about (and reused by the search
 * ranker and the pager) without pulling in component state.
 */

import type { Toc, TocChapter, TocTopic } from '@/types/book';

/** DOM id used as the scroll target for a topic. Namespaced to avoid collisions. */
export const topicAnchorId = (topicId: string): string => `topic-${topicId}`;

export const chapterPath = (chapterId: string): string => `/${encodeURIComponent(chapterId)}`;

export const topicPath = (chapterId: string, topicId: string): string =>
  `/${encodeURIComponent(chapterId)}/${encodeURIComponent(topicId)}`;

export const findChapterIndex = (toc: Toc, chapterId: string | undefined): number =>
  chapterId === undefined ? -1 : toc.findIndex((chapter) => chapter.id === chapterId);

export const findChapter = (toc: Toc, chapterId: string | undefined): TocChapter | undefined => {
  const index = findChapterIndex(toc, chapterId);
  return index === -1 ? undefined : toc[index];
};

export const findTopic = (
  chapter: TocChapter | undefined,
  topicId: string | undefined,
): TocTopic | undefined =>
  chapter === undefined || topicId === undefined
    ? undefined
    : chapter.topics.find((topic) => topic.id === topicId);

export interface ChapterNeighbours {
  readonly previous: TocChapter | null;
  readonly next: TocChapter | null;
}

export const getChapterNeighbours = (toc: Toc, chapterId: string | undefined): ChapterNeighbours => {
  const index = findChapterIndex(toc, chapterId);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? (toc[index - 1] ?? null) : null,
    next: index < toc.length - 1 ? (toc[index + 1] ?? null) : null,
  };
};

/**
 * Short label for chrome that needs the chapter number separately from its
 * verbatim title (sidebar badge, pager, breadcrumb). Returns `null` for
 * front/back matter, which the contract models as `number: null`.
 */
export const chapterNumberLabel = (chapter: Pick<TocChapter, 'number'>): string | null =>
  chapter.number === null ? null : String(chapter.number);

export const totalTopicCount = (toc: Toc): number =>
  toc.reduce((total, chapter) => total + chapter.topics.length, 0);
