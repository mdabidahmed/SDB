import { Link } from 'react-router-dom';

import { ArrowRightIcon, BookIcon, SearchIcon } from '@/components/ui/icons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cx } from '@/lib/cx';
import { BOOK_AUTHOR, BOOK_TITLE } from '@/lib/meta';
import { chapterNumberLabel, chapterPath, totalTopicCount } from '@/lib/navigation';
import styles from '@/routes/HomePage.module.css';
import { useToc } from '@/state/tocContext';

export const HomePage = (): React.JSX.Element => {
  const toc = useToc();
  useDocumentTitle(undefined);

  const numberedCount = toc.filter((chapter) => chapter.number !== null).length;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>
          <BookIcon size={14} /> Online reader
        </p>
        <h1 className={styles.title}>{BOOK_TITLE}</h1>
        <p className={styles.subtitle}>
          {BOOK_AUTHOR}. Every chapter, topic and diagram from the print edition, laid out for
          reading on screen — pick a chapter below or jump straight into the text.
        </p>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Chapters</dt>
            <dd className={styles.statValue}>{numberedCount}</dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Topics</dt>
            <dd className={styles.statValue}>{totalTopicCount(toc)}</dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Diagrams</dt>
            <dd className={styles.statValue}>226</dd>
          </div>
        </dl>

        <div className={styles.ctaRow}>
          <Link to="/chapter-1" className={styles.cta}>
            Start reading <ArrowRightIcon size={16} />
          </Link>
          <Link to="/forward" className={cx(styles.cta, styles.ctaGhost)}>
            <SearchIcon size={16} /> Read the forward
          </Link>
        </div>
      </header>

      <h2 className={styles.sectionTitle}>All chapters</h2>
      <ul className={styles.grid}>
        {toc.map((chapter) => {
          const number = chapterNumberLabel(chapter);
          return (
            <li key={chapter.id}>
              <Link to={chapterPath(chapter.id)} className={styles.card}>
                <span className={styles.cardNumber}>
                  {number === null ? 'Front & back matter' : `Chapter ${number}`}
                </span>
                <span className={styles.cardTitle}>{chapter.title}</span>
                <span className={styles.cardMeta}>
                  {chapter.topics.length} topic{chapter.topics.length === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
