import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { listen } from '@tauri-apps/api/event';
import { isEditableTarget } from './useSidebar';
import {
  INITIAL_MOMENTUM,
  SWIPE_COMMIT_SHARE,
  SWIPE_GAIN,
  detailPresence,
  isMomentum,
  isRunStart,
  readTranslateX,
  resolveSwipeAxis,
  settleMotion,
  shouldCommitSwipe,
  swipeOffset,
  trackMomentum,
  travelFromTranslate,
  type MomentumState,
} from '../utils/swipeGesture';

/** MouseEvent.button of the side buttons ("back" / "forward" on most mice). */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;
/** Pause without wheel events that ends a gesture, momentum included. */
const SWIPE_IDLE_MS = 220;
/** Pause that means the fingers stopped, then left the trackpad without momentum. */
const SWIPE_RELEASE_MS = 120;
/** No movement for this long before the fingers lift: they had stopped, no speed left. */
const LIFT_STILL_MS = 50;

export type BackSource = 'swipe' | 'other';
type SwipeDirection = 'back' | 'forward';

interface BackForwardOptions {
  /**
   * Goes back (closes the current sub-page). Does nothing when there is nowhere to go.
   * `swipe`: the page has already slid out under the fingers, nothing is left to animate.
   */
  readonly onBack: (source: BackSource) => void;
  /**
   * Goes forward again (reopens the page just left). Does nothing when there is none.
   * `swipe`: the page is already fully on screen under the fingers, nothing is left to animate.
   */
  readonly onForward: (source: BackSource) => void;
  /**
   * Shows or hides the page that a swipe forward drags in (rendered, but not open yet).
   * Called inside `flushSync`, so the page is in the DOM when the call returns.
   */
  readonly onForwardPreview: (isShown: boolean) => void;
  /** True while going back is possible: the swipe follows the fingers only then. */
  readonly canGoBack: boolean;
  /** True while a page can be reopened (read when a swipe starts). */
  readonly canGoForward: () => boolean;
  /**
   * Element that receives the swipe progress while the fingers move: `--back-swipe`
   * (0 to 1) and `data-back-swipe`, read by the back button's styles; `--swipe-bar`
   * (share of the detail page on screen, 0 to 1) and `data-swipe-bar` (back / forward),
   * read by the top bar; then `data-swipe-settle` with the same duration and easing
   * variables as the page container, for the end of the gesture.
   */
  readonly feedbackRef: RefObject<HTMLElement | null>;
  /**
   * Page container (`.t-page-slide`) that follows the fingers: `data-swipe`
   * (back / forward), `--swipe-x` (px) and `--swipe-reveal` (0 to 1), then
   * `data-swipe-settle` (commit / cancel) with `--swipe-settle-dur` and
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
 * swipe (right = back, left = forward). Ignored while a dialog is open.
 *
 * Tauri does not expose WKWebView's native swipe navigation, so the swipe is read from
 * horizontal wheel events. The axis is locked once the fingers have moved a little; a
 * swipe back drags the page to the right under the fingers, a swipe forward drags the
 * page to reopen in from the right (styles written straight on the container, no React
 * render per event). Wheel events have no "fingers lifted": the release is either the
 * momentum that follows (events shrinking frame after frame) or a short pause. Past the
 * distance, or after a quick flick, the page finishes its way and the navigation
 * happens; otherwise it settles back. One decision per gesture.
 */
export function useBackForward({
  onBack,
  onForward,
  onForwardPreview,
  canGoBack,
  canGoForward,
  feedbackRef,
  stageRef,
}: BackForwardOptions) {
  // Latest values without re-attaching the listeners on every render
  const latest = useRef({ onBack, onForward, onForwardPreview, canGoBack, canGoForward });
  useLayoutEffect(() => {
    latest.current = { onBack, onForward, onForwardPreview, canGoBack, canGoForward };
  });

  useEffect(() => {
    const navigate = (direction: 'back' | 'forward') => {
      if (isDialogOpen()) return;
      if (direction === 'back') latest.current.onBack('other');
      else latest.current.onForward('other');
    };

    // macOS: WKWebView reports the side buttons as the middle one, so the Rust side reads
    // them from AppKit and sends `mouse-nav` instead (src-tauri/src/mouse_nav.rs)
    const isMac = document.documentElement.classList.contains('is-macos');

    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return;
      // WebView2 would otherwise navigate the webview itself
      event.preventDefault();
      if (isMac || event.type !== 'mouseup') return;
      navigate(event.button === MOUSE_BACK ? 'back' : 'forward');
    };

    // Keyboard: ⌘[ / ⌘] on macOS, Alt+Left / Alt+Right elsewhere. Some mouse
    // utilities (Logitech Options+…) also send these shortcuts for the side buttons.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) return;
      let direction: 'back' | 'forward' | null = null;
      if (isMac && event.metaKey && !event.altKey && !event.ctrlKey) {
        if (event.code === 'BracketLeft') direction = 'back';
        else if (event.code === 'BracketRight') direction = 'forward';
      } else if (!isMac && event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'ArrowLeft') direction = 'back';
        else if (event.key === 'ArrowRight') direction = 'forward';
      }
      if (!direction) return;
      event.preventDefault();
      navigate(direction);
    };

