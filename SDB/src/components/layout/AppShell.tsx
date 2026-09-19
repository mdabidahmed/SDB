import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';

import styles from '@/components/layout/AppShell.module.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { SearchDialog } from '@/components/search/SearchDialog';
import { useFocusTrap, useScrollLock } from '@/hooks/useFocusTrap';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { isApplePlatform } from '@/lib/platform';

export const AppShell = (): React.JSX.Element => {
  const { chapterId, topicId } = useParams();
  const location = useLocation();
  const isCompact = useIsCompact();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  const closeNav = useCallback(() => {
    setNavOpen(false);
  }, []);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isCompact) setNavOpen(false);
  }, [isCompact]);

  const drawerActive = navOpen && isCompact;
  useFocusTrap(drawerRef, drawerActive, closeNav);
  useScrollLock(drawerActive);

  /** Cmd/Ctrl-K opens search from anywhere that is not a text field. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = isApplePlatform() ? event.metaKey : event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return;
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <TopBar
        onOpenNav={() => {
          setNavOpen((value) => !value);
        }}
        onOpenSearch={openSearch}
        navOpen={navOpen}
      />

      <div className={styles.body}>
        {drawerActive && (
          <button
            type="button"
            className={styles.overlay}
            onClick={closeNav}
            aria-label="Close navigation"
            tabIndex={-1}
          />
        )}

        {(!isCompact || navOpen) && (
          <aside
            className={styles.sidebar}
            ref={drawerRef}
            {...(drawerActive ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Book contents' } : {})}
          >
            <Sidebar
              activeChapterId={chapterId}
              activeTopicId={topicId}
              isDrawer={drawerActive}
              onNavigate={closeNav}
              onClose={closeNav}
            />
          </aside>
        )}

        <main className={styles.main} id="main-content">
          <Outlet />
        </main>
      </div>

      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </div>
  );
};
