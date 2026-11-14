/**
 * Cheap world FX: every mote (dust, debris, updraft, wind, leaves, ward shards,
 * construction puffs) in ONE THREE.Points draw, plus a single arrow mesh for
 * the hunting shot.
 */
import * as THREE from 'three';
import { sharedUniforms } from '@/engine/shaders';

const moteVertex = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uScale / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const moteFragment = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  // Chunky two-step falloff keeps the pixel-art read.
  float a = vColor.a * (r < 0.45 ? 1.0 : 0.55);
  gl_FragColor = vec4(vColor.rgb * a, a);
}
`;

export interface MoteSpec {
  readonly color: readonly [number, number, number];
  readonly count: number;
  /** Initial speed (m/s) in a random direction, scaled per axis by `spread`. */
  readonly speed: number;
  readonly up?: number;
  readonly gravity?: number;
  readonly life?: number;
  readonly size?: number;
  readonly spread?: number;
  /** Additive glow (true) vs. dusty normal blend look (false) — both drawn additively; dust is dimmer. */
  readonly glow?: boolean;
  /** Random position jitter radius at spawn. */
  readonly jitter?: number;
  /** Constant drift (m/s) added to velocity, e.g. wind. */
  readonly drift?: readonly [number, number];
}

export class MoteLayer {
  readonly points: THREE.Points;
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private seed = 1;

  constructor(capacity = 900) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.grav = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      name: 'EmberwakeMotes',
      vertexShader: moteVertex,
      fragmentShader: moteFragment,
      uniforms: { uScale: { value: 400 }, uTime: sharedUniforms.uTime },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = 'motes';
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /** Projection scale so `aSize` is in metres: viewport height / (2 tan(fov/2)). */
  setViewport(heightPx: number, fovDeg: number): void {
    const u = this.material.uniforms.uScale;
    if (u) u.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(x: number, y: number, z: number, spec: MoteSpec): void {
    const sp = spec.spread ?? 1;
    for (let n = 0; n < spec.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const j = spec.jitter ?? 0;
      this.pos[i * 3] = x + (this.rnd() - 0.5) * 2 * j;
      this.pos[i * 3 + 1] = y + (this.rnd() - 0.5) * j * 0.5;
      this.pos[i * 3 + 2] = z + (this.rnd() - 0.5) * 2 * j;
      const a = this.rnd() * Math.PI * 2;
      const s = spec.speed * (0.4 + this.rnd() * 0.6);
      this.vel[i * 3] = Math.cos(a) * s * sp + (spec.drift?.[0] ?? 0);
      this.vel[i * 3 + 1] = (spec.up ?? 0) * (0.6 + this.rnd() * 0.6);
      this.vel[i * 3 + 2] = Math.sin(a) * s * sp + (spec.drift?.[1] ?? 0);
      const life = (spec.life ?? 1) * (0.7 + this.rnd() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = spec.gravity ?? 0;
      this.size[i] = (spec.size ?? 0.25) * (0.7 + this.rnd() * 0.6);
      const alpha = spec.glow ? 0.9 : 0.55;
      this.baseAlpha[i] = alpha;
      this.col[i * 4] = spec.color[0];
      this.col[i * 4 + 1] = spec.color[1];
      this.col[i * 4 + 2] = spec.color[2];
      this.col[i * 4 + 3] = alpha;
    }
  }

  update(dt: number): void {
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.life[i] ?? 0) <= 0) {
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const l = (this.life[i] ?? 0) - dt;
      this.life[i] = l;
      this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] ?? 0) - (this.grav[i] ?? 0) * dt;
      const drag = Math.exp(-1.2 * dt);
      this.vel[i * 3] = (this.vel[i * 3] ?? 0) * drag;
      this.vel[i * 3 + 2] = (this.vel[i * 3 + 2] ?? 0) * drag;
      this.pos[i * 3] = (this.pos[i * 3] ?? 0) + (this.vel[i * 3] ?? 0) * dt;
      this.pos[i * 3 + 1] = (this.pos[i * 3 + 1] ?? 0) + (this.vel[i * 3 + 1] ?? 0) * dt;
      this.pos[i * 3 + 2] = (this.pos[i * 3 + 2] ?? 0) + (this.vel[i * 3 + 2] ?? 0) * dt;
      const k = Math.max(0, l / (this.maxLife[i] ?? 0));
      this.col[i * 4 + 3] = (this.baseAlpha[i] ?? 0) * Math.min(1, k * 2.5);
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize']) {
      const attr = g.getAttribute(name);
      if (attr) attr.needsUpdate = true;
    }
    this.points.visible = alive > 0;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** One arrow in flight at a time (the hunting shot). */
export class ArrowFx {
  readonly mesh: THREE.Mesh;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private t = 1;
  private duration = 0.3;

  constructor() {
    const shaft = new THREE.BoxGeometry(1.1, 0.05, 0.05);
    shaft.translate(-0.55, 0, 0);
    const head = new THREE.ConeGeometry(0.09, 0.25, 4);
    head.rotateZ(-Math.PI / 2);
    head.translate(0.1, 0, 0);
    const merged = new THREE.BufferGeometry();
    const parts = [shaft, head].map((g) => g.toNonIndexed());
    const arrays = parts.map((g) => Float32Array.from(g.getAttribute('position').array));
    const pos = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let off = 0;
    for (const a of arrays) {
      pos.set(a, off);
      off += a.length;
    }
    for (const g of parts) g.dispose();
    shaft.dispose();
    head.dispose();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'arrow';
  }

  fire(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
    this.from.set(fx, fy, fz);
    this.to.set(tx, ty, tz);
    this.duration = Math.max(0.12, this.from.distanceTo(this.to) / 70);
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t >= 1) {
      this.mesh.visible = false;
      return;
    }
    this.t = Math.min(1, this.t + dt / this.duration);
    const arc = Math.sin(this.t * Math.PI) * this.from.distanceTo(this.to) * 0.05;
    this.mesh.position.lerpVectors(this.from, this.to, this.t);
    this.mesh.position.y += arc;
    this.mesh.rotation.set(0, -Math.atan2(this.to.z - this.from.z, this.to.x - this.from.x), Math.cos(this.t * Math.PI) * 0.15);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
