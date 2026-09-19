import { Link } from 'react-router-dom';

import styles from '@/components/ui/States.module.css';
import { cx } from '@/lib/cx';

export const LoadingState = ({ label }: { label: string }): React.JSX.Element => (
  <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className={cx(styles.bar, styles.barTitle)} />
    <div className={styles.bar} />
    <div className={styles.bar} />
    <div className={cx(styles.bar, styles.barShort)} />
    <div className={cx(styles.bar, styles.barBlock)} />
    <div className={styles.bar} />
    <div className={cx(styles.bar, styles.barShort)} />
  </div>
);

export const ErrorState = ({ error }: { error: Error }): React.JSX.Element => (
  <div className={styles.state} role="alert">
    <p className={styles.title}>The book could not be loaded</p>
    <p className={styles.body}>
      The content files in <code>src/data</code> are missing or do not match the data contract.
    </p>
    <pre className={styles.detail}>{error.message}</pre>
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </button>
      <Link to="/" className={cx(styles.button, styles.buttonGhost)}>
        Back to contents
      </Link>
    </div>
  </div>
);
