import { createContext, useContext } from 'react';

import type { Toc } from '@/types/book';

export const TocContext = createContext<Toc | null>(null);

/** Only reachable below `<TocGate>`, which renders nothing until the TOC is in. */
export const useToc = (): Toc => {
  const toc = useContext(TocContext);
  if (!toc) throw new Error('useToc must be used inside <TocGate>');
  return toc;
};
