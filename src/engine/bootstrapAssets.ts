/**
 * Procedural canvas asset bootstrapper (lead-owned).
 *
 * Every sprite sheet, animation frame, foliage card, pattern and terrain
 * heightmap in Emberwake is generated here at runtime from code — the game has
 * zero binary asset dependencies and renders on first frame.
 *
 * This module is three.js-free: it returns canvases, typed arrays and data
 * URLs. `src/engine/shaders/textures.ts` wraps canvases into GPU textures.
 * Terrain sampling (`sampleHeight`, `terrainKindAt`) is pure math and safe in
 * node; anything returning a canvas needs a DOM.
 */
import {
  CHUNK_SIZE,
  type BiomeChunkDef,
  type BiomeId,
  type HeroId,
  type SpriteAnim,
  type SpriteSheetId,
  type SpriteSheetMeta,
  type TerrainKind,
  type Vec2,
  type WorldMapDef,
} from '@/types/contracts';

/* ════════════════════════════════════════════════════════════════════════
 * Deterministic noise
 * ════════════════════════════════════════════════════════════════════════ */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — returns a stateful generator of floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (a: number, b: number, x: number): number => smooth(clamp01((x - a) / (b - a)));

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/** Fractal value noise, ~0..1. */
export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* ════════════════════════════════════════════════════════════════════════
 * Terrain — analytic height field shared by renderer and gameplay
 * ════════════════════════════════════════════════════════════════════════ */

export const WATER_LEVEL = 0;

