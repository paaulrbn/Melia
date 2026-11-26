import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { isEditableTarget } from './useSidebar';
import {
  INITIAL_MOMENTUM,
  SWIPE_COMMIT_SHARE,
  SWIPE_FORWARD_DISTANCE,
  SWIPE_FORWARD_LIMIT,
  isMomentum,
  isRunStart,
  resolveSwipeAxis,
  rubberBand,
  settleMotion,
  shouldCommitSwipe,
  swipeOffset,
  trackMomentum,
  type MomentumState,
} from '../utils/swipeGesture';

/** MouseEvent.button of the side buttons ("back" / "forward" on most mice). */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;
/** Pause without wheel events that ends a gesture, momentum included. */
const SWIPE_IDLE_MS = 220;
/** Pause that means the fingers stopped, then left the trackpad without momentum. */
const SWIPE_RELEASE_MS = 120;

export type BackSource = 'swipe' | 'other';
type SwipeDirection = 'back' | 'forward';

interface BackForwardOptions {
  /**
   * Goes back (closes the current sub-page). Does nothing when there is nowhere to go.
   * `swipe`: the page has already slid out under the fingers, nothing is left to animate.
   */
  readonly onBack: (source: BackSource) => void;
  /** Goes forward again (reopens the page just left). Does nothing when there is none. */
  readonly onForward: () => void;
  /** True while going back is possible: the swipe follows the fingers only then. */
  readonly canGoBack: boolean;
  /** True while a page can be reopened (read when a swipe starts). */
  readonly canGoForward: () => boolean;
  /**
   * Element that receives the swipe progress while the fingers move: `--back-swipe`
   * (0 to 1) and `data-back-swipe`, read by the back button's styles.
   */
  readonly feedbackRef: RefObject<HTMLElement | null>;
  /**
   * Page container (`.t-page-slide`) that follows the fingers: `data-swipe`
   * (back / forward), `--swipe-x` (px), `--swipe-reveal` and `--swipe-progress` (0 to 1),
   * then `data-swipe-settle` (commit / cancel) with `--swipe-settle-dur` and
   * `--swipe-settle-ease` for the end of the gesture.
   */
  readonly stageRef: RefObject<HTMLElement | null>;
}

function isDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 * horizontal wheel events. The axis is locked once the fingers have moved a little; a
 * swipe back then drags the page to the right under the fingers (styles written straight
 * on the container, no React render per event). Wheel events have no "fingers lifted":
 * the release is either the momentum that follows (events shrinking frame after frame)
 * or a short pause. Past the distance, or after a quick flick, the page finishes its way
 * out and the navigation happens; otherwise it settles back. One decision per gesture.
 */
