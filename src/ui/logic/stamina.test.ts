import { describe, expect, it } from 'vitest';
import { GAUGE_FADE_IDLE_SEC, gaugeMode, isDoubleTapHold, staminaFraction, staminaPercent } from './stamina';

const st = (current: number, idleSec = 0, exhausted = false) => ({ current, max: 100, exhausted, idleSec });

describe('stamina gauge maths', () => {
  it('fraction is clamped and safe', () => {
    expect(staminaFraction(st(50))).toBe(0.5);
    expect(staminaFraction(st(150))).toBe(1);
    expect(staminaFraction(st(-5))).toBe(0);
    expect(staminaFraction({ current: 5, max: 0 })).toBe(0);
    expect(staminaFraction({ current: Number.NaN, max: 100 })).toBe(0);
    expect(staminaPercent(st(33.4))).toBe(33);
  });
  it('fades when full and idle', () => {
    expect(gaugeMode(st(100, GAUGE_FADE_IDLE_SEC), false)).toBe('hidden');
    expect(gaugeMode(st(100, 0.5), false)).toBe('idle');
  });
  it('pulses while exhausted, even when spending', () => {
    expect(gaugeMode(st(0, 0, true), true)).toBe('exhausted');
    expect(gaugeMode(st(40, 5, true), false)).toBe('exhausted');
  });
  it('shows draining while spending or just drained', () => {
    expect(gaugeMode(st(100, 10), true)).toBe('draining');
    expect(gaugeMode(st(60, 0.1), false)).toBe('draining');
    expect(gaugeMode(st(60, 2), false)).toBe('idle');
  });
});

describe('double-tap-and-hold', () => {
  it('needs a recent nearby release', () => {
    expect(isDoubleTapHold(null, { t: 0, x: 0, y: 0 })).toBe(false);
    expect(isDoubleTapHold({ t: 0, x: 10, y: 10 }, { t: 200, x: 20, y: 15 })).toBe(true);
    expect(isDoubleTapHold({ t: 0, x: 10, y: 10 }, { t: 400, x: 10, y: 10 })).toBe(false);
    expect(isDoubleTapHold({ t: 0, x: 0, y: 0 }, { t: 100, x: 100, y: 0 })).toBe(false);
    expect(isDoubleTapHold({ t: 100, x: 0, y: 0 }, { t: 50, x: 0, y: 0 })).toBe(false);
  });
});
