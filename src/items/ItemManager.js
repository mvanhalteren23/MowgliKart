import * as THREE from 'three';
import { WEAPONS, SHIELDS, weaponEffectiveness, weaponCooldown, shieldPower, shieldCooldown } from '../registries/CircuitDraftRegistry.js';
import { ITEMS, ITEM_IDS, makeMysteryBox } from '../registries/ItemRegistry.js';
import { GROUPS } from '../physics/PhysicsWorld.js';

const V = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _a = new V(), _b = new V();

/**
 * Triple-slot manager: Cooldown Weapon + Cooldown Shield + single-use Mystery Pickup.
 * Owns mystery boxes, projectiles, persistent hazards (puddles, foam, poo, peels) and shield timers.
 */
export class ItemManager {
  constructor(session) {
    this.s = session;
    this.projectiles = [];
    this.hazards = [];
    this.timed = []; // gloves etc.
    this.boxes = [];
    this.group = new THREE.Group();
    session.scene.add(this.group);
  }

  /* ------------------------------------------------------------------ mystery boxes */
  buildBoxes() {
    const { track } = this.s;
    for (let d = 300; d < track.length - 350; d += 450) {
      for (const lat of [-6, -2, 2, 6]) {
        const mesh = makeMysteryBox(THREE);
        const pos = track.surface(d, lat).add(new V(0, 1.4, 0));
        mesh.position.copy(pos);
        this.group.add(mesh);
        this.boxes.push({ mesh, d, lat, pos, active: true, respawn: 0 });
      }
    }
  }

  initLoadout(kart, draft) {
    const lo = kart.loadout;
    lo.weapon = draft.weapon ? { ...draft.weapon } : null;
    lo.shield = draft.shield ? { ...draft.shield } : null;
    lo.weaponCd = lo.weapon ? 2.0 : 0; // brief spawn lockout
    lo.shieldCd = 0; lo.shieldActive = 0; lo.pickup = null;
  }

  rankFraction(kart) {
    const n = this.s.karts.length;
    return n > 1 ? clamp((kart.rank - 1) / (n - 1), 0, 1) : 0;
  }
  rollPickup(kart) {
    const r = this.rankFraction(kart); // 0 = leading, 1 = last
    const w = { nitro_boost: 1 + 2 * r, banana_rocket: 1 + r, flaming_poo_bag: 1 + (1 - r) };
    let tot = ITEM_IDS.reduce((a, id) => a + w[id], 0), x = this.s.rand() * tot;
    for (const id of ITEM_IDS) { x -= w[id]; if (x <= 0) return id; }
    return ITEM_IDS[0];
  }

