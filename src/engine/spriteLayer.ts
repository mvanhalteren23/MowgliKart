/**
 * Instanced sprite rendering: one InstancedMesh per sprite sheet (all NPCs,
 * animals, party members and encounter sprites sharing a sheet share a draw
 * call), one InstancedMesh for every contact shadow, and the per-entity
 * resonance auras.
 */
import * as THREE from 'three';
import { getSpriteMeta } from '@/engine/bootstrapAssets';
import { createAuraMaterial, createBillboardGeometry, createSpriteInstanceAttributes, createSpriteMaterial, setAuraColors, shadowTexture, spriteTexture } from '@/engine/shaders';
import type { SpriteSheetId } from '@/types/contracts';
import type { EngineEntity } from './ecs';
import { parseHexColor, spriteFrameRect, spriteWorldSize } from './spriteMath';

interface Batch {
  mesh: THREE.InstancedMesh;
  uvRect: THREE.InstancedBufferAttribute;
  tint: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
}

const tmpMatrix = new THREE.Matrix4();

export class SpriteBatcher {
  readonly root = new THREE.Group();
  private readonly batches = new Map<SpriteSheetId, Batch>();
  private readonly materials = new Map<SpriteSheetId, THREE.ShaderMaterial>();

  constructor() {
    this.root.name = 'sprites';
  }

  private material(sheet: SpriteSheetId): THREE.ShaderMaterial {
    let m = this.materials.get(sheet);
    if (!m) {
      m = createSpriteMaterial(spriteTexture(sheet));
      this.materials.set(sheet, m);
    }
    return m;
  }

