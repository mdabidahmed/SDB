import { Link } from 'react-router-dom';

import styles from '@/components/layout/TopBar.module.css';
import { MenuIcon, MoonIcon, SearchIcon, SettingsIcon, SunIcon } from '@/components/ui/icons';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { cx } from '@/lib/cx';
import { BOOK_AUTHOR, BOOK_TITLE } from '@/lib/meta';
import { isApplePlatform } from '@/lib/platform';
import { useTheme } from '@/state/themeContext';

interface TopBarProps {
  readonly onOpenNav: () => void;
  readonly onOpenSearch: () => void;
  readonly onOpenSettings: () => void;
  readonly navOpen: boolean;
}

const shortcutHint = (): string => (isApplePlatform() ? '⌘K' : 'Ctrl K');

export const TopBar = ({
  onOpenNav,
  onOpenSearch,
  onOpenSettings,
  navOpen,
}: TopBarProps): React.JSX.Element => {
  const { theme, toggleTheme } = useTheme();
  const progress = useReadingProgress();

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={cx(styles.iconButton, styles.menuButton)}
        onClick={onOpenNav}
        aria-label={`${navOpen ? 'Close' : 'Open'} chapter navigation`}
        aria-expanded={navOpen}
        aria-controls="chapter-nav"
      >
        <MenuIcon size={20} />
      </button>

      <Link to="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          SD
        </span>
        <span className={styles.titles}>
          <span className={styles.title}>{BOOK_TITLE}</span>
          <span className={styles.author}>{BOOK_AUTHOR}</span>
        </span>
      </Link>

      <span className={styles.spacer} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.searchTrigger}
          onClick={onOpenSearch}
          aria-label="Search the book"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <SearchIcon size={16} />
          <span className={styles.searchTriggerLabel}>Search</span>
          <kbd className={styles.kbd}>{shortcutHint()}</kbd>
        </button>

        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          aria-pressed={theme === 'dark'}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>

        <button
          type="button"
          className={styles.iconButton}
          onClick={onOpenSettings}
          aria-label="Open reading settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <div className={styles.progressBar} style={{ transform: `scaleX(${String(progress)})` }} />
      </div>
    </header>
  );
};