function distToSegment(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : clamp01(((px - a.x) * dx + (pz - a.z) * dz) / len2);
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** Signed distance to the nearest path edge (negative = on the path). */
export function pathDistance(world: WorldMapDef, x: number, z: number): number {
  let best = Infinity;
  for (const path of world.paths) {
    const half = path.width / 2;
    for (let i = 0; i + 1 < path.points.length; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      if (!a || !b) continue;
      // cheap reject
      if (Math.min(a.x, b.x) - x > 12 + half || x - Math.max(a.x, b.x) > 12 + half) continue;
      if (Math.min(a.z, b.z) - z > 12 + half || z - Math.max(a.z, b.z) > 12 + half) continue;
      const d = distToSegment(x, z, a, b) - half;
      if (d < best) best = d;
    }
  }
  return best;
}

const DEFAULT_CHUNKS: readonly BiomeChunkDef[] = [{ cx: 0, cz: 0, name: 'Frontier', biome: 'frontier', act: 1, scatterProps: [], foliageDensity: 1 }];
const chunkIndex = new WeakMap<WorldMapDef, Map<string, BiomeChunkDef>>();

function authoredChunks(world: WorldMapDef): readonly BiomeChunkDef[] {
  return world.chunks && world.chunks.length > 0 ? world.chunks : DEFAULT_CHUNKS;
}

/** The authored chunk containing (x, z), if any. */
export function chunkAt(world: WorldMapDef, x: number, z: number): BiomeChunkDef | undefined {
  let idx = chunkIndex.get(world);
  if (!idx) {
    idx = new Map(authoredChunks(world).map((c) => [`${c.cx},${c.cz}`, c]));
    chunkIndex.set(world, idx);
  }
  return idx.get(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
}

/** Distance (m) from (x, z) to the nearest authored chunk; 0 inside one. */
export function distanceToAuthored(world: WorldMapDef, x: number, z: number): number {
  let best = Infinity;
  for (const c of authoredChunks(world)) {
    const dx = Math.max(0, c.cx * CHUNK_SIZE - x, x - (c.cx + 1) * CHUNK_SIZE);
    const dz = Math.max(0, c.cz * CHUNK_SIZE - z, z - (c.cz + 1) * CHUNK_SIZE);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/** Biome at any point: the containing authored chunk, else the nearest one's (wilderness blends outward). */
export function biomeAt(world: WorldMapDef, x: number, z: number): BiomeId {
  const here = chunkAt(world, x, z);
  if (here) return here.biome;
  let best: BiomeChunkDef | undefined;
  let bestD = Infinity;
  for (const c of authoredChunks(world)) {
    const d = Math.hypot((c.cx + 0.5) * CHUNK_SIZE - x, (c.cz + 0.5) * CHUNK_SIZE - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best?.biome ?? 'frontier';
}

/** Terrain relief per biome: [base amplitude, extra rugged amplitude]. */
const BIOME_RELIEF: Readonly<Record<BiomeId, readonly [number, number]>> = {
  frontier: [3.4, 0],
  coast: [2.6, 0],
  forest: [3.8, 1.5],
  highland: [5, 7],
  marsh: [1.4, 0],
  desert: [3, 2.5],
  tundra: [4, 4],
  volcanic: [4.5, 8],
  skyreach: [5, 10],
  ruin: [3, 1.5],
};

/** Continuous ground height in metres at any world position (any chunk). */
export function sampleHeight(world: WorldMapDef, x: number, z: number): number {
  const seed = world.seed | 0;
  const biome = biomeAt(world, x, z);
  const [amp, rugged] = BIOME_RELIEF[biome];
  let h = 0.7 + fbm(x / 70, z / 70, seed, 4) * amp;
  if (rugged > 0) h += Math.pow(fbm(x / 45, z / 45, seed + 31, 3), 2) * rugged;

  // Wilderness rises into rolling highlands away from the authored continent.
  const out = distanceToAuthored(world, x, z);
  if (out > 0) h += smoothstep(10, 160, out) * (fbm(x / 110, z / 110, seed + 77, 3) * 16 - 3);

  // Settlements sit on levelled ground.
  for (const r of world.regions) {
    const d = Math.hypot(x - r.center.x, z - r.center.z);
    if (d < r.radius) h = lerp(h, 1.1, (1 - smoothstep(r.radius * 0.45, r.radius, d)) * 0.85);
  }

  // Paths cut gently into the hills.
  const pd = pathDistance(world, x, z);
  if (pd < 5) {
    const low = 0.9 + fbm(x / 140, z / 140, seed + 13, 2) * 1.6;
    h = lerp(h, low, (1 - smoothstep(0, 5, pd)) * 0.7);
  }

  // Lakes and sea carve basins below the water line.
  for (const w of world.water) {
    const d = Math.hypot(x - w.center.x, z - w.center.z);
    const edge = w.kind === 'sea' ? 10 : 6;
    if (d < w.radius + edge) {
      const wobble = (fbm(x / 9, z / 9, seed + 5, 2) - 0.5) * 3;
      h = lerp(h, -1.8, 1 - smoothstep(w.radius - edge + wobble, w.radius + edge + wobble, d));
    }
  }
  return h;
}

export function terrainKindAt(world: WorldMapDef, x: number, z: number): TerrainKind {
  const h = sampleHeight(world, x, z);
  if (h < WATER_LEVEL - 0.05) return 'water';
  if (h < 0.42) return 'sand';
  for (const p of world.props) {
    const r = p.kind === 'arena' ? 15 : p.kind === 'well' ? 8 : p.kind === 'chapel' ? 7 : 0;
    if (r > 0 && Math.hypot(x - p.position.x, z - p.position.z) < r) return 'plaza';
  }
  if (pathDistance(world, x, z) < 0) return 'path';
  if (h > 6.5) return 'rock';
  return 'grass';
}

/** True where a character can stand (shallow water allowed, deep water not). */
export function isWalkable(world: WorldMapDef, x: number, z: number): boolean {
  return sampleHeight(world, x, z) > WATER_LEVEL - 0.45;
}

export interface TerrainChunk {
  readonly cx: number;
  readonly cz: number;
  /** World-space origin (min corner) of the chunk. */
  readonly originX: number;
  readonly originZ: number;
  readonly size: number;
  /** Vertices per side; `heights` is row-major [z * resolution + x]. */
  readonly resolution: number;
  readonly heights: Float32Array;
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Painted albedo for the chunk (north = top row). */
  readonly colorMap: HTMLCanvasElement;
  readonly hasWater: boolean;
}

type Rgb = readonly [number, number, number];
const KIND_COLORS: Readonly<Record<TerrainKind, Rgb>> = {
  grass: [96, 142, 74],
  path: [176, 146, 104],
  sand: [214, 196, 146],
  water: [58, 96, 122],
  rock: [128, 122, 120],
  plaza: [164, 156, 150],
};
/** Per-biome repaint of the base kinds (ground = what "grass" means in that biome). */
const BIOME_COLORS: Readonly<Record<BiomeId, Partial<Record<TerrainKind, Rgb>>>> = {
  frontier: {},
  coast: { grass: [110, 150, 82], sand: [226, 210, 160] },
  forest: { grass: [70, 118, 62], path: [140, 112, 80] },
  highland: { grass: [118, 140, 88], rock: [140, 132, 126] },
  marsh: { grass: [92, 112, 66], path: [112, 98, 70], sand: [120, 112, 80], water: [60, 84, 70] },
  desert: { grass: [212, 178, 118], path: [190, 150, 100], rock: [176, 128, 92], sand: [226, 196, 140] },
  tundra: { grass: [226, 232, 238], path: [190, 196, 206], rock: [150, 160, 176], sand: [208, 214, 222] },
  volcanic: { grass: [72, 62, 60], path: [110, 70, 54], rock: [52, 46, 48], sand: [96, 82, 76] },
  skyreach: { grass: [150, 186, 150], path: [214, 206, 182], rock: [190, 194, 206] },
  ruin: { grass: [108, 124, 92], path: [150, 146, 138], plaza: [138, 134, 128] },
};

/** Heightmap only — pure, usable without a DOM. */
export function generateHeights(world: WorldMapDef, cx: number, cz: number, resolution: number): { heights: Float32Array; min: number; max: number } {
  const heights = new Float32Array(resolution * resolution);
  const step = CHUNK_SIZE / (resolution - 1);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const h = sampleHeight(world, cx * CHUNK_SIZE + i * step, cz * CHUNK_SIZE + j * step);
      heights[j * resolution + i] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { heights, min, max };
}

const chunkCache = new Map<string, TerrainChunk>();

/**
 * Heightmap + painterly albedo for one streaming chunk.
 * @param resolution vertices per side (e.g. 129 home chunk, 49 for far wilderness)
 * @param textureSize albedo canvas edge in px
 */
export function generateTerrainChunk(world: WorldMapDef, cx: number, cz: number, resolution = 97, textureSize = 384): TerrainChunk {
  const key = `${world.seed}:${cx}:${cz}:${resolution}:${textureSize}`;
  const cached = chunkCache.get(key);
  if (cached) return cached;

  const { heights, min, max } = generateHeights(world, cx, cz, resolution);
  const colorMap = makeCanvas(textureSize, textureSize);
  const ctx = get2d(colorMap);
  const img = ctx.createImageData(textureSize, textureSize);
  const seed = world.seed | 0;
  const texel = CHUNK_SIZE / textureSize;
  for (let py = 0; py < textureSize; py++) {
    for (let px = 0; px < textureSize; px++) {
      const wx = cx * CHUNK_SIZE + (px + 0.5) * texel;
      const wz = cz * CHUNK_SIZE + (py + 0.5) * texel;
      // Dither the classification point for ragged, hand-painted borders.
      const jx = (hash2(px, py, seed + 3) - 0.5) * 1.4;
      const jz = (hash2(py, px, seed + 4) - 0.5) * 1.4;
      const kind = terrainKindAt(world, wx + jx, wz + jz);
      const biome = biomeAt(world, wx, wz);
      const base = BIOME_COLORS[biome][kind] ?? KIND_COLORS[kind];
      const patch = fbm(wx / 18, wz / 18, seed + 21, 3);
      const grain = hash2(px, py, seed + 9);
      let r = base[0];
      let g = base[1];
      let b = base[2];
      if (kind === 'grass' && (biome === 'frontier' || biome === 'coast' || biome === 'forest' || biome === 'highland' || biome === 'ruin')) {
        // Sun-bleached meadows vs. deep clover, in broad painterly patches.
        const dry = smoothstep(0.52, 0.72, patch);
        r = lerp(r, 148, dry * 0.6);
        g = lerp(g, 160, dry * 0.5);
        b = lerp(b, 70, dry * 0.3);
        const lush = smoothstep(0.5, 0.3, patch);
        r = lerp(r, 62, lush * 0.5);
        g = lerp(g, 118, lush * 0.4);
        b = lerp(b, 70, lush * 0.4);
      }
      // Quantised shading bands keep the pixel-art read.
      const shade = 0.9 + Math.floor((patch * 0.6 + grain * 0.4) * 5) * 0.035;
      const o = (py * textureSize + px) * 4;
      img.data[o] = Math.min(255, r * shade);
      img.data[o + 1] = Math.min(255, g * shade);
      img.data[o + 2] = Math.min(255, b * shade);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const chunk: TerrainChunk = {
    cx,
    cz,
    originX: cx * CHUNK_SIZE,
    originZ: cz * CHUNK_SIZE,
    size: CHUNK_SIZE,
    resolution,
    heights,
    minHeight: min,
    maxHeight: max,
    colorMap,
    hasWater: min < WATER_LEVEL,
  };
  chunkCache.set(key, chunk);
  return chunk;
}

/* ════════════════════════════════════════════════════════════════════════
 * Canvas helpers
 * ════════════════════════════════════════════════════════════════════════ */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  const top = Math.round(cy - ry);
  const bottom = Math.round(cy + ry);
  for (let y = top; y <= bottom; y++) {
    const t = ry <= 0 ? 0 : (y - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - t * t));
    if (half < 0.4) continue;
    ctx.fillRect(Math.round(cx - half), y, Math.max(1, Math.round(half * 2)), 1);
  }
}

function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1)}`;
}

const OUTLINE: readonly [number, number, number] = [26, 18, 32];

/** 1-px dark outline + soft bottom-up shading: the pixel-art finishing pass. */
function finishSheet(canvas: HTMLCanvasElement, frameW: number, frameH: number): void {
  const ctx = get2d(canvas);
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  out.data.set(src.data);
  const alpha = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : (src.data[(y * width + x) * 4 + 3] ?? 0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (alpha(x, y) > 0) {
        // darken the lower third of each frame slightly, and right-hand edges
        const fy = (y % frameH) / frameH;
        const edge = alpha(x + 1, y) === 0 || alpha(x, y + 1) === 0;
        const k = (fy > 0.7 ? 0.9 : 1) * (edge ? 0.8 : 1);
        out.data[o] = (src.data[o] ?? 0) * k;
        out.data[o + 1] = (src.data[o + 1] ?? 0) * k;
        out.data[o + 2] = (src.data[o + 2] ?? 0) * k;
        continue;
      }
      // stay inside the frame so outlines never bleed into neighbours
      const fx = x % frameW;
      const fyy = y % frameH;
      const n =
        (fx > 0 && alpha(x - 1, y) > 0) ||
        (fx < frameW - 1 && alpha(x + 1, y) > 0) ||
        (fyy > 0 && alpha(x, y - 1) > 0) ||
        (fyy < frameH - 1 && alpha(x, y + 1) > 0);
      if (n) {
        out.data[o] = OUTLINE[0];
        out.data[o + 1] = OUTLINE[1];
        out.data[o + 2] = OUTLINE[2];
        out.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

/* ════════════════════════════════════════════════════════════════════════
 * Sprite sheets — 8 facings × 9 animation columns, drawn parametrically
 * ════════════════════════════════════════════════════════════════════════ */

/** Column layout shared by every character sheet. */
export const SHEET_COLS = 9;
export const SHEET_ROWS = 8;
const ANIMS: SpriteSheetMeta['anims'] = {
  idle: { from: 0, count: 2, fps: 2 },
  walk: { from: 2, count: 4, fps: 8 },
  action: { from: 6, count: 2, fps: 6 },
  hurt: { from: 8, count: 1, fps: 1 },
};

function colToAnim(col: number): { anim: SpriteAnim; frame: number } {
  if (col < 2) return { anim: 'idle', frame: col };
  if (col < 6) return { anim: 'walk', frame: col - 2 };
  if (col < 8) return { anim: 'action', frame: col - 6 };
  return { anim: 'hurt', frame: 0 };
}

/** Facing index (0 = S, clockwise S, SW, W, …) → lateral (−1 = screen-left) and depth (+1 = toward camera). */
function facingVector(k: number): { fx: number; fz: number } {
  const a = (k * Math.PI) / 4;
  return { fx: -Math.sin(a), fz: Math.cos(a) };
}

type Weapon = 'none' | 'sword' | 'bow' | 'glaive' | 'staff' | 'hammer' | 'dagger';
type Headwear = 'none' | 'horns' | 'hood' | 'hat' | 'band' | 'crest';

interface HumanLook {
  readonly skin: string;
  readonly hair: string;
  readonly tunic: string;
  readonly legs: string;
  readonly accent: string;
  readonly weapon: Weapon;
  readonly headwear: Headwear;
  readonly cape: string | null;
  readonly longHair: boolean;
  readonly robe: boolean;
}

const HERO_LOOKS: Readonly<Record<HeroId, HumanLook>> = {
  kael: { skin: '#e8b98f', hair: '#3b5fa8', tunic: '#c9463a', legs: '#3a3348', accent: '#f2c14e', weapon: 'sword', headwear: 'horns', cape: '#7a2230', longHair: false, robe: false },
  tobin: { skin: '#c99670', hair: '#6b4a2b', tunic: '#4f7f4a', legs: '#5a4634', accent: '#d9c27a', weapon: 'bow', headwear: 'hood', cape: '#35593a', longHair: false, robe: false },
  vesna: { skin: '#d9a47c', hair: '#e07b39', tunic: '#7d4fa0', legs: '#2e2a3d', accent: '#f0d264', weapon: 'glaive', headwear: 'band', cape: null, longHair: true, robe: false },
  orla: { skin: '#f0cbaa', hair: '#f3e9c6', tunic: '#5aa7c9', legs: '#e8e2d2', accent: '#ffffff', weapon: 'staff', headwear: 'crest', cape: '#dfe9f2', longHair: true, robe: true },
  hadrik: { skin: '#b98566', hair: '#3a3a3a', tunic: '#8d8f96', legs: '#4b4d57', accent: '#c96a3a', weapon: 'hammer', headwear: 'none', cape: null, longHair: false, robe: false },
  pim: { skin: '#e3c19a', hair: '#9bd16a', tunic: '#e0a23a', legs: '#6a5a8a', accent: '#f25f5c', weapon: 'dagger', headwear: 'hat', cape: null, longHair: false, robe: false },
  quill: { skin: '#cfa989', hair: '#22252e', tunic: '#2f3d5c', legs: '#22252e', accent: '#9ad1d4', weapon: 'staff', headwear: 'hat', cape: '#1c2740', longHair: false, robe: true },
  moss: { skin: '#8fae7a', hair: '#4d6b3a', tunic: '#6e5a3e', legs: '#4a3d2c', accent: '#d7e08a', weapon: 'none', headwear: 'crest', cape: null, longHair: true, robe: false },
  sable: { skin: '#a67c68', hair: '#f0f0f5', tunic: '#2a2230', legs: '#1c1822', accent: '#b0364f', weapon: 'dagger', headwear: 'hood', cape: '#1c1822', longHair: false, robe: false },
};

function lookFromId(id: string): HumanLook {
  const rnd = seededRandom(hashString(id));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const hue = rnd();
  const lower = id.toLowerCase();
  const covenant = /covenant|acolyte|deacon|prior|tither|inquis/.test(lower);
  const smith = /smith|forge/.test(lower);
  const carpenter = /carpent|wright|joiner/.test(lower);
  return {
    skin: pick(['#e8b98f', '#c99670', '#f0cbaa', '#a67c68', '#d9a47c']),
    hair: pick(['#3a2a20', '#6b4a2b', '#c9a15a', '#8a8d94', '#22252e', '#a5502e']),
    tunic: covenant ? '#e9e4d4' : smith ? '#5c4a44' : carpenter ? '#a9773f' : hsl(hue, 0.42, 0.46),
    legs: covenant ? '#8f8a7a' : hsl((hue + 0.5) % 1, 0.2, 0.3),
    accent: covenant ? '#8fd0e8' : hsl((hue + 0.12) % 1, 0.6, 0.62),
    weapon: covenant ? 'staff' : smith ? 'hammer' : /guard|duel|brute|thug|fighter/.test(lower) ? 'sword' : 'none',
    headwear: covenant ? 'hood' : pick<Headwear>(['none', 'none', 'hat', 'band', 'hood']),
    cape: covenant ? '#cfc8b4' : rnd() < 0.25 ? hsl(hue, 0.35, 0.3) : null,
    longHair: rnd() < 0.4,
    robe: covenant || rnd() < 0.2,
  };
}

const HUMAN_W = 32;
const HUMAN_H = 48;

function drawHuman(ctx: Ctx, ox: number, oy: number, k: number, col: number, look: HumanLook): void {
  const { fx, fz } = facingVector(k);
  const { anim, frame } = colToAnim(col);
  const side = Math.abs(fx);
  const front = fz > -0.3;
  const walk = anim === 'walk';
  const stride = walk ? ([1, 0, -1, 0][frame] ?? 0) : 0;
  const bob = anim === 'idle' ? frame : walk ? frame % 2 : 0;
  const lean = anim === 'hurt' ? -fx * 2 - (side < 0.5 ? 1 : 0) : anim === 'action' && frame === 1 ? fx * 2 : 0;
  const cx = ox + 16 + lean;
  const ground = oy + 46;
  const torsoW = Math.round(11 - 3 * side);
  const torsoTop = ground - 23 + bob;
  const torsoH = 13;
  const dark = shadeHex(look.tunic, -0.28);

  // cape behind the body when we can see the character's front
  if (look.cape && fz >= -0.1) rect(ctx, cx - torsoW / 2 - 2 - fx * 2, torsoTop + 1, torsoW + 4, torsoH + 5, look.cape);

  // legs
  for (const s of [-1, 1] as const) {
    const lx = cx + s * (1 + 2.2 * (1 - side)) + s * stride * 2.6 * fx - 1.5;
    const lift = walk ? Math.max(0, s * stride) * (1 + (1 - side)) : 0;
    if (look.robe) continue;
    rect(ctx, lx, ground - 10, 3, 10 - lift, look.legs);
    rect(ctx, lx - (fx < -0.3 ? 1 : 0), ground - 2 - lift, 3 + (side > 0.3 ? 1 : 0), 2, shadeHex(look.legs, -0.45));
  }
  if (look.robe) {
    rect(ctx, cx - torsoW / 2 - 1, ground - 11, torsoW + 2, 10, look.tunic);
    rect(ctx, cx - torsoW / 2 - 1, ground - 2, torsoW + 2, 1, look.accent);
    rect(ctx, cx - 2 + stride * fx * 2, ground - 1, 4, 1, shadeHex(look.legs, -0.4));
  }

  // far arm (behind torso on side views)
  const armSwing = walk ? -stride * 2.5 : 0;
  const armY = torsoTop + 2;
  const armLen = 9;
  const drawArm = (s: -1 | 1, raised: number, reach: number): void => {
    const ax = cx + s * (torsoW / 2 + 0.5) * (1 - side * 0.8) + s * armSwing * fx * (side > 0.3 ? 1 : 0) + reach - 1.5;
    rect(ctx, ax, armY - raised, 3, armLen - 3, shadeHex(look.tunic, -0.12));
    rect(ctx, ax, armY - raised + armLen - 3, 3, 3, look.skin);
  };
  const actRaise = anim === 'action' ? (frame === 0 ? 6 : 1) : 0;
  const actReach = anim === 'action' && frame === 1 ? fx * 3 : 0;
  // which hand is "near" the camera / holds the weapon
  const weaponSide: -1 | 1 = fx > 0.3 ? 1 : fx < -0.3 ? -1 : fz >= 0 ? -1 : 1;
  const farSide: -1 | 1 = weaponSide === 1 ? -1 : 1;
  drawArm(farSide, 0, 0);

  // torso
  rect(ctx, cx - torsoW / 2, torsoTop, torsoW, torsoH, look.tunic);
  rect(ctx, cx - torsoW / 2, torsoTop + torsoH - 3, torsoW, 2, dark);
  rect(ctx, cx - 1 + fx * 2, torsoTop + torsoH - 3, 2, 2, look.accent);
  if (front && side < 0.8) rect(ctx, cx - 1 + fx * 3, torsoTop + 1, 2, 5, look.accent);

  // cape over the back when facing away
  if (look.cape && fz < -0.1) rect(ctx, cx - torsoW / 2 - 1, torsoTop, torsoW + 2, torsoH + 5, look.cape);

  // head
  const headW = 10;
  const headH = 9;
  const hx = cx - headW / 2 + fx * 1;
  const hy = torsoTop - headH + 1;
  rect(ctx, hx, hy, headW, headH, look.skin);
  rect(ctx, hx + 1, hy + headH, headW - 2, 1, shadeHex(look.skin, -0.25));
  // hair
  if (!front) {
    rect(ctx, hx, hy, headW, headH - 1, look.hair);
  } else {
    rect(ctx, hx, hy, headW, 3, look.hair);
    if (side > 0.3) rect(ctx, fx > 0 ? hx : hx + headW - 4, hy, 4, headH - 2, look.hair);
    else {
      rect(ctx, hx, hy, 2, 6, look.hair);
      rect(ctx, hx + headW - 2, hy, 2, 6, look.hair);
    }
  }
  if (look.longHair) {
    if (!front) rect(ctx, hx + 1, hy + headH - 1, headW - 2, 7, look.hair);
    else rect(ctx, fx > 0.3 ? hx - 1 : fx < -0.3 ? hx + headW - 2 : hx - 1, hy + 3, 3, 9, look.hair);
    if (front && side < 0.3) rect(ctx, hx + headW - 2, hy + 3, 3, 9, look.hair);
  }
  // face
  if (front) {
    const eyeY = hy + 5;
    const ec = hx + headW / 2 + fx * 2.4;
    if (side > 0.8) rect(ctx, ec + fx * 1, eyeY, 1, 2, '#1c1420');
    else {
      rect(ctx, ec - 2.4, eyeY, 1, 2, '#1c1420');
      rect(ctx, ec + 1.6, eyeY, 1, 2, '#1c1420');
    }
    if (anim === 'hurt') rect(ctx, ec - 1, eyeY + 3, 2, 1, '#7a2230');
  }
  // headwear
  switch (look.headwear) {
    case 'horns':
      rect(ctx, hx - 1, hy - 2, 2, 4, look.accent);
      rect(ctx, hx + headW - 1, hy - 2, 2, 4, look.accent);
      break;
    case 'hood':
      rect(ctx, hx - 1, hy - 1, headW + 2, 3, look.cape ?? dark);
      if (!front) rect(ctx, hx - 1, hy, headW + 2, headH, look.cape ?? dark);
      else {
        rect(ctx, hx - 1, hy, 2, headH, look.cape ?? dark);
        rect(ctx, hx + headW - 1, hy, 2, headH, look.cape ?? dark);
      }
      break;
    case 'hat':
      rect(ctx, hx - 2, hy, headW + 4, 2, dark);
      rect(ctx, hx + 1, hy - 3, headW - 2, 3, dark);
      rect(ctx, hx + 1, hy - 1, headW - 2, 1, look.accent);
      break;
    case 'band':
      rect(ctx, hx, hy + 2, headW, 1, look.accent);
      break;
    case 'crest':
      rect(ctx, hx + headW / 2 - 1, hy - 3, 2, 4, look.accent);
      break;
    case 'none':
      break;
  }

  // near arm + weapon
  drawArm(weaponSide, actRaise, actReach);
  const handX = cx + weaponSide * (torsoW / 2 + 0.5) * (1 - side * 0.8) + actReach;
  const handY = armY - actRaise + armLen - 2;
  const metal = '#d8dde6';
  const wood = '#7a5a3a';
  const swing = anim === 'action' && frame === 1;
  switch (look.weapon) {
    case 'sword':
      if (swing) rect(ctx, handX + (fx >= 0 ? 1 : -9) * (side > 0.3 ? 1 : 0) - (side > 0.3 ? 0 : 1), handY + (side > 0.3 ? 0 : 2), side > 0.3 ? 9 : 2, side > 0.3 ? 2 : 9, metal);
      else rect(ctx, handX - 1, handY - 10, 2, 10, metal);
      rect(ctx, handX - 2, handY, 4, 1, look.accent);
      break;
    case 'dagger':
      rect(ctx, handX - 1, handY - (swing ? 0 : 5), swing && side > 0.3 ? 5 : 2, swing && side > 0.3 ? 2 : 5, metal);
      break;
    case 'glaive':
      rect(ctx, handX - 1, handY - 20 + (swing ? 8 : 0), 1, 26, wood);
      rect(ctx, handX - 2, handY - 24 + (swing ? 8 : 0), 3, 6, metal);
      break;
    case 'staff':
      rect(ctx, handX - 1, handY - 18, 1, 24, wood);
      rect(ctx, handX - 2, handY - 21, 3, 3, look.accent);
      break;
    case 'hammer':
      rect(ctx, handX - 1, handY - 12 + (swing ? 8 : 0), 1, 13, wood);
      rect(ctx, handX - 3, handY - 15 + (swing ? 8 : 0), 6, 4, '#8d8f96');
      break;
    case 'bow': {
      const bx = handX + weaponSide * 2;
      rect(ctx, bx, handY - 9, 1, 14, wood);
      rect(ctx, bx - weaponSide, handY - 10, 1, 2, wood);
      rect(ctx, bx - weaponSide, handY + 4, 1, 2, wood);
      if (anim === 'action') rect(ctx, bx - weaponSide * (frame === 0 ? 3 : 1), handY - 2, 4, 1, metal);
      break;
    }
    case 'none':
      break;
  }
}

interface CreatureLook {
  readonly kind: 'quadruped' | 'wisp' | 'bird' | 'dragon';
  readonly body: string;
  readonly belly: string;
  readonly detail: string;
  readonly size: number; // 0.5 .. 1.4 of the frame
  readonly antlers: boolean;
  readonly tusks: boolean;
  readonly longEars: boolean;
  readonly mane: boolean;
  readonly tail: 'none' | 'short' | 'long';
  readonly worldHeight: number;
}

const CREATURE_W = 48;
const CREATURE_H = 48;

function creatureLook(id: string): CreatureLook {
  const rnd = seededRandom(hashString(id));
  const hue = rnd();
  const base = { antlers: false, tusks: false, longEars: false, mane: false, tail: 'short' as const };
  if (id.startsWith('dragon.')) {
    const frost = /frost|ice|rime|snow|tide|water|mire/.test(id);
    const storm = /thunder|storm|spark|volt|gale/.test(id);
    const apex = /apex|sovereign|crown|ascend|elder/.test(id);
    const whelp = /pup|hatch|whelp|kit/.test(id);
    const body = apex ? '#e8c75a' : storm ? hsl(0.13 + rnd() * 0.03, 0.75, 0.5) : frost ? hsl(0.55 + rnd() * 0.06, 0.55, 0.55) : hsl(0.01 + rnd() * 0.05, 0.7, 0.45);
    const detail = apex ? '#fff6d8' : storm ? '#fff3a0' : frost ? '#d6f3ff' : '#ffd166';
    const big = !whelp && /drake|wyrm|great/.test(id);
    const size = apex ? 1.4 : big ? 1.3 : whelp ? 0.62 : 0.95;
    const worldHeight = apex ? 4.4 : big ? 3.6 : whelp ? 1.5 : 2.4;
    return { ...base, kind: 'dragon', body, belly: apex ? '#fff1c2' : '#f2d28a', detail, size, tail: 'long', worldHeight };
  }
  if (id.startsWith('animal.deer')) return { ...base, kind: 'quadruped', body: '#a9744a', belly: '#e6cfa8', detail: '#f1e6cf', size: 0.85, antlers: true, worldHeight: 1.7 };
  if (id.startsWith('animal.boar')) return { ...base, kind: 'quadruped', body: '#5d4a42', belly: '#7a655a', detail: '#efe9dc', size: 0.75, tusks: true, mane: true, worldHeight: 1.2 };
  if (id.startsWith('animal.hare')) return { ...base, kind: 'quadruped', body: '#c9b79c', belly: '#f3ecdf', detail: '#f3ecdf', size: 0.42, longEars: true, worldHeight: 0.7 };
  if (id.startsWith('animal.bird')) return { ...base, kind: 'bird', body: hsl(0.08 + rnd() * 0.1, 0.5, 0.5), belly: '#f1e3c4', detail: '#f0a23a', size: 0.4, tail: 'short', worldHeight: 0.7 };
  if (id.startsWith('enemy.wisp')) return { ...base, kind: 'wisp', body: hsl(0.5 + hue * 0.2, 0.7, 0.62), belly: '#ffffff', detail: hsl(0.5 + hue * 0.2, 0.9, 0.85), size: 0.7, tail: 'none', worldHeight: 1.6 };
  // enemy.beast.* and anything unknown
  return {
    ...base,
    kind: 'quadruped',
    body: hsl(hue, 0.35, 0.36),
    belly: hsl(hue, 0.25, 0.55),
    detail: hsl((hue + 0.45) % 1, 0.7, 0.6),
    size: 0.8 + rnd() * 0.4,
    tusks: rnd() < 0.5,
    mane: rnd() < 0.6,
    longEars: rnd() < 0.3,
    tail: rnd() < 0.5 ? 'long' : 'short',
    worldHeight: 1.5 + rnd() * 0.8,
  };
}

function drawCreature(ctx: Ctx, ox: number, oy: number, k: number, col: number, look: CreatureLook): void {
  const { fx, fz } = facingVector(k);
  const { anim, frame } = colToAnim(col);
  const side = Math.abs(fx);
  const s = look.size;
  const cx = ox + CREATURE_W / 2 + (anim === 'hurt' ? -fx * 3 : anim === 'action' && frame === 1 ? fx * 4 : 0);
  const ground = oy + CREATURE_H - 3;
  const walk = anim === 'walk';
  const stride = walk ? ([1, 0, -1, 0][frame] ?? 0) : 0;
  const bob = anim === 'idle' ? frame : walk ? frame % 2 : 0;
  const eye = '#1c1420';

  if (look.kind === 'wisp') {
    const cy = ground - 18 * s - bob * 2 - 6;
    const r = 9 * s;
    // trailing flame
    for (let i = 3; i >= 1; i--) ellipse(ctx, cx - fx * i * 2 + Math.sin(frame + i) * 1.5, cy - i * 5 * s, r * (1 - i * 0.22), r * (1 - i * 0.2), i === 1 ? look.body : shadeHex(look.body, -0.2 * i));
    ellipse(ctx, cx, cy, r, r, look.body);
    ellipse(ctx, cx + fx * 2, cy + 1, r * 0.6, r * 0.6, look.detail);
    if (fz > -0.3) {
      rect(ctx, cx + fx * 3 - 3, cy - 1, 2, 3, eye);
      rect(ctx, cx + fx * 3 + 2, cy - 1, 2, 3, eye);
    }
    return;
  }

  if (look.kind === 'bird') {
    const cy = ground - 5 * s * 2 - (walk ? Math.abs(stride) * 2 : 0);
    ellipse(ctx, cx, cy, 7 * s * 2 * (0.6 + side * 0.4), 5 * s * 2, look.body);
    ellipse(ctx, cx, cy + 2, 4 * s * 2 * (0.6 + side * 0.4), 3 * s * 2, look.belly);
    const hx = cx + fx * 6 * s * 2;
    const hy = cy - 5 * s * 2 - (fz < 0 ? 1 : 0);
    ellipse(ctx, hx, hy, 3.5 * s * 2, 3.5 * s * 2, look.body);
    if (fz > -0.3) {
      rect(ctx, hx + fx * 2 - (side > 0.5 ? 0 : 2), hy - 1, 1, 2, eye);
      if (side <= 0.5) rect(ctx, hx + 2, hy - 1, 1, 2, eye);
      rect(ctx, hx + fx * 4 - 1, hy + 1, 3, 2, look.detail);
    }
    // wing flick + legs
    rect(ctx, cx - fx * 3 - 3, cy - 2 - (walk || anim === 'action' ? (frame % 2) * 4 : 0), 7, 4, shadeHex(look.body, -0.25));
    rect(ctx, cx - 2, ground - 3, 1, 3, look.detail);
    rect(ctx, cx + 2, ground - 3, 1, 3, look.detail);
    return;
  }

  const dragon = look.kind === 'dragon';
  const bodyLen = lerp(11, 22, side) * s;
  const bodyH = (dragon ? 9 : 8) * s;
  const legH = (dragon ? 8 : 9) * s * (look.longEars ? 0.6 : 1);
  const by = ground - legH - bodyH + bob;
  const dark = shadeHex(look.body, -0.3);

  // tail (opposite the head)
  if (look.tail !== 'none') {
    const tl = (look.tail === 'long' ? 12 : 4) * s;
    if (side > 0.3) for (let i = 0; i < tl; i++) rect(ctx, cx - fx * (bodyLen * 0.5 + i), by + bodyH * 0.5 + i * (dragon ? 0.5 : 0.2) + Math.sin((i + frame) * 0.8) * (walk ? 1 : 0), 2, Math.max(1, (dragon ? 4 : 2) * s * (1 - i / tl)), dark);
    else if (fz < 0) rect(ctx, cx - 1, by + bodyH * 0.3, 3, tl * 0.8 + 3, dark);
  }

  // head position
  const headR = (dragon ? 6 : 5) * s;
  const hx = cx + fx * (bodyLen * 0.5 + headR * 0.6);
  const hy = by + (fz >= 0 ? bodyH * 0.2 : -headR * 0.5) - (dragon ? 5 * s : look.antlers ? 4 * s : 0) + (anim === 'action' && frame === 0 ? -2 : 0);
  const drawHead = (): void => {
    if (dragon || look.antlers) {
      // neck
      for (let i = 0; i < 5; i++) ellipse(ctx, lerp(cx + fx * bodyLen * 0.35, hx, i / 4), lerp(by + bodyH * 0.4, hy, i / 4), headR * 0.6, headR * 0.6, look.body);
    }
    ellipse(ctx, hx, hy, headR * (0.9 + side * 0.25), headR, look.body);
    // snout
    if (side > 0.3) ellipse(ctx, hx + fx * headR, hy + headR * 0.3, headR * 0.7, headR * 0.55, dragon ? look.body : look.belly);
    else if (fz >= 0) ellipse(ctx, hx, hy + headR * 0.5, headR * 0.6, headR * 0.45, dragon ? look.belly : look.belly);
    if (fz > -0.3) {
      const eo = side > 0.6 ? 0 : headR * 0.45;
      rect(ctx, hx + fx * headR * 0.4 - eo - 0.5, hy - headR * 0.3, dragon ? 2 : 1, 2, dragon ? look.detail : eye);
      if (eo > 0) rect(ctx, hx + fx * headR * 0.4 + eo - 0.5, hy - headR * 0.3, dragon ? 2 : 1, 2, dragon ? look.detail : eye);
    }
    if (look.tusks && fz > -0.3) {
      rect(ctx, hx + fx * headR - 2, hy + headR * 0.5, 1, 3, look.detail);
      rect(ctx, hx + fx * headR + 2, hy + headR * 0.5, 1, 3, look.detail);
    }
    if (look.longEars) {
      rect(ctx, hx - 2 - fx, hy - headR - 6 * s * 2, 2, 6 * s * 2 + 1, look.body);
      rect(ctx, hx + 1 - fx, hy - headR - 6 * s * 2, 2, 6 * s * 2 + 1, look.body);
    } else if (!dragon) {
      rect(ctx, hx - headR * 0.8, hy - headR - 1, 2, 3, dark);
      rect(ctx, hx + headR * 0.8 - 2, hy - headR - 1, 2, 3, dark);
    }
    if (look.antlers) {
      for (const d of [-1, 1] as const) {
        rect(ctx, hx + d * 2, hy - headR - 6, 1, 6, look.detail);
        rect(ctx, hx + d * 2 + d, hy - headR - 6, 3, 1, look.detail);
        rect(ctx, hx + d * 4, hy - headR - 8, 1, 3, look.detail);
      }
    }
    if (dragon) {
      rect(ctx, hx - headR * 0.6 - fx * 2, hy - headR - 4, 2, 5, look.detail);
      rect(ctx, hx + headR * 0.6 - 2 - fx * 2, hy - headR - 4, 2, 5, look.detail);
      if (anim === 'action' && frame === 1 && fz > -0.3) {
        // breath
        for (let i = 1; i <= 4; i++) ellipse(ctx, hx + fx * (headR + i * 4), hy + headR * 0.4 + (side < 0.3 ? i * 3 : 0), 2 + i, 2 + i * 0.6, i % 2 ? look.detail : '#ff8a3d');
      }
    }
  };

  // wings behind the body
  const drawWings = (): void => {
    if (!dragon) return;
    const flap = walk || anim === 'action' ? (frame % 2 ? 5 : -3) : bob * 2;
    for (const d of [-1, 1] as const) {
      const wx = side > 0.5 ? cx - fx * 2 : cx + d * bodyLen * 0.55;
      if (side > 0.5 && d === 1) continue;
      for (let i = 0; i < 13 * s; i++) {
        const t = i / (13 * s);
        const px = side > 0.5 ? wx - fx * i * 0.9 : wx + d * i;
        rect(ctx, px, by - 2 - i * 0.9 - flap * t, 2, 3 + (1 - t) * 9 * s, i % 4 < 2 ? dark : shadeHex(look.body, -0.12));
      }
    }
  };

  if (fz >= 0) drawWings();
  if (fz < -0.3) drawHead();

  // legs
  for (const lz of [-1, 1] as const) {
    for (const lxs of [-1, 1] as const) {
      const lx = cx + lxs * bodyLen * 0.34 + lz * (1 - side) * 2 + stride * lxs * lz * 2 * side;
      const lift = walk ? Math.max(0, stride * lxs * lz) * 2 : 0;
      rect(ctx, lx - 1.5 * s, by + bodyH * 0.6, 3 * s, legH + bodyH * 0.4 - lift, lz < 0 ? dark : shadeHex(look.body, -0.14));
    }
  }

  // body
  ellipse(ctx, cx, by + bodyH * 0.5, bodyLen * 0.56, bodyH * 0.62, look.body);
  ellipse(ctx, cx, by + bodyH * 0.78, bodyLen * 0.4, bodyH * 0.28, look.belly);
  if (look.mane) for (let i = 0; i < bodyLen * 0.8; i += 2) rect(ctx, cx - bodyLen * 0.4 + i, by - 1 - (i % 4 === 0 ? 1 : 0), 2, 3, dark);
  if (dragon) for (let i = 0; i < bodyLen * 0.8; i += 4) rect(ctx, cx - bodyLen * 0.4 + i, by - 2, 2, 3, look.detail);

  if (fz < 0) drawWings();
  if (fz >= -0.3) drawHead();
}

interface BuiltSheet {
  readonly canvas: HTMLCanvasElement;
  readonly meta: SpriteSheetMeta;
}
const sheetCache = new Map<SpriteSheetId, BuiltSheet>();

function isHumanoid(id: SpriteSheetId): boolean {
  return id.startsWith('hero.') || id.startsWith('npc.') || id.startsWith('enemy.humanoid');
}

/** Sheet metadata is derivable without a DOM (used by tests + UV math). */
export function getSpriteMeta(id: SpriteSheetId): SpriteSheetMeta {
  const cached = sheetCache.get(id);
  if (cached) return cached.meta;
  const human = isHumanoid(id);
  const big = id.startsWith('enemy.humanoid') && /brute|prior|captain|champion/.test(id);
  return {
    id,
    cols: SHEET_COLS,
    rows: SHEET_ROWS,
    frameWidth: human ? HUMAN_W : CREATURE_W,
    frameHeight: human ? HUMAN_H : CREATURE_H,
    directional: true,
    worldHeight: human ? (big ? 2.4 : 2.0) : creatureLook(id).worldHeight,
    anims: ANIMS,
  };
}

/**
 * Build (or fetch from cache) the sprite sheet for any id. Art is derived
 * from the id: heroes have hand-tuned looks, everything else is seeded by
 * hashing the id, with the prefix picking the body plan
 * (`hero.` / `npc.` / `enemy.humanoid.` / `enemy.beast.` / `enemy.wisp.` /
 * `animal.{deer,boar,hare,bird}.` / `dragon.`).
 */
export function getSpriteSheet(id: SpriteSheetId): BuiltSheet {
  const cached = sheetCache.get(id);
  if (cached) return cached;
  const meta = getSpriteMeta(id);
  const canvas = makeCanvas(meta.cols * meta.frameWidth, meta.rows * meta.frameHeight);
  const ctx = get2d(canvas);
  if (isHumanoid(id)) {
    const heroId = id.startsWith('hero.') ? (id.slice(5) as HeroId) : null;
    const look = (heroId && HERO_LOOKS[heroId]) || lookFromId(id);
    for (let row = 0; row < meta.rows; row++) for (let col = 0; col < meta.cols; col++) drawHuman(ctx, col * HUMAN_W, row * HUMAN_H, row, col, look);
  } else {
    const look = creatureLook(id);
    for (let row = 0; row < meta.rows; row++) for (let col = 0; col < meta.cols; col++) drawCreature(ctx, col * CREATURE_W, row * CREATURE_H, row, col, look);
  }
  finishSheet(canvas, meta.frameWidth, meta.frameHeight);
  const built: BuiltSheet = { canvas, meta };
  sheetCache.set(id, built);
  return built;
}

/** UV rectangle for a frame: offset is the bottom-left corner in GL (v-up) space. */
export function frameUv(meta: SpriteSheetMeta, row: number, col: number): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } {
  const r = meta.directional ? ((row % meta.rows) + meta.rows) % meta.rows : 0;
  const c = ((col % meta.cols) + meta.cols) % meta.cols;
  return { offsetX: c / meta.cols, offsetY: 1 - (r + 1) / meta.rows, scaleX: 1 / meta.cols, scaleY: 1 / meta.rows };
}

/** Column for an animation at a given elapsed time. Falls back to idle. */
export function animColumn(meta: SpriteSheetMeta, anim: SpriteAnim, timeSec: number): number {
  const a = meta.anims[anim] ?? meta.anims.idle;
  if (!a) return 0;
  const frame = Math.floor(Math.max(0, timeSec) * a.fps) % a.count;
  return a.from + frame;
}

const dataUrlCache = new Map<string, string>();

/** A single frame, upscaled with nearest-neighbour, as a data URL (for DOM UI). */
export function spriteFrameDataUrl(id: SpriteSheetId, facing = 0, col = 0, scale = 3, crop?: { x: number; y: number; w: number; h: number }): string {
  const key = `${id}:${facing}:${col}:${scale}:${crop ? `${crop.x},${crop.y},${crop.w},${crop.h}` : ''}`;
  const hit = dataUrlCache.get(key);
  if (hit) return hit;
  const { canvas, meta } = getSpriteSheet(id);
  const c = crop ?? { x: 0, y: 0, w: meta.frameWidth, h: meta.frameHeight };
  const out = makeCanvas(c.w * scale, c.h * scale);
  const ctx = get2d(out);
  ctx.drawImage(canvas, col * meta.frameWidth + c.x, facing * meta.frameHeight + c.y, c.w, c.h, 0, 0, c.w * scale, c.h * scale);
  const url = out.toDataURL('image/png');
  dataUrlCache.set(key, url);
  return url;
}

/** Head-and-shoulders portrait for the hot-swap rail / inspector. */
export function heroPortrait(heroId: HeroId, scale = 4): string {
  return spriteFrameDataUrl(`hero.${heroId}`, 0, 0, scale, { x: 6, y: 8, w: 20, h: 20 });
}

/** Full-body portrait for any sprite id (enemies, NPCs, dragon forms). */
export function spritePortrait(id: SpriteSheetId, scale = 3): string {
  return spriteFrameDataUrl(id, 1, 0, scale);
}

/* ════════════════════════════════════════════════════════════════════════
 * Foliage atlas, patterns, FX
 * ════════════════════════════════════════════════════════════════════════ */

export type FoliageKind = 'grass' | 'flower' | 'bush' | 'tree' | 'pine' | 'rock' | 'reed';

export interface FoliageRect {
  /** UV rect in GL space (v-up): xy = bottom-left offset, zw = size. */
  readonly uv: readonly [number, number, number, number];
  /** World size in metres of the card. */
  readonly width: number;
  readonly height: number;
  /** 0..1 how much wind sways the top of the card. */
  readonly sway: number;
}

export interface FoliageAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly rects: Readonly<Record<FoliageKind, FoliageRect>>;
}

let foliageAtlas: FoliageAtlas | null = null;

/** One 256×256 atlas for every foliage card ⇒ one material, one draw call per chunk. */
export function getFoliageAtlas(): FoliageAtlas {
  if (foliageAtlas) return foliageAtlas;
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = get2d(canvas);
  const rnd = seededRandom(0xf011a6e);
  const uv = (x: number, y: number, w: number, h: number): readonly [number, number, number, number] => [x / S, 1 - (y + h) / S, w / S, h / S];

  // tree: 96×128 at (0,0)
  const tree = (ox: number, leaf: string, pine: boolean): void => {
    rect(ctx, ox + 44, 86, 8, 40, '#5b4030');
    rect(ctx, ox + 44, 86, 3, 40, '#6f4e39');
    if (pine) {
      for (let tier = 0; tier < 5; tier++) {
        const w = 22 + tier * 14;
        const y = 8 + tier * 19;
        for (let r = 0; r < 24; r++) rect(ctx, ox + 48 - (w * (r + 4)) / 56, y + r, (w * (r + 4)) / 28, 1, r > 18 ? shadeHex(leaf, -0.28) : tier % 2 ? leaf : shadeHex(leaf, 0.08));
      }
    } else {
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * 26;
        const cx = ox + 48 + Math.cos(a) * d * 1.25;
        const cy = 50 + Math.sin(a) * d;
        ellipse(ctx, cx, cy, 12 + rnd() * 8, 10 + rnd() * 7, shadeHex(leaf, (cy < 46 ? 0.14 : -0.16) + (rnd() - 0.5) * 0.12));
      }
    }
  };
  tree(0, '#4f8a4a', false);
  tree(96, '#2f6b52', true);

  // bush 64×48 at (192, 0)
  for (let i = 0; i < 14; i++) ellipse(ctx, 200 + rnd() * 48, 22 + rnd() * 16, 8 + rnd() * 6, 7 + rnd() * 5, shadeHex('#5d9950', (rnd() - 0.6) * 0.3));
  for (let i = 0; i < 6; i++) rect(ctx, 198 + rnd() * 52, 16 + rnd() * 22, 2, 2, '#d9534f');

  // rock 64×48 at (192, 48)
  ellipse(ctx, 224, 80, 26, 14, '#7f7a7c');
  ellipse(ctx, 216, 74, 16, 10, '#9a9597');
  ellipse(ctx, 236, 84, 10, 6, '#646064');

  // grass tuft 48×32 at (0,128) — several blades
  for (let i = 0; i < 16; i++) {
    const bx = 4 + rnd() * 40;
    const hgt = 12 + rnd() * 16;
    const leanB = (rnd() - 0.5) * 8;
    const c = shadeHex('#6fae58', (rnd() - 0.5) * 0.35);
    for (let y = 0; y < hgt; y++) rect(ctx, bx + (leanB * y) / hgt, 159 - y, y > hgt * 0.7 ? 1 : 2, 1, c);
  }

  // flowers 48×32 at (48,128)
  for (let i = 0; i < 9; i++) {
    const bx = 54 + rnd() * 36;
    const hgt = 10 + rnd() * 14;
    for (let y = 0; y < hgt; y++) rect(ctx, bx, 159 - y, 1, 1, '#4f8a4a');
    const col = ['#f6d55c', '#ed6a5a', '#f4f1de', '#c38adf'][Math.floor(rnd() * 4)] ?? '#f6d55c';
    rect(ctx, bx - 1, 158 - hgt, 3, 3, col);
    rect(ctx, bx, 159 - hgt, 1, 1, '#fff8e1');
  }

  // reeds 48×64 at (96,128)
  for (let i = 0; i < 10; i++) {
    const bx = 100 + rnd() * 40;
    const hgt = 30 + rnd() * 30;
    const leanB = (rnd() - 0.5) * 10;
    for (let y = 0; y < hgt; y++) rect(ctx, bx + (leanB * y) / hgt, 191 - y, 1, 1, '#7d9a5a');
    rect(ctx, bx + leanB - 1, 191 - hgt, 2, 7, '#6b4a2b');
  }

  // outline everything for the HD-2D sticker look (single frame = whole atlas)
  finishSheet(canvas, S, S);

  foliageAtlas = {
    canvas,
    rects: {
      tree: { uv: uv(0, 0, 96, 128), width: 5.4, height: 7.2, sway: 0.25 },
      pine: { uv: uv(96, 0, 96, 128), width: 4.6, height: 7.8, sway: 0.15 },
      bush: { uv: uv(192, 0, 64, 48), width: 2.0, height: 1.5, sway: 0.2 },
      rock: { uv: uv(192, 48, 64, 48), width: 1.9, height: 1.4, sway: 0 },
      grass: { uv: uv(0, 128, 48, 32), width: 1.1, height: 0.7, sway: 1 },
      flower: { uv: uv(48, 128, 48, 32), width: 1.0, height: 0.65, sway: 0.8 },
      reed: { uv: uv(96, 128, 48, 64), width: 1.2, height: 1.6, sway: 0.7 },
    },
  };
  return foliageAtlas;
}

export type PatternKind = 'plaster' | 'timber' | 'roof' | 'stone' | 'wood' | 'thatch' | 'cloth';
const patternCache = new Map<string, HTMLCanvasElement>();

/** Small tiling 64×64 surface patterns for low-poly props. */
export function getPattern(kind: PatternKind, tint = '#ffffff'): HTMLCanvasElement {
  const key = `${kind}:${tint}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = get2d(c);
  const rnd = seededRandom(hashString(key));
  const base: Record<PatternKind, string> = { plaster: '#e6dcc6', timber: '#e6dcc6', roof: '#a8483c', stone: '#9a9597', wood: '#8a6542', thatch: '#c9a85a', cloth: '#c9463a' };
  const b = tint === '#ffffff' ? base[kind] : tint;
  rect(ctx, 0, 0, S, S, b);
  for (let i = 0; i < 260; i++) rect(ctx, rnd() * S, rnd() * S, 2, 1, shadeHex(b, (rnd() - 0.5) * 0.16));
  switch (kind) {
    case 'timber':
      for (const x of [0, 30, 60]) rect(ctx, x, 0, 4, S, '#5b4030');
      rect(ctx, 0, 0, S, 4, '#5b4030');
      rect(ctx, 0, 30, S, 4, '#5b4030');
      for (let i = 0; i < 26; i++) rect(ctx, 4 + i, 4 + i, 3, 2, '#5b4030');
      break;
    case 'roof':
    case 'thatch':
      for (let y = 0; y < S; y += 8) {
        rect(ctx, 0, y + 7, S, 1, shadeHex(b, -0.35));
        for (let x = (y / 8) % 2 ? 0 : 6; x < S; x += 12) rect(ctx, x, y, 1, 8, shadeHex(b, -0.22));
      }
      break;
    case 'stone':
      for (let y = 0; y < S; y += 16) {
        rect(ctx, 0, y, S, 1, shadeHex(b, -0.4));
        for (let x = (y / 16) % 2 ? 0 : 16; x < S; x += 32) rect(ctx, x, y, 1, 16, shadeHex(b, -0.4));
      }
      break;
    case 'wood':
      for (let x = 0; x < S; x += 10) rect(ctx, x, 0, 1, S, shadeHex(b, -0.35));
      break;
    case 'cloth':
      for (let x = 0; x < S; x += 16) rect(ctx, x, 0, 8, S, shadeHex(b, 0.5));
      break;
    case 'plaster':
      break;
  }
  patternCache.set(key, c);
  return c;
}

let shadowBlob: HTMLCanvasElement | null = null;
/** Soft elliptical contact shadow (alpha in the red channel is not used — plain RGBA). */
export function getShadowBlob(): HTMLCanvasElement {
  if (shadowBlob) return shadowBlob;
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = get2d(c);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,6,18,0.55)');
  g.addColorStop(0.6, 'rgba(10,6,18,0.28)');
  g.addColorStop(1, 'rgba(10,6,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  shadowBlob = c;
  return c;
}

let noiseTile: HTMLCanvasElement | null = null;
/** Tiling RGBA value-noise tile (R: low freq, G: mid, B: high, A: 255) for shaders. */
export function getNoiseTile(size = 128): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const c = makeCanvas(size, size);
  const ctx = get2d(c);
  const img = ctx.createImageData(size, size);
  const tile = (x: number, y: number, cells: number, seed: number): number => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const h = (a: number, b: number): number => hash2(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, seed);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), tx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), tx), ty);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      img.data[o] = tile(x, y, 4, 1) * 255;
      img.data[o + 1] = (tile(x, y, 8, 2) * 0.6 + tile(x, y, 16, 3) * 0.4) * 255;
      img.data[o + 2] = tile(x, y, 32, 4) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

/**
 * Warm the caches for a list of sprite ids so the first frame has no hitch.
 * Call once at boot with every sprite id referenced by the database.
 */
export function bootstrapAssets(spriteIds: readonly SpriteSheetId[]): { readonly sprites: number; readonly ms: number } {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  for (const id of spriteIds) getSpriteSheet(id);
  getFoliageAtlas();
  getShadowBlob();
  getNoiseTile();
  const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
  return { sprites: spriteIds.length, ms: t1 - t0 };
}
