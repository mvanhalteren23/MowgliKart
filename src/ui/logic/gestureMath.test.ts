import { describe, expect, it } from 'vitest';
import {
  CRANK_IDLE,
  DEFAULT_AIM,
  DEFAULT_CRANK,
  aimAngleFromDrag,
  aimFromDrag,
  castLabel,
  classifyAimRelease,
  crankDirection,
  crankHolding,
  crankStart,
  crankStep,
  crankVelocityAt,
  flickQuality,
  powerCurve,
  windRelation,
  worldAngleToCss,
  wrapAngle,
  type CrankState,
  type GesturePoint,
} from './gestureMath';

const close = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('wrapAngle', () => {
  it('wraps into (−π, π]', () => {
    close(wrapAngle(3 * Math.PI), Math.PI);
    close(wrapAngle(-Math.PI), Math.PI);
    close(wrapAngle(-3 * Math.PI / 2), Math.PI / 2);
    close(wrapAngle(0.5), 0.5);
    expect(wrapAngle(Number.NaN)).toBe(0);
  });
});

describe('aim angle convention (pull-back slingshot, camera faces north)', () => {
  it('shoots opposite the drag in world atan2(dz, dx)', () => {
    // drag left (−x) → shot east (+x) → 0
    close(aimAngleFromDrag(-50, 0), 0);
    // drag down on screen (+y = +z) → shot north (−z) → −π/2
    close(aimAngleFromDrag(0, 50), -Math.PI / 2);
    // drag up → shot south (+z) → π/2
    close(aimAngleFromDrag(0, -50), Math.PI / 2);
    // drag right → shot west → π
    close(Math.abs(aimAngleFromDrag(50, 0)), Math.PI);
    // matches atan2(-dy, -dx)
    close(aimAngleFromDrag(13, -7), Math.atan2(7, -13));
    expect(aimAngleFromDrag(0, 0)).toBe(0);
  });

  it('maps world angles to CSS rotation from screen-up', () => {
    close(worldAngleToCss(-Math.PI / 2), 0); // north = up
    close(worldAngleToCss(0), Math.PI / 2); // east = right (90° clockwise)
  });
});