export function useBackForward({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  feedbackRef,
  stageRef,
}: BackForwardOptions) {
  // Latest values without re-attaching the listeners on every render
  const latest = useRef({ onBack, onForward, canGoBack, canGoForward });
  useLayoutEffect(() => {
    latest.current = { onBack, onForward, canGoBack, canGoForward };
  });

  useEffect(() => {
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return;
      // WebView2 would otherwise navigate the webview itself
      event.preventDefault();
      if (event.type !== 'mouseup' || isDialogOpen()) return;
      if (event.button === MOUSE_BACK) latest.current.onBack('other');
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
    // idle: waiting · pending: axis not known yet · tracking: following the fingers ·
    // spent: decided (navigated, settled, or a scroll), waits for the pause
    let phase: 'idle' | 'pending' | 'tracking' | 'spent' = 'idle';
    let sumX = 0;
    let sumY = 0;
    let direction: SwipeDirection = 'back';
    // Page follows the fingers (off with reduced motion: navigation only)
    let isVisual = false;
    let width = 0;
    let distance = 0;
    let velocity = 0;
    let liftVelocity = 0;
    let lastTime = 0;
    let momentum: MomentumState = INITIAL_MOMENTUM;
    let idleTimer: number | undefined;
    let releaseTimer: number | undefined;
    let settleTimer: number | undefined;
    let frame: number | undefined;
    let instantFrame: number | undefined;
    // Where the page is on screen (last frame written)
    let renderedOffset = 0;

    const showBackProgress = (progress: number) => {
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

    const writeStage = (offset: number, progress: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      renderedOffset = offset;
      stage.style.setProperty('--swipe-x', `${offset.toFixed(1)}px`);
      stage.style.setProperty('--swipe-reveal', width > 0 ? Math.min(offset / width, 1).toFixed(4) : '0');
      stage.style.setProperty('--swipe-progress', progress.toFixed(3));
      stage.toggleAttribute('data-swipe-ready', progress >= 1);
    };

    /** Back: page px that navigate on release. Forward: wheel px. */
    const commitTarget = () => (direction === 'back' ? width * SWIPE_COMMIT_SHARE : SWIPE_FORWARD_DISTANCE);

    /** Back: page px, proportional to the gesture. Forward: the list's lean. */
    const offsetFor = (travel: number) =>
      direction === 'back' ? swipeOffset(travel, width) : rubberBand(travel, SWIPE_FORWARD_LIMIT);

    /** Measured like the decision: page px for back, wheel px for forward */
    const travelFor = (travel: number) => (direction === 'back' ? swipeOffset(travel, width) : travel);

    const render = () => {
      frame = undefined;
      const target = commitTarget();
      const progress = target > 0 ? Math.min(travelFor(distance) / target, 1) : 0;
      if (direction === 'back') showBackProgress(progress);
      if (!isVisual) return;
      writeStage(offsetFor(distance), progress);
    };

    const scheduleRender = () => {
      frame ??= window.requestAnimationFrame(render);
    };

    /** Back to rest. `instant`: without the pages' own transition (one frame). */
    const clearStage = (instant: boolean) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (instant) stage.setAttribute('data-swipe-instant', '');
      stage.removeAttribute('data-swipe');
      stage.removeAttribute('data-swipe-settle');
      stage.removeAttribute('data-swipe-ready');
      for (const name of ['--swipe-x', '--swipe-reveal', '--swipe-progress', '--swipe-settle-dur', '--swipe-settle-ease']) {
        stage.style.removeProperty(name);
      }
      renderedOffset = 0;
      if (!instant) return;
      // Applied with the transitions off, then the transitions come back for what follows
      void stage.offsetWidth;
      if (instantFrame !== undefined) window.cancelAnimationFrame(instantFrame);
      instantFrame = window.requestAnimationFrame(() => {
        instantFrame = undefined;
        stage.removeAttribute('data-swipe-instant');
      });
    };

    const stopFollowing = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      window.clearTimeout(releaseTimer);
      showBackProgress(0);
    };

    /** Drops the gesture at once (dialog opened, page gone): nothing navigates. */
    const abort = () => {
      stopFollowing();
      if (isVisual && settleTimer === undefined) clearStage(true);
      isVisual = false;
      phase = 'spent';
    };

    /** `source`: 'swipe' once the page has slid out, else the usual page transition runs. */
    const navigate = (source: BackSource) => {
      if (direction === 'back') {
        if (latest.current.canGoBack) latest.current.onBack(source);
      } else if (latest.current.canGoForward()) {
        latest.current.onForward();
      }
    };

    /**
     * Fingers lifted: decide now, from where the page is. The momentum events that follow
     * are not followed (the pending frame is dropped) and, the gesture being spent, every
     * wheel event is ignored until the pause that ends it.
     * `liftSpeed`: speed of the fingers when they left (the decision); `pageSpeed`: speed
     * of the page right now (the end continues it). Wheel px per ms, toward going there.
     */
    const release = (liftSpeed: number, pageSpeed: number) => {
      if (phase !== 'tracking') return;
      phase = 'spent';
      stopFollowing();
      const commit = shouldCommitSwipe(travelFor(distance), commitTarget(), liftSpeed);
      const stage = stageRef.current;
      if (!isVisual || !stage) {
        // Reduced motion: no drag, the usual cross-fade
        if (commit) navigate('other');
        return;
      }

      const isForwardCommit = commit && direction === 'forward';
      // Back: the page finishes its way out. Forward: the list returns before the new page
      // slides in with the usual transition. Cancel: everything back in place.
      const finalOffset = commit && direction === 'back' ? width : 0;
      // Page speed in page px per ms, toward the final position (1:1 while going back)
      const speedTowardEnd = (finalOffset > renderedOffset ? 1 : -1) * pageSpeed;
      const motion = settleMotion(Math.abs(finalOffset - renderedOffset), speedTowardEnd, !commit);
      stage.style.setProperty('--swipe-settle-dur', `${motion.duration}ms`);
      stage.style.setProperty('--swipe-settle-ease', motion.easing);
      stage.setAttribute('data-swipe-settle', commit ? 'commit' : 'cancel');
      const duration = motion.duration;
      writeStage(finalOffset, commit ? 1 : 0);
      settleTimer = window.setTimeout(
        () => {
          settleTimer = undefined;
          isVisual = false;
          if (!commit) {
            clearStage(true);
            return;
          }
          // The page is already out of view: render the navigation now, then drop the
          // swipe styles in the same frame so nothing slides back
          flushSync(() => navigate('swipe'));
          clearStage(!isForwardCommit);
        },
        // Forward: the list only leans, it does not need to come all the way back
        isForwardCommit ? 0 : duration
      );
    };

    const reset = () => {
      phase = 'idle';
      sumX = 0;
      sumY = 0;
      distance = 0;
      velocity = 0;
      liftVelocity = 0;
      momentum = INITIAL_MOMENTUM;
    };

    const onIdle = () => {
      release(0, 0);
      reset();
    };

    /** False when there is nowhere to go that way: the gesture is then ignored. */
    const startTracking = (time: number): boolean => {
      direction = sumX < 0 ? 'back' : 'forward';
      const isAllowed = direction === 'back' ? latest.current.canGoBack : latest.current.canGoForward();
      if (!isAllowed) {
        phase = 'spent';
        return false;
      }
      phase = 'tracking';
      lastTime = time;
      const stage = stageRef.current;
      isVisual = Boolean(stage) && !prefersReducedMotion();
      // Also measured under reduced motion: the decision is a share of the width
      width = stage?.clientWidth ?? window.innerWidth;
      if (stage && isVisual) {
        stage.removeAttribute('data-swipe-instant');
        stage.setAttribute('data-swipe', direction);
      }
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(onIdle, SWIPE_IDLE_MS);
      // The previous swipe is still settling, or this gesture is already decided
      if (settleTimer !== undefined || phase === 'spent') return;

      // Pinch zoom (ctrlKey), Shift+wheel and line-based mouse wheels are not swipes
      if (
        event.ctrlKey ||
        event.shiftKey ||
        event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
        isDialogOpen() ||
        (phase === 'idle' && scrollsHorizontally(event.target))
      ) {
        abort();
        return;
      }

      sumX += event.deltaX;
      sumY += event.deltaY;

      if (phase === 'idle') phase = 'pending';
      if (phase === 'pending') {
        const axis = resolveSwipeAxis(sumX, sumY);
        if (axis === null) return;
        if (axis === 'y') {
          phase = 'spent';
          return;
        }
        if (!startTracking(event.timeStamp)) return;
      }

      // The page can disappear mid-gesture (deleted, another page opened)
      const isStillAllowed = direction === 'back' ? latest.current.canGoBack : latest.current.canGoForward();
      if (!isStillAllowed) {
        abort();
        return;
      }

      // Content moving right (negative deltaX) is a swipe back, as in Safari
      const sign = direction === 'back' ? -1 : 1;
      const elapsed = Math.max(event.timeStamp - lastTime, 4);
      lastTime = event.timeStamp;
      velocity = velocity * 0.5 + ((event.deltaX * sign) / elapsed) * 0.5;
      momentum = trackMomentum(momentum, event.deltaX, event.timeStamp);
      // A possible momentum starts here: if it is confirmed, this is the fingers' speed
      // when they left
      if (isRunStart(momentum)) liftVelocity = velocity;
      // Followed 1:1 until the release is confirmed: no slowdown under the fingers
      distance = Math.max(0, sumX * sign);

      if (isMomentum(momentum)) {
        // Decided on the fingers' speed, continued at the speed the page has now
        release(liftVelocity, velocity);
        return;
      }
      scheduleRender();
      window.clearTimeout(releaseTimer);
      // Fingers stopped before leaving: no speed left
      releaseTimer = window.setTimeout(() => release(0, 0), SWIPE_RELEASE_MS);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.clearTimeout(idleTimer);
      window.clearTimeout(releaseTimer);
      window.clearTimeout(settleTimer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (instantFrame !== undefined) window.cancelAnimationFrame(instantFrame);
      showBackProgress(0);
      stageRef.current?.removeAttribute('data-swipe-instant');
      clearStage(false);
    };
  }, [feedbackRef, stageRef]);
}
