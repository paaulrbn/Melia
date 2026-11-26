import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

/** Below this width the docked sidebar would squeeze the poster grid: it starts hidden. */
const NARROW_QUERY = '(max-width: 879px)';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === 'true';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(collapsed));
  } catch {
    // Storage unavailable: the choice simply lasts for this session
  }
}

function matchesNarrow(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;
}

/** Elements that slide with the sidebar when it is docked or hidden (content, back button, search).
 *  The top tabs are not among them: they fade in and out on their own (layout.css). */
const FOLLOW_SELECTOR = '[data-sidebar-follow]';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Where each follower is on screen now, transform included, so a toggle mid-slide reverses from there. */
function measureFollowers(): Map<HTMLElement, number> {
  const positions = new Map<HTMLElement, number>();
  document.querySelectorAll<HTMLElement>(FOLLOW_SELECTOR).forEach(element => {
    positions.set(element, element.getBoundingClientRect().left);
  });
  return positions;
}

/** Typing in a field: keyboard shortcuts (Cmd+B, Escape on a page) leave the key to it. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Docked / hidden state of the sidebar. It only changes with the toggle button or Cmd/Ctrl+B.
 */
export function useSidebar() {
  const [storedCollapsed, setStoredCollapsed] = useState(readStoredCollapsed);
  const [isNarrow, setIsNarrow] = useState(matchesNarrow);
  // Below the threshold, opening is temporary and never overwrites the stored choice
  const [isOpenWhileNarrow, setIsOpenWhileNarrow] = useState(false);

  const isCollapsed = isNarrow ? !isOpenWhileNarrow : storedCollapsed;

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches);
      setIsOpenWhileNarrow(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // FLIP: positions before a toggle, read back once the new layout is committed
  const followerPositions = useRef<Map<HTMLElement, number> | null>(null);

  useLayoutEffect(() => {
    const before = followerPositions.current;
    followerPositions.current = null;
    if (!before) return;

    const moved: HTMLElement[] = [];
    before.forEach((left, element) => {
      if (!element.isConnected) return;
      // Measure without a leftover transform from a slide still running
      element.style.transition = 'none';
      element.style.transform = '';
      const dx = left - element.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) {
        element.style.transition = '';
        return;
      }
      // Back where it was, without a transition...
      element.style.transform = `translateX(${dx}px)`;
      moved.push(element);
    });
    if (moved.length === 0) return;

    // ...then the stylesheet transition brings it to its new place, in step with the sidebar
    void document.body.offsetWidth;
    moved.forEach(element => {
      element.style.transition = '';
      element.style.transform = '';
    });
  }, [isCollapsed]);

  const toggle = useCallback(() => {
    followerPositions.current = prefersReducedMotion() ? null : measureFollowers();
    if (isNarrow) {
      setIsOpenWhileNarrow(isCollapsed);
    } else {
      const next = !isCollapsed;
      setStoredCollapsed(next);
      writeStoredCollapsed(next);
    }
  }, [isCollapsed, isNarrow]);

  // Cmd+B (macOS) / Ctrl+B elsewhere, except while typing in a field
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = IS_MAC ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { isCollapsed, toggle };
}
