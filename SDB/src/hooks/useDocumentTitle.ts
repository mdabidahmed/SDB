import { useEffect } from 'react';

import { BOOK_TITLE } from '@/lib/meta';

export const useDocumentTitle = (title: string | undefined): void => {
  useEffect(() => {
    document.title = title === undefined ? BOOK_TITLE : `${title} · ${BOOK_TITLE}`;
  }, [title]);
};
