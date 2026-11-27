import { describe, expect, it } from 'vitest';
import { cubicBezier, parseCubicBezier } from './easing';

describe('cubicBezier', () => {
  it('starts at 0 and ends at 1', () => {
    const ease = cubicBezier(0.76, 0, 0.24, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('never decreases', () => {
    const ease = cubicBezier(0.76, 0, 0.24, 1);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = ease(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('matches the CSS ease curve at the middle', () => {
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('is the identity for a straight line', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe('parseCubicBezier', () => {
  it('reads the four numbers', () => {
    expect(parseCubicBezier('cubic-bezier(0.76, 0, 0.24, 1)')).toEqual([0.76, 0, 0.24, 1]);
  });

  it('rejects other values', () => {
    expect(parseCubicBezier('ease-in')).toBeNull();
    expect(parseCubicBezier('cubic-bezier(a, 0, 0, 1)')).toBeNull();
  });
});
