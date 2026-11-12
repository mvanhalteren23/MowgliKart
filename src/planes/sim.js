import * as THREE from 'three';
import { wrap } from './course.js';

const V = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/* ------------------------------------------------------------------ tuning (all gameplay numbers live here) */
export const TUNE = {
  speed: 40,              // cruise speed, m/s (144 km/h)
  bank: 0.78, bankSharp: 1.2,       // max bank angle (rad): normal / sharp turn
  turn: 0.92, turnSharp: 1.3,       // yaw rate per radian of bank (1/s)
  bankRate: 5.5, pitchRate: 4,      // how quickly the plane follows the stick
  pitchMax: 0.5,          // max climb / dive angle (rad)
  diveGain: 0.22,         // speed gained in a full dive (and lost in a full climb), fraction
  sharpDrag: 0.94,        // speed factor while holding a sharp turn
  assist: 0.55,           // steering help: pulls the heading toward the canyon when the stick is centred (1/s)
  wallSoft: 5,            // metres from a wall where the cushion starts pushing back
  planeR: 1.6,            // collision radius of a plane
  charge: [1.0, 2.0, 3.2], chargeBoost: [[1.25, 0.8], [1.35, 1.4], [1.5, 2.0]], // sharp-turn charge tiers (s) -> [speed x, seconds]
  ringBoost: [1.45, 1.2], itemBoost: [1.6, 2.2], draftBoost: [1.2, 1.5], startBoost: [1.5, 1.5],
  stun: 1.3, stunSpeed: 0.5,
  rocketSpeed: 78, rocketRange: 240,
  shield: 6, mineLife: 22,
  balloonRespawn: 5,
  countdown: 3.2,
};
export const ITEMS = ['boost', 'rocket', 'shield', 'mine'];
export const ITEM_ICON = { boost: '🚀', rocket: '🎯', shield: '🛡', mine: '🌩' };
export const blankInput = () => ({ turn: 0, pitch: 0, sharp: false, use: false });

/** One aeroplane. Position/heading are world-space; (d, lat, h) are its track coordinates, refreshed every step. */
export class Plane {
  constructor(id, { name = 'P' + (id + 1), color = 0xd92b2b, human = false, local = true, skill = 1, owner = null } = {}) {
    Object.assign(this, { id, name, color, human, local, skill, owner });
    this.puppet = !local;
    this.pos = new V(); this.prev = new V(); this.yaw = 0; this.pitch = 0; this.bank = 0; this.speed = 0;
    this.prevYaw = 0; this.prevPitch = 0; this.prevBank = 0;
    this.d = 0; this.lat = 0; this.h = 10; this.hint = -1; this.lap = 0; this.progress = 0; this.halfW = 20; this.ceil = 30; this.trackYaw = 0;
    this.input = blankInput();
    this.boosts = []; this.charge = 0; this.tier = 0; this.sharpT = 0;
    this.stun = 0; this.stall = 0; this.shield = 0; this.item = null; this.draftT = 0; this.wallT = 0; this.spin = 0;
    this.finished = false; this.finishTime = 0; this.rank = 1; this.hold = true; this.trigSince = null;
  }
  get boosting() { return this.boosts.length > 0; }
  get boostMult() { let m = 1; for (const b of this.boosts) m = Math.max(m, b[0]); return m; }
  addBoost([mult, dur], src) { if (this.puppet) return; const b = this.boosts.find((x) => x[2] === src); if (b) { b[0] = Math.max(b[0], mult); b[1] = Math.max(b[1], dur); } else this.boosts.push([mult, dur, src]); }
  forward(out = new V()) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
}

/**
 * The whole race: planes, laps, items, AI. Pure logic (no rendering, no DOM) so it runs headless in tests and identically
 * on every device. `events` is drained by the view / audio / network layers each frame.
 */
