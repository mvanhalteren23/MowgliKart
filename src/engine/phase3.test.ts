import { describe, expect, it } from 'vitest';
import type { MountDef, StaminaTuning } from '@/types/contracts';
import { cuesFromEvents } from './combatStaging';
import { hazardEnvelope } from './hazardLayer';
import { HitStopClock, shakeOffset } from './hitStop';
import { distanceToSegment, instancesNearStage } from './scatter';
import { approach, findLanding, flightTuning, landingDistance, lerpFraming, locomotion, mountFraming, riderVariantId, startAutopilot, stepAutopilot, type AutopilotState } from './travel';
import { OVERWORLD_FRAMING } from './cameraRig';

const tuning: StaminaTuning = { max: 100, regenPerSec: 22, regenDelaySec: 0.8, sprintDrainPerSec: 14, sprintSpeedMultiplier: 1.6, recoverFraction: 0.35 };
const base = { unlockWhen: { all: [] }, unlockText: '', iconAssetId: 'i', description: '', name: 'm' } as unknown as Pick<MountDef, 'unlockWhen' | 'unlockText' | 'iconAssetId' | 'description' | 'name'>;
const drake: MountDef = { ...base, id: 'mount.drakeFlight', kind: 'flight', hero: 'kael', speed: 22, boostSpeed: 34, staminaDrainPerSec: 2, boostDrainPerSec: 14, ignoresCollision: true, altitude: 14, camera: { distance: 48, pitchDeg: 52, lookHeight: 12 }, assetId: 'mount_drake_flight_rider_kael_01' };
const strider: MountDef = { ...base, id: 'mount.thornbackStrider', kind: 'beast', speed: 11, boostSpeed: 16, staminaDrainPerSec: 0, boostDrainPerSec: 15, ignoresCollision: false, altitude: 1.6, camera: { distance: 38, pitchDeg: 33, lookHeight: 2 }, assetId: 'mount_thornback_strider_01' };

describe('stamina-driven speed', () => {
  const foot = { baseSpeed: 5.5, stickMag: 1, sprint: false, boost: false, canDrain: true, tuning, mount: null };
  it('sprint multiplies speed and drains only while it can', () => {
    expect(locomotion(foot)).toMatchObject({ speed: 5.5, drainPerSec: 0, sprinting: false });
    expect(locomotion({ ...foot, sprint: true })).toMatchObject({ speed: 5.5 * 1.6, drainPerSec: 14, sprinting: true });
    expect(locomotion({ ...foot, sprint: true, canDrain: false })).toMatchObject({ speed: 5.5, drainPerSec: 0 });
    expect(locomotion({ ...foot, sprint: true, stickMag: 0 })).toMatchObject({ speed: 0, drainPerSec: 0 });
    expect(locomotion({ ...foot, sprint: true, terrainFactor: 0.5 }).speed).toBeCloseTo(4.4);
  });
  it('mounts use mount speed, boost and drains', () => {
    expect(locomotion({ ...foot, mount: drake })).toMatchObject({ speed: 22, drainPerSec: 2 });
    expect(locomotion({ ...foot, mount: drake, stickMag: 0 })).toMatchObject({ speed: 0, drainPerSec: 2 }); // hovering still drains
    expect(locomotion({ ...foot, mount: drake, boost: true })).toMatchObject({ speed: 34, drainPerSec: 16, boosting: true });
    expect(locomotion({ ...foot, mount: drake, boost: true, canDrain: false })).toMatchObject({ speed: 22, drainPerSec: 2, boosting: false });
    expect(locomotion({ ...foot, mount: strider, stickMag: 0.5 })).toMatchObject({ speed: 5.5, drainPerSec: 0 });
    expect(locomotion({ ...foot, mount: strider, boost: true })).toMatchObject({ speed: 16, drainPerSec: 15 });
  });
});

describe('camera spring-arm', () => {
  it('blends overworld → mount framing', () => {
    const f = mountFraming(drake);
    expect(f.pitch).toBeCloseTo((52 * Math.PI) / 180);
    expect(lerpFraming(OVERWORLD_FRAMING, f, 0)).toEqual(OVERWORLD_FRAMING);
    expect(lerpFraming(OVERWORLD_FRAMING, f, 1).distance).toBe(48);
    expect(lerpFraming(OVERWORLD_FRAMING, f, 0.5).lookHeight).toBeCloseTo((1 + 12) / 2);
  });
});

