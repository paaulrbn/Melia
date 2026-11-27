import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { cubicBezier, parseCubicBezier } from '../utils/easing';

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

const APP_SELECTOR = '.melia-app';
/** Width the docked sidebar takes from the layout: written every frame while it slides. */
const DOCKED_WIDTH_VAR = '--sidebar-docked-width';
/** Elements whose place changes with the sidebar state but not with the width alone. */
const FOLLOW_SELECTOR = '[data-sidebar-follow]';
const SLIDE_ANIMATION_ID = 'sidebar-slide';
const DEFAULT_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getApp(): HTMLElement | null {
  return document.querySelector<HTMLElement>(APP_SELECTOR);
}

/** Place on screen, running animations included, so a toggle mid-slide starts from there. */
interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * `data-sidebar-follow="resize"` (the search): its width is animated too. The shift is
 * taken on the edge its new place holds still: the right one when it is pushed to the end
 * of its column.
 */
function isResizing(element: HTMLElement): boolean {
  return element.dataset.sidebarFollow === 'resize';
}

/** Posters and section titles of the libraries: they move when the grids change columns. */
const CARD_SELECTOR = '.movie-card';
const TITLE_SELECTOR = '.category-title';

/** On screen or nearly: what is off screen changes at once, nobody sees it. */
function isNearScreen(element: HTMLElement): boolean {
  const margin = window.innerHeight * 0.25;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.bottom > -margin && rect.top < window.innerHeight + margin;
}

interface Snapshot {
  readonly followers: Map<HTMLElement, Box>;
  readonly cards: Map<HTMLElement, Box>;
}

