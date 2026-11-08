import * as THREE from 'three';
import { DamageModel } from './DamageModel.js';
import { DRIFT_TIERS, FSM } from './KartController.js';
import { SHIELDS, WEAPONS } from '../registries/CircuitDraftRegistry.js';
import { WHEEL_R } from '../registries/_mesh.js';
import { addOutlines, applyToon, blobTexture } from '../core/Toon.js';
import { GROUPS } from '../physics/PhysicsWorld.js';

const V = THREE.Vector3;

/** Renders one kart: model (GLB or procedural), kid, wheels, shield aura, boost flame, drift sparks, draft ribbons. */
export class KartVisual {
  constructor(scene, kart, assets) {
    this.scene = scene; this.kart = kart;
    this.root = new THREE.Group();
    this.flip = new THREE.Group();
    this.root.add(this.flip);
    this.model = assets.getKart(kart.def);
    this.flip.add(this.model);
    const seat = this.model.getObjectByName('Driver_Seat');
    const kid = assets.getCharacter(kart.character);
    if (seat) seat.add(kid); else { kid.position.set(0, 0.12, 0.25); this.model.add(kid); }
    this.kid = kid; this.kidY0 = kid.position.y;
    this.wheels = {};
    for (const k of ['FL', 'FR', 'RL', 'RR']) this.wheels[k] = this.model.getObjectByName(`Wheel_${k}`);
    addOutlines(this.model); addOutlines(kid); applyToon(this.root);
    this.spin = 0;
    this.damage = new DamageModel(scene, this.model);
    this.weaponMount = this.model.getObjectByName('Weapon_Mount');
    this.shieldMount = this.model.getObjectByName('Shield_Mount');
    this.weaponMesh = null; this.weaponId = null;
    this.aura = null; this.auraId = null;
    // rocket / exhaust flames (twin thrusters on the Rocket Grocery Kart)
    this.flames = (kart.def.thrusters ?? [0]).map((x) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.3, 8), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85 }));
      f.rotation.x = -Math.PI / 2; f.position.set(x, 0.05, 1.9); f.visible = false; f.userData.outline = true;
      this.flip.add(f); return f;
    });
    this.flame = this.flames[0];
    // soft ground shadow (re-projected onto the road every frame)
    const bt = blobTexture();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bt, color: bt ? 0xffffff : 0x000000, transparent: true, opacity: bt ? 0.9 : 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    scene.add(this.shadow);
    // drafting wind ribbons
    this.ribbons = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 14 }, () => new V()));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line); this.ribbons.push(line);
    }
    // human marker
    if (kart.isHuman) {
      const colors = [0x44ff88, 0x44aaff, 0xffcc33, 0xff66cc];
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: colors[kart.index % 4] }));
      m.rotation.x = Math.PI; m.position.set(0, 2.1, 0.3); this.flip.add(m);
      this.marker = m;
    }
    scene.add(this.root);
    this._p = new V(); this._q = new THREE.Quaternion(); this.tmp = new V();
  }

  _syncLoadout() {
    const lo = this.kart.loadout;
    if (lo.weapon?.id !== this.weaponId) {
      if (this.weaponMesh) this.weaponMount?.remove(this.weaponMesh);
      this.weaponMesh = null; this.weaponId = lo.weapon?.id ?? null;
      if (this.weaponId && this.weaponMount) {
        this.weaponMesh = WEAPONS[this.weaponId].proceduralFallback(THREE);
        this.weaponMesh.scale.setScalar(0.45);
        this.weaponMount.add(this.weaponMesh);
      }
    }
    if (lo.shield?.id !== this.auraId) {
      if (this.aura) (this.shieldMount ?? this.flip).remove(this.aura);
      this.aura = null; this.auraId = lo.shield?.id ?? null;
      if (this.auraId) {
        this.aura = SHIELDS[this.auraId].proceduralFallback(THREE);
        this.aura.visible = false;
        (this.shieldMount ?? this.flip).add(this.aura);
      }
    }
  }

  update(dt, alpha, fx, time) {
    const k = this.kart;
    k.renderPose(alpha, this._p, this._q);
    this.root.position.copy(this._p);
    this.root.quaternion.copy(this._q);
    this._syncLoadout();

    // cosmetic drift slip & trick flip
    const drifting = k.fsm === FSM.DRIFTING;
    const targetYaw = drifting ? -k.drift.dir * 0.32 : 0;
    this.flip.rotation.y += (targetYaw - this.flip.rotation.y) * Math.min(1, 10 * dt);
    this.flip.rotation.x = k.trick.active ? -Math.PI * 2 * Math.min(1, k.trick.flipT / 0.65) : 0;
    // knocked-up tumble wobble
    const sf = Math.min(1, k.speed / 18);
    const roll = -k.input.steer * 0.07 * sf - (drifting ? k.drift.dir * 0.11 : 0);          // chassis leans into the turn
    const tumble = k.t.spin > 0 || k.t.oil > 0 ? Math.sin(time * 18) * 0.12 : 0;
    this.flip.rotation.z += (roll + tumble - this.flip.rotation.z) * Math.min(1, 9 * dt);
    // kid: leans & looks into corners, bobs with speed, hops and spins when the race is won
    const kd = this.kid;
    kd.rotation.z += ((-k.input.steer * 0.38 * sf - (drifting ? k.drift.dir * 0.2 : 0)) - kd.rotation.z) * Math.min(1, 8 * dt);
    kd.rotation.y += (((k.finished ? Math.sin(time * 6) * 0.9 : -k.input.steer * 0.3)) - kd.rotation.y) * Math.min(1, 8 * dt);
    kd.position.y = this.kidY0 + (k.finished ? Math.abs(Math.sin(time * 9)) * 0.22 : Math.sin(time * 22) * 0.012 * sf + (k.trick.active ? 0.12 : 0));

    // wheels: suspension travel, spin, steer, comic wobble
    this.spin += (k.fwdSpeed * dt) / WHEEL_R;
    const wob = this.damage.wheelWobble();
    const steer = -k.input.steer * 0.42;
    for (const w of k.suspension.wheels) {
      const node = this.wheels[w.name];
      if (!node) continue;
      node.position.y = -w.dist + WHEEL_R;
      node.rotation.order = 'YXZ';
      node.rotation.set(this.spin, w.front ? steer : 0, wob);
    }
    this.damage.update(dt);

    // aura
    const lo = k.loadout;
    if (this.aura) {
      const on = lo.shieldActive > 0;
      this.aura.visible = on;
      if (on) {
        this.aura.rotation.y += dt * 6;
        const s = 1 + Math.sin(time * 10) * 0.03;
        this.aura.scale.setScalar(s);
        if (lo.shield.id === 'trash_lid_shield') this.aura.rotation.y += dt * 5;
      }
    }
    // flames: full on boosts, idle glow on throttle for rocket karts
    const boosting = k.isBoosting || k.t.surge > 0;
    const idle = !boosting && k.def.thrusters && k.input.throttle > 0.3 && k.grounded;
    const src = k.boosts.find((b) => b.src === 'drift');
    const col = src ? DRIFT_TIERS[Math.max(0, k.drift.lastTier ?? 0)]?.color ?? '#ffaa00' : k.hasNitro ? '#55aaff' : '#ffaa00';
    for (const f of this.flames) {
      f.visible = boosting || idle;
      if (f.visible) { f.material.color.set(boosting ? col : '#ffb347'); const sc = boosting ? 1 : 0.45; f.scale.set(sc * (1 + Math.random() * 0.2), sc * (0.8 + Math.random() * 0.6), sc); }
    }
    // ground shadow
    const hit = k.physics.castRay(this._p.x, this._p.y, this._p.z, 0, -1, 0, 40, GROUPS.TRACK, k.body);
    if (hit) {
      this.shadow.visible = true;
      const n = hit.normal;
      this.shadow.position.set(this._p.x, this._p.y - hit.toi + 0.06, this._p.z);
      this.shadow.quaternion.setFromUnitVectors(new V(0, 1, 0), new V(n.x, n.y, n.z));
      const f = Math.max(0.35, 1 - hit.toi / 18);
      this.shadow.scale.setScalar(f); this.shadow.material.opacity = 0.9 * f;
      this.shadow.rotateY(k.speed > 1 ? Math.atan2(-k.fwd.x, -k.fwd.z) : 0);
    } else this.shadow.visible = false;
    // snow / dust spray off the rear wheels (heavier in powder)
    if (fx.soft && k.grounded && k.speed > 7 && !k.finished) {
      const n = k.onPowder ? 3 : drifting ? 2 : 1, col = fx.dust ?? '#f4f9ff';
      for (const nm of ['RL', 'RR']) {
        const w = this.wheels[nm]; if (!w) continue;
        w.getWorldPosition(this.tmp);
        for (let i = 0; i < n; i++) {
          const r = k.onPowder ? 2.2 : 1.1;
          fx.soft.emit(this.tmp.x + (Math.random() - 0.5) * 0.3, this.tmp.y - 0.1, this.tmp.z + (Math.random() - 0.5) * 0.3,
            -k.vel.x * 0.1 + (Math.random() - 0.5) * r * 2, 0.8 + Math.random() * (k.onPowder ? 3.2 : 1.6), -k.vel.z * 0.1 + (Math.random() - 0.5) * r * 2, col, 0.45 + Math.random() * 0.5, 2.5);
        }
      }
    }
    // drift sparks at rear wheels
    if (drifting && k.grounded) {
      const tier = k.drift.tier;
      const col = tier ? DRIFT_TIERS[tier - 1].color : '#ffe9a0';
      for (const n of ['RL', 'RR']) {
        const w = this.wheels[n]; if (!w) continue;
        w.getWorldPosition(this.tmp);
        fx.emit(this.tmp.x, this.tmp.y - 0.15, this.tmp.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, col, 0.35, 8);
      }
      k.drift.lastTier = tier ? tier - 1 : 0;
    }
    // wobble sparks while parts are missing
    if (this.damage.detachedCount && Math.random() < 0.25 && k.speed > 5) {
      this.model.getWorldPosition(this.tmp);
      fx.emit(this.tmp.x, this.tmp.y - 0.4, this.tmp.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, '#ffcc66', 0.3, 9);
    }
    // slipstream ribbons: from rival rear to our nose
    const tgt = k.slip.target;
    for (let i = 0; i < this.ribbons.length; i++) {
      const line = this.ribbons[i];
      line.visible = !!tgt;
      if (!tgt) continue;
      const pos = line.geometry.attributes.position;
      const a = tgt.pos, b = k.pos;
      for (let j = 0; j < pos.count; j++) {
        const u = j / (pos.count - 1);
        const off = Math.sin(u * 9 + time * 14 + i * 2.1) * 0.35 * (1 - u * 0.5);
        pos.setXYZ(j, a.x + (b.x - a.x) * u + k.right.x * off * (i - 1), a.y + 0.6 + (b.y - a.y) * u + Math.cos(u * 7 + time * 10 + i) * 0.3, a.z + (b.z - a.z) * u + k.right.z * off * (i - 1));
      }
      pos.needsUpdate = true;
      line.material.opacity = 0.25 + 0.35 * Math.min(1, k.slip.draftTimer / 1.5);
    }
  }

  dispose() {
    this.scene.remove(this.root); this.scene.remove(this.shadow);
    for (const r of this.ribbons) this.scene.remove(r);
    this.damage.dispose();
  }
}
