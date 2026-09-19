import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );

/**
 * Traps Tab inside `ref` while `active`, closes on Escape, and restores focus
 * to whatever opened the surface. Used by both the drawer and the search dialog.
 */
export const useFocusTrap = (
  ref: RefObject<HTMLElement>,
  active: boolean,
  onDismiss: () => void,
): void => {
  useEffect(() => {
    if (!active) return;

    const root = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (root) {
      const first = focusable(root)[0];
      (first ?? root).focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab' || !root) return;

      const items = focusable(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [ref, active, onDismiss]);
};

/** Prevents the page behind a modal surface from scrolling. */
export const useScrollLock = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    const { overflow, paddingRight } = document.body.style;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gutter > 0) document.body.style.paddingRight = `${String(gutter)}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
};
