/**
 * Pure decisions behind the two-finger trackpad swipe (back / forward), read from wheel
 * events: which axis the gesture follows, how far the page moves under the fingers, when
 * the fingers have left the trackpad and whether the swipe navigates.
 */

/** Movement, in wheel pixels, before the gesture picks an axis. */
export const SWIPE_AXIS_LOCK_DISTANCE = 12;
/** Horizontal only when |y| stays under this share of |x| when the axis is picked. */
export const SWIPE_MAX_SLOPE = 0.5;
/**
 * CSS pixels the page moves per wheel pixel, constant (no resistance). A wheel
 * delta is the distance the content would scroll for the same movement, so 1 makes the
 * page move exactly as a scrolled page would under the same fingers.
 */
export const SWIPE_GAIN = 1;
/** Share of the page width, as seen on screen, that navigates on release. */
export const SWIPE_COMMIT_SHARE = 0.35;
/** A shorter flick still navigates when fast enough: page px, and page px per ms. */
export const SWIPE_FLICK_MIN_DISTANCE = 40;
export const SWIPE_FLICK_VELOCITY = 0.6;
/** px per ms back toward the start, at the release, that cancels the swipe. */
export const SWIPE_CANCEL_VELOCITY = 0.15;
/** End of a swipe (navigates or settles back): duration bounds, in ms. */
export const SWIPE_SETTLE_MIN_MS = 120;
export const SWIPE_SETTLE_MAX_MS = 300;
/**
 * Momentum (fingers lifted), as recorded on a 120 Hz MacBook (see
 * __fixtures__/swipe-real.json): one wheel event per frame (~8 ms, with jitter, and now
 * and then two frames merged into one event), with sizes that fall smoothly and almost
 * monotonically (243, 242, 201, 180, 167…), equal steps included. Under the fingers the
 * sizes go up and down (20, 17, 20, 24, 16, 34…) or hold a plateau (20, 20, 20, 19, 20).
 *
 * Each event's size is divided by the number of frames it covers. A run is a series of
 * events, one frame apart (gap up to MOMENTUM_MAX_GAP_MS), each no larger than the one
 * before (+MOMENTUM_TOLERANCE allowed from MOMENTUM_TOLERANCE_FROM, rounding of the deltas).
 * The release is confirmed once a run, starting at MOMENTUM_MIN_START or more, is
 * MOMENTUM_MIN_RUN events long, ends at MOMENTUM_END_SHARE of its start or less, and fell
 * strictly on at least MOMENTUM_MIN_FALLING_SHARE of its steps (a finger plateau only
 * dips now and then; momentum keeps falling). The page follows every event 1:1 until then.
 */
export const FRAME_MS = 1000 / 120;
export const MOMENTUM_MAX_GAP_MS = 34;
export const MOMENTUM_TOLERANCE = 1;
export const MOMENTUM_TOLERANCE_FROM = 10;
export const MOMENTUM_MIN_START = 8;
export const MOMENTUM_MIN_RUN = 8;
export const MOMENTUM_END_SHARE = 0.75;
export const MOMENTUM_MIN_FALLING_SHARE = 0.6;

export type SwipeAxis = 'x' | 'y';

/** Axis of a starting gesture, or null while it has not moved enough to tell. */
export function resolveSwipeAxis(sumX: number, sumY: number): SwipeAxis | null {
  const absX = Math.abs(sumX);
  const absY = Math.abs(sumY);
  if (Math.max(absX, absY) < SWIPE_AXIS_LOCK_DISTANCE) return null;
  return absY <= absX * SWIPE_MAX_SLOPE ? 'x' : 'y';
}

/**
 * How far the page has moved under the fingers (leaving when going back, entering when
 * going forward), in CSS pixels, for a page `width` wide.
 * Linear: twice the movement moves the page twice as far, up to the width.
 */
export function swipeOffset(distance: number, width: number): number {
  return Math.min(Math.max(distance * SWIPE_GAIN, 0), Math.max(width, 0));
}

/**
 * Horizontal translation, in px, of a computed `transform` value ("none", "matrix(...)" or
 * "matrix3d(...)"). 0 when it cannot be read.
 */
export function readTranslateX(transform: string): number {
  const match = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!match) return 0;
  const values = match[2].split(',').map(part => Number.parseFloat(part));
  const value = values[match[1] ? 12 : 4];
  return Number.isFinite(value) ? value : 0;
}

/**
 * How far the moving page has travelled (px from its resting side), from its horizontal
 * translation on screen. Going back the page leaves to the right (translation = travel);
 * going forward it comes in from the right (translation = width - travel).
 */
export function travelFromTranslate(direction: 'back' | 'forward', translateX: number, width: number): number {
  const travel = direction === 'back' ? translateX : width - translateX;
  return Math.min(Math.max(travel, 0), Math.max(width, 0));
}

