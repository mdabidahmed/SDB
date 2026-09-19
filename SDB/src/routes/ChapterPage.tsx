import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Breadcrumbs } from '@/components/reader/Breadcrumbs';
import { MiniToc } from '@/components/reader/MiniToc';
import { Pager } from '@/components/reader/Pager';
import { TopicSection } from '@/components/reader/TopicSection';
import styles from '@/components/reader/reader.module.css';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { loadBook } from '@/lib/book';
import {
  chapterNumberLabel,
  chapterPath,
  getChapterNeighbours,
  topicAnchorId,
} from '@/lib/navigation';
import { useToc } from '@/state/tocContext';
import { NotFoundPage } from '@/routes/NotFoundPage';

const countBlocks = (chapterTopicCount: number, figureCount: number): string =>
  `${String(chapterTopicCount)} topic${chapterTopicCount === 1 ? '' : 's'} · ${String(figureCount)} figure${figureCount === 1 ? '' : 's'}`;

export const ChapterPage = (): React.JSX.Element => {
  const { chapterId, topicId } = useParams();
  const navigate = useNavigate();
  const toc = useToc();
  const state = useAsync(loadBook);

  const neighbours = useMemo(() => getChapterNeighbours(toc, chapterId), [toc, chapterId]);

  /** Left/right arrows page between chapters, as on W3Schools. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return;

      if (event.key === 'ArrowLeft' && neighbours.previous) {
        navigate(chapterPath(neighbours.previous.id));
      } else if (event.key === 'ArrowRight' && neighbours.next) {
        navigate(chapterPath(neighbours.next.id));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate, neighbours]);

  const chapter =
    state.status === 'ready'
      ? state.data.chapters.find((candidate) => candidate.id === chapterId)
      : undefined;

  useDocumentTitle(chapter?.fullTitle);

  /**
   * Deep links land on their topic; a plain chapter link starts at the top.
   * `scroll-margin-top` on the section clears the sticky header.
   */
  useEffect(() => {
    if (state.status !== 'ready') return;
    if (topicId === undefined) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const target = document.getElementById(topicAnchorId(topicId));
    target?.scrollIntoView({ block: 'start' });
  }, [state.status, chapterId, topicId]);

  if (state.status === 'loading') return <LoadingState label="Loading the book…" />;
  if (state.status === 'error') return <ErrorState error={state.error} />;
  if (!chapter) return <NotFoundPage />;

  const number = chapterNumberLabel(chapter);
  const figureCount = chapter.topics.reduce(
    (total, topic) => total + topic.blocks.filter((block) => block.type === 'figure').length,
    0,
  );

  return (
    <div className={styles.layout}>
      <article className={styles.article}>
        <Breadcrumbs
          items={[
            { label: 'Contents', to: '/' },
            { label: number === null ? chapter.title : `Chapter ${number}`, to: chapterPath(chapter.id) },
            ...(topicId === undefined
              ? []
              : [{ label: chapter.topics.find((topic) => topic.id === topicId)?.title ?? '' }]),
          ]}
        />

        <header className={styles.header}>
          {number !== null && <p className={styles.kicker}>Chapter {number}</p>}
          <h1 className={styles.chapterHeading}>{chapter.title}</h1>
          <p className={styles.meta}>
            <span>{countBlocks(chapter.topics.length, figureCount)}</span>
            <span>
              Pages {chapter.pageStart}–{chapter.pageEnd}
            </span>
          </p>
        </header>

        {chapter.topics.map((topic) => (
          <TopicSection key={topic.id} topic={topic} />
        ))}

        <Pager previous={neighbours.previous} next={neighbours.next} />
        <p className={styles.shortcutHint}>
          Tip: press <kbd>←</kbd> and <kbd>→</kbd> to move between chapters
        </p>
      </article>

      <MiniToc chapterId={chapter.id} topics={chapter.topics} />
    </div>
  );
};
