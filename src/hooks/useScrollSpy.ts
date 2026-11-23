import { useEffect, useState, type RefObject } from 'react';

/**
 * Share of the visible height, from its top edge, a section must reach to count as the one
 * being read. The visible part starts below the scroll container's top padding (the
 * translucent top row floats over the first pixels).
 */
const READING_LINE_RATIO = 0.25;

/** Height covered at the top of the scroll container, from its `scroll-padding-top`. */
function coveredTop(root: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(root).scrollPaddingTop);
  return Number.isFinite(value) ? value : 0;
}

function findActiveId(root: HTMLElement, ids: readonly string[]): string | null {
  const sections = ids
    .map(id => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  if (sections.length === 0) return null;

  // Scrolled to the end: a short last section can never reach the reading line
  if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
    return sections[sections.length - 1].id;
  }

  const rootRect = root.getBoundingClientRect();
  const covered = coveredTop(root);
  const readingLine = rootRect.top + covered + (root.clientHeight - covered) * READING_LINE_RATIO;
  let active = sections[0].id;
  for (const section of sections) {
    if (section.getBoundingClientRect().top > readingLine) break;
    active = section.id;
  }
  return active;
}

/**
 * Tracks which of the given sections is currently being read inside a scroll container.
 * Listens only while `enabled`, recomputes at most once per frame and cleans up on change.
 */
export function useScrollSpy(
  rootRef: RefObject<HTMLElement | null>,
  ids: readonly string[],
  enabled: boolean
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  // A new array holding the same ids must not restart the listener
  const idsKey = ids.join('|');

  useEffect(() => {
    const root = rootRef.current;
    const sectionIds = idsKey ? idsKey.split('|') : [];
    if (!enabled || !root || sectionIds.length === 0) {
      setActiveId(null);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      setActiveId(findActiveId(root, sectionIds));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    root.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      root.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef, idsKey, enabled]);

  return activeId;
}
