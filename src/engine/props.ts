/**
 * Low-poly prop kit (pure, three-free). Builds merged vertex arrays for any
 * number of props plus their colliders; `propMesh.ts` uploads the arrays as a
 * single BufferGeometry ⇒ one draw call for all props of a layer.
 *
 * Surface detail comes from a 8-slot pattern atlas (see `PATTERN_SLOTS`);
 * uvs are in tiles (1 tile = 2 m) and wrapped in the shader.
 */
import { sampleHeight, WATER_LEVEL } from '@/engine/bootstrapAssets';
import type { PropDef, WorldMapDef } from '@/types/contracts';
import type { Collider } from './movement';
import { parseHexColor } from './spriteMath';

export const PATTERN_SLOTS = ['plaster', 'timber', 'roof', 'stone', 'wood', 'thatch', 'cloth', 'plain'] as const;
export type PatternSlot = (typeof PATTERN_SLOTS)[number];

/** Extra prop kinds the engine places itself. */
export type PropKind = PropDef['kind'] | 'barge' | 'plot';

export interface PropInstance {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
  readonly tint?: string;
}

/** Oriented rectangle the player may stand on even over deep water (docks). */
export interface WalkArea {
  readonly x: number;
  readonly z: number;
  readonly hx: number;
  readonly hz: number;
  readonly rot: number;
  readonly deck: number;
}

type Rgb = readonly [number, number, number];

/** Similarity transform in the xz plane + y offset: p' = R(θ)(s·p) + t. */
interface Xf {
  readonly rot: number;
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
}

const IDENTITY: Xf = { rot: 0, s: 1, tx: 0, ty: 0, tz: 0 };

function compose(a: Xf, b: Xf): Xf {
  const c = Math.cos(a.rot);
  const s = Math.sin(a.rot);
  const bx = b.tx * a.s;
  const bz = b.tz * a.s;
  return { rot: a.rot + b.rot, s: a.s * b.s, tx: a.tx + bx * c + bz * s, ty: a.ty + b.ty * a.s, tz: a.tz - bx * s + bz * c };
}