  private batch(sheet: SpriteSheetId, need: number): Batch {
    const existing = this.batches.get(sheet);
    if (existing && existing.capacity >= need) return existing;
    const capacity = Math.max(8, existing ? existing.capacity * 2 : 8, need);
    const geo = createBillboardGeometry();
    const { uvRect, tint } = createSpriteInstanceAttributes(geo, capacity);
    const mesh = new THREE.InstancedMesh(geo, this.material(sheet), capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = `sprites ${sheet}`;
    mesh.count = 0;
    if (existing) {
      this.root.remove(existing.mesh);
      existing.mesh.geometry.dispose();
      existing.mesh.dispose();
    }
    const b: Batch = { mesh, uvRect, tint, capacity, count: existing?.count ?? 0 };
    if (existing) {
      // Growing mid-frame: carry over the instances already written.
      mesh.instanceMatrix.array.set(existing.mesh.instanceMatrix.array.subarray(0, existing.count * 16));
      uvRect.array.set(existing.uvRect.array.subarray(0, existing.count * 4));
      tint.array.set(existing.tint.array.subarray(0, existing.count * 4));
    }
    this.batches.set(sheet, b);
    this.root.add(mesh);
    return b;
  }

  begin(): void {
    for (const b of this.batches.values()) b.count = 0;
  }

  /** Queue one sprite. `facing` must already be camera-relative. */
  add(e: EngineEntity): void {
    const s = e.sprite;
    const p = e.position;
    if (!s || !p) return;
    const pending = this.batches.get(s.sheet);
    const b = this.batch(s.sheet, (pending?.count ?? 0) + 1);
    const i = b.count++;
    const meta = getSpriteMeta(s.sheet);
    const size = spriteWorldSize(meta);
    const k = e.scale ?? 1;
    tmpMatrix.makeScale(size.width * k, size.height * k, 1);
    tmpMatrix.setPosition(p.x, p.y, p.z);
    b.mesh.setMatrixAt(i, tmpMatrix);
    const r = spriteFrameRect(meta, s.facing, s.anim, s.frameTime);
    b.uvRect.setXYZW(i, r[0], r[1], r[2], r[3]);
    const c = parseHexColor(s.tint);
    b.tint.setXYZW(i, c[0], c[1], c[2], Math.min(1, Math.max(0, s.flash ?? 0)));
  }

  end(): void {
    for (const b of this.batches.values()) {
      b.mesh.count = b.count;
      b.mesh.visible = b.count > 0;
      if (b.count > 0) {
        b.mesh.instanceMatrix.needsUpdate = true;
        b.uvRect.needsUpdate = true;
        b.tint.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      b.mesh.geometry.dispose();
      b.mesh.dispose();
    }
    for (const m of this.materials.values()) m.dispose();
    this.batches.clear();
    this.materials.clear();
  }
}

/** Every contact shadow in one instanced draw. */
export class ShadowBatch {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity = 256) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'contact shadows';
    this.mesh.renderOrder = 2;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, width: number, depth: number): void {
    if (this.count >= this.capacity) return;
    tmpMatrix.makeScale(width, 1, depth);
    tmpMatrix.setPosition(x, y + 0.06, z);
    this.mesh.setMatrixAt(this.count++, tmpMatrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Shadow footprint for an entity's sheet. */
export function shadowSize(e: EngineEntity): { w: number; d: number } {
  if (!e.sprite) return { w: 0, d: 0 };
  const meta = getSpriteMeta(e.sprite.sheet);
  const s = spriteWorldSize(meta);
  const k = e.scale ?? 1;
  const w = Math.max(0.7, Math.min(3.2, s.width * 0.75)) * k;
  return { w, d: w * 0.55 };
}

type AuraMat = ReturnType<typeof createAuraMaterial>;

/** One additive aura quad per fused entity. */
export class AuraLayer {
  readonly root = new THREE.Group();
  private readonly geo = createBillboardGeometry();
  private readonly meshes = new Map<EngineEntity, { mesh: THREE.Mesh; mat: AuraMat; key: string }>();
  private seen = new Set<EngineEntity>();
  private seed = 0;

  constructor() {
    this.root.name = 'auras';
  }

  begin(): void {
    this.seen = new Set();
  }

  add(e: EngineEntity): void {
    const a = e.aura;
    const p = e.position;
    if (!a || !p || !e.sprite || a.colors.length === 0) return;
    let entry = this.meshes.get(e);
    const key = a.colors.join('|');
    if (!entry) {
      const mat = createAuraMaterial(a.colors, (this.seed++ * 0.37) % 1);
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.root.add(mesh);
      entry = { mesh, mat, key };
      this.meshes.set(e, entry);
    } else if (entry.key !== key) {
      setAuraColors(entry.mat, a.colors);
      entry.key = key;
    }
    const size = spriteWorldSize(getSpriteMeta(e.sprite.sheet));
    const k = e.scale ?? 1;
    entry.mesh.position.set(p.x, p.y - 0.05, p.z);
    entry.mesh.scale.set(size.width * 1.9 * k, size.height * 1.35 * k, 1);
    entry.mat.uniforms.uIntensity.value = a.intensity * (e.opacity ?? 1);
    entry.mat.uniforms.uBroken.value = a.broken ? 1 : 0;
    entry.mesh.visible = true;
    this.seen.add(e);
  }

  end(): void {
    for (const [e, entry] of this.meshes) {
      if (this.seen.has(e)) continue;
      this.root.remove(entry.mesh);
      entry.mat.dispose();
      this.meshes.delete(e);
    }
  }

  dispose(): void {
    for (const entry of this.meshes.values()) entry.mat.dispose();
    this.meshes.clear();
    this.geo.dispose();
  }
}

/** Expanding amber ring for Drake-Sight + bobbing rings on fishing spots. */
export class FxLayer {
  readonly root = new THREE.Group();
  private readonly pulse: THREE.Mesh;
  private readonly pulseMat: THREE.MeshBasicMaterial;
  private readonly spots: THREE.InstancedMesh;
  private pulseStart = -100;
  private pulseRange = 30;
  private spotCount = 0;

  constructor() {
    this.root.name = 'fx';
    const ring = new THREE.RingGeometry(0.94, 1, 72);
    ring.rotateX(-Math.PI / 2);
    this.pulseMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.pulse = new THREE.Mesh(ring, this.pulseMat);
    this.pulse.frustumCulled = false;
    this.pulse.visible = false;
    this.pulse.renderOrder = 4;
    this.root.add(this.pulse);

    const spotGeo = new THREE.RingGeometry(0.55, 0.8, 24);
    spotGeo.rotateX(-Math.PI / 2);
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.7, depthWrite: false });
    this.spots = new THREE.InstancedMesh(spotGeo, spotMat, 16);
    this.spots.frustumCulled = false;
    this.spots.renderOrder = 2;
    this.spots.count = 0;
    this.root.add(this.spots);
  }

  startPulse(time: number, range: number): void {
    this.pulseStart = time;
    this.pulseRange = range;
  }

  updatePulse(time: number, x: number, y: number, z: number): void {
    const t = (time - this.pulseStart) / 1.4;
    if (t < 0 || t > 1) {
      this.pulse.visible = false;
      return;
    }
    const r = Math.max(0.1, this.pulseRange * (1 - (1 - t) * (1 - t)));
    this.pulse.visible = true;
    this.pulse.position.set(x, y + 0.25, z);
    this.pulse.scale.set(r, 1, r);
    this.pulseMat.opacity = 0.85 * (1 - t);
  }

  beginSpots(): void {
    this.spotCount = 0;
  }

  addSpot(x: number, z: number, time: number, revealed: boolean): void {
    if (this.spotCount >= 16) return;
    const s = 1 + Math.sin(time * 2.2 + x) * 0.18 + (revealed ? 0.3 : 0);
    tmpMatrix.makeScale(s, 1, s);
    tmpMatrix.setPosition(x, 0.08, z);
    this.spots.setMatrixAt(this.spotCount++, tmpMatrix);
  }

  endSpots(): void {
    this.spots.count = this.spotCount;
    this.spots.visible = this.spotCount > 0;
    this.spots.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.pulse.geometry.dispose();
    this.pulseMat.dispose();
    this.spots.geometry.dispose();
    (this.spots.material as THREE.Material).dispose();
    this.spots.dispose();
  }
}
