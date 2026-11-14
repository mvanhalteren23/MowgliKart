/**
 * Mounts, sprint and fast-travel autopilot math (pure, three-free).
 */
import type { MountDef, StaminaTuning, Vec2 } from '@/types/contracts';
import type { Framing } from './cameraRig';

/* ── Locomotion speed + stamina drain ─────────────────────────────────────── */

export interface LocomotionInput {
  readonly baseSpeed: number;
  /** Deadzoned stick magnitude 0..1. */
  readonly stickMag: number;
  readonly sprint: boolean;
  readonly boost: boolean;
  /** `core.stamina.canDrain(runtime.stamina)` — gates voluntary drains. */
  readonly canDrain: boolean;
  readonly tuning: StaminaTuning;
  readonly mount: MountDef | null;
  /** True while a flight mount is airborne (drains even while hovering). */
  readonly airborne?: boolean;
  /** Shallow-water factor on foot (1 = dry). */
  readonly terrainFactor?: number;
}

export interface Locomotion {
  readonly speed: number;
  readonly drainPerSec: number;
  readonly sprinting: boolean;
  readonly boosting: boolean;
}

/**
 * On foot: sprint multiplies speed by `sprintSpeedMultiplier` and drains `sprintDrainPerSec`
 * while `canDrain`. Mounted: the mount's speed (boost → `boostSpeed` + `boostDrainPerSec` while
 * `canDrain`); `staminaDrainPerSec` applies while flying or while a beast is moving.
 * An exhausted beast falls back to `baseSpeed` and stops draining so the pool can refill.
 */
export function locomotion(i: LocomotionInput): Locomotion {
  const mag = Math.max(0, Math.min(1, i.stickMag));
  const moving = mag > 0;
  const m = i.mount;
  if (!m) {
    const sprinting = i.sprint && moving && i.canDrain;
    const mult = sprinting ? i.tuning.sprintSpeedMultiplier : 1;
    return { speed: i.baseSpeed * mag * mult * (i.terrainFactor ?? 1), drainPerSec: sprinting ? i.tuning.sprintDrainPerSec : 0, sprinting, boosting: false };
  }
  if (m.kind === 'beast' && !i.canDrain && m.staminaDrainPerSec > 0) {
    return { speed: i.baseSpeed * mag, drainPerSec: 0, sprinting: false, boosting: false };
  }
  const boosting = i.boost && moving && i.canDrain;
  const speed = (boosting ? m.boostSpeed : m.speed) * mag;
  const active = m.kind === 'flight' ? (i.airborne ?? true) : moving;
  const drainPerSec = (active ? m.staminaDrainPerSec : 0) + (boosting ? m.boostDrainPerSec : 0);
  return { speed, drainPerSec, sprinting: false, boosting };
}

/* ── Camera spring-arm ────────────────────────────────────────────────────── */

export function mountFraming(m: MountDef): Framing {
  return { pitch: (m.camera.pitchDeg * Math.PI) / 180, distance: m.camera.distance, lookHeight: m.camera.lookHeight };
}

export function lerpFraming(a: Framing, b: Framing, t: number): Framing {
  const k = Math.min(1, Math.max(0, t));
  return { pitch: a.pitch + (b.pitch - a.pitch) * k, distance: a.distance + (b.distance - a.distance) * k, lookHeight: a.lookHeight + (b.lookHeight - a.lookHeight) * k };
}

/* ── Altitude ─────────────────────────────────────────────────────────────── */

/** Move `current` toward `target` at most `rate × dt` (smooth climbs / descents). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = Math.max(0, rate) * Math.max(0, dt);
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

/* ── Autopilot ────────────────────────────────────────────────────────────── */

export type AutopilotPhase = 'takeoff' | 'cruise' | 'landing' | 'glide' | 'done';
export type AutopilotResult = 'arrived' | 'exhausted' | 'cancelled';