  /* ------------------------------------------------------------------ per-step update */
  update(dt) {
    const { karts, time } = this.s;
    // boxes
    for (const b of this.boxes) {
      if (!b.active) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.active = true; b.mesh.visible = true; }
        continue;
      }
      b.mesh.rotation.y += dt * 2; b.mesh.position.y = b.pos.y + Math.sin(time * 3 + b.d) * 0.15;
      for (const k of karts) {
        if (k.loadout.pickup) continue;
        if (Math.abs(k.d - b.d) > 4) continue;
        if (k.pos.distanceToSquared(b.pos) < 3.2 * 3.2) {
          b.active = false; b.mesh.visible = false; b.respawn = 6;
          k.loadout.pickup = this.rollPickup(k);
          k.emit('pickup', { id: k.loadout.pickup });
          this.s.fx.burst(b.pos, 14, 5, '#66ddff', 0.6);
        }
      }
    }
    // cooldowns / shield windows
    for (const k of karts) {
      const lo = k.loadout;
      lo.weaponCd = Math.max(0, lo.weaponCd - dt);
      lo.shieldCd = Math.max(0, lo.shieldCd - dt);
      if (lo.shieldActive > 0) {
        lo.shieldActive = Math.max(0, lo.shieldActive - dt);
        if (lo.shieldActive === 0) k.shieldImmuneOil = false;
      }
    }
    this._updateProjectiles(dt);
    this._updateHazards(dt);
    this._updateTimed(dt);
  }

  /* ------------------------------------------------------------------ firing */
  nearestAhead(kart, maxDist, coneDeg = 180, minD = 0) {
    let best = null, bd = Infinity;
    for (const r of this.s.karts) {
      if (r === kart) continue;
      _a.subVectors(r.pos, kart.pos);
      const dist = _a.length();
      if (dist > maxDist || dist < minD) continue;
      if (coneDeg < 180) {
        const ang = Math.acos(clamp(_a.dot(kart.fwd) / (dist || 1), -1, 1)) * 180 / Math.PI;
        if (ang > coneDeg) continue;
      } else if (r.d <= kart.d) continue;
      if (dist < bd) { bd = dist; best = r; }
    }
    return best;
  }

  fireWeapon(kart) {
    const lo = kart.loadout;
    if (!lo.weapon || lo.weaponCd > 0 || kart.finished) return false;
    const W = WEAPONS[lo.weapon.id], lvl = lo.weapon.level, eff = weaponEffectiveness(lvl);
    const cd = weaponCooldown(W, lvl);
    const s = this.s;
    switch (W.id) {
      case 'ballistic_chicken': {
        const tgt = this.nearestAhead(kart, W.range, W.homingCone);
        const n = lvl >= 2 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const mesh = W.proceduralFallback(THREE); mesh.scale.setScalar(0.8); this.group.add(mesh);
          this.projectiles.push({ kind: 'chicken', owner: kart, d: kart.d + 3, lat: kart.lat, latVel: n === 1 ? 0 : (i - 1) * 7, dir: 1, speed: W.projectileSpeed,
            target: i === (n === 1 ? 0 : 1) ? tgt : (tgt && n > 1 ? tgt : null), traveled: 0, range: W.range * 1.4, mesh, level: lvl, eff, grace: 0.25, y: 1.0, homing: !!tgt });
        }
        s.sfx('chicken', kart);
        kart.addBoost(1.05, 0.3, 'recoil');
        break;
      }
      case 'baby_oil_puddle': {
        const width = lvl >= 2 ? W.width2 : W.width;
        const count = lvl >= 2 ? 3 : 1;
        for (let i = 0; i < count; i++) this.spawnHazard({ kind: 'puddle', owner: kart, d: kart.d - 5 - i * (width * 0.9), lat: kart.lat + (i - (count - 1) / 2) * 0.8, radius: width / 2, life: W.life, eff, grace: 2.2 });
        kart.addBoost(1.10 + (lvl >= 2 ? 0.04 : 0), 0.5, 'recoil');
        s.sfx('squirt', kart);
        break;
      }
      case 'mentos_mortar': {
        const tgt = this.nearestAhead(kart, W.range);
        const land = tgt ? clamp(tgt.d + tgt.speed * 0.9, kart.d + 15, kart.d + W.range) : kart.d + 45;
        const mesh = W.proceduralFallback(THREE); this.group.add(mesh);
        this.timed.push({ kind: 'lob', owner: kart, from: kart.pos.clone(), d0: kart.d, d1: land, lat: tgt ? tgt.lat : kart.lat, t: 0, dur: 1.05, mesh, eff, item: false });
        kart.addBoost(1.05, 0.3, 'recoil');
        s.sfx('thunk', kart);
        break;
      }
      case 'boxing_glove': {
        let tgt = null, bd = Infinity;
        for (const r of s.karts) {
          if (r === kart) continue;
          const dist = r.pos.distanceTo(kart.pos);
          if (dist < W.range && Math.abs(r.d - kart.d) < 14 && dist < bd) { bd = dist; tgt = r; }
        }
        const mesh = W.proceduralFallback(THREE); mesh.scale.setScalar(1.4); this.group.add(mesh);
        this.timed.push({ kind: 'glove', owner: kart, target: tgt, t: 0, dur: 0.22, mesh, eff });
        kart.addBoost(1.05, 0.3, 'recoil');
        if (!tgt) { lo.weaponCd = cd * 0.5; s.sfx('whiff', kart); return true; }
        break;
      }
      default: break;
    }
    lo.weaponCd = cd;
    kart.emit('fire', { id: W.id });
    return true;
  }

  activateShield(kart) {
    const lo = kart.loadout;
    if (!lo.shield || lo.shieldCd > 0 || lo.shieldActive > 0) return false;
    const S = SHIELDS[lo.shield.id];
    lo.shieldActive = S.window;
    lo.shieldCd = shieldCooldown(S, lo.shield.level);
    kart.shieldImmuneOil = !!S.immuneOil;
    kart.t.oil = 0; kart.t.stink = 0;
    kart.emit('snap'); // every shield activation welds panels back on
    kart.emit('shield', { id: S.id });
    this.s.sfx('shield', kart);
    return true;
  }

  usePickup(kart) {
    const id = kart.loadout.pickup;
    if (!id) return false;
    kart.loadout.pickup = null;
    const I = ITEMS[id];
    switch (id) {
      case 'nitro_boost':
        kart.addBoost(I.mult, I.duration, 'nitro', true);
        kart.t.mud = 0; kart.t.gripLoss = 0;
        this.s.sfx('nitro', kart);
        break;
      case 'banana_rocket': {
        const tgt = this.nearestAhead(kart, 150, 180);
        const mesh = I.proceduralFallback(THREE); mesh.scale.setScalar(1.2); this.group.add(mesh);
        this.projectiles.push({ kind: 'banana', owner: kart, d: kart.d + 4, lat: kart.lat, latVel: 0, dir: 1, speed: I.speed, target: tgt, traveled: 0, range: 220, mesh, level: 1, eff: 1, grace: 0.25, y: 1.0, homing: true });
        this.s.sfx('whistle', kart);
        break;
      }
      case 'flaming_poo_bag': {
        const tgt = this.nearestAhead(kart, 30);
        if (tgt) {
          const mesh = I.proceduralFallback(THREE); this.group.add(mesh);
          this.timed.push({ kind: 'lob', owner: kart, from: kart.pos.clone(), d0: kart.d, d1: tgt.d + tgt.speed * 0.6, lat: tgt.lat, t: 0, dur: 0.8, mesh, eff: 1, item: true });
        } else this.spawnHazard({ kind: 'poo', owner: kart, d: kart.d - 4, lat: kart.lat, radius: I.radius, life: 14, eff: 1, grace: 2 });
        this.s.sfx('thunk', kart);
        break;
      }
      default: break;
    }
    kart.emit('useItem', { id });
    return true;
  }

  /* ------------------------------------------------------------------ hazards (sensor volumes) */
  spawnHazard({ kind, owner, d, lat, radius, life, eff = 1, grace = 0 }) {
    const { track, physics } = this.s;
    d = clamp(d, 2, track.length - 5);
    const fr = track.atDist(d);
    const pos = fr.P.clone().addScaledVector(fr.B, lat);
    let mesh;
    if (kind === 'puddle') {
      mesh = WEAPONS.baby_oil_puddle.proceduralFallback(THREE);
      mesh.scale.set(radius, 1, radius);
    } else if (kind === 'foam') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshToonMaterial({ color: 0xfff6e0 }));
      mesh.scale.set(radius * 0.8, radius * 0.35, radius * 0.8);
    } else if (kind === 'poo') {
      mesh = ITEMS.flaming_poo_bag.proceduralFallback(THREE);
      mesh.scale.setScalar(radius * 0.7);
    } else { // peel
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.25, 5), new THREE.MeshToonMaterial({ color: 0xffe135 }));
    }
    mesh.position.copy(pos).addScaledVector(fr.N, kind === 'puddle' ? 0.07 : 0.15);
    const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), fr.N);
    mesh.quaternion.copy(q);
    this.group.add(mesh);
    const center = pos.clone().addScaledVector(fr.N, 0.35);
    const sensor = physics.addSensor({ position: center, radius: Math.max(radius, 0.9), group: GROUPS.HAZARD, ref: null, kind: 'hazard' });
    const h = { kind, owner, d, lat, radius, life, eff, grace, mesh, sensor, contacts: new Set(), pos };
    physics.owners.set(sensor.collider.handle, { kind: 'hazard', ref: h });
    this.hazards.push(h);
    return h;
  }

  _updateHazards(dt) {
    const keep = [];
    for (const h of this.hazards) {
      h.life -= dt; h.grace = Math.max(0, h.grace - dt);
      if (h.kind === 'poo') { h.mesh.rotation.y += dt * 2; }
      if (h.kind === 'foam') h.mesh.scale.y = h.radius * (0.35 + 0.12 * Math.sin(this.s.time * 14));
      if (h.life <= 0) { this.group.remove(h.mesh); this.s.physics.removeSensor(h.sensor); continue; }
      if (h.kind === 'puddle') for (const k of h.contacts) if (!(k === h.owner && h.grace > 0)) this._puddleEffect(k);
      keep.push(h);
    }
    this.hazards = keep;
  }

  _puddleEffect(k) {
    if (k.shieldImmuneOil && k.loadout.shieldActive > 0) return;
    if (k.t.oil < 0.3) { k.oilSlick(1.8); k.emit('hit', { kind: 'oil' }); }
  }

  /** Physics sensor callback for hazard <-> kart. */
  onHazardContact(h, kart, started) {
    if (!started) { h.contacts.delete(kart); return; }
    h.contacts.add(kart);
    if (kart === h.owner && h.grace > 0) return;
    const lo = kart.loadout;
    const S = lo.shieldActive > 0 && lo.shield ? SHIELDS[lo.shield.id] : null;
    const attacker = h.owner;
    switch (h.kind) {
      case 'puddle': this._puddleEffect(kart); break;
      case 'poo':
        if (S?.immunePoo) { this._blockedFx(kart, S, false); break; }
        kart.spinOut(1.4 * h.eff, 600, 0.6); kart.t.stink = 2.5; kart.emit('hit', { kind: 'poo' }); kart.emit('shed');
        this.s.fx.burst(kart.pos, 18, 6, '#8bc34a', 0.9, 2);
        this._adrenaline(attacker, kart);
        h.life = Math.min(h.life, 0.1);
        break;
      case 'foam':
        if (S) { this._blockedFx(kart, S, true); break; }
        kart.stunFor(1.85 * h.eff, 0.3); kart.t.foam = 1.2; kart.emit('hit', { kind: 'foam' });
        this._adrenaline(attacker, kart);
        break;
      case 'peel':
        if (S) { this._blockedFx(kart, S, false); break; }
        kart.spinOut(0.9, 650, 0.75); kart.emit('hit', { kind: 'peel' });
        h.life = Math.min(h.life, 0.1);
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ projectiles */
  _updateProjectiles(dt) {
    const { track, karts } = this.s;
    const keep = [];
    for (const p of this.projectiles) {
      p.grace -= dt;
      p.d += p.dir * p.speed * dt; p.traveled += p.speed * dt;
      if (p.latVel) { p.lat += p.latVel * dt; p.latVel *= 0.93; }
      if (p.target && p.homing) {
        const behind = p.dir > 0 ? p.target.d < p.d - 6 : p.target.d > p.d + 6;
        if (!behind) p.lat += clamp(p.target.lat - p.lat, -14 * dt, 14 * dt);
      }
      p.lat = clamp(p.lat, -track.width / 2 + 0.8, track.width / 2 - 0.8);
      const fr = track.atDist(clamp(p.d, 0, track.length));
      const pos = fr.P.clone().addScaledVector(fr.B, p.lat).addScaledVector(fr.N, p.y + 0.3 * Math.sin(this.s.time * 12));
      p.mesh.position.copy(pos);
      p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;
      if (p.kind === 'chicken') p.mesh.rotation.z = Math.sin(this.s.time * 20) * 0.3;
      if (p.kind === 'banana') p.mesh.rotation.z += dt * 12;
      p.pos = pos;
      this.s.fx.emit(pos.x, pos.y, pos.z, 0, 0.5, 0, p.kind === 'banana' ? '#ffe135' : '#ffffff', 0.35, 0);

      let dead = p.traveled > p.range || p.d < 0 || p.d > track.length;
      if (!dead) {
        for (const k of karts) {
          if (k === p.owner && p.grace > 0) continue;
          if (k === p.owner && !p.reflected) continue;
          if (Math.abs(k.d - p.d) > 5) continue;
          if (k.pos.distanceToSquared(pos) < 2.4 * 2.4) {
            const res = this._attack(p.owner, k, p.kind, p);
            if (res !== 'reflected') dead = true;
            break;
          }
        }
      }
      if (dead) { this.group.remove(p.mesh); continue; }
      keep.push(p);
    }
    this.projectiles = keep;
  }

  _updateTimed(dt) {
    const keep = [];
    for (const t of this.timed) {
      t.t += dt;
      const u = clamp(t.t / t.dur, 0, 1);
      if (t.kind === 'lob') {
        const { track } = this.s;
        const d = t.d0 + (t.d1 - t.d0) * u;
        const lat = t.owner.lat + (t.lat - t.owner.lat) * u;
        const fr = track.atDist(clamp(d, 0, track.length));
        const ground = fr.P.clone().addScaledVector(fr.B, lat);
        const p = new V().lerpVectors(t.from, ground, u);
        p.y += Math.sin(u * Math.PI) * 9;
        t.mesh.position.copy(p); t.mesh.rotation.x += dt * 9;
        if (u >= 1) {
          this.group.remove(t.mesh);
          if (t.item) this.spawnHazard({ kind: 'poo', owner: t.owner, d: t.d1, lat, radius: ITEMS.flaming_poo_bag.radius, life: 14, eff: 1, grace: 0.3 });
          else {
            this.spawnHazard({ kind: 'foam', owner: t.owner, d: t.d1, lat, radius: WEAPONS.mentos_mortar.foamRadius, life: 4, eff: t.eff, grace: 0 });
            this.s.fx.burst(ground, 30, 9, '#fff6e0', 1.0, 4);
            this.s.sfx('geyser', t.owner);
          }
          continue;
        }
      } else if (t.kind === 'glove') {
        const o = t.owner;
        const tp = t.target ? t.target.pos : o.pos.clone().addScaledVector(o.fwd, 10);
        const gp = new V().lerpVectors(o.pos, tp, Math.sin(u * Math.PI / 2));
        gp.y += 0.3;
        t.mesh.position.copy(gp);
        t.mesh.lookAt(tp);
        if (u >= 1) {
          this.group.remove(t.mesh);
          if (t.target && t.target.pos.distanceTo(o.pos) < 32) this._attack(o, t.target, 'glove', null, t);
          continue;
        }
      }
      keep.push(t);
    }
    this.timed = keep;
  }

  /* ------------------------------------------------------------------ attack resolution */
  _blockedFx(victim, S, pop) {
    this.s.fx.burst(victim.pos, 16, 7, S.id === 'tinfoil_shield' ? '#66aaff' : '#cfe9ff', 0.6, 2);
    victim.emit('blocked', { id: S.id });
    this.s.sfx('block', victim);
  }
  _adrenaline(attacker, victim) {
    if (attacker && attacker !== victim) { attacker.addBoost(1.18, 0.8, 'adrenaline'); attacker.emit('hitConfirm', { victim: victim.name }); }
  }

  /** Returns 'blocked' | 'reflected' | 'hit'. */
  _attack(attacker, victim, kind, proj, timed = null) {
    const lo = victim.loadout;
    const hostile = ['chicken', 'banana', 'glove'].includes(kind);
    if (hostile && lo.shieldActive > 0 && lo.shield) {
      const S = SHIELDS[lo.shield.id], pw = shieldPower(lo.shield.level);
      victim.addBoost(1 + (S.surge - 1) * pw, S.surgeTime, 'shield-surge');
      const reflect = this.s.rand() < clamp(S.reflect * pw, 0, 0.95);
      this._blockedFx(victim, S, true);
      if (S.id === 'bubble_wrap_shield') { lo.shieldActive = 0; victim.shieldImmuneOil = false; victim.emit('pop'); }
      if (reflect && proj) {
        proj.owner = victim; proj.target = attacker; proj.dir *= -1; proj.reflected = true; proj.traveled = 0; proj.grace = 0.3;
        victim.emit('ricochet');
        return 'reflected';
      }
      if (reflect && kind === 'glove' && attacker) { this._glove(victim, attacker, timed?.eff ?? 1); return 'reflected'; }
      return 'blocked';
    }
    switch (kind) {
      case 'chicken': {
        const eff = proj?.eff ?? 1;
        victim.knockUp(7.5, 1.75 * eff);
        victim.t.blind = 2.0;
        victim.emit('shed');
        this.s.fx.burst(victim.pos, 40, 9, '#fff6d8', 1.2, 5);
        this.s.sfx('boom', victim);
        break;
      }
      case 'banana': {
        victim.spinOut(1.3, 850, 0.45);
        victim.emit('hit', { kind: 'banana' }); victim.emit('shed');
        for (let i = -1; i <= 1; i++) this.spawnHazard({ kind: 'peel', owner: attacker, d: victim.d + 3 + Math.abs(i) * 2, lat: clamp(victim.lat + i * 2.6, -8, 8), radius: 1.0, life: 10, grace: 0.5 });
        this.s.fx.burst(victim.pos, 30, 8, '#ffe135', 1.0, 5);
        this.s.sfx('boom', victim);
        break;
      }
      case 'glove': this._glove(attacker, victim, timed?.eff ?? 1); break;
      default: break;
    }
    this._adrenaline(attacker, victim);
    return 'hit';
  }

  _glove(attacker, victim, eff) {
    const W = WEAPONS.boxing_glove;
    // slam sideways, away from the attacker
    const side = new V().subVectors(victim.pos, attacker.pos); side.y = 0;
    const lateral = side.dot(attacker.right) >= 0 ? 1 : -1;
    victim.shove(new V().copy(attacker.right).multiplyScalar(lateral * 13).setY(2));
    victim.t.stun = Math.max(victim.t.stun, (1.55 * eff * 0.6) / victim.knockRes);
    victim.cancelDrift?.();
    victim.t.spin = Math.max(victim.t.spin, 0);
    // siphon 30% of their forward momentum
    victim.scaleSpeed(1 - W.siphon);
    attacker.addBoost(1.12, 1.0, 'siphon');
    victim.emit('hit', { kind: 'glove' }); victim.emit('shed');
    this.s.fx.burst(victim.pos, 22, 7, '#ff6060', 0.7, 4);
    this.s.sfx('boom', victim);
  }

  /** Is a hostile projectile about to hit this kart? (AI reactive shield) */
  threatTo(kart, range = 20) {
    for (const p of this.projectiles) {
      if (p.owner === kart) continue;
      if (p.target === kart || (Math.abs(p.lat - kart.lat) < 3)) {
        const gap = (kart.d - p.d) * p.dir;
        if (gap > 0 && gap < range) return p;
      }
    }
    return null;
  }

  dispose() {
    this.s.scene.remove(this.group);
    for (const h of this.hazards) this.s.physics.removeSensor(h.sensor);
  }
}