export class PropGeometryBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly tiles: number[] = [];
  readonly emissive: number[] = [];
  readonly indices: number[] = [];
  readonly colliders: Collider[] = [];
  readonly walkAreas: WalkArea[] = [];
  private xf: Xf = IDENTITY;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  withTransform(local: Partial<Xf>, fn: () => void): void {
    const prev = this.xf;
    this.xf = compose(prev, { ...IDENTITY, ...local });
    fn();
    this.xf = prev;
  }

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, color: Rgb, slot: number, glow: number): void {
    const { rot, s, tx, ty, tz } = this.xf;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    this.positions.push(tx + (x * c + z * sn) * s, ty + y * s, tz + (-x * sn + z * c) * s);
    this.normals.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
    this.uvs.push(u, v);
    this.colors.push(color[0], color[1], color[2]);
    this.tiles.push(slot);
    this.emissive.push(glow);
  }

  /** Quad from 4 corners (counter-clockwise seen from the normal side). */
  private quad(p: readonly (readonly [number, number, number])[], n: readonly [number, number, number], uv: readonly (readonly [number, number])[], color: Rgb, slot: number, glow: number): void {
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) {
      const q = p[i] ?? [0, 0, 0];
      const t = uv[i] ?? [0, 0];
      this.vert(q[0], q[1], q[2], n[0], n[1], n[2], t[0], t[1], color, slot, glow);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  private tri(p: readonly (readonly [number, number, number])[], n: readonly [number, number, number], uv: readonly (readonly [number, number])[], color: Rgb, slot: number, glow: number): void {
    const base = this.vertexCount;
    for (let i = 0; i < 3; i++) {
      const q = p[i] ?? [0, 0, 0];
      const t = uv[i] ?? [0, 0];
      this.vert(q[0], q[1], q[2], n[0], n[1], n[2], t[0], t[1], color, slot, glow);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  /** Axis-aligned box centred at (x, y, z) in the current transform, optional local yaw. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, slot: PatternSlot, color: Rgb, opts: { rot?: number; glow?: number } = {}): void {
    this.withTransform({ rot: opts.rot ?? 0, tx: x, ty: y, tz: z }, () => {
      const hx = sx / 2;
      const hy = sy / 2;
      const hz = sz / 2;
      const k = 0.5; // uv tiles per metre
      const si = PATTERN_SLOTS.indexOf(slot);
      const g = opts.glow ?? 0;
      // +z
      this.quad([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1], [[0, 0], [sx * k, 0], [sx * k, sy * k], [0, sy * k]], color, si, g);
      // −z
      this.quad([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1], [[0, 0], [sx * k, 0], [sx * k, sy * k], [0, sy * k]], color, si, g);
      // +x
      this.quad([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0], [[0, 0], [sz * k, 0], [sz * k, sy * k], [0, sy * k]], color, si, g);
      // −x
      this.quad([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0], [[0, 0], [sz * k, 0], [sz * k, sy * k], [0, sy * k]], color, si, g);
      // top
      this.quad([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0], [[0, 0], [sx * k, 0], [sx * k, sz * k], [0, sz * k]], color, si, g);
      // bottom
      this.quad([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0], [[0, 0], [sx * k, 0], [sx * k, sz * k], [0, sz * k]], color, si, g);
    });
  }

  /** Gable roof: ridge along local z, eaves at y0, ridge at y0 + h. */
  gable(x: number, y0: number, z: number, w: number, d: number, h: number, slot: PatternSlot, color: Rgb, gableColor: Rgb, gableSlot: PatternSlot): void {
    this.withTransform({ tx: x, ty: y0, tz: z }, () => {
      const hw = w / 2;
      const hd = d / 2;
      const si = PATTERN_SLOTS.indexOf(slot);
      const slope = Math.hypot(hw, h);
      const nx = h / slope;
      const ny = hw / slope;
      const k = 0.5;
      // right slope (+x)
      this.quad([[hw, 0, hd], [hw, 0, -hd], [0, h, -hd], [0, h, hd]], [nx, ny, 0], [[0, 0], [d * k, 0], [d * k, slope * k], [0, slope * k]], color, si, 0);
      // left slope (−x)
      this.quad([[-hw, 0, -hd], [-hw, 0, hd], [0, h, hd], [0, h, -hd]], [-nx, ny, 0], [[0, 0], [d * k, 0], [d * k, slope * k], [0, slope * k]], color, si, 0);
      const gi = PATTERN_SLOTS.indexOf(gableSlot);
      this.tri([[-hw, 0, hd], [hw, 0, hd], [0, h, hd]], [0, 0, 1], [[0, 0], [w * k, 0], [hw * k, h * k]], gableColor, gi, 0);
      this.tri([[hw, 0, -hd], [-hw, 0, -hd], [0, h, -hd]], [0, 0, -1], [[0, 0], [w * k, 0], [hw * k, h * k]], gableColor, gi, 0);
    });
  }

  /** Four-sided pyramid with base centred at (x, y0, z). */
  pyramid(x: number, y0: number, z: number, w: number, h: number, slot: PatternSlot, color: Rgb, glow = 0, flip = false): void {
    this.withTransform({ tx: x, ty: y0, tz: z }, () => {
      const hw = w / 2;
      const si = PATTERN_SLOTS.indexOf(slot);
      const apexY = flip ? -h : h;
      const sides: readonly [readonly [number, number], readonly [number, number]][] = [
        [[-hw, hw], [hw, hw]],
        [[hw, hw], [hw, -hw]],
        [[hw, -hw], [-hw, -hw]],
        [[-hw, -hw], [-hw, hw]],
      ];
      for (const [a, b] of sides) {
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        const len = Math.hypot(mx, mz) || 1;
        const nY = flip ? -hw / Math.hypot(hw, h) : hw / Math.hypot(hw, h);
        const nH = h / Math.hypot(hw, h);
        const n: [number, number, number] = [(mx / len) * nH, nY, (mz / len) * nH];
        const pts: [number, number, number][] = flip
          ? [[b[0], 0, b[1]], [a[0], 0, a[1]], [0, apexY, 0]]
          : [[a[0], 0, a[1]], [b[0], 0, b[1]], [0, apexY, 0]];
        this.tri(pts, n, [[0, 0], [w * 0.5, 0], [w * 0.25, h * 0.5]], color, si, glow);
      }
    });
  }

  /** Low-poly upright cylinder (sides + top cap), base at y0. */
  cylinder(x: number, y0: number, z: number, r: number, h: number, segments: number, slot: PatternSlot, color: Rgb, glow = 0): void {
    const si = PATTERN_SLOTS.indexOf(slot);
    this.withTransform({ tx: x, ty: y0, tz: z }, () => {
      const circ = 2 * Math.PI * r * 0.5;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const p0: [number, number] = [Math.sin(a0) * r, Math.cos(a0) * r];
        const p1: [number, number] = [Math.sin(a1) * r, Math.cos(a1) * r];
        const u0 = (i / segments) * circ;
        const u1 = ((i + 1) / segments) * circ;
        this.quad([[p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], h, p1[1]], [p0[0], h, p0[1]]], [Math.sin(am), 0, Math.cos(am)], [[u0, 0], [u1, 0], [u1, h * 0.5], [u0, h * 0.5]], color, si, glow);
        this.tri([[0, h, 0], [p0[0], h, p0[1]], [p1[0], h, p1[1]]], [0, 1, 0], [[0, 0], [r * 0.5, 0], [0, r * 0.5]], color, si, glow);
      }
    });
  }

  /** Collider in the current transform's space (centre + local rotation). */
  collideBox(x: number, z: number, hx: number, hz: number, rot = 0): void {
    const p = this.toWorld(x, z);
    this.colliders.push({ kind: 'box', x: p.x, z: p.z, hx: hx * this.xf.s, hz: hz * this.xf.s, rot: this.xf.rot + rot });
  }

  collideCircle(x: number, z: number, r: number): void {
    const p = this.toWorld(x, z);
    this.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: r * this.xf.s });
  }

  walkArea(x: number, z: number, hx: number, hz: number, deck: number): void {
    const p = this.toWorld(x, z);
    this.walkAreas.push({ x: p.x, z: p.z, hx: hx * this.xf.s, hz: hz * this.xf.s, rot: this.xf.rot, deck });
  }

  private toWorld(x: number, z: number): { x: number; z: number } {
    const { rot, s, tx, tz } = this.xf;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    return { x: tx + (x * c + z * sn) * s, z: tz + (-x * sn + z * c) * s };
  }
}

