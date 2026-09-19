import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: Error };

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/**
 * Subscribes to a cached loader from `@/lib/book`. The loaders memoise their
 * promise, so remounting a route never refetches.
 */
export const useAsync = <T>(load: () => Promise<T>): AsyncState<T> => {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load().then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', error: toError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [load]);

  return state;
};