export class Race {
  constructor(course, entries, { seed = 1, hold = false } = {}) {
    this.course = course; this.time = 0; this.raceTime = 0;
    this.state = hold ? 'GRID' : 'COUNT'; this.count = TUNE.countdown;
    this.events = []; this.rockets = []; this.mines = []; this.nextId = 1;
    let s = seed >>> 0; this.rand = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.planes = entries.map((e, i) => new Plane(e.id ?? i, e));
    this.byId = new Map(this.planes.map((p) => [p.id, p]));
    this.balloons = course.balloons.map((b) => ({ ...b, t: 0 }));
    this.ai = new Map();
    this.planes.forEach((p, slot) => {
      // 2-wide grid just past the start line, pole position furthest ahead
      const row = Math.floor(slot / 2), d = 46 - row * 11, lat = (slot % 2 ? 5 : -5), h = 9;
      course.point(d, lat, h, p.pos); p.prev.copy(p.pos);
      const f = course.frame(d); p.yaw = p.prevYaw = Math.atan2(-f.T.x, -f.T.z); p.pitch = Math.asin(clamp(f.T.y, -1, 1));
      this._locate(p); p.progress = p.d;
      if (!p.human && p.local) this.ai.set(p.id, { lane: lat, laneT: 0, hT: 10, startAt: TUNE.countdown - 0.05 - this.rand() * 0.5, useT: 1 + this.rand() * 3, skill: p.skill });
    });
    this.done = false; this.results = null; this.endTimer = null; this.referee = true;
    this.rank();
  }

  emit(type, p, data) { this.events.push({ type, id: p?.id ?? -1, ...data }); }
  _locate(p) {
    const o = this.course.locate(p.pos, p.hint, (this._loc ??= {}));
    const before = p.d; p.hint = o.i; p.d = o.d; p.lat = o.lat; p.h = o.h; p.halfW = o.halfW; p.ceil = o.ceil; p.trackYaw = o.trackYaw;
    return before;
  }
  rank() {
    const L = this.course.length;
    for (const p of this.planes) if (!p.puppet || !p.finished) p.progress = p.lap * L + p.d;
    const order = [...this.planes].sort((a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress));
    order.forEach((p, i) => { p.rank = i + 1; });
    return order;
  }
  /** Put a plane at track coordinates, flying along the canyon. */
  place(p, d, lat, h) {
    this.course.point(d, lat, h, p.pos); p.prev.copy(p.pos); p.hint = -1; this._locate(p);
    p.yaw = p.prevYaw = p.trackYaw; p.pitch = p.prevPitch = Math.asin(clamp(this.course.T[p.hint].y, -1, 1)); p.bank = p.prevBank = 0;
  }
  /** Leave the grid hold (multiplayer: host says go). */
  go() { if (this.state === 'GRID') this.state = 'COUNT'; }

  step(dt) {
    if (this.state === 'GRID') return;
    this.time += dt;
    if (this.state === 'COUNT') {
      this.count -= dt;
      for (const p of this.planes) { // rocket start: squeeze the trigger just before GO (too early = engine sputter)
        const held = p.human ? p.input.sharp : this.time >= (this.ai.get(p.id)?.startAt ?? 9);
        if (held && p.trigSince == null) p.trigSince = this.time; else if (!held) p.trigSince = null;
      }
      if (this.count <= 0) {
        this.state = 'RACE';
        for (const p of this.planes) {
          p.hold = false; p.speed = TUNE.speed * 0.6;
          if (p.puppet || p.trigSince == null) continue;
          const early = this.time - p.trigSince;
          if (early <= 0.45) { p.addBoost(TUNE.startBoost, 'start'); this.emit('startBoost', p); } else if (early > 1.2) { p.stall = 1.0; this.emit('stall', p); }
        }
        this.emit('go', null);
      }
      return;
    }
    this.raceTime += dt;
    for (const p of this.planes) {
      if (p.puppet) { this._puppet(p, dt); continue; }
      if (!p.human || p.finished) this._ai(p, dt);
      this._fly(p, dt);
    }
    this._collide();
    this._items(dt);
    this.rank();
    this._checkEnd(dt);
  }