/* ── Palette ────────────────────────────────────────────────────────────── */

const C = {
  white: [1, 1, 1] as Rgb,
  stone: [0.78, 0.76, 0.78] as Rgb,
  darkStone: [0.55, 0.53, 0.56] as Rgb,
  wood: [0.95, 0.9, 0.85] as Rgb,
  darkWood: [0.55, 0.42, 0.34] as Rgb,
  window: [0.23, 0.2, 0.28] as Rgb,
  slate: [0.42, 0.5, 0.66] as Rgb,
  lamp: [1, 0.85, 0.5] as Rgb,
  flame: [1, 0.6, 0.24] as Rgb,
  flameCore: [1, 0.9, 0.55] as Rgb,
  stillFlame: [0.6, 0.85, 0.95] as Rgb,
  moss: [0.62, 0.74, 0.55] as Rgb,
  water: [0.2, 0.35, 0.5] as Rgb,
  rope: [0.85, 0.75, 0.55] as Rgb,
};

const tintOr = (tint: string | undefined, fallback: Rgb): Rgb => (tint ? parseHexColor(tint) : fallback);

/* ── Kit ────────────────────────────────────────────────────────────────── */

function house(b: PropGeometryBuilder, tint?: string): void {
  const wall = tintOr(tint, C.white);
  b.box(0, -0.4, 0, 6.4, 1.6, 5.4, 'stone', C.darkStone);
  b.box(0, 1.6, 0, 6, 3.2, 5, 'timber', wall);
  b.gable(0, 3.2, 0, 6.9, 5.8, 2.4, 'roof', C.white, wall, 'plaster');
  b.box(0, 0.95, 2.53, 1.1, 1.9, 0.1, 'wood', C.darkWood);
  b.box(-1.8, 1.9, 2.53, 0.9, 0.8, 0.08, 'plain', C.window);
  b.box(1.8, 1.9, 2.53, 0.9, 0.8, 0.08, 'plain', C.window);
  b.box(1.8, 4.5, -1, 0.7, 2.2, 0.7, 'stone', C.stone);
  b.collideBox(0, 0, 3.1, 2.6);
}

