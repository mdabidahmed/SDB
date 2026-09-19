import { useCallback, useRef, useState, type ReactNode } from 'react';

import styles from '@/components/media/Lightbox.module.css';
import { CloseIcon } from '@/components/ui/icons';
import { useFocusTrap, useScrollLock } from '@/hooks/useFocusTrap';
import { cx } from '@/lib/cx';
import { LightboxContext } from '@/state/lightboxContext';
import type { FigureBlock } from '@/types/book';

/**
 * Full-screen figure viewer. Opens fit-to-viewport, then toggles to the
 * figure's native pixel size so the small labels in the book's diagrams are
 * legible. The image is never cropped or stretched.
 */
export const LightboxProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const [figure, setFigure] = useState<FigureBlock | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = useCallback((next: FigureBlock) => {
    setFigure(next);
    setZoomed(false);
  }, []);

  const close = useCallback(() => {
    setFigure(null);
  }, []);

  useFocusTrap(dialogRef, figure !== null, close);
  useScrollLock(figure !== null);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {figure && (
        <div
          className={styles.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="presentation"
        >
        <div
          className={styles.surface}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={figure.caption ?? figure.alt}
        >
          <div className={styles.bar}>
            <span className={styles.caption}>{figure.caption ?? figure.alt}</span>
            <span className={styles.dims}>
              {figure.width} × {figure.height} · page {figure.page}
            </span>
            <button type="button" className={styles.close} onClick={close} aria-label="Close figure">
              <CloseIcon size={20} />
            </button>
          </div>

          <div className={styles.stage}>
            <button
              type="button"
              className={cx(styles.imageButton, zoomed && styles.zoomed)}
              onClick={() => {
                setZoomed((value) => !value);
              }}
              aria-label={zoomed ? 'Fit diagram to screen' : 'View diagram at full size'}
            >
              <img
                className={styles.image}
                src={figure.src}
                alt={figure.alt}
                width={figure.width}
                height={figure.height}
              />
            </button>
          </div>

          <p className={styles.hint}>
            Click the diagram to view it at {zoomed ? 'fit size' : 'full size'} · Esc to close
          </p>
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
};
