/**
 * Combat terrain hazards: one flat ground FX quad per `CombatState.hazards` instance,
 * laid under that side of the line-up. Delivered `fxAssetId` sheets animate through the
 * manifest grid; until delivered the quad is a flat debug wireframe. `hazardSpawn` grows
 * it in, `hazardTick` pulses it, `hazardExpire` fades it out. Frozen during hit-stop.
 */
import * as THREE from 'three';
import type { CombatSide, CombatState, GameDatabase, HazardInstance } from '@/types/contracts';
import type { AssetRegistryLoader } from './assets/AssetRegistryLoader';
import { frameAspect, manifestFrameRect } from './assets/manifestSprite';

export const HAZARD_DEBUG_COLOR = 0xff3df2;
const SPAWN_TIME = 0.35;
const PULSE_TIME = 0.35;
const EXPIRE_TIME = 0.5;

/** Pure: scale / opacity of a hazard quad from its animation clocks. */
export function hazardEnvelope(spawnT: number, pulseT: number, expireT: number | null): { scale: number; opacity: number } {
  const grow = Math.min(1, spawnT / SPAWN_TIME);
  const easeGrow = 1 - (1 - grow) * (1 - grow);
  const pulse = pulseT < PULSE_TIME ? Math.sin((pulseT / PULSE_TIME) * Math.PI) * 0.08 : 0;
  const fade = expireT === null ? 1 : Math.max(0, 1 - expireT / EXPIRE_TIME);
  return { scale: (0.6 + 0.4 * easeGrow + pulse) * (expireT === null ? 1 : 1 + 0.15 * (1 - fade)), opacity: easeGrow * fade };
}

interface Visual {
  readonly instanceId: number;
  readonly hazardId: string;
  readonly side: CombatSide;
  readonly mesh: THREE.Mesh;
  readonly wire: THREE.MeshBasicMaterial;
  readonly sheet: THREE.MeshBasicMaterial;
  tex: THREE.Texture | null;
  unbind: () => void;
  spawnT: number;
  pulseT: number;
  expireT: number | null;
  clock: number;
}

export type SideSpan = (side: CombatSide) => { x: number; z: number; width: number } | null;

export class HazardLayer {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1, 4, 2).rotateX(-Math.PI / 2);
  private readonly visuals = new Map<number, Visual>();
  private lastLog = 0;
  private combatRef: CombatState | null = null;

  constructor(
    private readonly db: GameDatabase,
    private readonly loader: AssetRegistryLoader,
  ) {
    this.root.name = 'hazards';
  }

  get count(): number {
    return this.visuals.size;
  }

  private fxAsset(hazardId: string): string {
    return this.db.hazards?.[hazardId]?.fxAssetId ?? hazardId;
  }

  private create(h: HazardInstance): Visual {
    const wire = new THREE.MeshBasicMaterial({ color: HAZARD_DEBUG_COLOR, wireframe: true, transparent: true, depthWrite: false });
    const sheet = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(this.geometry, wire);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.name = `hazard ${h.hazardId}#${h.instanceId}`;
    const v: Visual = { instanceId: h.instanceId, hazardId: h.hazardId, side: h.side, mesh, wire, sheet, tex: null, unbind: () => undefined, spawnT: 0, pulseT: 9, expireT: null, clock: 0 };
    v.unbind = this.loader.bind(this.fxAsset(h.hazardId), (tex) => {
      // Own clone (shared image source) so each quad animates its own UV window.
      const clone = tex.clone();
      clone.needsUpdate = true;
      v.tex?.dispose();
      v.tex = clone;
      const had = sheet.map !== null;
      sheet.map = clone;
      if (!had) sheet.needsUpdate = true;
      mesh.material = sheet;
    });
    this.root.add(mesh);
    this.visuals.set(h.instanceId, v);
    return v;
  }

  private destroy(v: Visual): void {
    v.unbind();
    this.root.remove(v.mesh);
    v.wire.dispose();
    v.sheet.dispose();
    v.tex?.dispose();
    this.visuals.delete(v.instanceId);
  }

  /** `dt` should already exclude hit-stop time. */
  update(dt: number, combat: CombatState | null, span: SideSpan, ground: (x: number, z: number) => number): void {
    if (!combat) {
      for (const v of [...this.visuals.values()]) this.destroy(v);
      this.lastLog = 0;
      this.combatRef = null;
      return;
    }
    if (this.combatRef && this.combatRef.encounterId !== combat.encounterId) this.lastLog = 0;
    if (combat.log.length < this.lastLog) this.lastLog = 0;
    this.combatRef = combat;
    for (let i = this.lastLog; i < combat.log.length; i++) {
      const e = combat.log[i];
      if (!e) continue;
      if (e.type === 'hazardTick') {
        const v = this.visuals.get(e.instanceId);
        if (v) v.pulseT = 0;
      } else if (e.type === 'hazardExpire') {
        const v = this.visuals.get(e.instanceId);
        if (v && v.expireT === null) v.expireT = 0;
      } else if (e.type === 'hazardSpawn') {
        const v = this.visuals.get(e.instanceId);
        if (v) {
          v.expireT = null;
          v.pulseT = 0;
        }
      }
    }
    this.lastLog = combat.log.length;

    const live = new Set<number>();
    for (const h of combat.hazards ?? []) {
      live.add(h.instanceId);
      const v = this.visuals.get(h.instanceId) ?? this.create(h);
      if (v.expireT !== null && v.expireT > EXPIRE_TIME) v.expireT = null;
    }
    for (const v of [...this.visuals.values()]) {
      if (!live.has(v.instanceId) && v.expireT === null) v.expireT = 0;
      v.spawnT += dt;
      v.pulseT += dt;
      v.clock += dt;
      if (v.expireT !== null) v.expireT += dt;
      const env = hazardEnvelope(v.spawnT, v.pulseT, v.expireT);
      if (v.expireT !== null && env.opacity <= 0 && !live.has(v.instanceId)) {
        this.destroy(v);
        continue;
      }
      const s = span(v.side);
      if (!s) {
        v.mesh.visible = false;
        continue;
      }
      const entry = this.loader.entryFor(this.fxAsset(v.hazardId));
      const width = Math.max(4, s.width + 2.5) * env.scale;
      const depth = width * Math.min(0.75, Math.max(0.35, frameAspect(entry)));
      v.mesh.visible = true;
      v.mesh.position.set(s.x, ground(s.x, s.z) + 0.06, s.z);
      v.mesh.scale.set(width, 1, depth);
      v.wire.opacity = env.opacity;
      v.sheet.opacity = env.opacity;
      if (v.tex && entry) {
        const r = manifestFrameRect(entry, 'loop', null, v.clock, entry.loop ?? true);
        v.tex.offset.set(r[0], r[1]);
        v.tex.repeat.set(r[2], r[3]);
      }
    }
  }

  dispose(): void {
    for (const v of [...this.visuals.values()]) this.destroy(v);
    this.geometry.dispose();
  }
}
