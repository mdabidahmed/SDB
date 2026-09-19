import { useEffect, useState } from 'react';

/** Fraction (0–1) of the document scrolled, throttled to animation frames. */
export const useReadingProgress = (): number => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = (): void => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / scrollable)));
    };

    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return progress;
};