function chapel(b: PropGeometryBuilder, tint?: string): void {
  const wall = tintOr(tint, [0.94, 0.92, 0.86]);
  b.box(0, -0.4, 0.5, 7.6, 1.6, 12.6, 'stone', C.darkStone);
  b.box(0, 2.5, 0, 7, 5, 11, 'plaster', wall);
  b.gable(0, 5, 0, 7.8, 11.8, 3.2, 'roof', C.slate, wall, 'plaster');
  b.box(0, 4.5, 6.3, 2.6, 9, 2.6, 'plaster', wall);
  b.pyramid(0, 9, 6.3, 3.2, 3, 'roof', C.slate);
  b.box(0, 1.2, 7.62, 1.4, 2.4, 0.1, 'wood', C.darkWood);
  b.box(0, 7.2, 7.62, 0.6, 0.9, 0.06, 'plain', C.stillFlame, { glow: 1 });
  for (const z of [-3, 0, 3]) {
    b.box(3.52, 2.8, z, 0.08, 1.8, 0.9, 'plain', C.window);
    b.box(-3.52, 2.8, z, 0.08, 1.8, 0.9, 'plain', C.window);
  }
  b.collideBox(0, 0.9, 3.7, 6.9);
}

function arena(b: PropGeometryBuilder, tint?: string): void {
  const banner = tintOr(tint, [0.85, 0.3, 0.25]);
  const segs = 18;
  const r = 14;
  for (let i = 0; i < segs; i++) {
    if (i === 0 || i === segs / 2) continue; // east + west entrances
    const a = (i / segs) * Math.PI * 2;
    const len = 2 * Math.PI * r / segs - 0.15;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rot = -a + Math.PI / 2;
    b.box(x, 0.4, z, len, 1.6, 0.8, 'stone', C.stone, { rot });
    const bx = Math.cos(a) * (r + 1.4);
    const bz = Math.sin(a) * (r + 1.4);
    b.box(bx, 0.9, bz, len + 0.3, 1.0, 1.4, 'wood', C.wood, { rot });
    b.box(Math.cos(a) * (r + 2.6), 1.5, Math.sin(a) * (r + 2.6), len + 0.6, 2.2, 1.2, 'wood', C.darkWood, { rot });
    b.collideBox(x, z, len / 2, 0.5, rot);
  }
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2;
    const x = Math.cos(a) * (r + 0.2);
    const z = Math.sin(a) * (r + 0.2);
    b.cylinder(x, 0, z, 0.15, 5, 6, 'wood', C.darkWood);
    b.box(x, 3.8, z, 0.06, 1.8, 1.1, 'cloth', banner, { rot: -a });
  }
}

function dock(b: PropGeometryBuilder): void {
  b.box(0, 0, 0, 3, 0.3, 14, 'wood', C.wood);
  for (const z of [-6.5, -3, 0.5, 4, 6.5]) {
    b.cylinder(-1.4, -3, z, 0.16, 3.4, 6, 'wood', C.darkWood);
    b.cylinder(1.4, -3, z, 0.16, 3.4, 6, 'wood', C.darkWood);
  }
  b.walkArea(0, 0, 1.5, 7, 0.15);
}

function stall(b: PropGeometryBuilder, tint?: string): void {
  const cloth = tintOr(tint, C.white);
  b.box(0, 0.5, 0.6, 3, 1, 0.8, 'wood', C.wood);
  for (const [x, z] of [[-1.5, 1], [1.5, 1], [-1.5, -1], [1.5, -1]] as const) b.cylinder(x, 0, z, 0.08, 2.6, 5, 'wood', C.darkWood);
  b.gable(0, 2.6, 0, 3.6, 2.6, 0.6, 'cloth', cloth, cloth, 'cloth');
  b.box(-0.8, 1.15, 0.6, 0.5, 0.3, 0.4, 'plain', [0.9, 0.55, 0.3]);
  b.box(0.2, 1.12, 0.6, 0.6, 0.25, 0.4, 'plain', [0.6, 0.75, 0.4]);
  b.box(1.0, 1.15, 0.6, 0.4, 0.3, 0.4, 'plain', [0.85, 0.8, 0.45]);
  b.collideBox(0, 0, 1.7, 1.2);
}

