import * as THREE from 'three';
import { FSM } from '../controllers/KartController.js';

const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const SEND_HZ = 15;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Quaternion();

/**
 * Race replication. Every device simulates the karts it owns with full local physics (so steering in a headset has zero
 * network lag) and streams their state 15x per second; everyone else's karts are "puppets" eased toward those
 * snapshots. The host owns the AI field and is the referee for the finishing order.
 * Item use / weapon fire / shields are replayed as events so projectiles and hazards exist in every simulation;
 * a hit only counts in the simulation that owns the victim.
 */
export class NetRace {
  constructor(session, net) {
    this.s = session; this.net = net; this.acc = 0;
    this.byId = new Map(session.karts.map((k) => [k.id, k]));
    this.owned = session.karts.filter((k) => !k.puppet);
    this.target = new Map();
    net.raceHook = this;
    net.on('s', (m) => this._onState(m));
    net.on('e', (m) => this._onEvent(m));
    if (net.isHost) net.on('left', (m) => { for (const k of session.karts) if (k.puppet && k.ownerId === m.from) session.takeOver(k); this.owned = session.karts.filter((k) => !k.puppet); });
    else {
      net.on('go', () => { session.netHold = false; });
      net.on('results', (m) => { session.results = m.order; session.done = true; session.state = 'DONE'; });
    }
  }

  /** Host: release the grid everywhere. */
  go() { this.net.send({ t: 'go' }); this.s.netHold = false; }
  /** Host: publish the official finishing order. */
  results(order) { this.net.send({ t: 'results', order }); }

  dispose() { for (const t of ['s', 'e', 'left', 'go', 'results']) this.net.off(t); if (this.net.raceHook === this) this.net.raceHook = null; }

  /* called from RaceSession.step, before the karts update */
  step(dt) {
    this._applyPuppets(dt);
    if (this.s.netHold) return;
    this.acc += dt;
    if (this.acc < 1 / SEND_HZ) return;
    this.acc = 0;
    const k = [];
    for (const kart of this.owned) {
      const p = kart.pos, q = kart.quat, v = kart.vel;
      const flags = (kart.finished ? 1 : 0) | (kart.fsm === FSM.DRIFTING ? 2 : 0) | (kart.isBoosting ? 4 : 0) | (kart.loadout.shieldActive > 0 ? 8 : 0);
      k.push([kart.id, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(v.x), r2(v.y), r2(v.z), flags, Math.round(kart.maxD), r2(kart.input.steer), kart.drift.dir, kart.drift.tier, r2(kart.finishTime)]);
    }
    if (k.length) this.net.send({ t: 's', k });
  }

  _onState(m) {
    const now = performance.now();
    for (const a of m.k) {
      const kart = this.byId.get(a[0]);
      if (!kart?.puppet) continue;
      this.target.set(kart, { a, at: now });
      if (a[12] > kart.maxD) kart.maxD = a[12];
      if ((a[11] & 1) && !kart.finished) { kart.finished = true; kart.finishTime = a[16]; }
    }
    if (this.net.isHost) this.net.send(m, null, m.from); // relay to the other players
  }

  _applyPuppets(dt) {
    const now = performance.now();
    for (const [kart, t] of this.target) {
      if (!kart.puppet) { this.target.delete(kart); continue; }
      const a = t.a, age = Math.min(0.25, (now - t.at) / 1000), b = kart.body;
      _p.set(a[1] + a[8] * age, a[2] + a[9] * age, a[3] + a[10] * age);
      const cur = b.translation(), far = (cur.x - _p.x) ** 2 + (cur.y - _p.y) ** 2 + (cur.z - _p.z) ** 2 > 144;
      const k = far ? 1 : Math.min(1, 14 * dt);
      b.setTranslation({ x: cur.x + (_p.x - cur.x) * k, y: cur.y + (_p.y - cur.y) * k, z: cur.z + (_p.z - cur.z) * k }, true);
      const r = b.rotation(); _c.set(r.x, r.y, r.z, r.w); _q.set(a[4], a[5], a[6], a[7]).normalize(); _c.slerp(_q, far ? 1 : Math.min(1, 12 * dt));
      b.setRotation({ x: _c.x, y: _c.y, z: _c.z, w: _c.w }, true);
      b.setLinvel({ x: a[8], y: a[9], z: a[10] }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      kart.hold = false;
      kart.input.steer = a[13]; kart.input.throttle = 1;
      kart.fsm = a[11] & 2 ? FSM.DRIFTING : FSM.NORMAL; kart.drift.dir = a[14]; kart.drift.tier = a[15];
      kart.boosts = a[11] & 4 ? [{ mult: 1.3, t: 0.3, dur: 0.3, src: 'net' }] : [];
    }
  }

  /* called from RaceSession._events for karts this device owns */
  onKartEvent(kart, e) {
    if (e.type !== 'useItem' && e.type !== 'fire' && e.type !== 'shield') return;
    this.net.send({ t: 'e', id: kart.id, ev: e.type, item: e.data?.id });
  }
  _onEvent(m) {
    const kart = this.byId.get(m.id), items = this.s.items;
    if (kart?.puppet) {
      const lo = kart.loadout;
      if (m.ev === 'useItem') { lo.pickup = m.item; items.usePickup(kart); }
      else if (m.ev === 'fire' && lo.weapon) { lo.weaponCd = 0; items.fireWeapon(kart); }
      else if (m.ev === 'shield' && lo.shield) { lo.shieldCd = 0; lo.shieldActive = 0; items.activateShield(kart); }
    }
    if (this.net.isHost) this.net.send(m, null, m.from);
  }
}
