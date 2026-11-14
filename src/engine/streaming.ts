/**
 * Chunk streaming math (pure, three-free).
 * 250 m chunks, 500 m active radius, hysteresis on unload.
 */
import { ACTIVE_RADIUS, CHUNK_SIZE, type Vec2 } from '@/types/contracts';

export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
  readonly key: string;
}

/** Extra distance (m) beyond the active radius before a loaded chunk is dropped. */
export const STREAM_HYSTERESIS = 60;

/** The player may roam a little beyond the authored chunk (0..250) into wilderness. */
export const PLAYABLE_MIN = -60;
export const PLAYABLE_MAX = CHUNK_SIZE + 60;

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export function chunkCoord(cx: number, cz: number): ChunkCoord {
  return { cx, cz, key: chunkKey(cx, cz) };
}

export function parseChunkKey(key: string): ChunkCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const cx = Number(parts[0]);
  const cz = Number(parts[1]);
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
  return chunkCoord(cx, cz);
}

/** Chunk containing a world position. */
export function chunkOf(x: number, z: number): ChunkCoord {
  return chunkCoord(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
}

/** Distance from a point to the chunk's square footprint (0 when inside). */
export function chunkDistance(cx: number, cz: number, pos: Vec2): number {
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  const dx = Math.max(minX - pos.x, 0, pos.x - (minX + CHUNK_SIZE));
  const dz = Math.max(minZ - pos.z, 0, pos.z - (minZ + CHUNK_SIZE));
  return Math.hypot(dx, dz);
}

/** Every chunk whose footprint lies within `radius` of `pos`, nearest first. */
export function chunksInRadius(pos: Vec2, radius: number = ACTIVE_RADIUS): ChunkCoord[] {
  const span = Math.ceil(radius / CHUNK_SIZE) + 1;
  const home = chunkOf(pos.x, pos.z);
  const out: { c: ChunkCoord; d: number }[] = [];
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const cx = home.cx + dx;
      const cz = home.cz + dz;
      const d = chunkDistance(cx, cz, pos);
      if (d <= radius) out.push({ c: chunkCoord(cx, cz), d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.c.cz - b.c.cz || a.c.cx - b.c.cx);
  return out.map((o) => o.c);
}

export interface ChunkDiff {
  /** Chunks to create, nearest first. */
  readonly load: readonly ChunkCoord[];
  /** Loaded chunk keys to drop. */
  readonly unload: readonly string[];
  /** Loaded chunk keys that stay. */
  readonly keep: readonly string[];
}

/**
 * Diff the loaded set against the player position. A chunk loads once it is
 * within `radius`; a loaded chunk only unloads beyond `radius + hysteresis`.
 */
export function diffChunks(loaded: Iterable<string>, pos: Vec2, radius: number = ACTIVE_RADIUS, hysteresis: number = STREAM_HYSTERESIS): ChunkDiff {
  const loadedSet = new Set(loaded);
  const unload: string[] = [];
  const keep: string[] = [];
  for (const key of loadedSet) {
    const c = parseChunkKey(key);
    if (!c || chunkDistance(c.cx, c.cz, pos) > radius + hysteresis) unload.push(key);
    else keep.push(key);
  }
  const load = chunksInRadius(pos, radius).filter((c) => !loadedSet.has(c.key));
  return { load, unload, keep };
}

export type FoliageDensity = 'dense' | 'sparse' | 'none';

export interface ChunkLod {
  /** 0 = near ring (the player's chunk + neighbours within reach), 1 = mid ring, 2 = far. */
  readonly tier: 0 | 1 | 2;
  readonly resolution: number;
  readonly textureSize: number;
  readonly water: boolean;
  readonly foliage: FoliageDensity;
  /** Biome dressing (scatter props) is only built in the near ring. */
  readonly dressing: boolean;
}

const LODS: Readonly<Record<0 | 1 | 2, ChunkLod>> = {
  0: { tier: 0, resolution: 129, textureSize: 384, water: true, foliage: 'dense', dressing: true },
  1: { tier: 1, resolution: 49, textureSize: 192, water: true, foliage: 'sparse', dressing: false },
  2: { tier: 2, resolution: 33, textureSize: 128, water: false, foliage: 'none', dressing: false },
};

export function lodForTier(tier: 0 | 1 | 2): ChunkLod {
  return LODS[tier];
}

/** Distance (m) to a chunk footprint below which it is promoted to the near ring. */
export const NEAR_RING = 70;
/** Distance (m) below which a chunk is in the mid ring. */
export const MID_RING = 260;
/** Extra distance before a chunk is demoted again (prevents rebuild ping-pong at a border). */
export const LOD_HYSTERESIS = 30;

/**
 * Level of detail for a chunk from the player's distance to its footprint, with
 * hysteresis against the tier it currently has (`current`, undefined = new chunk).
 */
export function chunkTier(cx: number, cz: number, pos: Vec2, current?: 0 | 1 | 2): 0 | 1 | 2 {
  const d = chunkDistance(cx, cz, pos);
  const pad = (tier: 0 | 1 | 2, limit: number): number => (current !== undefined && current <= tier ? limit + LOD_HYSTERESIS : limit);
  if (d <= pad(0, NEAR_RING)) return 0;
  if (d <= pad(1, MID_RING)) return 1;
  return 2;
}

/** Back-compat helper: LOD by Chebyshev ring around a reference chunk. */
export function chunkLod(cx: number, cz: number, home: { readonly cx: number; readonly cz: number } = { cx: 0, cz: 0 }): ChunkLod {
  const ring = Math.max(Math.abs(cx - home.cx), Math.abs(cz - home.cz));
  return LODS[ring === 0 ? 0 : ring === 1 ? 1 : 2];
}

/* ── Continental bounds ──────────────────────────────────────────────────── */

export interface ChunkRef {
  readonly cx: number;
  readonly cz: number;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Margin (m) the clamp box extends past the authored chunks' bounding box. */
export const CONTINENT_MARGIN = 40;
/** How far (m) past an authored chunk edge the player may wander into wilderness. */
export const SOFT_WALL = 40;

const DEFAULT_CHUNK: readonly ChunkRef[] = [{ cx: 0, cz: 0 }];

/** Bounding box of the authored chunks plus `margin`. Empty list ⇒ the (0,0) slice. */
export function continentBounds(chunks: readonly ChunkRef[], margin: number = CONTINENT_MARGIN): Bounds {
  const list = chunks.length > 0 ? chunks : DEFAULT_CHUNK;
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;
  for (const c of list) {
    minCx = Math.min(minCx, c.cx);
    maxCx = Math.max(maxCx, c.cx);
    minCz = Math.min(minCz, c.cz);
    maxCz = Math.max(maxCz, c.cz);
  }
  return { minX: minCx * CHUNK_SIZE - margin, maxX: (maxCx + 1) * CHUNK_SIZE + margin, minZ: minCz * CHUNK_SIZE - margin, maxZ: (maxCz + 1) * CHUNK_SIZE + margin };
}

export function clampToBounds(x: number, z: number, b: Bounds): { x: number; z: number } {
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), z: Math.min(b.maxZ, Math.max(b.minZ, z)) };
}

export function insideBounds(x: number, z: number, b: Bounds): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

/** Distance (m) from a point to the nearest authored chunk footprint (0 inside one). */
export function distanceToChunks(chunks: readonly ChunkRef[], x: number, z: number): number {
  const list = chunks.length > 0 ? chunks : DEFAULT_CHUNK;
  let best = Infinity;
  for (const c of list) {
    const d = chunkDistance(c.cx, c.cz, { x, z });
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Soft wall into unauthored wilderness: a step is allowed while the target is
 * within `wall` of an authored chunk, or when it does not take the player any
 * deeper (so someone pushed outside can always walk back).
 */
export function softWallAllows(chunks: readonly ChunkRef[], fromX: number, fromZ: number, toX: number, toZ: number, wall: number = SOFT_WALL): boolean {
  const to = distanceToChunks(chunks, toX, toZ);
  if (to <= wall) return true;
  return to <= distanceToChunks(chunks, fromX, fromZ) + 1e-6;
}

/** Continental movement gate: inside the clamp box and the soft wall. */
export function continentAllows(chunks: readonly ChunkRef[], bounds: Bounds, fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  return insideBounds(toX, toZ, bounds) && softWallAllows(chunks, fromX, fromZ, toX, toZ);
}

/** Pull a point (e.g. a saved/teleported position) back onto the playable continent. */
export function clampToContinent(chunks: readonly ChunkRef[], x: number, z: number, margin: number = CONTINENT_MARGIN): { x: number; z: number } {
  const b = clampToBounds(x, z, continentBounds(chunks, margin));
  if (distanceToChunks(chunks, b.x, b.z) <= SOFT_WALL) return b;
  // Outside the soft wall (a notch of the bounding box): snap to the nearest authored chunk edge + wall.
  const list = chunks.length > 0 ? chunks : DEFAULT_CHUNK;
  let best = { x: b.x, z: b.z, d: Infinity };
  for (const c of list) {
    const x0 = c.cx * CHUNK_SIZE - SOFT_WALL * 0.5;
    const z0 = c.cz * CHUNK_SIZE - SOFT_WALL * 0.5;
    const px = Math.min(x0 + CHUNK_SIZE + SOFT_WALL, Math.max(x0, b.x));
    const pz = Math.min(z0 + CHUNK_SIZE + SOFT_WALL, Math.max(z0, b.z));
    const d = Math.hypot(px - b.x, pz - b.z);
    if (d < best.d) best = { x: px, z: pz, d };
  }
  return { x: best.x, z: best.z };
}

/** @deprecated single-chunk slice bounds; use `continentBounds`. */
export function clampToPlayable(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(PLAYABLE_MAX, Math.max(PLAYABLE_MIN, x)),
    z: Math.min(PLAYABLE_MAX, Math.max(PLAYABLE_MIN, z)),
  };
}

/** Distance from a point to the playable rectangle (0 inside). */
export function distanceToPlayable(x: number, z: number): number {
  const dx = Math.max(PLAYABLE_MIN - x, 0, x - PLAYABLE_MAX);
  const dz = Math.max(PLAYABLE_MIN - z, 0, z - PLAYABLE_MAX);
  return Math.hypot(dx, dz);
}
