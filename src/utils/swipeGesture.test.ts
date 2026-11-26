import { describe, expect, it } from 'vitest';
import {
  INITIAL_MOMENTUM,
  SWIPE_AXIS_LOCK_DISTANCE,
  SWIPE_COMMIT_SHARE,
  SWIPE_FLICK_MIN_DISTANCE,
  SWIPE_FLICK_VELOCITY,
  SWIPE_SETTLE_MAX_MS,
  SWIPE_SETTLE_MIN_MS,
  isMomentum,
  settleMotion,
  isRunStart,
  resolveSwipeAxis,
  rubberBand,
  shouldCommitSwipe,
  swipeOffset,
  trackMomentum,
} from './swipeGesture';
import realGesturesJson from './__fixtures__/swipe-real.json';

/** One wheel event: [ms since the first event, deltaX, deltaY] */
type Sample = [number, number, number];

/**
 * Three two-finger swipes recorded in the app (dev wheel log), on a 120 Hz MacBook:
 * a slow swipe back that turns into a medium swipe forward, a quick flick back, and a
 * medium swipe back.
 */
const realGestures = realGesturesJson as Sample[][];

/** Time of the event that confirms the release, or null when none does */
function releaseTime(samples: readonly Sample[]): number | null {
  let state = INITIAL_MOMENTUM;
  for (const [time, deltaX] of samples) {
    state = trackMomentum(state, deltaX, time);
    if (isMomentum(state)) return time;
  }
  return null;
}

describe('resolveSwipeAxis', () => {
  it('waits until the fingers have moved enough', () => {
    expect(resolveSwipeAxis(SWIPE_AXIS_LOCK_DISTANCE - 1, 0)).toBeNull();
    expect(resolveSwipeAxis(3, -4)).toBeNull();
  });

  it('locks a mostly horizontal movement, in both directions', () => {
    expect(resolveSwipeAxis(-30, 10)).toBe('x');
    expect(resolveSwipeAxis(30, -15)).toBe('x');
  });

  it('treats a diagonal or vertical movement as a scroll', () => {
    expect(resolveSwipeAxis(20, 12)).toBe('y');
    expect(resolveSwipeAxis(2, 40)).toBe('y');
  });
});

describe('swipeOffset (swipe back)', () => {
  it('is linear: twice the movement moves the page twice as far', () => {
    expect(swipeOffset(200, 1000)).toBe(2 * swipeOffset(100, 1000));
    expect(swipeOffset(400, 1000)).toBe(2 * swipeOffset(200, 1000));
  });

  it('follows the movement 1:1, as a scrolled page would', () => {
    expect(swipeOffset(137, 1000)).toBe(137);
  });

  it('stays between 0 and the width', () => {
    expect(swipeOffset(-10, 1000)).toBe(0);
    expect(swipeOffset(5000, 1000)).toBe(1000);
  });
});

describe('rubberBand (forward lean, nowhere to drag a page from)', () => {
  it('resists without ever passing the limit', () => {
    expect(rubberBand(0, 100)).toBe(0);
    expect(rubberBand(-50, 100)).toBe(0);
    expect(rubberBand(1e6, 100)).toBeLessThan(100);
    expect(rubberBand(200, 100)).toBeGreaterThan(rubberBand(100, 100));
  });
});

describe('shouldCommitSwipe', () => {
  const width = 1000;
  const target = width * SWIPE_COMMIT_SHARE;

  it('navigates once the page shows past the share of the width, even at rest', () => {
    expect(shouldCommitSwipe(swipeOffset(target, width), target, 0)).toBe(true);
    expect(shouldCommitSwipe(swipeOffset(target - 1, width), target, 0)).toBe(false);
  });

  it('navigates after a short but quick flick', () => {
    expect(shouldCommitSwipe(SWIPE_FLICK_MIN_DISTANCE, target, SWIPE_FLICK_VELOCITY)).toBe(true);
    expect(shouldCommitSwipe(SWIPE_FLICK_MIN_DISTANCE, target, SWIPE_FLICK_VELOCITY / 2)).toBe(false);
  });

  it('ignores a tiny movement however fast', () => {
    expect(shouldCommitSwipe(SWIPE_FLICK_MIN_DISTANCE - 1, target, 10)).toBe(false);
  });
});

