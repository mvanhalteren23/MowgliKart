/** Small HUD math helpers — framework-free, unit tested. */
import type { Vec2 } from '@/types/contracts';

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Safe ratio for bars (0 when max ≤ 0). */
export const ratio = (value: number, max: number): number => (max > 0 ? clamp01(value / max) : 0);

/**
 * Remaining cooldown as a fraction: 1 = just used, 0 = ready.
 * @param readyAt world-time second the action is ready again (from `fieldCooldowns`)
 */
export function cooldownFraction(readyAt: number | undefined, worldTime: number, cooldownSec: number): number {
  if (readyAt === undefined || cooldownSec <= 0 || readyAt <= worldTime) return 0;
  return clamp01((readyAt - worldTime) / cooldownSec);
}

/** Seconds left on a cooldown, rounded up for display (0 = ready). */
export function cooldownSecondsLeft(readyAt: number | undefined, worldTime: number): number {
  if (readyAt === undefined || readyAt <= worldTime) return 0;
  return Math.ceil(readyAt - worldTime);
}

export interface Bearing {
  /** Metres on the ground plane. */
  readonly distance: number;
  /** Radians clockwise from screen-up (north / −z). Feed straight into CSS `rotate()`. */
  readonly angle: number;
}

/**
 * Compass bearing from the player to a marker. The overworld camera looks
 * north (screen-up = −z, screen-right = +x), matching `runtime.input`.
 */
export function compassBearing(from: { readonly x: number; readonly z: number }, to: Vec2): Bearing {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const angle = distance === 0 ? 0 : Math.atan2(dx, -dz);
  return { distance, angle };
}

/** Wind blows TOWARD `direction` (0 = +x/east, π/2 = +z/south) → CSS rotation clockwise from up. */
export function windArrowAngle(direction: number): number {
  return direction + Math.PI / 2;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Clockwise-from-north angle → 8-way compass label. */
export function compassLabel(angle: number): (typeof COMPASS_POINTS)[number] {
  const tau = Math.PI * 2;
  const a = ((angle % tau) + tau) % tau;
  const idx = Math.round(a / (tau / 8)) % 8;
  return COMPASS_POINTS[idx] ?? 'N';
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 3) return 'here';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
