import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from '@/components/search/SearchDialog.module.css';
import { CornerDownLeftIcon, SearchIcon } from '@/components/ui/icons';
import { useFocusTrap, useScrollLock } from '@/hooks/useFocusTrap';
import { loadSearchIndex } from '@/lib/book';
import { cx } from '@/lib/cx';
import { topicPath } from '@/lib/navigation';
import { flattenGroups, searchBook, type SearchHit, type Segment } from '@/lib/search';
import type { SearchIndex } from '@/types/book';

const Segments = ({ segments }: { segments: readonly Segment[] }): React.JSX.Element => (
  <>
    {segments.map((segment, index) =>
      segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
    )}
  </>
);

const optionId = (hit: SearchHit): string => `search-${hit.record.chapterId}-${hit.record.topicId}`;

interface SearchDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export const SearchDialog = ({ open, onClose }: SearchDialogProps): React.JSX.Element | null => {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);

  /** The index is only worth fetching once the reader actually opens search. */
  useEffect(() => {
    if (!open || index) return;
    let active = true;
    void loadSearchIndex().then(
      (loaded) => {
        if (active) setIndex(loaded);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [open, index]);

  const groups = useMemo(() => (index ? searchBook(index, query) : []), [index, query]);
  const hits = useMemo(() => flattenGroups(groups), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useFocusTrap(dialogRef, open, onClose);
  useScrollLock(open);

  const go = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      navigate(topicPath(hit.record.chapterId, hit.record.topicId));
      onClose();
      setQuery('');
    },
    [navigate, onClose],
  );

  /** Keeps the highlighted option inside the scroll box during arrow-key travel. */
  useEffect(() => {
    const hit = hits[activeIndex];
    if (!hit || !listRef.current) return;
    listRef.current.querySelector(`#${CSS.escape(optionId(hit))}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, hits]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((value) => (hits.length === 0 ? 0 : (value + 1) % hits.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((value) => (hits.length === 0 ? 0 : (value - 1 + hits.length) % hits.length));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, hits.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(hits[activeIndex]);
    }
  };

  const activeHit = hits[activeIndex];
  let flatIndex = -1;

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the book"
      >
        <div className={styles.inputRow}>
          <SearchIcon size={18} className={styles.inputIcon} />
          {/* `useFocusTrap` moves focus here on open — it is the first focusable child. */}
          <input
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-label="Search all chapters"
            {...(activeHit ? { 'aria-activedescendant': optionId(activeHit) } : {})}
            placeholder="Search every chapter and topic…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.escHint}>Esc</span>
        </div>

        <div className={styles.results} ref={listRef}>
          {query.trim().length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Search the whole book</p>
              <p>Type to match any topic in any chapter.</p>
            </div>
          )}

          {query.trim().length > 0 && hits.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No matches</p>
              <p>Nothing in the book matches “{query}”.</p>
            </div>
          )}

          <div id="search-results" role="listbox" aria-label="Search results">
            {groups.map((group) => {
              const labelId = `search-group-${group.chapterId}`;
              return (
                <div key={group.chapterId} role="group" aria-labelledby={labelId}>
                  <div className={styles.groupLabel} id={labelId}>
                    {group.chapterTitle}
                  </div>
                  {group.hits.map((hit) => {
                    flatIndex += 1;
                    const isActive = flatIndex === activeIndex;
                    const position = flatIndex;
                    return (
                      <div
                        key={hit.record.topicId}
                        id={optionId(hit)}
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                        className={cx(styles.option, isActive && styles.optionActive)}
                        onClick={() => {
                          go(hit);
                        }}
                        onMouseEnter={() => {
                          setActiveIndex(position);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            go(hit);
                          }
                        }}
                      >
                        <div className={styles.optionTitle}>
                          <Segments segments={hit.titleSegments} />
                          <CornerDownLeftIcon size={14} className={styles.optionEnter} />
                        </div>
                        <div className={styles.optionSnippet}>
                          {hit.snippetClipped && '…'}
                          <Segments segments={hit.snippet} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <span>
            <kbd className={styles.footerKey}>↑</kbd>
            <kbd className={styles.footerKey}>↓</kbd> navigate
          </span>
          <span>
            <kbd className={styles.footerKey}>↵</kbd> open
          </span>
          <span className={styles.count}>
            {hits.length > 0 && `${String(hits.length)} topic${hits.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    </div>
  );
};