/**
 * Share (0 to 1) of the detail page that is on screen for a given travel: grows while it
 * comes in (forward), shrinks while it leaves (back).
 */
export function detailPresence(direction: 'back' | 'forward', travel: number, width: number): number {
  if (width <= 0) return direction === 'forward' ? 0 : 1;
  const share = Math.min(Math.max(travel / width, 0), 1);
  return direction === 'forward' ? share : 1 - share;
}

/**
 * At release: navigate or settle back. `travel` and `target` in page px (target =
 * SWIPE_COMMIT_SHARE of the width); `velocity` toward the target, in px per ms. A short but quick flick navigates too.
 */
export function shouldCommitSwipe(travel: number, target: number, velocity: number): boolean {
  // Fingers heading back toward the start when they leave: the swipe is called off,
  // however far the page has gone
  if (velocity <= -SWIPE_CANCEL_VELOCITY) return false;
  if (travel >= target) return true;
  return travel >= SWIPE_FLICK_MIN_DISTANCE && velocity >= SWIPE_FLICK_VELOCITY;
}

export interface SettleMotion {
  /** ms */
  readonly duration: number;
  /** CSS timing function */
  readonly easing: string;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * End of a swipe that continues the gesture: covers `remaining` px starting at the speed
 * the page had on release (`velocity`, px/ms toward the end position), instead of
 * restarting with an ease that slows down.
 *
 * Duration: remaining / velocity, kept between SWIPE_SETTLE_MIN_MS and _MAX_MS. Easing: a
 * cubic-bezier whose initial slope is that speed in the curve's own units
 * (s = velocity × duration / remaining; s = 1 is linear). When the bounds make it start
 * faster than average (s > 1), it slows down at the very end; slower (s < 1), it picks up
 * speed. `endAtRest`: the page stops in view (settling back), so it always arrives
 * slowing down; a page leaving the screen may arrive at full speed.
 */
export function settleMotion(remaining: number, velocity: number, endAtRest: boolean): SettleMotion {
  if (remaining <= 0.5) return { duration: 0, easing: 'linear' };
  const speed = Math.max(velocity, 0);
  const ideal = speed > 0 ? remaining / speed : Number.POSITIVE_INFINITY;
  const duration = Math.round(Math.min(SWIPE_SETTLE_MAX_MS, Math.max(SWIPE_SETTLE_MIN_MS, ideal)));
  const slope = (speed * duration) / remaining;
  // First control point on the starting tangent, kept inside the unit square
  const x1 = slope > 3 ? 1 / slope : 1 / 3;
  const y1 = Math.min(1, x1 * slope);
  const y2 = endAtRest || slope > 1 ? 1 : 2 / 3;
  return {
    duration,
    easing: `cubic-bezier(${round3(x1)}, ${round3(y1)}, 0.667, ${round3(y2)})`,
  };
}

/** Follows the size of the wheel events to spot the momentum that starts on release. */
export interface MomentumState {
  /** Time of the previous event (ms), or null before the first one */
  readonly previousTime: number | null;
  /** Size per frame of the previous event */
  readonly previous: number;
  /** Current run: size per frame of its first event, its length and its strict falls */
  readonly start: number;
  readonly length: number;
  readonly falling: number;
}

export const INITIAL_MOMENTUM: MomentumState = {
  previousTime: null,
  previous: 0,
  start: 0,
  length: 0,
  falling: 0,
};

/** `time`: the event's timeStamp, in ms. */
export function trackMomentum(state: MomentumState, delta: number, time: number): MomentumState {
  const gap = state.previousTime === null ? FRAME_MS : time - state.previousTime;
  const frames = Math.max(1, Math.round(gap / FRAME_MS));
  const size = Math.abs(delta) / frames;
  const allowed = state.previous + (state.previous >= MOMENTUM_TOLERANCE_FROM ? MOMENTUM_TOLERANCE : 0);
  const continuesRun =
    state.previousTime !== null && state.length > 0 && gap <= MOMENTUM_MAX_GAP_MS && size <= allowed;
  if (!continuesRun) {
    return { previousTime: time, previous: size, start: size, length: 1, falling: 0 };
  }
  return {
    previousTime: time,
    previous: size,
    start: state.start,
    length: state.length + 1,
    falling: state.falling + (size < state.previous ? 1 : 0),
  };
}

/** True once the fingers are off and only momentum is left (see MOMENTUM_* above). */
export function isMomentum(state: MomentumState): boolean {
  if (state.start < MOMENTUM_MIN_START || state.length < MOMENTUM_MIN_RUN) return false;
  if (state.previous > state.start * MOMENTUM_END_SHARE) return false;
  return state.falling >= (state.length - 1) * MOMENTUM_MIN_FALLING_SHARE;
}

/** True on the first event of a run: the speed then is the speed at release. */
export function isRunStart(state: MomentumState): boolean {
  return state.length === 1;
}
