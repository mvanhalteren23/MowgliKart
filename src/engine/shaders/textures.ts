import * as THREE from 'three';
import { getFoliageAtlas, getNoiseTile, getShadowBlob, getSpriteSheet, type TerrainChunk } from '@/engine/bootstrapAssets';
import type { SpriteSheetId } from '@/types/contracts';

const canvasTextures = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();

/** Wrap a bootstrapper canvas as a cached GPU texture. `pixel` = nearest-neighbour (sprites). */
export function canvasTexture(canvas: HTMLCanvasElement, opts: { pixel?: boolean; repeat?: boolean } = {}): THREE.CanvasTexture {
  const hit = canvasTextures.get(canvas);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(canvas);
  // Gamma-space pipeline: sample raw sRGB bytes, no conversion.
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = opts.pixel ? THREE.NearestFilter : THREE.LinearFilter;
  tex.magFilter = opts.pixel ? THREE.NearestFilter : THREE.LinearFilter;
  tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  canvasTextures.set(canvas, tex);
  return tex;
}

export const spriteTexture = (id: SpriteSheetId): THREE.CanvasTexture => canvasTexture(getSpriteSheet(id).canvas, { pixel: true });
export const foliageTexture = (): THREE.CanvasTexture => canvasTexture(getFoliageAtlas().canvas, { pixel: true });
export const shadowTexture = (): THREE.CanvasTexture => canvasTexture(getShadowBlob());
export const noiseTexture = (): THREE.CanvasTexture => canvasTexture(getNoiseTile(), { repeat: true });
export const terrainTexture = (chunk: TerrainChunk): THREE.CanvasTexture => canvasTexture(chunk.colorMap);

const heightTextures = new WeakMap<TerrainChunk, THREE.DataTexture>();

/** Chunk heights packed as R8 = (h + 2) / 4, for the water shader's shoreline. v = 0 is the chunk's north (min z) edge. */
export function heightTexture(chunk: TerrainChunk): THREE.DataTexture {
  const hit = heightTextures.get(chunk);
  if (hit) return hit;
  const n = chunk.resolution;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = Math.max(0, Math.min(255, Math.round((((chunk.heights[i] ?? 0) + 2) / 4) * 255)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  heightTextures.set(chunk, tex);
  return tex;
}