function fly(s: AutopilotState, steps: number, dt: number, empty = (_i: number) => false): { s: AutopilotState; trace: AutopilotState[] } {
  const t = flightTuning(drake);
  const trace: AutopilotState[] = [];
  for (let i = 0; i < steps && s.phase !== 'done'; i++) {
    s = stepAutopilot(s, dt, { tuning: t, staminaEmpty: empty(i), stickMag: 0 });
    trace.push(s);
  }
  return { s, trace };
}

describe('flight autopilot', () => {
  it('takes off, cruises at altitude along a straight path and lands on the target', () => {
    const start = startAutopilot({ x: 0, z: 0 }, 0, { x: 300, z: 400 });
    const { s, trace } = fly(start, 5000, 1 / 30);
    expect(s).toMatchObject({ phase: 'done', result: 'arrived', alt: 0 });
    expect(s.x).toBeCloseTo(300, 3);
    expect(s.z).toBeCloseTo(400, 3);
    // straight great-path: every point on the line z = 4/3 x
    for (const p of trace) expect(Math.abs(p.z * 3 - p.x * 4)).toBeLessThan(1e-6);
    const phases = [...new Set(trace.map((p) => p.phase))];
    expect(phases).toEqual(['takeoff', 'cruise', 'landing', 'done']);
    expect(Math.max(...trace.map((p) => p.alt))).toBeCloseTo(14, 5);
    // smooth climb: never more than climbRate × dt per step
    const t = flightTuning(drake);
    for (let i = 1; i < trace.length; i++) expect(Math.abs((trace[i]?.alt ?? 0) - (trace[i - 1]?.alt ?? 0))).toBeLessThanOrEqual(t.climbRate * 2 * (1 / 30) + 1e-9);
    const cruise = trace.filter((p) => p.phase === 'cruise');
    expect(cruise.every((p) => Math.abs(p.alt - 14) < 1e-6)).toBe(true);
    expect(landingDistance(t)).toBeGreaterThan(10);
  });

  it('glides down and lands exhausted when stamina empties mid-flight', () => {
    const start = startAutopilot({ x: 0, z: 0 }, 0, { x: 2000, z: 0 });
    const { s, trace } = fly(start, 20000, 1 / 30, (i) => i > 120);
    expect(s).toMatchObject({ phase: 'done', result: 'exhausted', alt: 0 });
    expect(s.x).toBeLessThan(2000);
    const glide = trace.filter((p) => p.phase === 'glide');
    expect(glide.length).toBeGreaterThan(0);
    for (let i = 1; i < glide.length; i++) expect((glide[i]?.alt ?? 0) <= (glide[i - 1]?.alt ?? 0)).toBe(true);
  });

  it('stick input cancels; the clamp keeps it on the continent', () => {
    const s = stepAutopilot(startAutopilot({ x: 0, z: 0 }, 5, { x: 100, z: 0 }), 0.1, { tuning: flightTuning(drake), staminaEmpty: false, stickMag: 0.5 });
    expect(s).toMatchObject({ phase: 'done', result: 'cancelled' });
    const clamped = stepAutopilot(startAutopilot({ x: 0, z: 0 }, 14, { x: 1000, z: 0 }), 1, { tuning: flightTuning(drake), staminaEmpty: false, stickMag: 0, clamp: (x, z) => ({ x: Math.min(x, 3), z }) });
    expect(clamped.x).toBe(3);
  });

  it('touchdown search and altitude approach', () => {
    expect(findLanding(0, 0, () => true)).toEqual({ x: 0, z: 0 });
    const spot = findLanding(0, 0, (x) => x > 5);
    expect(spot && spot.x > 5).toBe(true);
    expect(findLanding(0, 0, () => false, 5)).toBeNull();
    expect(approach(0, 10, 4, 0.5)).toBe(2);
    expect(approach(10, 0, 4, 10)).toBe(0);
    expect(riderVariantId('mount_thornback_strider_01', 'vesna')).toBe('mount_thornback_strider_rider_vesna_01');
    expect(riderVariantId('mount_drake_flight_rider_kael_01', 'tobin')).toBe('mount_drake_flight_rider_tobin_01');
  });
});

