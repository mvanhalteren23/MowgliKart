import { describe, expect, it } from 'vitest';
import type { StaminaState } from '@/types/contracts';
import { staminaTuning as t } from './__fixtures__/db';
import { core } from './__fixtures__/helpers';

const { initial, tick, canDrain } = core.stamina;
const run = (s: StaminaState, drain: number, secs: number, dt = 0.1): StaminaState => {
  let x = s;
  for (let i = 0; i < Math.round(secs / dt); i++) x = tick(x, drain, dt, t);
  return x;
};

describe('stamina pool', () => {
  it('starts full and drainable', () => {
    const s = initial(t);
    expect(s).toEqual({ current: 100, max: 100, exhausted: false, idleSec: 0 });
    expect(canDrain(s)).toBe(true);
  });

  it('drains at the given rate and resets idle time', () => {
    const s = tick({ ...initial(t), idleSec: 5 }, 25, 1, t);
    expect(s).toEqual({ current: 75, max: 100, exhausted: false, idleSec: 0 });
  });

  it('waits regenDelaySec before regenerating, counting only the time past the delay', () => {
    const s = { current: 50, max: 100, exhausted: false, idleSec: 0 };
    expect(tick(s, 0, 0.5, t).current).toBe(50);
    expect(tick(s, 0, 1.5, t).current).toBeCloseTo(60);
    expect(tick(tick(s, 0, 0.5, t), 0, 1, t).current).toBeCloseTo(60);
    expect(tick(s, 0, 100, t).current).toBe(100);
  });

  it('exhausts at 0 and stays exhausted until recoverFraction × max', () => {
    let s = run(initial(t), t.sprintDrainPerSec, 4);
    expect(s.current).toBeCloseTo(0);
    expect(s.exhausted).toBe(true);
    expect(canDrain(s)).toBe(false);
    s = run(s, 0, 3); // 1 s delay + 2 s × 20 = 40 < 50
    expect(s.exhausted).toBe(true);
    expect(canDrain(s)).toBe(false);
    s = run(s, 0, 0.6);
    expect(s.current).toBeGreaterThanOrEqual(50);
    expect(s.exhausted).toBe(false);
    expect(canDrain(s)).toBe(true);
  });

  it('clamps to [0, max] and ignores non-positive dt', () => {
    const s = initial(t);
    expect(tick(s, 1000, 10, t).current).toBe(0);
    expect(tick(s, 0, 10, t).current).toBe(100);
    expect(tick(s, 25, 0, t)).toBe(s);
    expect(canDrain({ current: 0, max: 100, exhausted: false, idleSec: 0 })).toBe(false);
  });

  it('is deterministic and frame-rate independent for draining', () => {
    expect(run(initial(t), 10, 2, 0.1).current).toBeCloseTo(run(initial(t), 10, 2, 0.5).current);
  });
});
