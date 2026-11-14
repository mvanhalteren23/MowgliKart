import { describe, expect, it } from 'vitest';
import type { BiomeChunkDef, RegionDef } from '@/types/contracts';
import { BIOME_FILL, chunkBounds, chunkTiles, waypointPins, worldToMap } from './travelMap';

const chunk = (cx: number, cz: number): BiomeChunkDef => ({ cx, cz, name: `C${cx},${cz}`, biome: 'frontier', act: 1, scatterProps: [], foliageDensity: 1 });
const region = (id: string, x: number, z: number): RegionDef => ({ id, name: id.toUpperCase(), biome: 'frontier', center: { x, z }, radius: 20, occupied: false, blurb: '' });

describe('travel map layout', () => {
  it('computes chunk grid bounds', () => {
    const b = chunkBounds([chunk(0, 0), chunk(-1, 0), chunk(1, 2)]);
    expect([b.minCx, b.maxCx, b.minCz, b.maxCz]).toEqual([-1, 1, 0, 2]);
    expect([b.cols, b.rows]).toEqual([3, 3]);
    expect([b.minX, b.minZ, b.width, b.height]).toEqual([-250, 0, 750, 750]);
  });
  it('defaults to the home chunk when nothing is authored', () => {
    const b = chunkBounds([]);
    expect([b.cols, b.rows, b.minX, b.width]).toEqual([1, 1, 0, 250]);
  });
  it('places tiles on a 1-based grid', () => {
    const b = chunkBounds([chunk(-1, 0), chunk(1, 1)]);
    const tiles = chunkTiles([chunk(-1, 0), chunk(1, 1)], b);
    expect(tiles.map((t) => [t.col, t.row])).toEqual([
      [1, 1],
      [3, 2],
    ]);
  });
  it('maps world points to percentages, clamped', () => {
    const b = chunkBounds([chunk(0, 0), chunk(1, 0)]);
    expect(worldToMap(250, 125, b)).toEqual({ left: 50, top: 50, inside: true });
    const out = worldToMap(-100, 900, b);
    expect(out).toEqual({ left: 0, top: 100, inside: false });
  });
  it('only places discovered waypoints', () => {
    const b = chunkBounds([chunk(0, 0)]);
    const pins = waypointPins([region('a', 25, 25), region('b', 200, 100)], new Set(['b']), b);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.regionId).toBe('b');
    expect(pins[0]?.point.left).toBeCloseTo(80);
    expect(pins[0]?.point.top).toBeCloseTo(40);
  });
  it('has a fill for every biome', () => {
    expect(Object.keys(BIOME_FILL)).toHaveLength(10);
  });
});
