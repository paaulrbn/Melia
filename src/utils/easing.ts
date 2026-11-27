/**
 * CSS-style cubic Bézier easing: returns a function mapping a progress `t` in [0, 1] to the
 * eased value. The curve runs from (0, 0) to (1, 1) with control points (x1, y1), (x2, y2).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  // Curve parameter whose x equals the requested one: Newton steps, then bisection
  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = x;
    while (low < high) {
      const error = sampleX(s);
      if (Math.abs(error - x) < 1e-6) return s;
      if (x > error) low = s;
      else high = s;
      s = (high - low) / 2 + low;
      if (high - low < 1e-9) break;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

const CUBIC_BEZIER_PATTERN = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/;

/** Reads `cubic-bezier(a, b, c, d)`; null when the text is anything else. */
export function parseCubicBezier(value: string): [number, number, number, number] | null {
  const match = CUBIC_BEZIER_PATTERN.exec(value.trim());
  if (!match) return null;
  const numbers = match.slice(1, 5).map(part => Number(part.trim()));
  if (numbers.some(number => !Number.isFinite(number))) return null;
  return [numbers[0], numbers[1], numbers[2], numbers[3]];
}