function takeSnapshot(): Snapshot {
  const followers = new Map<HTMLElement, Box>();
  document
    .querySelectorAll<HTMLElement>(FOLLOW_SELECTOR)
    .forEach(element => followers.set(element, boxOf(element)));
  const cards = new Map<HTMLElement, Box>();
  document.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}, ${TITLE_SELECTOR}`).forEach(element => {
    if (isNearScreen(element)) cards.set(element, boxOf(element));
  });
  return { followers, cards };
}

/** Speed factor of the sidebar toggle (--motion-scale, variables.css). */
function readMotionScale(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** A duration custom property (`400ms`, `0.4s`) in milliseconds. */
function readDuration(name: string, fallbackMs: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return fallbackMs;
  if (raw.endsWith('ms')) return value;
  if (raw.endsWith('s')) return value * 1000;
  return fallbackMs;
}

/** Current docked width: the inline value while a slide runs, else the one the class gives. */
function readDockedWidth(app: HTMLElement): number {
  const inline = Number.parseFloat(app.style.getPropertyValue(DOCKED_WIDTH_VAR));
  if (Number.isFinite(inline)) return inline;
  const computed = Number.parseFloat(getComputedStyle(app).getPropertyValue(DOCKED_WIDTH_VAR));
  return Number.isFinite(computed) ? computed : 0;
}

function readSidebarWidth(app: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(app).getPropertyValue('--sidebar-width'));
  if (Number.isFinite(value)) return value;
  return app.querySelector<HTMLElement>('.sidebar')?.offsetWidth ?? 0;
}

function cancelSlide(element: HTMLElement): void {
  element.getAnimations?.().forEach(animation => {
    if (animation.id === SLIDE_ANIMATION_ID) animation.cancel();
  });
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Poster grids: held at their final layout while the sidebar slides. */
const GRID_SELECTOR = '.movie-grid';

// One slide at a time: its frame loop and the grids it holds
let frame = 0;
let heldGrids: HTMLElement[] = [];

function stopLoop(): void {
  cancelAnimationFrame(frame);
  frame = 0;
}

function releaseGrids(): void {
  heldGrids.forEach(grid => grid.style.removeProperty('grid-template-columns'));
  heldGrids = [];
}

/** Ends any slide at once: the class value takes the layout back. */
function finishNow(app: HTMLElement | null): void {
  stopLoop();
  releaseGrids();
  app?.style.removeProperty(DOCKED_WIDTH_VAR);
}

interface Job {
  readonly before: Snapshot;
  readonly from: number;
  readonly to: number;
}

/**
 * The layout follows the sidebar frame by frame: the docked width is written to the shell
 * every frame, from where it is to its target, along the panel curve. Poster grids are held
 * at their final layout for the whole slide. The search and back button change grid with the sidebar
 * state: they are moved from where they were on screen, FLIP style, with Web Animations
 * on the same clock and curve.
 * The class has already switched when this runs; the inline width holds the start value.
 */
function slide(app: HTMLElement, { before, from, to }: Job, isOpening: boolean): void {
  const followers = Array.from(before.followers.keys()).filter(element => element.isConnected);

  // Writes first: drop what still runs from a previous toggle...
  followers.forEach(element => {
    cancelSlide(element);
    if (element.firstElementChild instanceof HTMLElement) cancelSlide(element.firstElementChild);
  });

  // ...then the reads: followers in the start layout
  const starts = followers.map(element => {
    const start = boxOf(element);
    const old = before.followers.get(element)!;
    const resizes = isResizing(element) && !near(old.width, start.width);
    const holdsRight = resizes && getComputedStyle(element).justifySelf === 'end';
    return { element, old, start, resizes, holdsRight };
  });

  // Final layout: width of the resizing followers, and the columns of each poster grid.
  // The grids take their final columns (count and size, in px) at once, like a window
  // resize, then only slide with the content: no poster changes size during the slide.
  releaseGrids();
  app.style.setProperty(DOCKED_WIDTH_VAR, `${to}px`);
  const finalWidths = starts.map(({ element, resizes }) => (resizes ? boxOf(element).width : 0));
  const grids = Array.from(document.querySelectorAll<HTMLElement>(GRID_SELECTOR));
  const finalColumns = grids.map(grid => getComputedStyle(grid).gridTemplateColumns);
  app.style.setProperty(DOCKED_WIDTH_VAR, `${from}px`);
  grids.forEach((grid, index) => {
    const columns = finalColumns[index];
    // Hidden pages report no resolved tracks: they are left alone
    if (!columns || columns === 'none' || columns.includes('repeat')) return;
    grid.style.gridTemplateColumns = columns;
    heldGrids.push(grid);
  });

  // Posters and titles, from where they were to their place in the held grids. A poster
  // that keeps its row glides and resizes; one that changes row fades in at its new place.
  const cards = Array.from(before.cards.keys()).filter(card => card.isConnected);
  cards.forEach(cancelSlide);
  const cardMoves = cards.map(card => {
    const old = before.cards.get(card)!;
    const now = boxOf(card);
    const isPoster = card.matches(CARD_SELECTOR);
    const changesRow = isPoster && Math.abs(old.top - now.top) > now.height / 2;
    return {
      card,
      changesRow,
      dx: old.left - now.left,
      dy: old.top - now.top,
      sx: isPoster && now.width > 0 ? old.width / now.width : 1,
      sy: isPoster && now.height > 0 ? old.height / now.height : 1,
    };
  });

  // ...then all the writes, in the same frame
  const duration =
    readDuration(isOpening ? '--panel-open-dur' : '--panel-close-dur', isOpening ? 450 : 400) * readMotionScale();
  const easingText = getComputedStyle(document.documentElement).getPropertyValue('--panel-ease').trim();
  const bezier = parseCubicBezier(easingText) ?? parseCubicBezier(DEFAULT_EASING)!;
  const ease = cubicBezier(...bezier);
  const timing: KeyframeAnimationOptions = {
    id: SLIDE_ANIMATION_ID,
    duration,
    easing: parseCubicBezier(easingText) ? easingText : DEFAULT_EASING,
  };
  const timelineTime = document.timeline.currentTime;
  const t0 = typeof timelineTime === 'number' ? timelineTime : performance.now();
  const animations: Animation[] = [];

  starts.forEach(({ element, old, start, resizes, holdsRight }, index) => {
    const shift = holdsRight ? old.right - start.right : old.left - start.left;
    if (near(shift, 0) && !resizes) return;
    animations.push(element.animate([{ translate: `${shift}px 0` }, { translate: '0px 0' }], timing));
    // The width goes on the field inside: it is out of the top row's column sizing
    const field = element.firstElementChild;
    if (resizes && field instanceof HTMLElement) {
      animations.push(
        field.animate([{ width: `${old.width}px` }, { width: `${finalWidths[index]}px` }], timing)
      );
    }
  });

  cardMoves.forEach(({ card, changesRow, dx, dy, sx, sy }) => {
    if (changesRow) {
      animations.push(card.animate([{ opacity: 0 }, { opacity: 1 }], timing));
      return;
    }
    if (near(dx, 0) && near(dy, 0) && near(sx * 100, 100) && near(sy * 100, 100)) return;
    animations.push(
      card.animate(
        [
          { transformOrigin: '0 0', translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
          { transformOrigin: '0 0', translate: '0px 0px', scale: '1 1' },
        ],
        timing
      )
    );
  });

  // Same start time as the frame loop
  if (typeof timelineTime === 'number') animations.forEach(animation => (animation.startTime = t0));

  // Only the width variable is written in the loop: no reads
  const tick = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - t0) / duration));
    if (progress >= 1) {
      finishNow(app);
      return;
    }
    app.style.setProperty(DOCKED_WIDTH_VAR, `${from + (to - from) * ease(progress)}px`);
    frame = requestAnimationFrame(tick);
  };
  if (duration <= 0) {
    finishNow(app);
    return;
  }
  frame = requestAnimationFrame(tick);
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

  // Start of the slide, prepared by the toggle and run once the new class is committed
  const pending = useRef<Job | null>(null);

  useLayoutEffect(() => {
    const job = pending.current;
    pending.current = null;
    const app = getApp();
    if (!job || !app) return;
    slide(app, job, !isCollapsed);
  }, [isCollapsed]);

  useEffect(() => () => finishNow(getApp()), []);

  const toggle = useCallback(() => {
    const app = getApp();
    if (app && !prefersReducedMotion() && typeof app.animate === 'function') {
      const from = readDockedWidth(app);
      const to = isCollapsed ? readSidebarWidth(app) : 0;
      const before = takeSnapshot();
      // The slide restarts from the current width; the inline value keeps the layout there
      // while the class changes
      stopLoop();
      app.style.setProperty(DOCKED_WIDTH_VAR, `${from}px`);
      pending.current = { before, from, to };
    } else {
      pending.current = null;
      finishNow(app);
    }
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