export interface AutopilotState {
  readonly phase: AutopilotPhase;
  readonly x: number;
  readonly z: number;
  /** Height of the rider above the ground (m). */
  readonly alt: number;
  readonly target: Vec2;
  /** Heading of travel (atan2(dz, dx)). */
  readonly heading: number;
  /** Seconds spent in the current phase (drives one-shot animations). */
  readonly phaseTime: number;
  readonly result: AutopilotResult | null;
}

export interface FlightTuning {
  readonly speed: number;
  readonly altitude: number;
  /** Climb / controlled-descent rate (m/s). */
  readonly climbRate: number;
  /** Sink rate while gliding down exhausted (m/s). */
  readonly sinkRate: number;
  /** Horizontal speed factor while taking off. */
  readonly takeoffSpeedFactor: number;
  /** Horizontal speed factor while gliding exhausted. */
  readonly glideSpeedFactor: number;
}

export function flightTuning(m: Pick<MountDef, 'speed' | 'altitude'>): FlightTuning {
  return { speed: m.speed, altitude: m.altitude, climbRate: Math.max(4, m.altitude / 2), sinkRate: Math.max(2.5, m.altitude / 5), takeoffSpeedFactor: 0.3, glideSpeedFactor: 0.55 };
}

/** Horizontal distance over which a cruise descends to land exactly on the target. */
export function landingDistance(t: FlightTuning): number {
  return Math.max(10, (t.altitude / t.climbRate) * t.speed * 0.6);
}

/** Arrival tolerance (m). */
export const ARRIVE_EPSILON = 0.35;

export function startAutopilot(from: Vec2, alt: number, target: Vec2): AutopilotState {
  const heading = Math.atan2(target.z - from.z, target.x - from.x);
  return { phase: 'takeoff', x: from.x, z: from.z, alt: Math.max(0, alt), target: { x: target.x, z: target.z }, heading: Number.isFinite(heading) ? heading : 0, phaseTime: 0, result: null };
}

export interface AutopilotContext {
  readonly tuning: FlightTuning;
  /** Stamina pool is empty (forced drain ran it dry). */
  readonly staminaEmpty: boolean;
  /** Deadzoned stick magnitude — any input cancels. */
  readonly stickMag: number;
  /** Keeps the path inside the continent clamp. */
  readonly clamp?: (x: number, z: number) => { x: number; z: number };
}

function stepToward(x: number, z: number, tx: number, tz: number, step: number): { x: number; z: number; d: number } {
  const dx = tx - x;
  const dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d <= step || d < 1e-9) return { x: tx, z: tz, d: 0 };
  return { x: x + (dx / d) * step, z: z + (dz / d) * step, d: d - step };
}

/**
 * One autopilot step along the straight great-path to the target:
 * takeoff (climb, slow) → cruise (full speed at altitude) → landing (ease speed + altitude
 * down so the touchdown lands on the target) → done 'arrived'. An empty pool switches to
 * a glide (forward, sinking) that ends in 'exhausted' on touchdown; stick input → 'cancelled'.
 */
