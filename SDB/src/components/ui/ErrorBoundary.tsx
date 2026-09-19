import { Component, type ErrorInfo, type ReactNode } from 'react';

import styles from '@/components/ui/States.module.css';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Reader crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={styles.state} role="alert">
        <p className={styles.title}>Something went wrong</p>
        <p className={styles.body}>
          The reader hit an unexpected error. Reloading usually clears it.
        </p>
        <pre className={styles.detail}>{error.message}</pre>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              window.location.assign('/');
            }}
          >
            Reload the reader
          </button>
        </div>
      </div>
    );
  }
}
