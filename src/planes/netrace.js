const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Race replication for the plane racer (same scheme as the kart game): each device flies its own plane(s) with zero lag
 * and streams them 15x a second; the host also flies the AI. Everyone else's planes are mirrors eased toward the stream.
 * Item use is replayed as an event; a hit is decided by the device that owns the victim. The host referees the result.
 */
export class PlaneNet {
  constructor(race, net) {
    this.race = race; this.net = net; this.acc = 0;
    race.referee = net.isHost;
    net.on('s', (m) => this._state(m));
    net.on('e', (m) => this._event(m));
    if (net.isHost) net.on('left', (m) => { for (const p of race.planes) if (p.puppet && p.owner === m.from) { p.puppet = false; p.local = true; p.human = false; p.hold = false; } });
    else { net.on('go', () => race.go()); net.on('results', (m) => race.finish(m.order)); }
  }
  go() { this.net.send({ t: 'go' }); this.race.go(); }
  results(order) { this.net.send({ t: 'results', order }); }
  dispose() { for (const t of ['s', 'e', 'left', 'go', 'results']) this.net.off(t); }

  /** Call once per physics step (after race.step). */
  step(dt) {
    const race = this.race;
    for (const e of race.events) if (e.type === 'use' && !race.byId.get(e.id)?.puppet) this.net.send({ t: 'e', id: e.id, item: e.item });
    if (race.state === 'GRID') return;
    this.acc += dt; if (this.acc < 1 / 15) return; this.acc = 0;
    const k = [];
    for (const p of race.planes) {
      if (p.puppet) continue;
      const flags = (p.finished ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.shield > 0 ? 4 : 0) | (p.boosting ? 8 : 0);
      k.push([p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.yaw), r3(p.pitch), r3(p.bank), r2(p.speed), flags, p.lap, r2(p.finishTime), p.tier]);
    }
    if (k.length) this.net.send({ t: 's', k });
  }
  _state(m) {
    for (const a of m.k) {
      const p = this.race.byId.get(a[0]); if (!p?.puppet) continue;
      const cp = Math.cos(a[5]);
      p.net = { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], bank: a[6], speed: a[7], vx: -Math.sin(a[4]) * cp * a[7], vy: Math.sin(a[5]) * a[7], vz: -Math.cos(a[4]) * cp * a[7], age: 0 };
      const f = a[8];
      p.lap = a[9]; p.tier = a[11];
      if ((f & 1) && !p.finished) { p.finished = true; p.finishTime = a[10]; }
      if (f & 2) { if (p.stun <= 0) p.spin = 1; p.stun = Math.max(p.stun, 0.25); } else p.stun = 0;
      p.shield = f & 4 ? Math.max(p.shield, 0.25) : 0;
      p.boosts = f & 8 ? [[1.3, 0.25, 'net']] : [];
    }
    if (this.net.isHost) this.net.send(m, null, m.from);
  }
  _event(m) {
    const p = this.race.byId.get(m.id);
    if (p?.puppet) this.race.useItem(p, m.item);
    if (this.net.isHost) this.net.send(m, null, m.from);
  }
}
