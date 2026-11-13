/**
 * Deterministic foliage scatter per chunk (pure, three-free — uses only the
 * bootstrapper's analytic terrain sampling, which is safe in node).
 */
import { fbm, hashString, pathDistance, sampleHeight, seededRandom, WATER_LEVEL, type FoliageKind } from '@/engine/bootstrapAssets';
import { CHUNK_SIZE, type WorldMapDef } from '@/types/contracts';
import { distanceToPlayable, type FoliageDensity } from './streaming';

export interface FoliageInstance {
  readonly kind: FoliageKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Uniform size multiplier on the atlas card size. */
  readonly scale: number;
  readonly phase: number;
  /** −1..1 tint variation. */
  readonly variation: number;
}

export interface Exclusion {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface ScatterOptions {
  readonly density: FoliageDensity;
  /** Circles kept clear (props, plots, spawn point…). */
  readonly exclusions?: readonly Exclusion[];
}

const SMALL_CELL = 4;
const BIG_CELL = 9;

function excluded(ex: readonly Exclusion[], x: number, z: number, pad: number): boolean {
  for (const e of ex) if (Math.hypot(x - e.x, z - e.z) < e.r + pad) return true;
  return false;
}

/** 0..1: how "settled" a point is (1 at a region centre). */
function settled(world: WorldMapDef, x: number, z: number): number {
  let s = 0;
  for (const r of world.regions) {
    const d = Math.hypot(x - r.center.x, z - r.center.z);
    if (d < r.radius) s = Math.max(s, 1 - d / r.radius);
  }
  return s;
}

export function scatterFoliage(world: WorldMapDef, cx: number, cz: number, opts: ScatterOptions): FoliageInstance[] {
  const out: FoliageInstance[] = [];
  if (opts.density === 'none') return out;
  const ex = opts.exclusions ?? [];
  const rnd = seededRandom(hashString(`foliage:${world.seed}:${cx}:${cz}`));
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const seed = world.seed | 0;

  const push = (kind: FoliageKind, x: number, y: number, z: number, scale: number): void => {
    out.push({ kind, x, y, z, scale, phase: rnd() * Math.PI * 2, variation: rnd() * 2 - 1 });
  };

  // Big cells: trees, pines, bushes, rocks.
  const bigN = Math.floor(CHUNK_SIZE / BIG_CELL);
  for (let j = 0; j < bigN; j++) {
    for (let i = 0; i < bigN; i++) {
      const x = ox + (i + rnd()) * BIG_CELL;
      const z = oz + (j + rnd()) * BIG_CELL;
      const roll = rnd();
      const sizeRoll = rnd();
      const h = sampleHeight(world, x, z);
      if (h < WATER_LEVEL + 0.35) continue;
      const pd = pathDistance(world, x, z);
      if (pd < 3.5) continue;
      if (excluded(ex, x, z, 3)) continue;
      const town = settled(world, x, z);
      const forest = fbm(x / 60, z / 60, seed + 404, 3);
      const treeChance = (forest > 0.55 ? 0.75 : forest > 0.45 ? 0.25 : 0.06) * (1 - town * 0.9);
      if (roll < treeChance) {
        const pine = h > 4.5 || fbm(x / 35, z / 35, seed + 9, 2) > 0.6;
        push(pine ? 'pine' : 'tree', x, h, z, 0.8 + sizeRoll * 0.45);
      } else if (roll < treeChance + 0.12 * (1 - town * 0.5)) {
        push('bush', x, h, z, 0.75 + sizeRoll * 0.5);
      } else if (roll < treeChance + 0.12 + (h > 5 ? 0.14 : 0.04)) {
        push('rock', x, h, z, 0.6 + sizeRoll * 0.9);
      }
    }
  }

  // Small cells: grass tufts, flowers, reeds. Sparse chunks only get detail near the playable area.
  const smallN = Math.floor(CHUNK_SIZE / SMALL_CELL);
  for (let j = 0; j < smallN; j++) {
    for (let i = 0; i < smallN; i++) {
      const x = ox + (i + rnd()) * SMALL_CELL;
      const z = oz + (j + rnd()) * SMALL_CELL;
      const roll = rnd();
      const sizeRoll = rnd();
      if (opts.density === 'sparse') {
        const d = distanceToPlayable(x, z);
        if (d > 70 || rnd() < d / 70) continue;
      }
      const h = sampleHeight(world, x, z);
      if (h < WATER_LEVEL + 0.05) {
        if (h > WATER_LEVEL - 0.45 && roll < 0.35 && !excluded(ex, x, z, 1)) push('reed', x, Math.max(h, WATER_LEVEL - 0.25), z, 0.8 + sizeRoll * 0.4);
        continue;
      }
      if (pathDistance(world, x, z) < 0.8) continue;
      if (excluded(ex, x, z, 0.5)) continue;
      const town = settled(world, x, z);
      if (h < WATER_LEVEL + 0.5 && roll < 0.2) {
        push('reed', x, h, z, 0.7 + sizeRoll * 0.4);
        continue;
      }
      const grassChance = 0.6 * (1 - town * 0.55);
      if (roll < grassChance) push('grass', x, h, z, 0.75 + sizeRoll * 0.6);
      else if (roll < grassChance + 0.09) push('flower', x, h, z, 0.8 + sizeRoll * 0.4);
    }
  }
  return out;
}
