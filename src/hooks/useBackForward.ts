import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isEditableTarget } from './useSidebar';

/** MouseEvent.button of the side buttons ("back" / "forward" on most mice). */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;
/** Horizontal scroll, in pixels, that makes one navigation: a deliberate two-finger swipe. */
const SWIPE_DISTANCE = 160;
/** Pause without wheel events that ends a gesture, momentum included. */
const SWIPE_IDLE_MS = 220;
/** Vertical movement tolerated before the gesture counts as a scroll instead of a swipe. */
const SWIPE_VERTICAL_SLACK = 16;
const SWIPE_MAX_SLOPE = 0.5;

interface BackForwardOptions {
  /** Goes back (closes the current sub-page). Does nothing when there is nowhere to go. */
  readonly onBack: () => void;
  /** Goes forward again (reopens the page just left). Does nothing when there is none. */
  readonly onForward: () => void;
  /** True while going back is possible: the swipe gives visual feedback only then. */
  readonly canGoBack: boolean;
  /**
   * Element that receives the swipe progress while the fingers move: `--back-swipe`
   * (0 to 1) and `data-back-swipe`, read by the back button's styles.
   */
  readonly feedbackRef: RefObject<HTMLElement | null>;
}

function isDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

/** The pointer is over something that scrolls sideways itself (table, text field). */
function scrollsHorizontally(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return true;
  let element = target instanceof Element ? target : null;
  while (element && element !== document.documentElement) {
    if (element.scrollWidth > element.clientWidth + 1) {
      const { overflowX } = getComputedStyle(element);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Back / forward like a browser, for the mouse side buttons and the two-finger trackpad
 * swipe (right = back, left = forward, as in Safari). Ignored while a dialog is open.
 *
 * Tauri does not expose WKWebView's native swipe navigation, so the swipe is read from
 * horizontal wheel events: their sum over one gesture must pass a threshold while staying
 * mostly horizontal; one navigation per gesture, the gesture ends after a short pause.
 */
export function useBackForward({ onBack, onForward, canGoBack, feedbackRef }: BackForwardOptions) {
  // Latest values without re-attaching the listeners on every render
  const latest = useRef({ onBack, onForward, canGoBack });
  useLayoutEffect(() => {
    latest.current = { onBack, onForward, canGoBack };
  });

  useEffect(() => {
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return;
      // WebView2 would otherwise navigate the webview itself
      event.preventDefault();
      if (event.type !== 'mouseup' || isDialogOpen()) return;
      if (event.button === MOUSE_BACK) latest.current.onBack();
      else latest.current.onForward();
    };

    window.addEventListener('mousedown', onMouseButton);
    window.addEventListener('mouseup', onMouseButton);
    window.addEventListener('auxclick', onMouseButton);
    return () => {
      window.removeEventListener('mousedown', onMouseButton);
      window.removeEventListener('mouseup', onMouseButton);
      window.removeEventListener('auxclick', onMouseButton);
    };
  }, []);

  useEffect(() => {
    let sumX = 0;
    let sumY = 0;
    // Gesture already used (navigated, or turned out to be a scroll): wait for the pause
    let isSpent = false;
    let idleTimer: number | undefined;

    const showProgress = (progress: number) => {
      const target = feedbackRef.current;
      if (!target) return;
      if (progress > 0) {
        target.style.setProperty('--back-swipe', progress.toFixed(3));
        target.setAttribute('data-back-swipe', '');
      } else {
        target.style.removeProperty('--back-swipe');
        target.removeAttribute('data-back-swipe');
      }
    };

    const endGesture = () => {
      sumX = 0;
      sumY = 0;
      isSpent = false;
      showProgress(0);
    };

    const spendGesture = () => {
      isSpent = true;
      showProgress(0);
    };

    const onWheel = (event: WheelEvent) => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(endGesture, SWIPE_IDLE_MS);
      if (isSpent) return;

      // Pinch zoom (ctrlKey), Shift+wheel and line-based mouse wheels are not swipes
      if (
        event.ctrlKey ||
        event.shiftKey ||
        event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
        isDialogOpen() ||
        scrollsHorizontally(event.target)
      ) {
        spendGesture();
        return;
      }

      sumX += event.deltaX;
      sumY += event.deltaY;
      if (Math.abs(sumY) > SWIPE_VERTICAL_SLACK && Math.abs(sumY) > Math.abs(sumX) * SWIPE_MAX_SLOPE) {
        spendGesture();
        return;
      }

      // Content moving right (negative deltaX) is a swipe back, as in Safari
      const isBack = sumX < 0;
      const progress = Math.min(Math.abs(sumX) / SWIPE_DISTANCE, 1);
      showProgress(isBack && latest.current.canGoBack ? progress : 0);
      if (progress < 1) return;

      spendGesture();
      if (isBack) latest.current.onBack();
      else latest.current.onForward();
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.clearTimeout(idleTimer);
      showProgress(0);
    };
  }, [feedbackRef]);
}
