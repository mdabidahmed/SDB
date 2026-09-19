import styles from '@/components/blocks/blocks.module.css';
import { cx } from '@/lib/cx';
import { useLightbox } from '@/state/lightboxContext';
import type { FigureBlock } from '@/types/book';

/**
 * Figures are the book's original artwork. They are never cropped or distorted:
 * intrinsic `width`/`height` reserve the box (no layout shift) and the display
 * width is capped at the smaller of the column and the figure's natural size,
 * so nothing is upscaled either. Labels in the artwork are small, hence zoom.
 */
export const FigureView = ({ block }: { block: FigureBlock }): React.JSX.Element => {
  const openLightbox = useLightbox();

  return (
    <figure className={styles.figure} style={{ maxWidth: `${String(block.width)}px` }}>
      <button
        type="button"
        className={styles.figureButton}
        onClick={() => {
          openLightbox(block);
        }}
        aria-label={`Zoom ${block.caption ?? block.alt}`}
      >
        <img
          className={styles.figureImage}
          src={block.src}
          alt={block.alt}
          width={block.width}
          height={block.height}
          loading="lazy"
          decoding="async"
        />
      </button>
      {block.caption !== null && (
        <figcaption className={styles.figcaption}>
          {block.caption}
          <span className={cx(styles.zoomHint)} aria-hidden="true">
            {' · click to zoom'}
          </span>
        </figcaption>
      )}
    </figure>
  );
};