function well(b: PropGeometryBuilder): void {
  b.cylinder(0, -0.3, 0, 1.1, 1.2, 10, 'stone', C.stone);
  b.box(0, 0.88, 0, 1.4, 0.05, 1.4, 'plain', C.water);
  b.cylinder(-1, 0, 0, 0.09, 2.4, 5, 'wood', C.darkWood);
  b.cylinder(1, 0, 0, 0.09, 2.4, 5, 'wood', C.darkWood);
  b.withTransform({ rot: Math.PI / 2 }, () => b.gable(0, 2.4, 0, 1.6, 2.6, 0.9, 'roof', C.white, C.wood, 'wood'));
  b.collideCircle(0, 0, 1.25);
}

function sign(b: PropGeometryBuilder): void {
  b.cylinder(0, 0, 0, 0.08, 1.7, 5, 'wood', C.darkWood);
  b.box(0, 1.45, 0.05, 1.3, 0.6, 0.08, 'wood', C.wood);
  b.collideCircle(0, 0, 0.3);
}

function lantern(b: PropGeometryBuilder): void {
  b.cylinder(0, 0, 0, 0.08, 2.6, 5, 'wood', C.darkWood);
  b.box(0, 2.75, 0, 0.36, 0.45, 0.36, 'plain', C.lamp, { glow: 1 });
  b.pyramid(0, 2.97, 0, 0.5, 0.3, 'plain', C.window);
  b.collideCircle(0, 0, 0.3);
}

function fence(b: PropGeometryBuilder): void {
  for (let i = 0; i < 5; i++) b.box(-3 + i * 1.5, 0.45, 0, 0.14, 1.1, 0.14, 'wood', C.darkWood);
  b.box(0, 0.45, 0, 6, 0.1, 0.07, 'wood', C.wood);
  b.box(0, 0.85, 0, 6, 0.1, 0.07, 'wood', C.wood);
  b.collideBox(0, 0, 3, 0.15);
}

function ruin(b: PropGeometryBuilder): void {
  b.box(-2, 1.0, 0, 0.8, 2.8, 4, 'stone', C.stone);
  b.box(-2, 2.6, -1.2, 0.8, 0.8, 1.4, 'stone', C.moss);
  b.box(0, 0.5, -2, 4, 1.6, 0.8, 'stone', C.stone);
  b.cylinder(2, -0.2, 1.5, 0.4, 3.2, 7, 'stone', C.stone);
  b.box(1, 0.1, 0.4, 0.8, 0.5, 0.6, 'stone', C.moss, { rot: 0.5 });
  b.box(0.2, 0.1, 1.6, 0.6, 0.4, 0.5, 'stone', C.darkStone, { rot: 1.2 });
  b.collideBox(-2, 0, 0.4, 2);
  b.collideBox(0, -2, 2, 0.4);
  b.collideCircle(2, 1.5, 0.45);
}

function campfire(b: PropGeometryBuilder): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, 0.3, 0.25, 0.25, 'stone', C.darkStone, { rot: a });
  }
  b.box(0, 0.12, 0, 1.0, 0.16, 0.16, 'wood', C.darkWood, { rot: 0.4 });
  b.box(0, 0.12, 0, 1.0, 0.16, 0.16, 'wood', C.darkWood, { rot: 2.0 });
  b.pyramid(0, 0.1, 0, 0.6, 0.9, 'plain', C.flame, 1);
  b.pyramid(0, 0.1, 0, 0.32, 0.6, 'plain', C.flameCore, 1);
  b.collideCircle(0, 0, 0.8);
}

function shrine(b: PropGeometryBuilder, tint?: string): void {
  const crystal = tintOr(tint, [0.6, 0.82, 0.83]);
  b.box(0, 0.1, 0, 1.6, 0.6, 1.6, 'stone', C.stone);
  b.box(0, 1.2, 0, 0.6, 1.6, 0.6, 'stone', C.moss);
  b.pyramid(0, 2.3, 0, 0.5, 0.6, 'plain', crystal, 1);
  b.pyramid(0, 2.3, 0, 0.5, 0.4, 'plain', crystal, 1, true);
  b.collideCircle(0, 0, 1.0);
}

