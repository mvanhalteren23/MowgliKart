import { CHUNK_SIZE } from '@/types/contracts';
import type { Vec2, WorldMapDef } from '@/types/contracts';

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

export function inWater(p: Vec2, water: WorldMapDef['water'], margin = 0): boolean {
  return water.some((w) => dist(p, w.center) < w.radius + margin);
}

/** Keep a point inside the chunk (with a small margin) and push it out of any water body. */
export function constrain(p: Vec2, water: WorldMapDef['water'], margin = 1): Vec2 {
  let x = p.x;
  let z = p.z;
  for (let pass = 0; pass < 3; pass++) {
    for (const w of water) {
      const dx = x - w.center.x;
      const dz = z - w.center.z;
      const d = Math.hypot(dx, dz);
      const min = w.radius + margin;
      if (d < min) {
        if (d < 1e-6) {
          x = w.center.x - min;
        } else {
          x = w.center.x + (dx / d) * min;
          z = w.center.z + (dz / d) * min;
        }
      }
    }
    x = Math.min(CHUNK_SIZE - margin, Math.max(margin, x));
    z = Math.min(CHUNK_SIZE - margin, Math.max(margin, z));
  }
  return { x, z };
}
