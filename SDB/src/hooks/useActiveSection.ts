import { useEffect, useState } from 'react';

/**
 * Tracks which section is currently under the reading line.
 *
 * The observer's root is inset from the top by the sticky header and from the
 * bottom by most of the viewport, leaving a narrow band just below the header.
 * The first section intersecting that band is the one being read. When no
 * section intersects — a section taller than the band — the previous answer
 * stands, which is exactly the desired behaviour.
 */
export const useActiveSection = (ids: readonly string[], topOffset: number): string | null => {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0) return;

    setActiveId(ids[0] ?? null);
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const firstVisible = ids.find((id) => visible.has(id));
        if (firstVisible !== undefined) setActiveId(firstVisible);
      },
      { rootMargin: `-${String(topOffset)}px 0px -70% 0px`, threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
    return () => {
      observer.disconnect();
    };
    // `key` stands in for the identity of `ids`, which is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, topOffset]);

  return activeId;
};
