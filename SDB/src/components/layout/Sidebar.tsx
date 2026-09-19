import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import styles from '@/components/layout/Sidebar.module.css';
import { ChevronIcon, CloseIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { chapterNumberLabel, chapterPath, topicPath, totalTopicCount } from '@/lib/navigation';
import { useToc } from '@/state/tocContext';
import type { TocChapter } from '@/types/book';

/** Module-scope so the drawer restores its scroll after unmounting on mobile. */
let savedScrollTop = 0;

interface SidebarProps {
  readonly activeChapterId: string | undefined;
  readonly activeTopicId: string | undefined;
  readonly isDrawer: boolean;
  readonly onNavigate: () => void;
  readonly onClose: () => void;
}

const scrollIntoViewWithin = (container: HTMLElement, target: HTMLElement): void => {
  const top = target.offsetTop;
  const bottom = top + target.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  const margin = 80;

  if (top < viewTop + margin) container.scrollTop = Math.max(0, top - margin);
  else if (bottom > viewBottom - margin) container.scrollTop = bottom - container.clientHeight + margin;
};

const ChapterItem = ({
  chapter,
  isActive,
  activeTopicId,
  expanded,
  onToggle,
  onNavigate,
  activeRef,
}: {
  chapter: TocChapter;
  isActive: boolean;
  activeTopicId: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  activeRef: React.RefObject<HTMLLIElement>;
}): React.JSX.Element => {
  const number = chapterNumberLabel(chapter);
  const topicsId = `topics-${chapter.id}`;

  return (
    <li ref={isActive ? activeRef : undefined}>
      <div className={cx(styles.chapterRow, isActive && styles.chapterActive)}>
        <NavLink to={chapterPath(chapter.id)} className={cx(styles.chapterLink)} onClick={onNavigate}>
          <span
            className={cx(styles.badge, number === null && styles.badgeMatter)}
            aria-hidden="true"
          >
            {number ?? ''}
          </span>
          <span className={styles.chapterTitle}>{chapter.title}</span>
        </NavLink>
        <button
          type="button"
          className={styles.disclosure}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={topicsId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} topics in ${chapter.title}`}
        >
          <ChevronIcon size={15} className={cx(styles.chevron, expanded && styles.chevronOpen)} />
        </button>
      </div>

      {expanded && (
        <ul className={styles.topics} id={topicsId}>
          {chapter.topics.map((topic) => (
            <li key={topic.id}>
              <NavLink
                to={topicPath(chapter.id, topic.id)}
                className={cx(
                  styles.topicLink,
                  isActive && topic.id === activeTopicId && styles.topicActive,
                )}
                onClick={onNavigate}
              >
                {topic.title}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const Sidebar = ({
  activeChapterId,
  activeTopicId,
  isDrawer,
  onNavigate,
  onClose,
}: SidebarProps): React.JSX.Element => {
  const toc = useToc();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const [manuallyToggled, setManuallyToggled] = useState<Record<string, boolean>>({});

  /** Restore the reader's place in a long contents list. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = savedScrollTop;
    return () => {
      if (container) savedScrollTop = container.scrollTop;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const item = activeItemRef.current;
    if (container && item) scrollIntoViewWithin(container, item);
  }, [activeChapterId, activeTopicId]);

  const toggle = useCallback((chapterId: string, isActive: boolean) => {
    setManuallyToggled((previous) => ({
      ...previous,
      [chapterId]: !(previous[chapterId] ?? isActive),
    }));
  }, []);

  return (
    <div className={styles.root}>
      {isDrawer && (
        <div className={styles.drawerBar}>
          <span className={styles.headTitle}>Contents</span>
          <button
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close navigation"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      )}
      <div className={styles.container} ref={containerRef}>
        <nav className={styles.nav} id="chapter-nav" aria-label="Book contents">
          {!isDrawer && (
            <div className={styles.head}>
              <span className={styles.headTitle}>Contents</span>
              <span className={styles.headCount}>
                {toc.length} sections · {totalTopicCount(toc)} topics
              </span>
            </div>
          )}
          <ul className={styles.list}>
            {toc.map((chapter) => {
              const isActive = chapter.id === activeChapterId;
              return (
                <ChapterItem
                  key={chapter.id}
                  chapter={chapter}
                  isActive={isActive}
                  activeTopicId={activeTopicId}
                  expanded={manuallyToggled[chapter.id] ?? isActive}
                  onToggle={() => {
                    toggle(chapter.id, isActive);
                  }}
                  onNavigate={onNavigate}
                  activeRef={activeItemRef}
                />
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
};