describe('settleMotion', () => {
  /** Initial slope of the curve, in px per ms */
  const startSpeed = (remaining: number, motion: ReturnType<typeof settleMotion>) => {
    const [x1, y1] = /cubic-bezier\(([^,]+), ([^,]+),/.exec(motion.easing)!.slice(1).map(Number);
    return (y1 / x1) * (remaining / motion.duration);
  };

  it('lasts remaining / speed, and is linear, when that fits the bounds', () => {
    const motion = settleMotion(400, 2, false);
    expect(motion.duration).toBe(200);
    expect(motion.easing).toBe('cubic-bezier(0.333, 0.333, 0.667, 0.667)');
  });

  it('starts at the speed of the release, even when the bounds shorten or stretch it', () => {
    expect(startSpeed(600, settleMotion(600, 10, false))).toBeCloseTo(10, 1);
    expect(settleMotion(600, 10, false).duration).toBe(SWIPE_SETTLE_MIN_MS);
    expect(startSpeed(600, settleMotion(600, 0.5, false))).toBeCloseTo(0.5, 1);
    expect(settleMotion(600, 0.5, false).duration).toBe(SWIPE_SETTLE_MAX_MS);
  });

  it('starts from rest when the page was not moving that way', () => {
    const motion = settleMotion(300, -1, true);
    expect(motion.duration).toBe(SWIPE_SETTLE_MAX_MS);
    expect(startSpeed(300, motion)).toBe(0);
  });

  it('arrives slowing down when the page stops in view', () => {
    expect(settleMotion(400, 2, true).easing.endsWith(', 1)')).toBe(true);
  });

  it('has nothing to animate when already there', () => {
    expect(settleMotion(0, 2, false).duration).toBe(0);
  });
});

describe('momentum detection on real gestures (120 Hz MacBook trackpad)', () => {
  const [slowThenForward, quickFlick, mediumSwipe] = realGestures;

  it('confirms the release of a quick flick early in its momentum', () => {
    // Peak -308 at 79 ms, then 243, 242, 201, 180… with no finger left
    const releasedAt = releaseTime(quickFlick);
    expect(releasedAt).not.toBeNull();
    expect(releasedAt).toBeGreaterThanOrEqual(120);
    expect(releasedAt).toBeLessThanOrEqual(160);
  });

  it('keeps following uneven fingers until the momentum really starts', () => {
    // Fingers move on (20, 20, 15, 22…, 18, 12, 12, 12, 11, 11) until ~2300 ms, then 25, 24, 23…
    const releasedAt = releaseTime(slowThenForward);
    expect(releasedAt).not.toBeNull();
    expect(releasedAt).toBeGreaterThanOrEqual(2300);
  });

  it('does not stop a medium swipe while its events rise and fall between 20 and 31', () => {
    const releasedAt = releaseTime(mediumSwipe);
    expect(releasedAt).not.toBeNull();
    // The fingers move until ~360 ms (14, 16, 19, 7, 12, 11, 17…), the fade comes after
    expect(releasedAt).toBeGreaterThan(360);
    expect(releasedAt).toBeLessThanOrEqual(520);
  });

  it('handles two frames merged into one event', () => {
    // 338 ms: -178 after 19 ms, that is twice -89: part of the same momentum
    const merged = quickFlick.filter(([time]) => time >= 311 && time <= 362);
    let state = INITIAL_MOMENTUM;
    for (const [time, deltaX] of merged) state = trackMomentum(state, deltaX, time);
    expect(state.length).toBe(merged.length);
  });
});

describe('momentum detection', () => {
  it('never ends a very slow drag (no momentum, only the pause ends it)', () => {
    // -2 / -3 for 2.5 s, as recorded
    const slow = Array.from({ length: 300 }, (_, index): Sample => [Math.round(index * 8.4), index % 3 ? -2 : -3, 0]);
    expect(releaseTime(slow)).toBeNull();
  });

  it('never takes a finger plateau for momentum', () => {
    const plateau = [27, 19, 20, 20, 20, 20, 19, 20, 19, 20, 20, 19, 20];
    expect(releaseTime(plateau.map((deltaX, index): Sample => [index * 8, deltaX, 0]))).toBeNull();
  });

  it('breaks a run on a pause longer than a couple of frames', () => {
    const fading = [40, 38, 36, 34, 32, 30, 28, 26, 24, 22];
    expect(releaseTime(fading.map((deltaX, index): Sample => [index * 8, deltaX, 0]))).not.toBeNull();
    expect(releaseTime(fading.map((deltaX, index): Sample => [index * 40, deltaX, 0]))).toBeNull();
  });

  it('marks the first event of a run, where the speed at release is read', () => {
    let state = trackMomentum(INITIAL_MOMENTUM, 30, 0);
    expect(isRunStart(state)).toBe(true);
    state = trackMomentum(state, 28, 8);
    expect(isRunStart(state)).toBe(false);
    state = trackMomentum(state, 33, 16);
    expect(isRunStart(state)).toBe(true);
  });
});
