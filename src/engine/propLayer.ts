/**
 * Prop rendering over the bootstrapper's pattern atlas with one small toon shader:
 *  - StaticPropLayer: authored props merged into ONE mesh per chunk (frustum-culled per chunk).
 *  - DressingLayer:   biome scatter props as one InstancedMesh per kind per near chunk.
 *  - SailsLayer:      every windmill rotor in one animated InstancedMesh.
 *  - DynamicPropLayer: township buildings / plots / the barge, one mesh each (scale pops on upgrades).
 */
import * as THREE from 'three';
import { getPattern, makeCanvas } from '@/engine/bootstrapAssets';
import { canvasTexture, sharedUniforms } from '@/engine/shaders';
import type { WorldMapDef } from '@/types/contracts';
import type { Collider } from './movement';
import { buildKindTemplate, buildProps, propBaseHeight, propColliders, PropGeometryBuilder, PATTERN_SLOTS, SAILS_HUB, type PropInstance, type PropKind, type WalkArea } from './props';
import { chunkOf } from './streaming';

const SLOT_PX = 64;

let atlasCanvas: HTMLCanvasElement | null = null;
function patternAtlas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const c = makeCanvas(SLOT_PX * PATTERN_SLOTS.length, SLOT_PX);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    PATTERN_SLOTS.forEach((slot, i) => {
      if (slot === 'plain') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(i * SLOT_PX, 0, SLOT_PX, SLOT_PX);
      } else ctx.drawImage(getPattern(slot), i * SLOT_PX, 0);
    });
  }
  atlasCanvas = c;
  return c;
}

const propVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSlot;
attribute float aEmissive;
#ifdef INST_TINT
attribute vec3 aInstTint;
#endif
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
varying float vSlot;
varying float vEmissive;
void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vUv = uv;
  vColor = aColor;
  #ifdef INST_TINT
    vColor *= aInstTint;
  #endif
  vSlot = aSlot;
  vEmissive = aEmissive;
  vNormal = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}
`;

const propFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uSlots;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadeColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
varying float vSlot;
varying float vEmissive;
void main() {
  vec2 f = fract(vUv);
  float inset = 0.5 / 64.0;
  vec2 a = vec2((vSlot + inset + f.x * (1.0 - 2.0 * inset)) / uSlots, inset + f.y * (1.0 - 2.0 * inset));
  vec3 albedo = texture2D(uAtlas, a).rgb * vColor;
  vec3 n = normalize(vNormal);
  float ndl = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
  float band = floor(ndl * 3.0 + 0.5) / 3.0;
  vec3 lit = albedo * mix(uShadeColor, uSunColor, mix(ndl, band, 0.7));
  // Emissive surfaces (lamps, crystals, wards) breathe softly.
  float pulse = 0.92 + 0.08 * sin(uTime * 2.3 + vColor.r * 6.0);
  gl_FragColor = vec4(mix(lit, vColor * 1.1 * pulse, vEmissive), 1.0);
}
`;

export function createPropMaterial(instanced = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: instanced ? 'EmberwakePropsInstanced' : 'EmberwakeProps',
    vertexShader: propVertex,
    fragmentShader: propFragment,
    defines: instanced ? { INST_TINT: '' } : {},
    uniforms: {
      uAtlas: { value: canvasTexture(patternAtlas(), { pixel: true }) },
      uSlots: { value: PATTERN_SLOTS.length },
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uShadeColor: sharedUniforms.uShadeColor,
      uTime: sharedUniforms.uTime,
    },
  });
}

/** Upload a builder's arrays as a BufferGeometry (null when empty). */
export function geometryFromBuilder(b: PropGeometryBuilder): THREE.BufferGeometry | null {
  if (b.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(b.colors, 3));
  g.setAttribute('aSlot', new THREE.Float32BufferAttribute(b.tiles, 1));
  g.setAttribute('aEmissive', new THREE.Float32BufferAttribute(b.emissive, 1));
  g.setIndex(b.indices);
  g.computeBoundingSphere();
  return g;
}

export interface PropBuild {
  readonly mesh: THREE.Mesh | null;
  readonly colliders: readonly Collider[];
  readonly walkAreas: readonly WalkArea[];
}

export function buildPropMesh(world: WorldMapDef, props: readonly PropInstance[], material: THREE.Material): PropBuild {
  const b = buildProps(world, props.filter((p) => p.kind !== 'sails'));
  const g = geometryFromBuilder(b);
  const mesh = g ? new THREE.Mesh(g, material) : null;
  if (mesh) mesh.name = 'props';
  return { mesh, colliders: b.colliders, walkAreas: b.walkAreas };
}

/* ── Shared material/template cache ──────────────────────────────────────── */