describe('aim power', () => {
  it('power curve is monotonic ease-out from 0 to 1', () => {
    expect(powerCurve(0)).toBe(0);
    expect(powerCurve(1)).toBe(1);
    expect(powerCurve(2)).toBe(1);
    expect(powerCurve(-1)).toBe(0);
    expect(powerCurve(0.5)).toBeCloseTo(0.75);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = powerCurve(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('drag length → draw/power, clamped, zero inside the cancel zone', () => {
    const inZone = aimFromDrag(5, 5);
    expect(inZone.inCancelZone).toBe(true);
    expect(inZone.power).toBe(0);
    const full = aimFromDrag(0, 500);
    expect(full.draw).toBe(1);
    expect(full.power).toBe(1);
    const mid = aimFromDrag(0, DEFAULT_AIM.cancelPx + (DEFAULT_AIM.maxDrawPx - DEFAULT_AIM.cancelPx) / 2);
    expect(mid.draw).toBeCloseTo(0.5);
    expect(mid.power).toBeCloseTo(0.75);
    expect(mid.inCancelZone).toBe(false);
  });
});

describe('aim release classification', () => {
  it('short tap fires plain, drag-back cancels, a held drag fires', () => {
    expect(classifyAimRelease(4, 4, 120)).toBe('tap');
    expect(classifyAimRelease(4, 4, 900)).toBe('cancel'); // long press without drawing
    expect(classifyAimRelease(80, 6, 600)).toBe('cancel'); // dragged back to origin
    expect(classifyAimRelease(80, 70, 600)).toBe('fire');
  });
});

describe('wind relative to the aim', () => {
  it('flags tailwind (scent carries toward the quarry)', () => {
    expect(windRelation(0, 0.1, 3).relation).toBe('tailwind');
    expect(windRelation(0, Math.PI, 3).relation).toBe('headwind');
    expect(windRelation(0, Math.PI / 2, 3).relation).toBe('crosswind');
    expect(windRelation(0, 0, 0.1).relation).toBe('calm');
    // wrap-around: aim just below +π, wind just above −π are aligned
    expect(windRelation(Math.PI - 0.05, -Math.PI + 0.05, 2).relation).toBe('tailwind');
  });
});

const path = (pts: readonly [number, number, number][]): GesturePoint[] => pts.map(([x, y, t]) => ({ x, y, t }));

describe('flick quality', () => {
  it('rejects non-upward or too-short flicks', () => {
    expect(flickQuality([]).valid).toBe(false);
    expect(flickQuality(path([[0, 0, 0], [0, 100, 100]])).valid).toBe(false);
    expect(flickQuality(path([[0, 0, 0], [0, -10, 50]])).valid).toBe(false);
  });

  it('a fast straight upward flick is near-perfect', () => {
    const r = flickQuality(path([[0, 200, 0], [0, 150, 30], [0, 80, 60], [0, 0, 100]]));
    expect(r.valid).toBe(true);
    expect(r.straightness).toBeCloseTo(1);
    expect(r.quality).toBeGreaterThan(0.92);
    expect(r.label).toBe('Perfect');
  });

  it('slow and crooked flicks score lower', () => {
    const fast = flickQuality(path([[0, 200, 0], [0, 100, 50], [0, 0, 100]]));
    const slow = flickQuality(path([[0, 200, 0], [0, 100, 600], [0, 0, 1200]]));
    const crooked = flickQuality(path([[0, 200, 0], [80, 120, 40], [-60, 60, 70], [40, 0, 100]]));
    const diagonal = flickQuality(path([[0, 200, 0], [100, 100, 50], [200, 0, 100]]));
    expect(slow.quality).toBeLessThan(fast.quality);
    expect(crooked.quality).toBeLessThan(fast.quality);
    expect(crooked.straightness).toBeLessThan(0.7);
    expect(diagonal.straightness).toBeCloseTo(Math.SQRT1_2, 2);
    for (const r of [fast, slow, crooked, diagonal]) {
      expect(r.quality).toBeGreaterThanOrEqual(0);
      expect(r.quality).toBeLessThanOrEqual(1);
    }
  });

  it('labels quality bands', () => {
    expect(castLabel(0.1)).toBe('Flop');
    expect(castLabel(0.3)).toBe('Fair');
    expect(castLabel(0.6)).toBe('Good');
    expect(castLabel(0.8)).toBe('Great');
    expect(castLabel(0.95)).toBe('Perfect');
  });
});

/** Feed a circular drag: `steps` samples, `dTheta` rad each, every `dt` ms, starting at angle a0. */
function spin(state: CrankState, a0: number, dTheta: number, steps: number, dt: number, t0: number, r = 60): { state: CrankState; t: number } {
  let s = state;
  let t = t0;
  for (let i = 1; i <= steps; i++) {
    t += dt;
    const a = a0 + dTheta * i;
    s = crankStep(s, Math.cos(a) * r, Math.sin(a) * r, t);
  }
  return { state: s, t };
}

describe('crank angular velocity', () => {
  it('measures clockwise rotation as positive rad/s', () => {
    const start = crankStart(60, 0, 0);
    const { state, t } = spin(start, 0, 0.2, 40, 16, 0); // 0.2 rad / 16 ms = 12.5 rad/s
    expect(state.velocity).toBeGreaterThan(11);
    expect(state.velocity).toBeLessThan(13);
    expect(crankDirection(state.velocity)).toBe('cw');
    expect(crankHolding(state, t)).toBe(true);
    expect(state.total).toBeCloseTo(8, 5);
    expect(state.moved).toBe(true);
  });

  it('handles the ±π wrap-around without spikes', () => {
    // Start just above +π (screen-left) and keep going clockwise across the seam.
    const a0 = Math.PI - 0.3;
    const start = crankStart(Math.cos(a0) * 60, Math.sin(a0) * 60, 0);
    const { state } = spin(start, a0, 0.1, 30, 16, 0); // 6.25 rad/s across the seam (and once more round)
    expect(state.velocity).toBeGreaterThan(5);
    expect(state.velocity).toBeLessThan(7);
    expect(state.total).toBeCloseTo(3, 5);
  });

  it('counter-clockwise is negative and still counts as holding', () => {
    const start = crankStart(60, 0, 0);
    const { state, t } = spin(start, 0, -0.15, 30, 16, 0);
    expect(state.velocity).toBeLessThan(-8);
    expect(crankDirection(state.velocity)).toBe('ccw');
    expect(crankHolding(state, t)).toBe(true);
  });

  it('slow cranking is below the hold threshold and idle time decays velocity', () => {
    const start = crankStart(60, 0, 0);
    const slow = spin(start, 0, 0.03, 30, 16, 0); // ~1.9 rad/s
    expect(crankHolding(slow.state, slow.t)).toBe(false);
    const fast = spin(start, 0, 0.2, 30, 16, 0);
    expect(crankHolding(fast.state, fast.t)).toBe(true);
    expect(Math.abs(crankVelocityAt(fast.state, fast.t + 1000))).toBeLessThan(DEFAULT_CRANK.holdThreshold);
    expect(crankHolding(fast.state, fast.t + 1000)).toBe(false);
  });

  it('ignores touches at the centre (no angle) and never divides by zero', () => {
    const s = crankStart(2, 2, 0);
    expect(s.angle).toBeNull();
    const s2 = crankStep(s, 60, 0, 10);
    expect(s2.angle).toBeCloseTo(0);
    expect(s2.velocity).toBe(0);
    const same = crankStep(s2, 0, 60, 10); // dt = 0
    expect(Number.isFinite(same.velocity)).toBe(true);
    expect(crankStep(CRANK_IDLE, 1, 1, 5).angle).toBeNull();
  });
});
