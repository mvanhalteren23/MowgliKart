import { describe, expect, it } from 'vitest';
import { clampOrigin, combineMove, computeStick, followOrigin, keysToVector } from './stickMath';

describe('computeStick', () => {
  it('outputs zero inside the dead zone but still moves the knob', () => {
    const s = computeStick(5, 0, 50, 0.2);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.magnitude).toBe(0);
    expect(s.knobX).toBeCloseTo(5);
  });

  it('rescales past the dead zone so output starts at 0 and reaches 1 at the rim', () => {
    const justOut = computeStick(10.5, 0, 50, 0.2);
    expect(justOut.x).toBeGreaterThan(0);
    expect(justOut.x).toBeLessThan(0.05);
    const rim = computeStick(50, 0, 50, 0.2);
    expect(rim.x).toBeCloseTo(1);
    const mid = computeStick(30, 0, 50, 0.2); // norm 0.6 → (0.6-0.2)/0.8 = 0.5
    expect(mid.x).toBeCloseTo(0.5);
  });

  it('clamps the knob and output to the radius', () => {
    const s = computeStick(300, -400, 50, 0.1);
    expect(Math.hypot(s.knobX, s.knobY)).toBeCloseTo(50);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1);
    expect(s.x).toBeCloseTo(0.6);
    expect(s.y).toBeCloseTo(-0.8);
  });

  it('keeps diagonals normalised (never exceeds the unit circle)', () => {
    const s = computeStick(100, 100, 50, 0.15);
    expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('handles degenerate input', () => {
    expect(computeStick(0, 0, 50, 0.2).magnitude).toBe(0);
    expect(computeStick(10, 10, 0, 0.2).magnitude).toBe(0);
    expect(computeStick(Number.NaN, 1, 50, 0.2).magnitude).toBe(0);
  });

  it('up on screen is negative y', () => {
    expect(computeStick(0, -50, 50, 0.1).y).toBeCloseTo(-1);
  });
});

describe('origin helpers', () => {
  it('clamps the floating origin into the zone', () => {
    expect(clampOrigin({ x: 2, y: 500 }, 300, 200, 60)).toEqual({ x: 60, y: 140 });
    expect(clampOrigin({ x: 150, y: 100 }, 300, 200, 60)).toEqual({ x: 150, y: 100 });
    expect(clampOrigin({ x: 0, y: 0 }, 100, 100, 60)).toEqual({ x: 50, y: 50 });
  });

  it('drags the origin when the finger overshoots', () => {
    expect(followOrigin({ x: 0, y: 0 }, { x: 30, y: 0 }, 50)).toEqual({ x: 0, y: 0 });
    const o = followOrigin({ x: 0, y: 0 }, { x: 80, y: 0 }, 50);
    expect(o.x).toBeCloseTo(30);
    expect(o.y).toBeCloseTo(0);
  });
});

describe('keyboard + combine', () => {
  it('normalises diagonals and cancels opposites', () => {
    const d = keysToVector(false, true, true, false);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2);
    expect(keysToVector(true, true, false, false)).toEqual({ x: 0, y: 0 });
  });

  it('prefers the stick, falls back to keys, zeroes when blocked', () => {
    expect(combineMove({ x: 0.5, y: 0 }, { x: -1, y: 0 }, false)).toEqual({ x: 0.5, y: 0 });
    expect(combineMove({ x: 0, y: 0 }, { x: -1, y: 0 }, false)).toEqual({ x: -1, y: 0 });
    expect(combineMove({ x: 0.5, y: 0 }, { x: -1, y: 0 }, true)).toEqual({ x: 0, y: 0 });
  });
});
