/**
 * Streams terrain chunks: one terrain mesh per chunk, plus a water plane and an
 * instanced foliage mesh for chunks near the authored slice. Chunks are built
 * one per frame (nearest first) so streaming never stalls a frame for long.
 */
import * as THREE from 'three';
import { createBillboardGeometry, createFoliageMaterial, createTerrainMaterial, createWaterMaterial, WATER_LEVEL } from '@/engine/shaders';
import { generateTerrainChunk, getFoliageAtlas, type TerrainChunk } from '@/engine/bootstrapAssets';
import type { Vec2, WorldMapDef } from '@/types/contracts';
import { scatterFoliage, type Exclusion, type FoliageInstance } from './scatter';
import { chunkLod, diffChunks, type ChunkCoord } from './streaming';

const SKIRT_DEPTH = 4;

/**
 * Terrain mesh in world space. NOTE on uv.v: the albedo is a CanvasTexture
 * (flipY = true), so the canvas' top row (north, min z) sits at v = 1; we emit
 * v = 1 − j/(n−1) so the painting lands the right way round.
 */
export function buildTerrainGeometry(chunk: TerrainChunk): THREE.BufferGeometry {
  const n = chunk.resolution;
  const step = chunk.size / (n - 1);
  const ring = 4 * (n - 1);
  const vCount = n * n + ring;
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = chunk.originX + i * step;
      pos[k * 3 + 1] = chunk.heights[k] ?? 0;
      pos[k * 3 + 2] = chunk.originZ + j * step;
      uv[k * 2] = i / (n - 1);
      uv[k * 2 + 1] = 1 - j / (n - 1);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Skirt: border loop (clockwise seen from above) duplicated SKIRT_DEPTH below to hide LOD cracks.
  const border: number[] = [];
  for (let i = 0; i < n - 1; i++) border.push(i); // north edge, west→east
  for (let j = 0; j < n - 1; j++) border.push(j * n + n - 1); // east edge, north→south
  for (let i = n - 1; i > 0; i--) border.push((n - 1) * n + i); // south edge, east→west
  for (let j = n - 1; j > 0; j--) border.push(j * n); // west edge, south→north
  border.forEach((src, t) => {
    const k = n * n + t;
    pos[k * 3] = pos[src * 3] ?? 0;
    pos[k * 3 + 1] = (pos[src * 3 + 1] ?? 0) - SKIRT_DEPTH;
    pos[k * 3 + 2] = pos[src * 3 + 2] ?? 0;
    uv[k * 2] = uv[src * 2] ?? 0;
    uv[k * 2 + 1] = uv[src * 2 + 1] ?? 0;
  });
  for (let t = 0; t < ring; t++) {
    const a = border[t] ?? 0;
    const b = border[(t + 1) % ring] ?? 0;
    const sa = n * n + t;
    const sb = n * n + ((t + 1) % ring);
    idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa); // both windings: skirts are seen from either side
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Flat water quad covering the chunk; uv (0,0) at the north-west corner (matches the height texture). */
export function buildWaterGeometry(chunk: TerrainChunk): THREE.BufferGeometry {
  const x0 = chunk.originX;
  const z0 = chunk.originZ;
  const x1 = x0 + chunk.size;
  const z1 = z0 + chunk.size;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, WATER_LEVEL, z0, x1, WATER_LEVEL, z0, x1, WATER_LEVEL, z1, x0, WATER_LEVEL, z1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeBoundingSphere();
  return g;
}

export function buildFoliageMesh(instances: readonly FoliageInstance[], material: THREE.Material): THREE.InstancedMesh | null {
  if (instances.length === 0) return null;
  const atlas = getFoliageAtlas();
  const geo = createBillboardGeometry();
  const n = instances.length;
  const uvRect = new Float32Array(n * 4);
  const params = new Float32Array(n * 4);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  const m = new THREE.Matrix4();
  instances.forEach((f, i) => {
    const r = atlas.rects[f.kind];
    uvRect.set(r.uv, i * 4);
    params.set([r.sway, f.phase, f.variation, 0], i * 4);
    m.makeScale(r.width * f.scale, r.height * f.scale, 1);
    m.setPosition(f.x, f.y - 0.05, f.z);
    mesh.setMatrixAt(i, m);
  });
  geo.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'foliage';
  return mesh;
}

interface LoadedChunk {
  readonly coord: ChunkCoord;
  readonly group: THREE.Group;
  readonly disposables: readonly { dispose(): void }[];
}

export class TerrainLayer {
  readonly root = new THREE.Group();
  private readonly loaded = new Map<string, LoadedChunk>();
  private queue: ChunkCoord[] = [];
  private readonly foliageMaterial = createFoliageMaterial();
  private lastDiffAt = { x: Infinity, z: Infinity };

  constructor(
    private readonly world: WorldMapDef,
    private readonly exclusions: () => readonly Exclusion[],
  ) {
    this.root.name = 'terrain';
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Re-diff when the player moved > 10 m; build at most `budget` chunks this frame. */
  update(player: Vec2, budget = 1): void {
    if (Math.hypot(player.x - this.lastDiffAt.x, player.z - this.lastDiffAt.z) > 10) {
      this.lastDiffAt = { x: player.x, z: player.z };
      const diff = diffChunks(this.loaded.keys(), player);
      for (const key of diff.unload) this.unload(key);
      this.queue = diff.load.slice();
    }
    for (let i = 0; i < budget; i++) {
      const next = this.queue.shift();
      if (!next) break;
      if (!this.loaded.has(next.key)) this.load(next);
    }
  }

  /** Build every queued chunk now (used at boot / tests). */
  flush(player: Vec2): void {
    this.update(player, 0);
    while (this.queue.length > 0) this.update(player, 8);
  }

  private load(coord: ChunkCoord): void {
    const lod = chunkLod(coord.cx, coord.cz);
    const chunk = generateTerrainChunk(this.world, coord.cx, coord.cz, lod.resolution, lod.textureSize);
    const group = new THREE.Group();
    group.name = `chunk ${coord.key}`;
    const disposables: { dispose(): void }[] = [];

    const tGeo = buildTerrainGeometry(chunk);
    const tMat = createTerrainMaterial(chunk);
    const terrain = new THREE.Mesh(tGeo, tMat);
    terrain.name = 'terrain';
    group.add(terrain);
    disposables.push(tGeo, tMat);

    if (lod.water && chunk.hasWater) {
      const wGeo = buildWaterGeometry(chunk);
      const wMat = createWaterMaterial(chunk);
      const water = new THREE.Mesh(wGeo, wMat);
      water.name = 'water';
      water.renderOrder = 1;
      group.add(water);
      disposables.push(wGeo, wMat);
    }

    if (lod.foliage !== 'none') {
      const instances = scatterFoliage(this.world, coord.cx, coord.cz, { density: lod.foliage, exclusions: this.exclusions() });
      const fol = buildFoliageMesh(instances, this.foliageMaterial);
      if (fol) {
        group.add(fol);
        disposables.push(fol.geometry);
      }
    }
    this.root.add(group);
    this.loaded.set(coord.key, { coord, group, disposables });
  }

  private unload(key: string): void {
    const c = this.loaded.get(key);
    if (!c) return;
    this.root.remove(c.group);
    for (const d of c.disposables) d.dispose();
    this.loaded.delete(key);
  }

  dispose(): void {
    for (const key of [...this.loaded.keys()]) this.unload(key);
    this.foliageMaterial.dispose();
  }
}
