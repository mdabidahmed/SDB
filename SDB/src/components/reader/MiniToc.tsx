import { Link } from 'react-router-dom';

import styles from '@/components/reader/reader.module.css';
import { useActiveSection } from '@/hooks/useActiveSection';
import { cx } from '@/lib/cx';
import { topicAnchorId, topicPath } from '@/lib/navigation';
import type { TocTopic } from '@/types/book';

const ANCHOR_BAND_OFFSET = 88;

interface MiniTocProps {
  readonly chapterId: string;
  readonly topics: readonly TocTopic[];
}

/** "On this page", kept in sync with the reading position. */
export const MiniToc = ({ chapterId, topics }: MiniTocProps): React.JSX.Element | null => {
  const ids = topics.map((topic) => topicAnchorId(topic.id));
  const activeId = useActiveSection(ids, ANCHOR_BAND_OFFSET);

  if (topics.length < 2) return null;

  return (
    <aside className={styles.miniToc} aria-label="On this page">
      <div className={styles.miniTocInner}>
        <p className={styles.miniTocTitle}>On this page</p>
        <ul className={styles.miniTocList}>
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                to={topicPath(chapterId, topic.id)}
                className={cx(
                  styles.miniTocLink,
                  topicAnchorId(topic.id) === activeId && styles.miniTocActive,
                )}
                {...(topicAnchorId(topic.id) === activeId ? { 'aria-current': 'location' } : {})}
              >
                {topic.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};