function barge(b: PropGeometryBuilder, tint?: string): void {
  const cabin = tintOr(tint, [0.55, 0.75, 0.7]);
  b.box(0, -0.2, 0, 3.2, 1.2, 8, 'wood', C.darkWood);
  b.pyramid(0, -0.8, 4, 3.2, 1.6, 'wood', C.darkWood);
  b.box(0, 0.4, 0, 3.0, 0.1, 7.6, 'wood', C.wood);
  b.box(0, 1.1, -1.5, 2.0, 1.4, 3, 'plaster', cabin);
  b.gable(0, 1.8, -1.5, 2.4, 3.4, 0.7, 'thatch', C.white, cabin, 'plaster');
  b.cylinder(0, 0.4, 1.5, 0.1, 5, 5, 'wood', C.darkWood);
  b.box(0, 3.4, 1.7, 0.05, 2.6, 2.2, 'cloth', [0.95, 0.85, 0.6]);
  b.box(1.2, 1.0, 3, 0.3, 0.4, 0.3, 'plain', C.lamp, { glow: 1 });
  b.collideBox(0, 0, 1.7, 4.4);
}

function plot(b: PropGeometryBuilder): void {
  for (const [x, z] of [[-3, -3], [3, -3], [3, 3], [-3, 3]] as const) b.box(x, 0.4, z, 0.14, 1.0, 0.14, 'wood', C.darkWood);
  b.box(0, 0.7, -3, 6, 0.05, 0.05, 'plain', C.rope);
  b.box(0, 0.7, 3, 6, 0.05, 0.05, 'plain', C.rope);
  b.box(-3, 0.7, 0, 0.05, 0.05, 6, 'plain', C.rope);
  b.box(3, 0.7, 0, 0.05, 0.05, 6, 'plain', C.rope);
}

const KIT: Readonly<Record<PropKind, (b: PropGeometryBuilder, tint?: string) => void>> = {
  house,
  chapel,
  arena,
  dock,
  stall,
  well,
  sign,
  lantern,
  fence,
  ruin,
  campfire,
  shrine,
  barge,
  plot,
};

/** Radius kept clear of foliage around each prop kind. */
export const PROP_CLEARANCE: Readonly<Record<PropKind, number>> = {
  house: 5,
  chapel: 8,
  arena: 18,
  dock: 8,
  stall: 3,
  well: 2.5,
  sign: 1,
  lantern: 1,
  fence: 3.5,
  ruin: 4,
  campfire: 2.5,
  shrine: 2,
  barge: 6,
  plot: 5,
};

/** Base height at which a prop is placed. Docks/barges float at deck level. */
export function propBaseHeight(world: WorldMapDef, p: PropInstance): number {
  if (p.kind === 'dock') return WATER_LEVEL + 0.45;
  if (p.kind === 'barge') return WATER_LEVEL;
  return sampleHeight(world, p.x, p.z);
}

export function propFromDef(p: PropDef): PropInstance {
  return { kind: p.kind, x: p.position.x, z: p.position.z, rotation: p.rotation ?? 0, scale: p.scale ?? 1, ...(p.tint ? { tint: p.tint } : {}) };
}

/** Build the merged geometry arrays + colliders for a set of props. */
export function buildProps(world: WorldMapDef, props: readonly PropInstance[]): PropGeometryBuilder {
  const b = new PropGeometryBuilder();
  for (const p of props) {
    const y = propBaseHeight(world, p);
    b.withTransform({ rot: p.rotation, s: p.scale, tx: p.x, ty: y, tz: p.z }, () => KIT[p.kind](b, p.tint));
  }
  // Walk areas carry deck height in world space.
  return b;
}

/** True when (x, z) lies on a walk area; returns its deck height or null. */
export function walkAreaDeck(areas: readonly WalkArea[], x: number, z: number): number | null {
  for (const a of areas) {
    const dx = x - a.x;
    const dz = z - a.z;
    const c = Math.cos(-a.rot);
    const s = Math.sin(-a.rot);
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    if (Math.abs(lx) <= a.hx && Math.abs(lz) <= a.hz) return WATER_LEVEL + 0.45 + a.deck;
  }
  return null;
}
