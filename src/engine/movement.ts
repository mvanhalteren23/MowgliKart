/**
 * Player movement + collision (pure, three-free).
 */
import { cameraToWorld } from './spriteMath';

export const WALK_SPEED = 5.5;
export const SHALLOW_SPEED_FACTOR = 0.55;
export const STICK_DEADZONE = 0.12;
export const BODY_RADIUS = 0.35;

export type Collider =
  | { readonly kind: 'circle'; readonly x: number; readonly z: number; readonly r: number }
  | { readonly kind: 'box'; readonly x: number; readonly z: number; readonly hx: number; readonly hz: number; readonly rot: number };

/**
 * Analog stick (moveX right, moveY up = −1) → camera-relative world direction
 * plus magnitude (0..1, deadzoned and rescaled).
 */
export function stickToWorld(moveX: number, moveY: number, cameraYaw: number): { x: number; z: number; mag: number } {
  const raw = Math.hypot(moveX, moveY);
  if (raw < STICK_DEADZONE) return { x: 0, z: 0, mag: 0 };
  const mag = Math.min(1, (raw - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  const w = cameraToWorld(moveX / raw, moveY / raw, cameraYaw);
  return { x: w.x, z: w.z, mag };
}

/** True when a body of `radius` at (x, z) overlaps the collider. */
export function hitsCollider(c: Collider, x: number, z: number, radius: number = BODY_RADIUS): boolean {
  if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + radius;
  const dx = x - c.x;
  const dz = z - c.z;
  const cos = Math.cos(-c.rot);
  const sin = Math.sin(-c.rot);
  // world → box local (inverse of the y-rotation used to place the prop)
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;
  const qx = Math.max(Math.abs(lx) - c.hx, 0);
  const qz = Math.max(Math.abs(lz) - c.hz, 0);
  return Math.hypot(qx, qz) < radius;
}

export function blockedByColliders(colliders: readonly Collider[], x: number, z: number, radius: number = BODY_RADIUS): boolean {
  for (const c of colliders) if (hitsCollider(c, x, z, radius)) return true;
  return false;
}

/**
 * Attempt a move with axis sliding: full step, then x-only, then z-only.
 * `canStand(x, z)` decides walkability (deep water, props, bounds…).
 */
export function resolveMove(fromX: number, fromZ: number, dx: number, dz: number, canStand: (x: number, z: number) => boolean): { x: number; z: number; blocked: boolean } {
  if (canStand(fromX + dx, fromZ + dz)) return { x: fromX + dx, z: fromZ + dz, blocked: false };
  if (dx !== 0 && canStand(fromX + dx, fromZ)) return { x: fromX + dx, z: fromZ, blocked: true };
  if (dz !== 0 && canStand(fromX, fromZ + dz)) return { x: fromX, z: fromZ + dz, blocked: true };
  return { x: fromX, z: fromZ, blocked: true };
}
