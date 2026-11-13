import { describe, expect, it } from 'vitest';
import { compassBearing, compassLabel, cooldownFraction, cooldownSecondsLeft, formatDistance, ratio, windArrowAngle } from './hudMath';

describe('cooldownFraction', () => {
  it('is 0 when ready or unknown', () => {
    expect(cooldownFraction(undefined, 10, 5)).toBe(0);
    expect(cooldownFraction(10, 10, 5)).toBe(0);
    expect(cooldownFraction(8, 10, 5)).toBe(0);
  });
  it('is 1 right after use and decreases linearly', () => {
    expect(cooldownFraction(15, 10, 5)).toBe(1);
    expect(cooldownFraction(15, 12.5, 5)).toBeCloseTo(0.5);
  });
  it('clamps and guards zero-length cooldowns', () => {
    expect(cooldownFraction(30, 10, 5)).toBe(1);
    expect(cooldownFraction(30, 10, 0)).toBe(0);
  });
  it('rounds seconds left up', () => {
    expect(cooldownSecondsLeft(12.2, 10)).toBe(3);
    expect(cooldownSecondsLeft(9, 10)).toBe(0);
  });
});

describe('compassBearing', () => {
  const p = { x: 0, z: 0 };
  it('north (−z) is up = 0', () => {
    const b = compassBearing(p, { x: 0, z: -10 });
    expect(b.angle).toBeCloseTo(0);
    expect(b.distance).toBeCloseTo(10);
  });
  it('east is +90°, south 180°, west −90°', () => {
    expect(compassBearing(p, { x: 5, z: 0 }).angle).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(compassBearing(p, { x: 0, z: 5 }).angle)).toBeCloseTo(Math.PI);
    expect(compassBearing(p, { x: -5, z: 0 }).angle).toBeCloseTo(-Math.PI / 2);
  });
  it('measures planar distance and handles coincident points', () => {
    expect(compassBearing({ x: 1, z: 1 }, { x: 4, z: 5 }).distance).toBeCloseTo(5);
    expect(compassBearing(p, p)).toEqual({ distance: 0, angle: 0 });
  });
  it('labels angles', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(Math.PI / 2)).toBe('E');
    expect(compassLabel(-Math.PI / 2)).toBe('W');
    expect(compassLabel(Math.PI * 0.75)).toBe('SE');
  });
});

describe('misc', () => {
  it('wind arrow: east → 90°, south → 180°', () => {
    expect(windArrowAngle(0)).toBeCloseTo(Math.PI / 2);
    expect(windArrowAngle(Math.PI / 2)).toBeCloseTo(Math.PI);
  });
  it('formats distances', () => {
    expect(formatDistance(1)).toBe('here');
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
  it('ratio is safe', () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(15, 10)).toBe(1);
    expect(ratio(5, 10)).toBe(0.5);
  });
});
