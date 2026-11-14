/**
 * Biome look-up tables + pure placement math (three-free):
 *  - foliage profiles (what grows where, how densely),
 *  - atmosphere palettes (fog / sky) with spatial + temporal blending,
 *  - deterministic dressing scatter for each authored chunk's `scatterProps`.
 */
import { hashString, pathDistance, sampleHeight, seededRandom, WATER_LEVEL, type FoliageKind } from '@/engine/bootstrapAssets';
import { CHUNK_SIZE, type BiomeChunkDef, type BiomeId, type PropDef, type WorldMapDef } from '@/types/contracts';
import { PROP_CLEARANCE, type PropInstance } from './props';
import type { Exclusion } from './scatter';

/* ── Foliage ─────────────────────────────────────────────────────────────── */

export interface FoliageProfile {
  /** Multiplier on the tree chance in forest patches. */
  readonly trees: number;
  /** 0..1 share of trees that are pines. */
  readonly pineShare: number;
  readonly bushes: number;
  readonly rocks: number;
  readonly grass: number;
  readonly flowers: number;
  /** Reeds on dry land (marsh) in addition to the shoreline reeds. */
  readonly reeds: number;
}

export const FOLIAGE_PROFILES: Readonly<Record<BiomeId, FoliageProfile>> = {
  frontier: { trees: 1, pineShare: 0.15, bushes: 1, rocks: 1, grass: 1, flowers: 1, reeds: 0 },
  coast: { trees: 0.45, pineShare: 0.1, bushes: 0.8, rocks: 1.2, grass: 0.8, flowers: 0.6, reeds: 0.05 },
  forest: { trees: 1.6, pineShare: 0.3, bushes: 1.4, rocks: 0.6, grass: 1, flowers: 0.7, reeds: 0 },
  highland: { trees: 0.7, pineShare: 0.85, bushes: 0.6, rocks: 2.2, grass: 0.8, flowers: 0.5, reeds: 0 },
  marsh: { trees: 0.5, pineShare: 0, bushes: 1.1, rocks: 0.2, grass: 0.7, flowers: 0.3, reeds: 0.45 },
  desert: { trees: 0.05, pineShare: 0, bushes: 0.25, rocks: 1.8, grass: 0.12, flowers: 0.05, reeds: 0 },
  tundra: { trees: 0.6, pineShare: 1, bushes: 0.2, rocks: 1.6, grass: 0.25, flowers: 0, reeds: 0 },
  volcanic: { trees: 0.04, pineShare: 0.5, bushes: 0.1, rocks: 2.6, grass: 0.08, flowers: 0, reeds: 0 },
  skyreach: { trees: 0.5, pineShare: 0.6, bushes: 0.8, rocks: 1.4, grass: 0.9, flowers: 1.3, reeds: 0 },
  ruin: { trees: 0.7, pineShare: 0.2, bushes: 1.3, rocks: 1.4, grass: 0.9, flowers: 0.5, reeds: 0 },
};

/** Foliage density for any point: the authored chunk's `foliageDensity`, else a thinner wilderness default. */
export function foliageDensityFor(chunk: BiomeChunkDef | undefined): number {
  return chunk ? Math.max(0, Math.min(1, chunk.foliageDensity)) : 0.6;
}

/** Big-cell pick for a roll in 0..1 (null = nothing grows here). Pure for tests. */
export function pickBigFoliage(profile: FoliageProfile, roll: number, pineRoll: number, forest: number, town: number, density: number, high: boolean): FoliageKind | null {
  const treeBase = forest > 0.55 ? 0.75 : forest > 0.45 ? 0.25 : 0.06;
  const tree = Math.min(0.9, treeBase * profile.trees) * (1 - town * 0.9) * density;
  if (roll < tree) return pineRoll < (high ? Math.max(profile.pineShare, 0.7) : profile.pineShare) ? 'pine' : 'tree';
  const bush = 0.12 * profile.bushes * (1 - town * 0.5) * density;
  if (roll < tree + bush) return 'bush';
  const rock = (high ? 0.14 : 0.04) * profile.rocks * Math.max(0.4, density);
  if (roll < tree + bush + rock) return 'rock';
  return null;
}

