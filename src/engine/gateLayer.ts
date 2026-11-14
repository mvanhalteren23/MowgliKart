/**
 * Traversal gate visuals: one merged mesh per gate (frustum-culled), ambient
 * motes for gates near the player, the clearing animation of permanent gates
 * and the grapple rope.
 */
import * as THREE from 'three';
import { sampleHeight } from '@/engine/bootstrapAssets';
import type { TraversalGateDef, Vec2, WorldMapDef } from '@/types/contracts';
import type { MoteLayer } from './fx';
import { buildGateGeometry } from './gateKit';
import { geometryFromBuilder, type PropMaterials } from './propLayer';

interface GateVisual {
  readonly def: TraversalGateDef;
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh | null;
  readonly baseY: number;
  /** null = standing; 0..1 = clearing animation progress. */
  clearing: number | null;
  emitAcc: number;
}

const AMBIENT_RANGE = 70;

export class GateLayer {
  readonly root = new THREE.Group();
  private readonly visuals = new Map<string, GateVisual>();
  private readonly rope: THREE.Line;
  private readonly ropePos = new Float32Array(6);

  constructor(
    private readonly world: WorldMapDef,
    private readonly mats: PropMaterials,
  ) {
    this.root.name = 'gates';
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.ropePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rope = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8d6a8 }));
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    this.root.add(this.rope);
  }

  has(id: string): boolean {
    return this.visuals.has(id);
  }

  /** Show exactly these gates (gates mid-clear are left to finish). */
  sync(present: readonly TraversalGateDef[]): void {
    const want = new Set(present.map((g) => g.id));
    for (const def of present) if (!this.visuals.has(def.id)) this.add(def);
    for (const [id, v] of this.visuals) if (!want.has(id) && v.clearing === null) this.remove(id);
  }

  private add(def: TraversalGateDef): void {
    const group = new THREE.Group();
    const baseY = sampleHeight(this.world, def.position.x, def.position.z);
    group.position.set(def.position.x, baseY, def.position.z);
    group.rotation.y = def.rotation ?? 0;
    group.name = `gate ${def.id}`;
    const geo = geometryFromBuilder(buildGateGeometry(def));
    const mesh = geo ? new THREE.Mesh(geo, this.mats.merged) : null;
    if (mesh) group.add(mesh);
    this.root.add(group);
    this.visuals.set(def.id, { def, group, mesh, baseY, clearing: null, emitAcc: 0 });
  }

  private remove(id: string): void {
    const v = this.visuals.get(id);
    if (!v) return;
    this.root.remove(v.group);
    v.mesh?.geometry.dispose();
    this.visuals.delete(id);
  }

  /** Begin the permanent-clear animation (driven by `setClearProgress`). */
  beginClear(id: string): void {
    const v = this.visuals.get(id);
    if (v && v.clearing === null) v.clearing = 0;
  }

  /** Apply the clear animation at progress `t` (0..1); at 1 the gate is removed. */
  setClearProgress(id: string, t: number, motes: MoteLayer): void {
    const v = this.visuals.get(id);
    if (!v || v.clearing === null) return;
    const prev = v.clearing;
    v.clearing = t;
    const { def, group, baseY } = v;
    const k = Math.min(1, Math.max(0, t));
    const at = (local: number): void => {
      if (prev < local && k >= local) {
        const c = def.kind === 'ward' ? ([0.7, 0.95, 1] as const) : def.kind === 'grove' ? ([0.45, 0.75, 0.35] as const) : ([0.72, 0.66, 0.6] as const);
        motes.emit(def.position.x, baseY + 1.2, def.position.z, { color: c, count: def.kind === 'ward' ? 70 : 55, speed: 5, up: 4, gravity: def.kind === 'ward' ? 2 : 9, life: 1.2, size: def.kind === 'ward' ? 0.22 : 0.4, jitter: def.width * 0.35, glow: def.kind === 'ward' });
      }
    };
    at(0.02);
    switch (def.kind) {
      case 'boulder':
        group.scale.setScalar(Math.max(0.01, 1 - k * 1.05));
        group.position.y = baseY - k * 1.2;
        break;
      case 'grove':
        group.position.y = baseY - k * k * 7;
        group.scale.set(1 + k * 0.4, 1, 1);
        break;
      case 'ward':
        group.scale.set(1, Math.max(0.01, 1 - k), 1);
        at(0.5);
        break;
      default:
        group.position.y = baseY - k * 4;
        break;
    }
    if (k >= 1) this.remove(id);
  }

  /** Point the grapple rope from `a` to `b` (null hides it). */
  setRope(a: THREE.Vector3 | null, b?: THREE.Vector3): void {
    if (!a || !b) {
      this.rope.visible = false;
      return;
    }
    this.ropePos.set([a.x, a.y, a.z, b.x, b.y, b.z]);
    const attr = this.rope.geometry.getAttribute('position');
    attr.needsUpdate = true;
    this.rope.visible = true;
  }

  /** Ambient motes for gates near the player. */
  update(dt: number, player: Vec2, motes: MoteLayer, wind: { x: number; z: number }): void {
    for (const v of this.visuals.values()) {
      const { def } = v;
      if (Math.hypot(def.position.x - player.x, def.position.z - player.z) > AMBIENT_RANGE) continue;
      v.emitAcc += dt;
      const rate = def.kind === 'chasm' ? 0.06 : def.kind === 'ward' ? 0.12 : def.kind === 'river' ? 0.2 : def.kind === 'grove' ? 0.5 : 0;
      if (rate <= 0 || v.clearing !== null) continue;
      while (v.emitAcc > rate) {
        v.emitAcc -= rate;
        const rot = def.rotation ?? 0;
        const lx = (Math.random() - 0.5) * def.width;
        const lz = (Math.random() - 0.5) * def.depth;
        const x = def.position.x + lx * Math.cos(rot) + lz * Math.sin(rot);
        const z = def.position.z - lx * Math.sin(rot) + lz * Math.cos(rot);
        switch (def.kind) {
          case 'chasm':
            motes.emit(x, v.baseY - 0.5, z, { color: [0.85, 0.92, 1], count: 1, speed: 0.2, up: 3.2, life: 1.6, size: 0.14, glow: true });
            break;
          case 'ward':
            motes.emit(x, v.baseY + 0.5 + Math.random() * 3, z, { color: [0.6, 0.9, 1], count: 1, speed: 0.2, up: 0.4, life: 1.1, size: 0.12, glow: true });
            break;
          case 'river':
            motes.emit(x, v.baseY + 0.15, z, { color: [0.92, 0.98, 1], count: 1, speed: 0.4, life: 0.7, size: 0.12, drift: [wind.x, wind.z] });
            break;
          case 'grove':
            motes.emit(x, v.baseY + 4.5, z, { color: [0.5, 0.72, 0.36], count: 1, speed: 0.3, gravity: 0.6, life: 2.2, size: 0.16, drift: [wind.x * 1.5, wind.z * 1.5] });
            break;
          default:
            break;
        }
      }
    }
  }

  dispose(): void {
    for (const id of [...this.visuals.keys()]) this.remove(id);
    this.rope.geometry.dispose();
    (this.rope.material as THREE.Material).dispose();
  }
}
