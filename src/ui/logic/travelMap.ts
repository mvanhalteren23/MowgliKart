/** Fast-travel map layout — framework-free, unit tested. */
import { CHUNK_SIZE, type BiomeChunkDef, type BiomeId, type RegionDef } from '@/types/contracts';

export interface MapBounds {
  readonly minCx: number;
  readonly maxCx: number;
  readonly minCz: number;
  readonly maxCz: number;
  readonly cols: number;
  readonly rows: number;
  /** World-space extent in metres. */
  readonly minX: number;
  readonly minZ: number;
  readonly width: number;
  readonly height: number;
}

/** Chunk grid bounds (inclusive chunk indices). Empty input = the single home chunk (0, 0). */
export function chunkBounds(chunks: readonly Pick<BiomeChunkDef, 'cx' | 'cz'>[], chunkSize = CHUNK_SIZE): MapBounds {
  let minCx = 0;
  let maxCx = 0;
  let minCz = 0;
  let maxCz = 0;
  if (chunks.length > 0) {
    minCx = Infinity;
    maxCx = -Infinity;
    minCz = Infinity;
    maxCz = -Infinity;
    for (const c of chunks) {
      minCx = Math.min(minCx, c.cx);
      maxCx = Math.max(maxCx, c.cx);
      minCz = Math.min(minCz, c.cz);
      maxCz = Math.max(maxCz, c.cz);
    }
  }
  const cols = maxCx - minCx + 1;
  const rows = maxCz - minCz + 1;
  return { minCx, maxCx, minCz, maxCz, cols, rows, minX: minCx * chunkSize, minZ: minCz * chunkSize, width: cols * chunkSize, height: rows * chunkSize };
}

export interface MapPoint {
  /** 0..100 percentages of the map box (left / top). */
  readonly left: number;
  readonly top: number;
  readonly inside: boolean;
}

/** World (x, z) → map percentages (+z is south = down on the map). Clamped to the box. */
export function worldToMap(x: number, z: number, b: MapBounds): MapPoint {
  const u = (x - b.minX) / b.width;
  const v = (z - b.minZ) / b.height;
  const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
  const c = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n * 100)) : 0);
  return { left: c(u), top: c(v), inside };
}

export interface ChunkTile {
  readonly key: string;
  readonly cx: number;
  readonly cz: number;
  readonly name: string;
  readonly biome: BiomeId;
  /** 1-based CSS grid placement. */
  readonly col: number;
  readonly row: number;
}

export function chunkTiles(chunks: readonly BiomeChunkDef[], b: MapBounds): readonly ChunkTile[] {
  return chunks.map((c) => ({ key: `${c.cx},${c.cz}`, cx: c.cx, cz: c.cz, name: c.name, biome: c.biome, col: c.cx - b.minCx + 1, row: c.cz - b.minCz + 1 }));
}

export interface WaypointPin {
  readonly regionId: string;
  readonly name: string;
  readonly point: MapPoint;
}

/** Only discovered regions are placed; undiscovered ones never reach the DOM. */
export function waypointPins(regions: readonly RegionDef[], discovered: ReadonlySet<string>, b: MapBounds): readonly WaypointPin[] {
  return regions.filter((r) => discovered.has(r.id)).map((r) => ({ regionId: r.id, name: r.name, point: worldToMap(r.center.x, r.center.z, b) }));
}

/** Plain CSS fill per biome (layout colour, not art). */
export const BIOME_FILL: Readonly<Record<BiomeId, string>> = {
  frontier: '#5d6b3a',
  coast: '#3f6f80',
  forest: '#2f5532',
  highland: '#6d6450',
  marsh: '#4a5a44',
  desert: '#a3874f',
  tundra: '#8a9aa6',
  volcanic: '#5a2f26',
  skyreach: '#5c6f9a',
  ruin: '#4e4652',
};