export function stepAutopilot(s: AutopilotState, dt: number, ctx: AutopilotContext): AutopilotState {
  if (s.phase === 'done') return s;
  if (ctx.stickMag > 0) return { ...s, phase: 'done', result: 'cancelled', phaseTime: 0 };
  const t = ctx.tuning;
  const land = landingDistance(t);
  const dist = Math.hypot(s.target.x - s.x, s.target.z - s.z);
  const heading = dist > 1e-6 ? Math.atan2(s.target.z - s.z, s.target.x - s.x) : s.heading;
  const clamp = ctx.clamp ?? ((x: number, z: number) => ({ x, z }));
  const next = (phase: AutopilotPhase, x: number, z: number, alt: number, result: AutopilotResult | null = null): AutopilotState => {
    const c = clamp(x, z);
    return { phase, x: c.x, z: c.z, alt: Math.max(0, alt), target: s.target, heading, phaseTime: phase === s.phase ? s.phaseTime + dt : 0, result };
  };

  let phase: AutopilotPhase = s.phase;
  if (ctx.staminaEmpty && phase !== 'glide') phase = 'glide';
  if (phase === 'cruise' && dist <= land) phase = 'landing';

  switch (phase) {
    case 'takeoff': {
      const alt = approach(s.alt, t.altitude, t.climbRate, dt);
      const p = stepToward(s.x, s.z, s.target.x, s.target.z, t.speed * t.takeoffSpeedFactor * dt);
      if (p.d <= ARRIVE_EPSILON && dist <= land) return next('landing', p.x, p.z, alt);
      return next(alt >= t.altitude - 1e-3 ? 'cruise' : 'takeoff', p.x, p.z, alt);
    }
    case 'cruise': {
      const p = stepToward(s.x, s.z, s.target.x, s.target.z, t.speed * dt);
      return next(p.d <= land ? 'landing' : 'cruise', p.x, p.z, approach(s.alt, t.altitude, t.climbRate, dt));
    }
    case 'landing': {
      const speed = Math.max(2, t.speed * Math.min(1, dist / land));
      const p = stepToward(s.x, s.z, s.target.x, s.target.z, speed * dt);
      const glidePath = t.altitude * Math.min(1, p.d / land);
      const alt = approach(s.alt, glidePath, t.climbRate * 2, dt);
      if (p.d <= ARRIVE_EPSILON) {
        // Hover-settle onto the exact target point.
        const touch = approach(s.alt, 0, t.climbRate * 2, dt);
        return touch <= 0.02 ? next('done', s.target.x, s.target.z, 0, 'arrived') : next('landing', s.target.x, s.target.z, touch);
      }
      return next('landing', p.x, p.z, alt);
    }
    case 'glide': {
      const alt = approach(s.alt, 0, t.sinkRate, dt);
      const p = stepToward(s.x, s.z, s.target.x, s.target.z, t.speed * t.glideSpeedFactor * dt);
      if (alt <= 0.02) return next('done', p.x, p.z, 0, p.d <= ARRIVE_EPSILON ? 'arrived' : 'exhausted');
      return next('glide', p.x, p.z, alt);
    }
    default:
      return s;
  }
}

/* ── Touchdown ────────────────────────────────────────────────────────────── */

/** Nearest standable point on a spiral around (x, z), up to `maxRadius` (null when none). */
export function findLanding(x: number, z: number, canStand: (x: number, z: number) => boolean, maxRadius = 40, step = 1.5): Vec2 | null {
  if (canStand(x, z)) return { x, z };
  for (let r = step; r <= maxRadius; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (canStand(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Rider-variant asset id: `mount_x_01` / `mount_x_rider_kael_01` → `mount_x_rider_<hero>_01`. */
export function riderVariantId(assetId: string, heroId: string): string {
  if (/_rider_[a-z0-9]+_\d+$/i.test(assetId)) return assetId.replace(/_rider_[a-z0-9]+_(\d+)$/i, `_rider_${heroId}_$1`);
  return /_\d+$/.test(assetId) ? assetId.replace(/_(\d+)$/, `_rider_${heroId}_$1`) : `${assetId}_rider_${heroId}`;
}

export const isRiderSheet = (assetId: string): boolean => /_rider_/i.test(assetId);

/** The bare mount sheet for a rider composite id (`mount_x_rider_kael_01` → `mount_x_01`); unchanged otherwise. */
export const baseMountId = (assetId: string): string => assetId.replace(/_rider_[a-z0-9]+(_\d+)$/i, '$1');

/** Sheets to try, best first: the leader's rider composite, the mount's own asset, then the bare mount sheet. */
export function mountSheetCandidates(assetId: string, leader: string): string[] {
  return [...new Set([riderVariantId(assetId, leader), assetId, baseMountId(assetId)])];
}