  /* ------------------------------------------------------------------ flight model */
  _fly(p, dt) {
    const T = TUNE, inp = p.input, c = this.course;
    p.prev.copy(p.pos); p.prevYaw = p.yaw; p.prevPitch = p.pitch; p.prevBank = p.bank;
    for (const b of p.boosts) b[1] -= dt;
    p.boosts = p.boosts.filter((b) => b[1] > 0);
    for (const k of ['stun', 'stall', 'shield', 'wallT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
    const ctl = p.stun > 0 ? 0.25 : 1;
    const turn = clamp(inp.turn, -1, 1) * ctl, pit = clamp(inp.pitch, -1, 1) * ctl, sharp = inp.sharp && p.stun <= 0;

    // bank -> turn. Sharp turn (trigger): steeper bank, tighter radius, a little slower, charges a mini-boost
    const bankT = turn * (sharp ? T.bankSharp : T.bank);
    p.bank += (bankT - p.bank) * Math.min(1, T.bankRate * dt);
    let yawRate = -p.bank * (sharp ? T.turnSharp : T.turn);
    // canyon assist: with the stick near centre the nose eases toward the canyon direction
    const off = angDiff(p.trackYaw, p.yaw);
    yawRate += off * T.assist * (1 - Math.min(1, Math.abs(turn) * 1.6));
    // wall cushion: close to a wall the air pushes the plane back toward the middle (forgiving for imprecise remotes)
    const edge = p.halfW - T.planeR - Math.abs(p.lat);
    let push = 0;
    if (edge < T.wallSoft) { push = -Math.sign(p.lat) * (1 - Math.max(0, edge) / T.wallSoft); yawRate += -push * 0.9 * Math.cos(off); }
    p.yaw += yawRate * dt;

    // pitch -> climb/dive, limited near floor and ceiling so you skim instead of crash
    let pitchT = pit * T.pitchMax;
    const floorGap = p.h - 2.2, ceilGap = p.ceil - 1.8 - p.h;
    if (floorGap < 6) pitchT = Math.max(pitchT, (1 - Math.max(0, floorGap) / 6) * 0.42 - 0.06);
    if (ceilGap < 6) pitchT = Math.min(pitchT, -(1 - Math.max(0, ceilGap) / 6) * 0.42 + 0.06);
    // follow the canyon's own slope so "level stick" means "level with the canyon"
    const slope = Math.asin(clamp(c.T[p.hint >= 0 ? p.hint : 0].y, -1, 1));
    p.pitch += (pitchT + slope - p.pitch) * Math.min(1, T.pitchRate * dt);

    // speed: cruise x boosts, dive faster / climb slower, penalties
    let target = T.speed * p.skill * p.boostMult * (1 - T.diveGain * Math.sin(p.pitch - slope) / Math.sin(T.pitchMax));
    if (sharp && Math.abs(turn) > 0.3) target *= T.sharpDrag;
    if (p.stun > 0) target *= T.stunSpeed;
    if (p.stall > 0) target *= 0.35;
    if (p.wallT > 0) target *= 0.8;
    if (p.finished) target *= 0.7;
    p.speed += (target - p.speed) * Math.min(1, (p.boosting ? 3.2 : 1.3) * dt);

    // sharp-turn charge -> mini-boost on release (Mario-Kart drift rules)
    if (sharp && Math.abs(turn) > 0.3) {
      p.sharpT += dt; p.charge += dt * (1 + 0.5 * Math.abs(turn));
      let tier = 0; for (let i = 0; i < 3; i++) if (p.charge >= T.charge[i]) tier = i + 1;
      if (tier !== p.tier) { p.tier = tier; this.emit('tier', p, { tier }); }
    } else {
      if (p.tier > 0 && !inp.sharp && p.stun <= 0) { p.addBoost(T.chargeBoost[p.tier - 1], 'turn'); this.emit('miniBoost', p, { tier: p.tier }); }
      if (!inp.sharp || p.stun > 0) { p.charge = 0; p.tier = 0; p.sharpT = 0; }
    }

    // integrate
    const cp = Math.cos(p.pitch), v = p.speed * dt;
    p.pos.x += -Math.sin(p.yaw) * cp * v; p.pos.y += Math.sin(p.pitch) * v; p.pos.z += -Math.cos(p.yaw) * cp * v;
    if (push) { const r = c.R[p.hint]; p.pos.x += r.x * push * 9 * dt; p.pos.z += r.z * push * 9 * dt; }

    const lastD = this._locate(p), L = c.length;
    if (lastD > L * 0.75 && p.d < L * 0.25) { p.lap++; if (!p.finished) { if (p.lap >= c.laps) { p.finished = true; p.finishTime = this.raceTime; this.emit('finish', p); } else this.emit('lap', p, { lap: p.lap + 1 }); } } else if (lastD < L * 0.25 && p.d > L * 0.75) p.lap--;

    // hard limits: walls, floor, ceiling (scrape: bounce back in, lose speed)
    const r = c.R[p.hint], lim = p.halfW - T.planeR;
    if (Math.abs(p.lat) > lim) {
      const over = Math.abs(p.lat) - lim, s = Math.sign(p.lat);
      p.pos.x -= r.x * s * (over + 0.4); p.pos.z -= r.z * s * (over + 0.4);
      p.yaw += angDiff(p.trackYaw, p.yaw) * 0.5 + s * 0.12; // nose back along the canyon, slightly away from the wall
      this._scrape(p, 0.72);
    }
    if (p.h < 1.2) { p.pos.y += 1.2 - p.h + 0.3; p.pitch = Math.max(p.pitch, slope + 0.22); this._scrape(p, 0.8); }
    if (p.h > p.ceil - 0.8) { p.pos.y -= p.h - (p.ceil - 0.8) + 0.3; p.pitch = Math.min(p.pitch, slope - 0.2); this._scrape(p, 0.85); }
    // rock pillars: circles in the (d, lat) plane, full height
    for (const pl of c.pillars) {
      const dd = c.gap(pl.d, p.d); if (Math.abs(dd) > 12) continue;
      const dl = p.lat - pl.lat, q = Math.hypot(dd, dl), min = pl.r + T.planeR;
      if (q < min) {
        const nx = dl / (q || 1), k = min - q + 0.5;
        p.pos.x += r.x * nx * k; p.pos.z += r.z * nx * k;
        const t = c.T[p.hint]; p.pos.x += t.x * (dd / (q || 1)) * k; p.pos.z += t.z * (dd / (q || 1)) * k;
        p.yaw += (nx >= 0 ? -1 : 1) * 0.25;
        this._scrape(p, 0.6);
      }
    }
    // boost rings
    for (const g of c.rings) {
      const dd = c.gap(g.d, p.d);
      if (Math.abs(dd) < Math.max(1.5, p.speed * dt) && Math.hypot(p.lat - g.lat, p.h - g.h) < g.r) { if (!(p._ring === g && this.raceTime - p._ringT < 1)) { p._ring = g; p._ringT = this.raceTime; p.addBoost(T.ringBoost, 'ring'); this.emit('ring', p); } }
    }
    // item balloons
    if (!p.item) for (const b of this.balloons) {
      if (b.t > 0) continue;
      const dd = c.gap(b.d, p.d);
      if (Math.abs(dd) < Math.max(2.5, p.speed * dt) && Math.hypot(p.lat - b.lat, p.h - b.h) < b.r + T.planeR) { b.t = T.balloonRespawn; p.item = this._roll(p); this.emit('pickup', p, { item: p.item }); break; }
    }
    // slipstream: sit in someone's wake for 1.5 s -> slingshot
    let inWake = false;
    for (const o of this.planes) {
      if (o === p) continue;
      const g = c.gap(p.d, o.d);
      if (g > 4 && g < 26 && Math.abs(o.lat - p.lat) < 3.5 && Math.abs(o.h - p.h) < 3.5 && o.lap * 0 === 0) { inWake = true; break; }
    }
    p.draftT = inWake ? p.draftT + dt : Math.max(0, p.draftT - dt);
    if (p.draftT >= 1.5) { p.draftT = 0; p.addBoost(T.draftBoost, 'draft'); this.emit('draft', p); }

    if (inp.use) { inp.use = false; this.useItem(p); }
  }
  _scrape(p, f) { if (p.wallT <= 0) { p.speed *= f; this.emit('scrape', p); } p.wallT = 0.5; p.charge = 0; p.tier = 0; }

  _collide() { // planes bump each other apart (only planes this device owns are moved)
    const ps = this.planes, min = TUNE.planeR * 2.1;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z, q = Math.hypot(dx, dy, dz);
      if (q >= min || q < 1e-4) continue;
      const k = (min - q) / q / 2;
      if (!a.puppet) { a.pos.x -= dx * k; a.pos.y -= dy * k; a.pos.z -= dz * k; }
      if (!b.puppet) { b.pos.x += dx * k; b.pos.y += dy * k; b.pos.z += dz * k; }
      if (!a._bumpT || this.raceTime - a._bumpT > 0.6) { a._bumpT = this.raceTime; this.emit('bump', a); }
    }
  }

  /* ------------------------------------------------------------------ items */
  _roll(p) { // leaders get defence, back-markers get speed and rockets
    const f = this.planes.length > 1 ? (p.rank - 1) / (this.planes.length - 1) : 0;
    const w = { boost: 1 + 2 * f, rocket: 0.6 + 1.6 * f, shield: 1.4 - 0.8 * f, mine: 1.3 - 0.9 * f };
    let x = this.rand() * ITEMS.reduce((a, k) => a + w[k], 0);
    for (const k of ITEMS) { x -= w[k]; if (x <= 0) return k; }
    return 'boost';
  }
  /** Use the held item. `forced` replays a network player's item on the devices that only mirror them. */
  useItem(p, forced = null) {
    const item = forced ?? p.item;
    if (!item || (p.finished && !forced)) return false;
    p.item = null;
    const c = this.course;
    if (item === 'boost') p.addBoost(TUNE.itemBoost, 'item');
    else if (item === 'shield') p.shield = TUNE.shield;
    else if (item === 'mine') this.mines.push({ id: this.nextId++, owner: p.id, d: wrap(p.d - 7, c.length), lat: p.lat, h: p.h, t: TUNE.mineLife, arm: 0.7 });
    else if (item === 'rocket') {
      let tgt = null, best = TUNE.rocketRange;
      for (const o of this.planes) { if (o === p || o.finished) continue; const g = o.progress - p.progress; if (g > 3 && g < best) { best = g; tgt = o; } }
      this.rockets.push({ id: this.nextId++, owner: p.id, target: tgt?.id ?? -1, d: wrap(p.d + 5, c.length), lat: p.lat, h: p.h, travelled: 0 });
    }
    this.emit('use', p, { item });
    return true;
  }
  /** A weapon reached `p`. Only the device that owns the plane decides (shield, stun); mirrors just show it. */
  hit(p, kind) {
    if (p.puppet) return false;
    if (p.shield > 0) { p.shield = 0; this.emit('blocked', p, { kind }); return false; }
    p.stun = TUNE.stun; p.speed *= TUNE.stunSpeed; p.charge = 0; p.tier = 0; p.boosts.length = 0; p.spin = 1;
    this.emit('hit', p, { kind });
    return true;
  }
  _items(dt) {
    const c = this.course;
    for (const b of this.balloons) if (b.t > 0) b.t -= dt;
    for (const m of this.mines) {
      m.t -= dt; m.arm -= dt;
      if (m.arm > 0) continue;
      for (const p of this.planes) if (Math.abs(c.gap(m.d, p.d)) < 4.5 && Math.hypot(p.lat - m.lat, p.h - m.h) < 4.5) { this.hit(p, 'mine'); this.emit('boom', null, { d: m.d, lat: m.lat, h: m.h }); m.t = 0; break; }
    }
    this.mines = this.mines.filter((m) => m.t > 0);
    for (const r of this.rockets) {
      const step = TUNE.rocketSpeed * dt; r.d = wrap(r.d + step, c.length); r.travelled += step;
      const tg = this.byId.get(r.target);
      if (tg) { const k = Math.min(1, 2.6 * dt); r.lat += (tg.lat - r.lat) * k; r.h += (tg.h - r.h) * k; }
      const f = c.frame(r.d, (this._rf ??= {})); r.lat = clamp(r.lat, -f.halfW + 1, f.halfW - 1); r.h = clamp(r.h, 1.5, f.ceil - 1.5);
      for (const p of this.planes) {
        if (p.id === r.owner) continue;
        if (Math.abs(c.gap(r.d, p.d)) < Math.max(3, step) && Math.hypot(p.lat - r.lat, p.h - r.h) < 3.2) { this.hit(p, 'rocket'); this.emit('boom', null, { d: r.d, lat: r.lat, h: r.h }); r.travelled = 1e9; break; }
      }
    }
    this.rockets = this.rockets.filter((r) => r.travelled < TUNE.rocketRange * 1.6);
  }

  /* ------------------------------------------------------------------ AI pilots */
  _ai(p, dt) {
    const a = this.ai.get(p.id) ?? (this.ai.set(p.id, { lane: p.lat, laneT: 0, hT: 10, useT: 2, skill: p.skill }), this.ai.get(p.id));
    const c = this.course, inp = p.input;
    a.laneT -= dt;
    const look = 30 + p.speed * 0.35, f = c.frame(p.d + look, (this._af ??= {}));
    if (a.laneT <= 0) { // new lane every few seconds; sometimes aim for the next boost ring or item balloon
      a.laneT = 1.6 + this.rand() * 2.2;
      a.lane = (this.rand() * 2 - 1) * (f.halfW - 7); a.hT = 6 + this.rand() * (f.ceil - 14);
      let bestG = 150, goal = null;
      for (const g of c.rings) { const gp = c.gap(p.d, g.d); if (gp > 25 && gp < bestG) { bestG = gp; goal = g; } }
      if (!p.item) for (const b of this.balloons) { const gp = c.gap(p.d, b.d); if (b.t <= 0 && gp > 25 && gp < bestG && this.rand() < 0.5) { bestG = gp; goal = b; } }
      if (goal && this.rand() < 0.75) { a.lane = goal.lat; a.hT = goal.h; a.laneT = Math.min(3.5, bestG / p.speed + 0.2); }
    }
    let lane = a.lane, hT = Math.min(a.hT, f.ceil - 6);
    for (const pl of c.pillars) { // swerve around the next pillar
      const g = c.gap(p.d, pl.d);
      if (g > -4 && g < 70 && Math.abs(lane - pl.lat) < pl.r + 4.5) lane = pl.lat + (lane >= pl.lat ? 1 : -1) * (pl.r + 5.5);
    }
    lane = clamp(lane, -f.halfW + 5.5, f.halfW - 5.5);
    const tx = f.P.x + f.R.x * lane, ty = f.P.y + hT, tz = f.P.z + f.R.z * lane;
    const dx = tx - p.pos.x, dy = ty - p.pos.y, dz = tz - p.pos.z, hd = Math.hypot(dx, dz);
    const err = angDiff(Math.atan2(-dx, -dz), p.yaw);
    inp.turn = clamp(-err * 2.4, -1, 1);
    const slope = Math.asin(clamp(c.T[p.hint].y, -1, 1));
    inp.pitch = clamp((Math.atan2(dy, hd) - slope) * 2.6, -1, 1);
    const tight = Math.abs(c.kappa[c.idx(p.d + 25)]) > 0.007;
    inp.sharp = Math.abs(err) > 0.42 || (tight && Math.abs(err) > 0.16) ? true : (p.tier >= 1 && Math.abs(err) > 0.1 && inp.sharp);
    // rubber band: ease off when far ahead of the best human, push when far behind
    const humans = this.planes.filter((o) => o.human && !o.finished);
    if (humans.length) { const lead = Math.max(...humans.map((o) => o.progress)), gap = p.progress - lead; p.skill = a.skill * clamp(1 - gap / 1400, 0.9, 1.07); }
    a.useT -= dt;
    if (p.item && a.useT <= 0) {
      let go = false;
      if (p.item === 'boost') go = Math.abs(err) < 0.15 && !p.boosting;
      else if (p.item === 'rocket') go = this.planes.some((o) => o !== p && o.progress - p.progress > 8 && o.progress - p.progress < 150);
      else if (p.item === 'shield') go = this.rockets.some((r) => r.target === p.id) || this.rand() < 0.01;
      else if (p.item === 'mine') go = this.planes.some((o) => o !== p && p.progress - o.progress > 5 && p.progress - o.progress < 40);
      if (go) { inp.use = true; a.useT = 1.5 + this.rand() * 3; }
    }
  }

  /* ------------------------------------------------------------------ network mirrors */
  _puppet(p, dt) {
    p.prev.copy(p.pos); p.prevYaw = p.yaw; p.prevPitch = p.pitch; p.prevBank = p.bank;
    const n = p.net;
    if (n) {
      n.age += dt; const e = Math.min(0.25, n.age), k = Math.min(1, 12 * dt);
      const tx = n.x + n.vx * e, ty = n.y + n.vy * e, tz = n.z + n.vz * e, far = (tx - p.pos.x) ** 2 + (ty - p.pos.y) ** 2 + (tz - p.pos.z) ** 2 > 900;
      const q = far ? 1 : k;
      p.pos.x += (tx - p.pos.x) * q; p.pos.y += (ty - p.pos.y) * q; p.pos.z += (tz - p.pos.z) * q;
      p.yaw += angDiff(n.yaw, p.yaw) * q; p.pitch += (n.pitch - p.pitch) * q; p.bank += (n.bank - p.bank) * q; p.speed = n.speed;
    }
    for (const k of ['stun', 'shield']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
    this._locate(p);
  }

  _checkEnd(dt) {
    if (this.done || !this.referee) return;
    const humans = this.planes.filter((p) => p.human);
    const humansDone = humans.length > 0 && humans.every((p) => p.finished);
    if (humansDone && this.endTimer == null) this.endTimer = 6;
    if (this.endTimer != null) this.endTimer -= dt;
    if (this.planes.every((p) => p.finished) || (this.endTimer != null && this.endTimer <= 0) || this.raceTime > 600) this.finish(this.rank().map((p) => p.id));
  }
  finish(order) { this.done = true; this.results = order; this.state = 'DONE'; }
}