export class PropMaterials {
  readonly merged = createPropMaterial(false);
  readonly instanced = createPropMaterial(true);
  private readonly templates = new Map<PropKind, THREE.BufferGeometry | null>();

  template(kind: PropKind): THREE.BufferGeometry | null {
    if (!this.templates.has(kind)) this.templates.set(kind, geometryFromBuilder(buildKindTemplate(kind)));
    return this.templates.get(kind) ?? null;
  }

  dispose(): void {
    this.merged.dispose();
    this.instanced.dispose();
    for (const g of this.templates.values()) g?.dispose();
    this.templates.clear();
  }
}

/* ── Authored props: one merged mesh per chunk ───────────────────────────── */

export class StaticPropLayer {
  readonly root = new THREE.Group();
  /** chunk key → colliders (fed to the ColliderGrid by the owner). */
  readonly collidersByChunk = new Map<string, readonly Collider[]>();
  readonly walkAreas: WalkArea[] = [];
  readonly windmills: PropInstance[] = [];
  private readonly meshes: THREE.Mesh[] = [];

  constructor(world: WorldMapDef, props: readonly PropInstance[], mats: PropMaterials) {
    this.root.name = 'props';
    const byChunk = new Map<string, PropInstance[]>();
    for (const p of props) {
      const key = chunkOf(p.x, p.z).key;
      const list = byChunk.get(key) ?? [];
      list.push(p);
      byChunk.set(key, list);
      if (p.kind === 'windmill') this.windmills.push(p);
    }
    for (const [key, list] of byChunk) {
      const build = buildPropMesh(world, list, mats.merged);
      if (build.mesh) {
        build.mesh.name = `props ${key}`;
        this.root.add(build.mesh);
        this.meshes.push(build.mesh);
      }
      this.collidersByChunk.set(key, build.colliders);
      this.walkAreas.push(...build.walkAreas);
    }
  }

  get drawables(): number {
    return this.meshes.length;
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
  }
}

/* ── Biome dressing: InstancedMesh per kind per chunk ────────────────────── */

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

interface DressedChunk {
  readonly group: THREE.Group;
  readonly meshes: THREE.InstancedMesh[];
  readonly colliders: readonly Collider[];
  readonly windmills: readonly PropInstance[];
}

export class DressingLayer {
  readonly root = new THREE.Group();
  private readonly chunks = new Map<string, DressedChunk>();

  constructor(
    private readonly world: WorldMapDef,
    private readonly mats: PropMaterials,
  ) {
    this.root.name = 'dressing';
  }

  has(key: string): boolean {
    return this.chunks.has(key);
  }

