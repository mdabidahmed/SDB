import { Link } from 'react-router-dom';

import styles from '@/components/ui/States.module.css';
import { cx } from '@/lib/cx';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export const NotFoundPage = (): React.JSX.Element => {
  useDocumentTitle('Page not found');

  return (
    <div className={styles.state}>
      <p className={styles.title}>That page is not in this book</p>
      <p className={styles.body}>
        The chapter or topic in the address does not exist. Use the contents on the left, or search
        the whole book.
      </p>
      <div className={styles.actions}>
        <Link to="/" className={styles.button}>
          Go to contents
        </Link>
        <Link to="/chapter-1" className={cx(styles.button, styles.buttonGhost)}>
          Start at Chapter 1
        </Link>
      </div>
    </div>
  );
};
