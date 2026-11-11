import { detail } from '../core/Lod.js';
import * as THREE from 'three';
import { DamageModel } from './DamageModel.js';
import { DRIFT_TIERS, FSM } from './KartController.js';
import { SHIELDS, WEAPONS } from '../registries/CircuitDraftRegistry.js';
import { WHEEL_R } from '../registries/_mesh.js';
import { addOutlines, applyToon, bakeAssembly, makeShadowDecal } from '../core/Toon.js';
import { Trail } from '../core/Trail.js';
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
    bakeAssembly(this.model); addOutlines(this.model, 0.03); applyToon(this.root); // ~15x fewer draw calls, same look
    this.exhausts = []; this.cockpit = { wheel: null, needle: null };
    this.model.traverse((o) => { if (o.name?.startsWith('Exhaust') && !o.name.endsWith('_baked')) this.exhausts.push({ node: o, ph: Math.random() * 6.28 }); if (o.name === 'Cockpit_Wheel') this.cockpit.wheel = o; if (o.name === 'Cockpit_Needle') this.cockpit.needle = o; });
    this.eyes = []; kid.traverse((o) => { if (o.name === 'Eye') this.eyes.push(o); }); this.blinkT = 1 + Math.random() * 3; this.blinkV = 0;
    this.isCockpit = false;
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
    this.proxy = null;
    if (kart.lodProxy) { // headset tier: beyond ~55 m a kart is a 100-triangle stand-in
      const col = new THREE.Color(kart.def.color ?? '#cc3333'), pm = new THREE.MeshToonMaterial({ color: col });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 2.3), pm); body.position.y = 0.1;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshToonMaterial({ color: 0xffd9a0 })); head.position.set(0, 0.95, 0.2);
      this.proxy = new THREE.Group(); this.proxy.add(body, head); this.proxy.visible = false; this.root.add(this.proxy);
      if (!kart.isHuman) { const cp = this.model.getObjectByName('Cockpit'); if (cp) cp.visible = false; } // nobody sees another kart's dashboard
      const panel = this.model.getObjectByName('Cockpit_Panel'); // 6-material rounded box = 6 draw calls; one textured material is plenty in the headset
      if (panel && Array.isArray(panel.material)) { panel.geometry = panel.geometry.clone(); panel.geometry.clearGroups(); panel.material = panel.material[4]; }
    }
    this.shadow = makeShadowDecal(scene, 2.8); // soft contact shadow, re-projected onto the road every frame
    this.trails = kart.trailsOn ? [new Trail(scene), new Trail(scene)] : null;
    this.sparkTrails = [new Trail(scene, { max: 40, width: 0.09, additive: true, alpha: 0.95, fade: 0.93, every: 0.025 }), new Trail(scene, { max: 40, width: 0.09, additive: true, alpha: 0.95, fade: 0.93, every: 0.025 })];
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
        this.weaponMesh = WEAPONS[this.weaponId].proceduralFallback(detail.T);
        this.weaponMesh.scale.setScalar(0.45);
        this.weaponMount.add(this.weaponMesh);
      }
    }
    if (lo.shield?.id !== this.auraId) {
      if (this.aura) (this.shieldMount ?? this.flip).remove(this.aura);
      this.aura = null; this.auraId = lo.shield?.id ?? null;
      if (this.auraId) {
        this.aura = SHIELDS[this.auraId].proceduralFallback(detail.T);
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
    if (this.weaponMesh) this.weaponMesh.scale.setScalar(this.isCockpit ? 0.2 : 0.45); // hood-mounted weapon must not block the driver's view

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
      this.aura.visible = on && !this.isCockpit; // from the driver's seat a bubble would wall off the view (the HUD shows ON!)
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
    if (this.trails) {
      let i = 0;
      for (const nm of ['RL', 'RR']) { const w = this.wheels[nm]; if (!w) continue; w.getWorldPosition(this.tmp); this.tmp.y -= 0.2; this.trails[i++].push(this.tmp, k.right, k.grounded && k.speed > 3, dt); }
    }
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
    // glowing drift-spark trails: additive ribbons streaming behind both rear wheels in the current mini-turbo colour
    {
      const tier = k.drift.tier, hexC = tier ? DRIFT_TIERS[tier - 1].color : '#ffe9a0', cc = new THREE.Color(hexC);
      let i = 0;
      for (const nm of ['RL', 'RR']) { const w = this.wheels[nm]; if (!w) continue; w.getWorldPosition(this.tmp); this.tmp.y -= 0.15; this.sparkTrails[i++].push(this.tmp, k.right, drifting && k.grounded, dt, [cc.r, cc.g, cc.b]); }
    }
    // wobbling exhaust stacks / rocket pods + smoke puffs while on the throttle
    const thr = k.input.throttle;
    for (const e of this.exhausts) {
      const wob = (0.02 + 0.035 * thr + (k.isBoosting ? 0.05 : 0)) * Math.sin(time * (26 + 18 * thr) + e.ph);
      e.node.rotation.z = (e.node.userData.rz ??= e.node.rotation.z) + wob; e.node.rotation.x = (e.node.userData.rx ??= e.node.rotation.x) + wob * 0.6;
      if (fx.soft && thr > 0.3 && k.speed > 2 && Math.random() < 0.35 && !e.node.name.startsWith('Exhaust_Rocket')) {
        e.node.getWorldPosition(this.tmp); this.tmp.y += 0.5;
        fx.soft.emit(this.tmp.x, this.tmp.y, this.tmp.z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, k.isBoosting ? '#5a6577' : '#aab2bd', 0.6, -0.3);
      }
    }
    // cockpit: steering wheel turns with the input, speedo needle sweeps, kid blinks
    if (this.cockpit.wheel) this.cockpit.wheel.rotation.z += (-k.input.steer * 1.1 - this.cockpit.wheel.rotation.z) * Math.min(1, 12 * dt);
    if (this.cockpit.needle) this.cockpit.needle.rotation.z = -0.5 + Math.min(1, k.speed / (k.vtop * 1.2)) * 3.2 * -0.5;
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkV = 0.14; this.blinkT = 1.8 + Math.random() * 3.2; }
    if (this.blinkV > 0) this.blinkV -= dt;
    for (const e of this.eyes) e.scale.y = this.blinkV > 0 ? 0.1 : 1;
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

  /** Level of detail: far karts swap to the proxy. */
  setFar(far) { if (!this.proxy || this.isCockpit) far = false; if (this.far === far) return; this.far = far; this.flip.visible = !far; if (this.proxy) this.proxy.visible = far; }

  /** First-person view: hide the driver (so the camera isn't inside the head) and keep the dashboard/wheel. */
  setCockpit(on) { this.isCockpit = on; this.kid.visible = !on; }

  dispose() {
    this.scene.remove(this.root); this.scene.remove(this.shadow); this.trails?.forEach((t) => t.dispose()); this.sparkTrails?.forEach((t) => t.dispose());
    for (const r of this.ribbons) this.scene.remove(r);
    this.damage.dispose();
  }
}
