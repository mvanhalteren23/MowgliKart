/**
 * Deterministic foliage scatter per chunk (pure, three-free — uses only the
 * bootstrapper's analytic terrain sampling, which is safe in node).
 */
import { biomeAt, chunkAt, fbm, hashString, pathDistance, sampleHeight, seededRandom, WATER_LEVEL, type FoliageKind } from '@/engine/bootstrapAssets';
import { CHUNK_SIZE, type WorldMapDef } from '@/types/contracts';
import { FOLIAGE_PROFILES, foliageDensityFor, pickBigFoliage, pickSmallFoliage } from './biomes';
import type { FoliageDensity } from './streaming';

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
  const chunkDensity = foliageDensityFor(chunkAt(world, ox + CHUNK_SIZE / 2, oz + CHUNK_SIZE / 2));

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
      const pineRoll = rnd();
      const h = sampleHeight(world, x, z);
      if (h < WATER_LEVEL + 0.35) continue;
      if (pathDistance(world, x, z) < 3.5) continue;
      if (excluded(ex, x, z, 3)) continue;
      const profile = FOLIAGE_PROFILES[biomeAt(world, x, z)];
      const kind = pickBigFoliage(profile, roll, pineRoll, fbm(x / 60, z / 60, seed + 404, 3), settled(world, x, z), chunkDensity, h > 4.5);
      if (!kind) continue;
      const base = kind === 'rock' ? 0.6 + sizeRoll * 0.9 : kind === 'bush' ? 0.75 + sizeRoll * 0.5 : 0.8 + sizeRoll * 0.45;
      push(kind, x, h, z, base);
    }
  }

  // Small cells: grass tufts, flowers, reeds. Sparse (mid-ring) chunks keep ~15 % of the detail.
  const smallN = Math.floor(CHUNK_SIZE / SMALL_CELL);
  for (let j = 0; j < smallN; j++) {
    for (let i = 0; i < smallN; i++) {
      const x = ox + (i + rnd()) * SMALL_CELL;
      const z = oz + (j + rnd()) * SMALL_CELL;
      const roll = rnd();
      const sizeRoll = rnd();
      const keep = rnd();
      if (opts.density === 'sparse' && keep > 0.15) continue;
      const h = sampleHeight(world, x, z);
      if (h < WATER_LEVEL + 0.05) {
        if (h > WATER_LEVEL - 0.45 && roll < 0.35 && !excluded(ex, x, z, 1)) push('reed', x, Math.max(h, WATER_LEVEL - 0.25), z, 0.8 + sizeRoll * 0.4);
        continue;
      }
      if (pathDistance(world, x, z) < 0.8) continue;
      if (excluded(ex, x, z, 0.5)) continue;
      if (h < WATER_LEVEL + 0.5 && roll < 0.2) {
        push('reed', x, h, z, 0.7 + sizeRoll * 0.4);
        continue;
      }
      const kind = pickSmallFoliage(FOLIAGE_PROFILES[biomeAt(world, x, z)], roll, settled(world, x, z), chunkDensity);
      if (kind) push(kind, x, h, z, kind === 'reed' ? 0.7 + sizeRoll * 0.4 : kind === 'flower' ? 0.8 + sizeRoll * 0.4 : 0.75 + sizeRoll * 0.6);
    }
  }
  return out;
}

/** A segment (the combat stage line) foliage must clear by `radius` metres. */
export interface StageExclusion {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly radius: number;
}

/** Distance from (x, z) to the segment a→b. */
export function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

/** Indices of instances (parallel x / z arrays) within the exclusion — hidden during combat. */
export function instancesNearStage(xs: ArrayLike<number>, zs: ArrayLike<number>, ex: StageExclusion): number[] {
  const out: number[] = [];
  const n = Math.min(xs.length, zs.length);
  for (let i = 0; i < n; i++) {
    if (distanceToSegment(xs[i] ?? 0, zs[i] ?? 0, ex.ax, ex.az, ex.bx, ex.bz) <= ex.radius) out.push(i);
  }
  return out;
}
