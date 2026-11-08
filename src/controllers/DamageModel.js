import * as THREE from 'three';

export const PART_NAMES = ['Cosmetic_Panel_L', 'Cosmetic_Panel_R', 'Cosmetic_Roof_Spoiler', 'Cosmetic_Bumper_Prop'];

/**
 * Piecemeal cosmetic shedding (SPEC 3.3.6). Heavy hits pop one detachable node off as a flying debris clone;
 * a Duct-Tape snap (mini-turbo, nitro, shield) welds everything back. 100% cosmetic: never touches speed.
 */
export class DamageModel {
  constructor(scene, root) {
    this.scene = scene; this.root = root;
    this.parts = PART_NAMES.map((name) => {
      const node = root.getObjectByName(name) ?? null;
      return { name, node, attached: true };
    }).filter((p) => p.node);
    this.debris = [];
    this.tapes = [];
    this.wobbleAmp = 0; this.t = 0;
    this._tape = new THREE.MeshToonMaterial({ color: 0xc9d1d9 });
  }
  get detachedCount() { return this.parts.filter((p) => !p.attached).length; }

  /** Pops the next attached part off. Returns false if everything is already gone. */
  detachNextPart(kartVel) {
    const p = this.parts.find((x) => x.attached);
    this.wobbleAmp = 1;
    if (!p) return false;
    p.attached = false;
    p.node.updateWorldMatrix(true, false);
    const clone = p.node.clone(true);
    p.node.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    clone.visible = true;
    this.scene.add(clone);
    const side = p.name.endsWith('_L') ? -1 : p.name.endsWith('_R') ? 1 : 0;
    const out = new THREE.Vector3(side * 4, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    this.debris.push({
      mesh: clone,
      vel: new THREE.Vector3(kartVel.x * 0.6 + out.x + (Math.random() - 0.5) * 3, 6 + Math.random() * 4, kartVel.z * 0.6 + out.z + (Math.random() - 0.5) * 3),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      life: 2.4,
    });
    p.node.visible = false;
    return true;
  }

  /** Duct-tape snap-back: restore all parts with a silver cross-strap flash. */
  repairAll() {
    let any = false;
    for (const p of this.parts) {
      if (p.attached) continue;
      any = true;
      p.attached = true; p.node.visible = true;
      const g = new THREE.Group();
      for (const r of [0.6, -0.6]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.16), this._tape);
        strap.rotation.z = r;
        g.add(strap);
      }
      g.position.copy(p.node.position);
      this.root.add(g);
      this.tapes.push({ g, t: 0.45 });
    }
    return any;
  }

  update(dt) {
    this.t += dt;
    this.wobbleAmp = this.detachedCount > 0 ? Math.max(this.wobbleAmp, 0.35) : Math.max(0, this.wobbleAmp - dt * 0.5);
    for (const d of this.debris) {
      d.life -= dt;
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      if (d.life < 0.5) d.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
    }
    this.debris = this.debris.filter((d) => {
      if (d.life > 0) return true;
      this.scene.remove(d.mesh); return false;
    });
    for (const tp of this.tapes) {
      tp.t -= dt;
      tp.g.scale.setScalar(Math.max(0.01, tp.t / 0.45 + 0.4));
    }
    this.tapes = this.tapes.filter((tp) => {
      if (tp.t > 0) return true;
      this.root.remove(tp.g); return false;
    });
  }
  /** Comic +/-8 degree wheel wobble: sin(t*28)*0.14 rad */
  wheelWobble() { return Math.sin(this.t * 28) * 0.14 * this.wobbleAmp; }
  dispose() {
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris = [];
  }
}
