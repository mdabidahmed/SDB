import { type ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAsync } from '@/hooks/useAsync';
import { loadToc } from '@/lib/book';
import { TocContext } from '@/state/tocContext';

/** The TOC is small and gates every piece of chrome, so it is awaited up front. */
export const TocGate = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const state = useAsync(loadToc);

  if (state.status === 'loading') return <LoadingState label="Loading contents…" />;
  if (state.status === 'error') return <ErrorState error={state.error} />;
  return <TocContext.Provider value={state.data}>{children}</TocContext.Provider>;
};