describe('hit-stop', () => {
  it('freezes for ms, extends but never shortens, and reports partial frames', () => {
    const c = new HitStopClock();
    c.trigger(10, 120);
    expect(c.frozen(10)).toBe(true);
    expect(c.frozen(10.119)).toBe(true);
    expect(c.frozen(10.12)).toBe(false);
    expect(c.effectiveDt(10.05, 0.016)).toBe(0);
    expect(c.effectiveDt(10.13, 0.016)).toBeCloseTo(0.01, 6); // (10.114, 10.13] minus frozen (10.114, 10.12]
    expect(c.effectiveDt(10.2, 0.016)).toBeCloseTo(0.016, 9);
    c.trigger(10.05, 10); // shorter: keeps the 10.12 end
    expect(c.remaining(10.1)).toBeCloseTo(0.02, 6);
    expect(c.shake(10)).toBeGreaterThan(c.shake(10.1));
    expect(c.shake(11)).toBe(0);
    expect(shakeOffset(1, 0)).toEqual({ x: 0, y: 0 });
    expect(Math.abs(shakeOffset(1, 0.07).x)).toBeLessThanOrEqual(0.07);
  });

  it('hitStop events become cues aligned with their hit', () => {
    const cues = cuesFromEvents([
      { type: 'attack', actorId: 'hero:kael', targetId: 'enemy:0:x', element: 'fire' },
      { type: 'damage', targetId: 'enemy:0:x', amount: 10, element: 'fire', crit: false, affinity: 'neutral', absorbedByArmor: 0 },
      { type: 'hitStop', targetId: 'enemy:0:x', ms: 90 },
    ]);
    const hit = cues.find((c) => c.kind === 'hit');
    const stop = cues.find((c) => c.kind === 'hitStop');
    expect(stop).toMatchObject({ amount: 90, actorId: 'enemy:0:x' });
    expect(stop?.delay).toBe(hit?.delay);
  });
});

describe('combat foliage exclusion', () => {
  it('hides instances within the radius of the stage line only', () => {
    const xs = [0, 10, 25, 50, 10];
    const zs = [0, 11, 5, 0, 13];
    const hidden = instancesNearStage(xs, zs, { ax: 0, az: 0, bx: 20, bz: 0, radius: 12 });
    expect(hidden).toEqual([0, 1, 2]);
    expect(distanceToSegment(30, 0, 0, 0, 20, 0)).toBe(10);
    expect(distanceToSegment(5, 3, 5, 0, 5, 0)).toBe(3);
  });
});

describe('hazard FX envelope', () => {
  it('grows in, pulses on tick and fades out on expire', () => {
    expect(hazardEnvelope(0, 9, null).opacity).toBe(0);
    expect(hazardEnvelope(1, 9, null)).toEqual({ scale: 1, opacity: 1 });
    expect(hazardEnvelope(1, 0.175, null).scale).toBeGreaterThan(1);
    expect(hazardEnvelope(1, 9, 0.25).opacity).toBeCloseTo(0.5);
    expect(hazardEnvelope(1, 9, 1).opacity).toBe(0);
  });
});

import { baseMountId, mountSheetCandidates } from './travel';
describe('mount sheet fallback', () => {
  it('falls back from a rider composite to the bare mount sheet', () => {
    expect(baseMountId('mount_drake_flight_rider_kael_01')).toBe('mount_drake_flight_01');
    expect(baseMountId('mount_drake_flight_01')).toBe('mount_drake_flight_01');
    expect(mountSheetCandidates('mount_drake_flight_rider_kael_01', 'tobin')).toEqual([
      'mount_drake_flight_rider_tobin_01',
      'mount_drake_flight_rider_kael_01',
      'mount_drake_flight_01',
    ]);
    expect(mountSheetCandidates('mount_thornback_strider_01', 'vesna')).toEqual(['mount_thornback_strider_rider_vesna_01', 'mount_thornback_strider_01']);
  });
});

