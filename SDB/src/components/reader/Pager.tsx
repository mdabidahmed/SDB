import { Link } from 'react-router-dom';

import styles from '@/components/reader/reader.module.css';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/ui/icons';
import { chapterNumberLabel, chapterPath } from '@/lib/navigation';
import type { TocChapter } from '@/types/book';

const label = (chapter: TocChapter): string => {
  const number = chapterNumberLabel(chapter);
  return number === null ? chapter.title : `Chapter ${number}`;
};

interface PagerProps {
  readonly previous: TocChapter | null;
  readonly next: TocChapter | null;
}

/** The W3Schools affordance: a big Previous/Next pair closing every page. */
export const Pager = ({ previous, next }: PagerProps): React.JSX.Element => (
  <nav className={styles.pager} aria-label="Chapter pagination">
    {previous ? (
      <Link to={chapterPath(previous.id)} className={styles.pagerLink} rel="prev">
        <ArrowLeftIcon size={16} className={styles.pagerIcon} />
        <span className={styles.pagerText}>
          <span className={styles.pagerKicker}>Previous · {label(previous)}</span>
          <span className={styles.pagerTitle}>{previous.title}</span>
        </span>
      </Link>
    ) : (
      <span />
    )}

    {next ? (
      <Link
        to={chapterPath(next.id)}
        className={`${styles.pagerLink ?? ''} ${styles.pagerNext ?? ''}`}
        rel="next"
      >
        <span className={styles.pagerText}>
          <span className={styles.pagerKicker}>Next · {label(next)}</span>
          <span className={styles.pagerTitle}>{next.title}</span>
        </span>
        <ArrowRightIcon size={16} className={styles.pagerIcon} />
      </Link>
    ) : (
      <span />
    )}
  </nav>
);
