/**
 * Sprite / facing math (pure, three-free).
 *
 * Angles: world headings are radians with 0 = +x (east), π/2 = +z (south),
 * matching `WindState.direction` and `runtime.player.facing`.
 * Camera yaw ψ: 0 = camera south of its target looking north (−z).
 */
import { animColumn, frameUv } from '@/engine/bootstrapAssets';
import type { Facing8, SpriteAnim, SpriteSheetMeta } from '@/types/contracts';

export const FACING_STEP = Math.PI / 4;

/** World direction → camera frame (lx: screen right, lz: toward the camera). */
export function worldToCamera(dx: number, dz: number, yaw: number): { lx: number; lz: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** Camera frame → world direction. Inverse of `worldToCamera`. */
export function cameraToWorld(lx: number, lz: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

export const headingFromVector = (dx: number, dz: number): number => Math.atan2(dz, dx);

/**
 * Quantise a world heading into the camera-relative 8-way sheet row:
 * 0 = S (toward camera), clockwise S, SW, W, NW, N, NE, E, SE.
 */
export function facingFromHeading(heading: number, cameraYaw = 0): Facing8 {
  const { lx, lz } = worldToCamera(Math.cos(heading), Math.sin(heading), cameraYaw);
  const a = Math.atan2(-lx, lz);
  const k = Math.round(a / FACING_STEP);
  return (((k % 8) + 8) % 8) as Facing8;
}

/** UV rect (offsetX, offsetY, scaleX, scaleY) for an 8-way sheet frame at a time. */
export function spriteFrameRect(meta: SpriteSheetMeta, facing: Facing8, anim: SpriteAnim, timeSec: number): [number, number, number, number] {
  const col = animColumn(meta, anim, timeSec);
  const uv = frameUv(meta, meta.directional ? facing : 0, col);
  return [uv.offsetX, uv.offsetY, uv.scaleX, uv.scaleY];
}

/** World width (m) of a sheet's frame drawn at its world height. */
export function spriteWorldSize(meta: SpriteSheetMeta): { width: number; height: number } {
  return { width: (meta.worldHeight * meta.frameWidth) / meta.frameHeight, height: meta.worldHeight };
}

const colorCache = new Map<string, readonly [number, number, number]>();

/** '#rgb' / '#rrggbb' → 0..1 triple (gamma space, cached). Invalid → white. */
export function parseHexColor(hex: string | undefined): readonly [number, number, number] {
  if (!hex) return WHITE;
  const hit = colorCache.get(hex);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  const out: readonly [number, number, number] = Number.isNaN(n) || full.length < 6 ? WHITE : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  colorCache.set(hex, out);
  return out;
}
const WHITE: readonly [number, number, number] = [1, 1, 1];

/** Shortest signed angle difference b − a in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