    window.addEventListener('mousedown', onMouseButton);
    window.addEventListener('mouseup', onMouseButton);
    window.addEventListener('auxclick', onMouseButton);
    window.addEventListener('keydown', onKeyDown);

    let isActive = true;
    let unlisten: (() => void) | null = null;
    if (isMac) {
      listen<string>('mouse-nav', event => {
        if (event.payload === 'back' || event.payload === 'forward') navigate(event.payload);
      })
        .then(stop => {
          if (isActive) unlisten = stop;
          else stop();
        })
        .catch(() => {
          // Outside Tauri (plain browser): no native events
        });
    }

    return () => {
      isActive = false;
      unlisten?.();
      window.removeEventListener('keydown', onKeyDown);
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
    // Distance already covered when the fingers catch a page that was still moving
    let baseDistance = 0;
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
    // macOS: fingers on the trackpad, from the native touch phases (trackpad-touch). While
    // they rest, the page stays where it is however long they stay still.
    let fingersDown = false;
    // The page a swipe forward drags in is rendered (see onForwardPreview)
    let isPreviewShown = false;

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

    const writeStage = (offset: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      renderedOffset = offset;
      stage.style.setProperty('--swipe-x', `${offset.toFixed(1)}px`);
      stage.style.setProperty('--swipe-reveal', width > 0 ? Math.min(offset / width, 1).toFixed(4) : '0');
      // The top bar follows the same movement
      const bar = feedbackRef.current;
      if (bar) {
        bar.style.setProperty('--swipe-bar', detailPresence(direction, offset, width).toFixed(4));
        bar.setAttribute('data-swipe-bar', direction);
      }
    };

    /** Duration and easing of the end of the gesture, on the page container and the top bar. */
    const setSettle = (settle: { kind: 'commit' | 'cancel'; duration: number; easing: string } | null) => {
      for (const element of [stageRef.current, feedbackRef.current]) {
        if (!element) continue;
        if (settle) {
          element.style.setProperty('--swipe-settle-dur', `${settle.duration}ms`);
          element.style.setProperty('--swipe-settle-ease', settle.easing);
          element.setAttribute('data-swipe-settle', settle.kind);
        } else {
          element.removeAttribute('data-swipe-settle');
          element.style.removeProperty('--swipe-settle-dur');
          element.style.removeProperty('--swipe-settle-ease');
        }
      }
    };

    /** Page px that navigate on release. */
    const commitTarget = () => width * SWIPE_COMMIT_SHARE;

    /** Page px moved under the fingers, proportional to the gesture. */
    const travelPx = () => swipeOffset(distance, width);

    const render = () => {
      frame = undefined;
      if (direction === 'back') {
        const target = commitTarget();
        showBackProgress(target > 0 ? Math.min(travelPx() / target, 1) : 0);
      }
      if (!isVisual) return;
      writeStage(travelPx());
    };

    const scheduleRender = () => {
      frame ??= window.requestAnimationFrame(render);
    };

    /** Back to rest. `instant`: without the pages' own transition (one frame). */
    const clearStage = (instant: boolean) => {
      const bar = feedbackRef.current;
      if (bar) {
        bar.removeAttribute('data-swipe-bar');
        bar.style.removeProperty('--swipe-bar');
      }
      setSettle(null);
      const stage = stageRef.current;
      if (!stage) return;
      if (instant) stage.setAttribute('data-swipe-instant', '');
      stage.removeAttribute('data-swipe');
      for (const name of ['--swipe-x', '--swipe-reveal']) {
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

    /** Unmounts the page dragged in by a swipe forward. */
    const hidePreview = () => {
      if (!isPreviewShown) return;
      isPreviewShown = false;
      flushSync(() => latest.current.onForwardPreview(false));
    };

    /** Drops the gesture at once (dialog opened, page gone): nothing navigates. */
    const abort = () => {
      stopFollowing();
      if (isVisual && settleTimer === undefined) {
        clearStage(true);
        hidePreview();
      }
      isVisual = false;
      phase = 'spent';
    };

    /**
     * `source`: 'swipe' once the page has slid in or out under the fingers, else the usual
     * page transition runs.
     */
    const navigate = (source: BackSource) => {
      if (direction === 'back') {
        if (latest.current.canGoBack) latest.current.onBack(source);
      } else {
        isPreviewShown = false;
        if (latest.current.canGoForward()) latest.current.onForward(source);
        else latest.current.onForwardPreview(false);
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
      const commit = shouldCommitSwipe(travelPx(), commitTarget(), liftSpeed);
      const stage = stageRef.current;
      if (!isVisual || !stage) {
        // Reduced motion: no drag, the usual cross-fade
        if (commit) navigate('other');
        return;
      }

      // Commit: the page finishes its way (out when going back, in when going forward).
      // Cancel: everything back in place.
      const finalOffset = commit ? width : 0;
      // Page speed in page px per ms, toward the final position (1:1 under the fingers)
      const speedTowardEnd = (finalOffset > renderedOffset ? 1 : -1) * pageSpeed;
      const motion = settleMotion(Math.abs(finalOffset - renderedOffset), speedTowardEnd, !commit);
      setSettle({ kind: commit ? 'commit' : 'cancel', duration: motion.duration, easing: motion.easing });
      const duration = motion.duration;
      writeStage(finalOffset);
      settleTimer = window.setTimeout(() => {
        settleTimer = undefined;
        isVisual = false;
        if (!commit) {
          clearStage(true);
          hidePreview();
          return;
        }
        // The page is already in its final place: render the navigation now, then drop the
        // swipe styles in the same frame so nothing slides
        flushSync(() => navigate('swipe'));
        clearStage(true);
      }, duration);
    };

    /**
     * Fingers down on a page that is still finishing its move: stops the move where the page
     * is on screen right now and follows the fingers from there. Nothing has navigated yet
     * (that happens when the move ends), so the gesture simply goes on in the same
     * direction with the distance already covered: fingers going the other way bring the
     * page back toward its resting side.
     */
    const catchPage = () => {
      const stage = stageRef.current;
      const page = stage?.querySelector<HTMLElement>('.t-page[data-page-id="2"]');
      if (!stage || !page) return;
      width = stage.clientWidth;
      // Real position, mid-transition included
      const travel = travelFromTranslate(direction, readTranslateX(getComputedStyle(page).transform), width);
      window.clearTimeout(settleTimer);
      settleTimer = undefined;
      window.clearTimeout(idleTimer);
      window.clearTimeout(releaseTimer);
      // Settle transitions off, page and top bar written at the position it was caught
      setSettle(null);
      stage.removeAttribute('data-swipe-instant');
      baseDistance = travel / SWIPE_GAIN;
      sumX = 0;
      sumY = 0;
      distance = baseDistance;
      velocity = 0;
      liftVelocity = 0;
      momentum = INITIAL_MOMENTUM;
      lastTime = performance.now();
      phase = 'tracking';
      isVisual = true;
      writeStage(swipeOffset(distance, width));
      if (direction === 'back') {
        const target = commitTarget();
        showBackProgress(target > 0 ? Math.min(travelPx() / target, 1) : 0);
      }
    };

    const reset = () => {
      phase = 'idle';
      sumX = 0;
      sumY = 0;
      distance = 0;
      baseDistance = 0;
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
        // Going forward: the page to reopen is rendered off screen before the drag starts
        if (direction === 'forward') {
          flushSync(() => latest.current.onForwardPreview(true));
          isPreviewShown = true;
        }
        stage.removeAttribute('data-swipe-instant');
        stage.setAttribute('data-swipe', direction);
      }
      return true;
    };

    const armIdle = () => {
      window.clearTimeout(idleTimer);
      if (!fingersDown) idleTimer = window.setTimeout(onIdle, SWIPE_IDLE_MS);
    };

    const onTouch = (change: 'begin' | 'end') => {
      if (change === 'begin') {
        fingersDown = true;
        window.clearTimeout(idleTimer);
        window.clearTimeout(releaseTimer);
        // The page is still finishing its move: the fingers take it where it is
        if (settleTimer !== undefined && isVisual) {
          catchPage();
          return;
        }
        // Fingers down again: a new gesture, even if the last one has not timed out yet
        if (phase === 'spent' && settleTimer === undefined) reset();
        return;
      }
      fingersDown = false;
      armIdle();
      // Lifted: the decision is taken now, at the fingers' speed, and the page carries on
      // at that speed. The momentum events that follow are not followed, so the page never
      // slows down on its own once the fingers have left. Fingers that had stopped before
      // lifting leave no speed; fingers heading back toward the start call the swipe off.
      if (phase === 'tracking') {
        const isMoving = performance.now() - lastTime < LIFT_STILL_MS;
        const speed = isMoving ? velocity : 0;
        release(speed, speed);
      }
    };

    // The pointer moved or clicked: no scroll gesture can be under way
    const onPointer = () => {
      if (!fingersDown) return;
      fingersDown = false;
      if (phase === 'tracking') release(0, 0);
      armIdle();
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });

    let isActive = true;
    let unlistenTouch: (() => void) | null = null;
    if (document.documentElement.classList.contains('is-macos')) {
      listen<string>('trackpad-touch', event => {
        if (event.payload === 'begin' || event.payload === 'end') onTouch(event.payload);
      })
        .then(stop => {
          if (isActive) unlistenTouch = stop;
          else stop();
        })
        .catch(() => {
          // Outside Tauri (plain browser): the pauses decide, as elsewhere
        });
    }

    const onWheel = (event: WheelEvent) => {
      armIdle();
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

      // Content moving right (negative deltaX) is a swipe back
      const sign = direction === 'back' ? -1 : 1;
      const elapsed = Math.max(event.timeStamp - lastTime, 4);
      lastTime = event.timeStamp;
      velocity = velocity * 0.5 + ((event.deltaX * sign) / elapsed) * 0.5;
      momentum = trackMomentum(momentum, event.deltaX, event.timeStamp);
      // A possible momentum starts here: if it is confirmed, this is the fingers' speed
      // when they left
      if (isRunStart(momentum)) liftVelocity = velocity;
      // Followed 1:1 until the release is confirmed: no slowdown under the fingers
      distance = Math.max(0, baseDistance + sumX * sign);

      // Fingers still on the trackpad: a quick move that slows down is not momentum, the
      // lift decides. Without touch phases, the shape of the deltas is all there is.
      if (!fingersDown && isMomentum(momentum)) {
        // Decided on the fingers' speed, continued at the speed the page has now
        release(liftVelocity, velocity);
        return;
      }
      scheduleRender();
      window.clearTimeout(releaseTimer);
      // Without touch phases, a pause means the fingers stopped, then left with no speed
      if (!fingersDown) releaseTimer = window.setTimeout(() => release(0, 0), SWIPE_RELEASE_MS);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      isActive = false;
      unlistenTouch?.();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
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