/** Small-cell pick (grass / flowers / dry-land reeds). */
export function pickSmallFoliage(profile: FoliageProfile, roll: number, town: number, density: number): FoliageKind | null {
  const reed = profile.reeds * density;
  if (roll < reed) return 'reed';
  const grass = 0.6 * profile.grass * (1 - town * 0.55) * density;
  if (roll < reed + grass) return 'grass';
  if (roll < reed + grass + 0.09 * profile.flowers * density) return 'flower';
  return null;
}

/* ── Atmosphere ──────────────────────────────────────────────────────────── */

export type Rgb = readonly [number, number, number];

export interface Atmosphere {
  readonly fog: Rgb;
  readonly skyTop: Rgb;
  readonly skyHorizon: Rgb;
}

const hex = (h: string): Rgb => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const atmo = (fog: string, skyTop: string, skyHorizon: string): Atmosphere => ({ fog: hex(fog), skyTop: hex(skyTop), skyHorizon: hex(skyHorizon) });

export const BIOME_ATMOSPHERE: Readonly<Record<BiomeId, Atmosphere>> = {
  frontier: atmo('#c9d6e8', '#6fa4d8', '#f3e3c4'),
  coast: atmo('#cfe2ec', '#5ea9e2', '#eef4ee'),
  forest: atmo('#aec6b2', '#6a9cc4', '#e0e8c6'),
  highland: atmo('#c6cdd9', '#7c9dcb', '#e9e3d6'),
  marsh: atmo('#a3b39a', '#7a9288', '#cdd2b0'),
  desert: atmo('#ead3a6', '#77a5d8', '#f7dcac'),
  tundra: atmo('#e1e9f3', '#9db9da', '#f3f7fb'),
  volcanic: atmo('#8f6c60', '#4b3a46', '#de8c5a'),
  skyreach: atmo('#e6eefb', '#88b8f2', '#fcf4ff'),
  ruin: atmo('#bab2c2', '#6e7aa2', '#e3d1c8'),
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function lerpAtmosphere(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  return { fog: lerpRgb(a.fog, b.fog, t), skyTop: lerpRgb(a.skyTop, b.skyTop, t), skyHorizon: lerpRgb(a.skyHorizon, b.skyHorizon, t) };
}

/** Radius (m) of the spatial blend: atmospheres cross-fade over ~2× this around a biome border. */
export const ATMOSPHERE_BLEND_RADIUS = 45;

/**
 * Spatially blended atmosphere at a point: the biome under it, softened by
 * four samples on a ring so palettes cross-fade over a band, not at a line.
 */
export function atmosphereAt(biomeOf: (x: number, z: number) => BiomeId, x: number, z: number, radius: number = ATMOSPHERE_BLEND_RADIUS): Atmosphere {
  const samples: readonly (readonly [number, number, number])[] = [
    [0, 0, 2],
    [radius, 0, 1],
    [-radius, 0, 1],
    [0, radius, 1],
    [0, -radius, 1],
  ];
  const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let wsum = 0;
  for (const [dx, dz, w] of samples) {
    const a = BIOME_ATMOSPHERE[biomeOf(x + dx, z + dz)];
    const parts: readonly Rgb[] = [a.fog, a.skyTop, a.skyHorizon];
    parts.forEach((rgb, p) => {
      for (let i = 0; i < 3; i++) acc[p * 3 + i] = (acc[p * 3 + i] ?? 0) + (rgb[i] ?? 0) * w;
    });
    wsum += w;
  }
  const at = (p: number): Rgb => [(acc[p * 3] ?? 0) / wsum, (acc[p * 3 + 1] ?? 0) / wsum, (acc[p * 3 + 2] ?? 0) / wsum];
  return { fog: at(0), skyTop: at(1), skyHorizon: at(2) };
}

/** Frame-rate independent temporal damping toward `target`. */
export function dampAtmosphere(current: Atmosphere, target: Atmosphere, dt: number, lambda = 1.6): Atmosphere {
  return lerpAtmosphere(current, target, 1 - Math.exp(-lambda * Math.max(0, dt)));
}

/* ── Dressing scatter ────────────────────────────────────────────────────── */

type DressKind = PropDef['kind'];

/** Instances of each scatter kind per chunk (before density). */
export const DRESS_COUNT: Readonly<Record<DressKind, number>> = {
  house: 5, chapel: 1, arena: 0, dock: 0, stall: 3, well: 1, sign: 3, lantern: 6, fence: 6, ruin: 6, campfire: 3, shrine: 2,
  tent: 6, windmill: 3, tower: 2, fortWall: 4, gateArch: 2, bridge: 0, cactus: 28, iceSpire: 18, mangrove: 22, basalt: 20,
  crystal: 16, obelisk: 5, cathedral: 1, stiltHouse: 6, skyPlatform: 5, statue: 4,
};

/** Kinds that stand in (or right at) shallow water. */
const WET_KINDS: ReadonlySet<DressKind> = new Set<DressKind>(['mangrove', 'stiltHouse', 'dock']);

/** Ground-height window a dressing prop may stand in. */
export function dressHeightOk(kind: DressKind, h: number): boolean {
  if (WET_KINDS.has(kind)) return h > WATER_LEVEL - 0.6 && h < 1.6;
  return h > WATER_LEVEL + 0.45;
}

export interface DressOptions {
  readonly exclusions?: readonly Exclusion[];
  /** Keep this far (m) from path edges in addition to the prop's own clearance. */
  readonly pathPad?: number;
  /** Override instance counts (tests). */
  readonly countScale?: number;
}

const EDGE = 6;

/**
 * Deterministic per-chunk scatter of the chunk's `scatterProps` kinds, avoiding
 * paths, deep water, exclusion circles (props, gates, NPCs…) and each other.
 */
export function scatterDressing(world: WorldMapDef, chunk: BiomeChunkDef, opts: DressOptions = {}): PropInstance[] {
  const out: PropInstance[] = [];
  const ex = opts.exclusions ?? [];
  const rnd = seededRandom(hashString(`dress:${world.seed}:${chunk.cx}:${chunk.cz}`));
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;
  const scale = (opts.countScale ?? 1) * (0.55 + 0.45 * Math.max(0, Math.min(1, chunk.foliageDensity + 0.3)));
  const pathPad = opts.pathPad ?? 1.5;
  const kinds = [...new Set(chunk.scatterProps)];
  for (const kind of kinds) {
    const want = Math.round(DRESS_COUNT[kind] * scale);
    const clear = PROP_CLEARANCE[kind];
    let placed = 0;
    for (let attempt = 0; attempt < want * 14 && placed < want; attempt++) {
      const x = ox + EDGE + rnd() * (CHUNK_SIZE - EDGE * 2);
      const z = oz + EDGE + rnd() * (CHUNK_SIZE - EDGE * 2);
      const rot = rnd() * Math.PI * 2;
      const s = 0.8 + rnd() * 0.45;
      const r = clear * s;
      if (!dressHeightOk(kind, sampleHeight(world, x, z))) continue;
      if (pathDistance(world, x, z) < r + pathPad) continue;
      let hit = false;
      for (const e of ex) if (Math.hypot(x - e.x, z - e.z) < e.r + r) { hit = true; break; }
      if (hit) continue;
      for (const o of out) if (Math.hypot(x - o.x, z - o.z) < (PROP_CLEARANCE[o.kind] * o.scale + r) * 0.7) { hit = true; break; }
      if (hit) continue;
      out.push({ kind, x, z, rotation: rot, scale: s });
      placed++;
    }
  }
  return out;
}