  /** Build the chunk's instanced dressing; returns its colliders. */
  set(key: string, instances: readonly PropInstance[]): readonly Collider[] {
    this.remove(key);
    const group = new THREE.Group();
    group.name = `dressing ${key}`;
    const byKind = new Map<PropKind, PropInstance[]>();
    for (const p of instances) {
      const list = byKind.get(p.kind) ?? [];
      list.push(p);
      byKind.set(p.kind, list);
    }
    const meshes: THREE.InstancedMesh[] = [];
    const colliders: Collider[] = [];
    for (const [kind, list] of byKind) {
      const geo = this.mats.template(kind);
      if (!geo) continue;
      // Each kind-mesh needs its own geometry object for the per-instance tint attribute.
      const g = geo.clone();
      const tint = new Float32Array(list.length * 3);
      const mesh = new THREE.InstancedMesh(g, this.mats.instanced, list.length);
      list.forEach((p, i) => {
        const y = propBaseHeight(this.world, p);
        tmpE.set(0, p.rotation, 0);
        tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpP.set(p.x, y, p.z), tmpQ, tmpS.setScalar(p.scale));
        mesh.setMatrixAt(i, tmpM);
        const v = 0.9 + (((Math.abs(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1) * 0.2);
        tint.set([v, v, v], i * 3);
        colliders.push(...propColliders(this.world, p).colliders);
      });
      g.setAttribute('aInstTint', new THREE.InstancedBufferAttribute(tint, 3));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `dress ${kind}`;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.root.add(group);
    this.chunks.set(key, { group, meshes, colliders, windmills: instances.filter((p) => p.kind === 'windmill') });
    return colliders;
  }

  windmills(): PropInstance[] {
    const out: PropInstance[] = [];
    for (const c of this.chunks.values()) out.push(...c.windmills);
    return out;
  }

  remove(key: string): void {
    const c = this.chunks.get(key);
    if (!c) return;
    this.root.remove(c.group);
    for (const m of c.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.chunks.delete(key);
  }

  dispose(): void {
    for (const key of [...this.chunks.keys()]) this.remove(key);
  }
}

/* ── Windmill rotors ─────────────────────────────────────────────────────── */

export class SailsLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private hubs: { x: number; y: number; z: number; rot: number; s: number; phase: number }[] = [];
  private key = '';

  constructor(
    private readonly world: WorldMapDef,
    mats: PropMaterials,
    capacity = 64,
  ) {
    this.capacity = capacity;
    const geo = (mats.template('sails') ?? new THREE.BufferGeometry()).clone();
    const tint = new Float32Array(capacity * 3).fill(1);
    geo.setAttribute('aInstTint', new THREE.InstancedBufferAttribute(tint, 3));
    this.mesh = new THREE.InstancedMesh(geo, mats.instanced, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'windmill sails';
  }

  setWindmills(list: readonly PropInstance[], near: { x: number; z: number }): void {
    const sorted = [...list].sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z)).slice(0, this.capacity);
    const key = sorted.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    this.hubs = sorted.map((p) => {
      const base = propBaseHeight(this.world, p);
      const c = Math.cos(p.rotation);
      const sn = Math.sin(p.rotation);
      return {
        x: p.x + (SAILS_HUB.x * c + SAILS_HUB.z * sn) * p.scale,
        y: base + SAILS_HUB.y * p.scale,
        z: p.z + (-SAILS_HUB.x * sn + SAILS_HUB.z * c) * p.scale,
        rot: p.rotation,
        s: p.scale,
        phase: (p.x * 0.37 + p.z * 0.11) % (Math.PI * 2),
      };
    });
  }

  update(time: number, windSpeed: number): void {
    const spin = 0.4 + windSpeed * 0.12;
    this.hubs.forEach((h, i) => {
      tmpE.set(0, h.rot, time * spin + h.phase, 'YZX');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(h.x, h.y, h.z), tmpQ, tmpS.setScalar(h.s));
      this.mesh.setMatrixAt(i, tmpM);
    });
    this.mesh.count = this.hubs.length;
    this.mesh.visible = this.hubs.length > 0;
    if (this.hubs.length > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/* ── Township + barge: one mesh per instance ─────────────────────────────── */

export interface DynamicProp {
  readonly id: string;
  readonly prop: PropInstance;
}

interface DynamicEntry {
  readonly mesh: THREE.Mesh | null;
  readonly key: string;
  readonly colliders: readonly Collider[];
  readonly walkAreas: readonly WalkArea[];
  readonly prop: PropInstance;
  pop: number;
}

/** Scale overshoot of a construction "pop" at normalized time t (0..1). */
export function popScale(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  return 1 + Math.sin(t * Math.PI) * 0.12 * (1 - t) - (t < 0.15 ? (0.15 - t) * 1.2 : 0);
}

export class DynamicPropLayer {
  readonly root = new THREE.Group();
  private readonly entries = new Map<string, DynamicEntry>();
  colliders: readonly Collider[] = [];
  walkAreas: readonly WalkArea[] = [];

  constructor(
    private readonly world: WorldMapDef,
    private readonly mats: PropMaterials,
  ) {
    this.root.name = 'dynamic props';
  }

  /** Replace the set; returns ids whose prop changed (new building, new level). */
  set(list: readonly DynamicProp[]): string[] {
    const changed: string[] = [];
    const seen = new Set<string>();
    for (const { id, prop } of list) {
      seen.add(id);
      const key = JSON.stringify(prop);
      const old = this.entries.get(id);
      if (old && old.key === key) continue;
      if (old) this.drop(id);
      const g = geometryFromBuilder(buildKindTemplate(prop.kind, prop.tint));
      let mesh: THREE.Mesh | null = null;
      if (g) {
        mesh = new THREE.Mesh(g, this.mats.merged);
        mesh.position.set(prop.x, propBaseHeight(this.world, prop), prop.z);
        mesh.rotation.y = prop.rotation;
        mesh.scale.setScalar(prop.scale);
        mesh.name = `dyn ${id}`;
        this.root.add(mesh);
      }
      const col = propColliders(this.world, prop);
      this.entries.set(id, { mesh, key, colliders: col.colliders, walkAreas: col.walkAreas, prop, pop: old ? 0 : 1 });
      if (old) changed.push(id);
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.drop(id);
    this.colliders = [...this.entries.values()].flatMap((e) => e.colliders);
    this.walkAreas = [...this.entries.values()].flatMap((e) => e.walkAreas);
    return changed;
  }

  position(id: string): PropInstance | null {
    return this.entries.get(id)?.prop ?? null;
  }

  update(dt: number): void {
    for (const e of this.entries.values()) {
      if (e.pop >= 1 || !e.mesh) continue;
      e.pop = Math.min(1, e.pop + dt / 0.7);
      e.mesh.scale.setScalar(e.prop.scale * popScale(e.pop));
    }
  }

  private drop(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.mesh) {
      this.root.remove(e.mesh);
      e.mesh.geometry.dispose();
    }
    this.entries.delete(id);
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.drop(id);
  }
}
