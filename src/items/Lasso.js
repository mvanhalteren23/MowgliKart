import * as THREE from 'three';
import { SHIELDS } from '../registries/CircuitDraftRegistry.js';

const V = THREE.Vector3;
export const LASSO = { range: 55, cone: Math.cos((10 * Math.PI) / 180), autoCone: Math.cos((26 * Math.PI) / 180), dur: 2.4, cooldown: 9, slow: 0.7, pull: 1.3, tug: 10 };

/**
 * Lasso hook: every kart carries one (9 s cooldown). Point at a rival and throw: for 2.4 s you are reeled toward them
 * (speed boost + a tug along the rope) while they are slowed. A raised shield blocks it.
 * In the headset the remote is the aim (a ring marks the locked rival); on other devices it auto-aims at the kart ahead.
 */
export class LassoManager {
  constructor(session) {
    this.s = session; this.ropes = [];
    this.group = new THREE.Group(); this.group.userData.noOutline = true; session.scene.add(this.group);
    this.reticle = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 6, 28), new THREE.MeshBasicMaterial({ color: 0x44ff88, depthTest: false, transparent: true, opacity: 0.9, fog: false }));
    this.reticle.visible = false; this.reticle.renderOrder = 990; this.reticle.userData.noOutline = true; this.group.add(this.reticle);
    this._t = new V(); this._a = new V(); this._b = new V();
  }

  /** Best rival along a ray (headset remote). Stores it on kart.lassoAim. */
  aim(kart, origin, dir) {
    let best = null, bs = LASSO.cone;
    for (const o of this.s.karts) {
      if (o === kart || o.finished) continue;
      this._t.copy(o.pos).setY(o.pos.y + 0.6).sub(origin);
      const d = this._t.length(); if (d < 3 || d > LASSO.range) continue;
      const c = this._t.dot(dir) / d; if (c > bs) { bs = c; best = o; }
    }
    kart.lassoAim = best; kart._aimAt = this.s.time;
    return best;
  }
  /** No pointer: the nearest rival in front of the kart. */
  autoAim(kart) {
    let best = null, bd = LASSO.range;
    for (const o of this.s.karts) {
      if (o === kart || o.finished) continue;
      this._t.subVectors(o.pos, kart.pos); const d = this._t.length();
      if (d < 3 || d > bd || this._t.dot(kart.fwd) / d < LASSO.autoCone) continue;
      bd = d; best = o;
    }
    return best;
  }

  fire(kart) {
    if (kart.lassoCd > 0 || kart.finished || this.s.state !== 'RACING') return false;
    const fresh = kart._aimAt != null && this.s.time - kart._aimAt < 0.2;
    const target = (fresh ? kart.lassoAim : null) ?? (fresh ? null : this.autoAim(kart));
    if (!target) return false;
    kart.lassoCd = LASSO.cooldown;
    kart.emit('lasso', { id: target.id });
    this.apply(kart, target);
    return true;
  }

  /** Attach the rope (also called for network mirrors). Effects only land on karts this device owns. */
  apply(attacker, target) {
    let blocked = false;
    if (!target.puppet) {
      const lo = target.loadout;
      if (lo.shieldActive > 0 && lo.shield) { blocked = true; target.emit('blocked'); this.s.items._blockedFx?.(target, SHIELDS[lo.shield.id], false); }
      else { target.t.lasso = LASSO.dur; target.emit('lassoed', { by: attacker.name }); }
    }
    if (!attacker.puppet && !blocked) attacker.addBoost(LASSO.pull, LASSO.dur, 'lasso');
    const pts = Array.from({ length: 10 }, () => new V());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd9b36a }));
    line.frustumCulled = false; line.userData.noOutline = true;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 5, 18), new THREE.MeshBasicMaterial({ color: 0xd9b36a }));
    loop.rotation.x = Math.PI / 2; loop.userData.noOutline = true;
    this.group.add(line, loop);
    this.ropes.push({ from: attacker, to: target, t: blocked ? 0.35 : LASSO.dur, line, loop });
    this.s.sfx('whoosh', attacker);
  }

  update(dt) {
    const s = this.s;
    for (const k of s.karts) {
      if (k.lassoCd > 0) k.lassoCd = Math.max(0, k.lassoCd - dt);
      if (k.isHuman && !(k._aimAt != null && s.time - k._aimAt < 0.2)) k.lassoAim = k.lassoCd <= 0 ? this.autoAim(k) : null; // flat screens: auto-aim preview
    }
    for (const r of this.ropes) {
      r.t -= dt;
      const a = this._a.copy(r.from.pos).setY(r.from.pos.y + 0.9), b = this._b.copy(r.to.pos).setY(r.to.pos.y + 0.7), dist = a.distanceTo(b);
      if (dist > LASSO.range * 1.5 || r.to.finished) r.t = 0;
      if (!r.from.puppet && r.t > 0 && dist > 6 && r.from.grounded) { // reel in: a steady tug along the rope
        const m = r.from.mass * LASSO.tug * dt / dist;
        r.from.body.applyImpulse({ x: (b.x - a.x) * m, y: 0, z: (b.z - a.z) * m }, true);
      }
      const pos = r.line.geometry.attributes.position, n = pos.count, sag = Math.min(1.2, dist * 0.04);
      for (let i = 0; i < n; i++) { const u = i / (n - 1); pos.setXYZ(i, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * sag, a.z + (b.z - a.z) * u); }
      pos.needsUpdate = true;
      r.loop.position.copy(b);
    }
    for (const r of this.ropes) if (r.t <= 0) { this.group.remove(r.line, r.loop); r.line.geometry.dispose(); r.line.material.dispose(); r.loop.geometry.dispose(); r.loop.material.dispose(); }
    this.ropes = this.ropes.filter((r) => r.t > 0);
  }

  /** Aim ring over the locked rival of the kart being viewed. */
  showReticle(kart, camPos) {
    const t = kart?.lassoAim;
    this.reticle.visible = !!t && kart.lassoCd <= 0 && this.s.state === 'RACING';
    if (!this.reticle.visible) return;
    this.reticle.position.copy(t.pos).setY(t.pos.y + 0.7);
    this.reticle.lookAt(camPos);
    this.reticle.scale.setScalar(Math.max(1, camPos.distanceTo(t.pos) / 14));
  }
  dispose() { this.s.scene.remove(this.group); }
}
