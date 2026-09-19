import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { LightboxProvider } from '@/components/media/LightboxProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingState } from '@/components/ui/States';
import { prefetchBook } from '@/lib/book';
import { ThemeProvider } from '@/state/ThemeProvider';
import { TocGate } from '@/state/TocGate';

const HomePage = lazy(async () => ({ default: (await import('@/routes/HomePage')).HomePage }));
const ChapterPage = lazy(async () => ({
  default: (await import('@/routes/ChapterPage')).ChapterPage,
}));
const NotFoundPage = lazy(async () => ({
  default: (await import('@/routes/NotFoundPage')).NotFoundPage,
}));

export const App = (): React.JSX.Element => {
  useEffect(prefetchBook, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LightboxProvider>
          <TocGate>
            <Suspense fallback={<LoadingState label="Loading…" />}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />
                  <Route path=":chapterId" element={<ChapterPage />} />
                  <Route path=":chapterId/:topicId" element={<ChapterPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </TocGate>
        </LightboxProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};
