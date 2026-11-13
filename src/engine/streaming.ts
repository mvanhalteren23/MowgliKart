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
  /** 0 = authored home chunk, 1 = adjacent wilderness, 2 = far wilderness. */
  readonly tier: 0 | 1 | 2;
  readonly resolution: number;
  readonly textureSize: number;
  readonly water: boolean;
  readonly foliage: FoliageDensity;
}

/** Level of detail by Chebyshev ring around the authored chunk (the player never leaves its neighbourhood). */
export function chunkLod(cx: number, cz: number, home: { readonly cx: number; readonly cz: number } = { cx: 0, cz: 0 }): ChunkLod {
  const ring = Math.max(Math.abs(cx - home.cx), Math.abs(cz - home.cz));
  if (ring === 0) return { tier: 0, resolution: 129, textureSize: 384, water: true, foliage: 'dense' };
  if (ring === 1) return { tier: 1, resolution: 49, textureSize: 192, water: true, foliage: 'sparse' };
  return { tier: 2, resolution: 33, textureSize: 128, water: false, foliage: 'none' };
}

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
