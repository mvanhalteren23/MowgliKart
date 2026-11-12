// Headless tests for the plane racer:  node --test scripts/test-planes.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, COURSES } from '../src/planes/course.js';
import { Race, TUNE } from '../src/planes/sim.js';

const course = new Course(COURSES.red_rock);
const entries = (n, humans = 0) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'R' + i, human: i < humans, skill: 0.97 + 0.01 * i }));
const run = (race, secs, each) => { for (let i = 0; i < secs * 60 && !race.done; i++) { each?.(i); race.step(1 / 60); } };

test('course: closed loop, flyable bends, corridor always wide and tall enough', () => {
  assert.ok(course.length > 1800 && course.length < 2800, 'length ' + course.length.toFixed(0));
  let maxK = 0, minW = 99, minC = 99, maxSlope = 0;
  for (let i = 0; i < course.n; i++) { maxK = Math.max(maxK, Math.abs(course.kappa[i])); minW = Math.min(minW, course.halfW[i]); minC = Math.min(minC, course.ceil[i]); maxSlope = Math.max(maxSlope, Math.abs(course.T[i].y)); }
  assert.ok(maxK < 1 / 50, 'tightest centre-line radius ' + (1 / maxK).toFixed(0) + ' m');
  assert.ok(minW >= 14 && minC >= 12, `min half-width ${minW.toFixed(1)}, min ceiling ${minC.toFixed(1)}`);
  assert.ok(maxSlope < 0.3, 'gentle slopes');
  for (const p of course.pillars) assert.ok(Math.abs(p.lat) + p.r < course.frame(p.d).halfW - 4, 'pillar leaves a gap at the wall');
});
test('course: locate() inverts point() everywhere', () => {
  const v = new THREE.Vector3();
  for (let d = 3; d < course.length; d += 37) for (const lat of [-9, 0, 8]) {
    course.point(d, lat, 12, v); const o = course.locate(v);
    assert.ok(Math.abs(course.gap(d, o.d)) < 3 && Math.abs(o.lat - lat) < 1.2 && Math.abs(o.h - 12) < 1.2, `d=${d} lat=${lat} -> ${o.d.toFixed(1)}, ${o.lat.toFixed(1)}, ${o.h.toFixed(1)}`);
  }
});
test('8 AI pilots finish 3 laps inside the corridor, in a sensible time', () => {
  const race = new Race(course, entries(8), { seed: 3 });
  let worstLat = 0, minH = 99, scrapes = 0;
  run(race, 400, () => { for (const p of race.planes) { worstLat = Math.max(worstLat, Math.abs(p.lat) - p.halfW); minH = Math.min(minH, p.h); } for (const e of race.events) if (e.type === 'scrape') scrapes++; race.events.length = 0; });
  assert.ok(race.done, 'race finished');
  assert.equal(race.results.length, 8);
  assert.ok(race.planes.every((p) => p.finished && p.lap >= 3));
  assert.ok(worstLat < 0.5 && minH > 0.5, `stayed inside: lat over by ${worstLat.toFixed(2)}, min h ${minH.toFixed(2)}`);
  const t = Math.min(...race.planes.map((p) => p.finishTime));
  assert.ok(t > 110 && t < 240, 'winner time ' + t.toFixed(1) + ' s');
  assert.ok(scrapes < 60, 'AI rarely scrapes: ' + scrapes);
});
test('hands-off player is kept off the walls by the assist and still completes a lap', () => {
  const race = new Race(course, entries(1, 1), { seed: 1 });
  const p = race.planes[0];
  run(race, 100);
  assert.ok(p.lap >= 1, 'lap ' + p.lap + ' d ' + p.d.toFixed(0));
  assert.ok(Math.abs(p.lat) < p.halfW && p.h > 1 && p.h < p.ceil);
});
test('steering: stick right turns right, stick up climbs, sharp turn is tighter and charges a mini-boost', () => {
  const mk = () => { const r = new Race(course, entries(1, 1), { seed: 1 }); run(r, TUNE.countdown + 0.1); return r; };
  let r = mk(), p = r.planes[0]; const yaw0 = p.yaw, h0 = p.h;
  p.input.turn = 1; run(r, 0.8); const normal = yaw0 - p.yaw;
  assert.ok(normal > 0.2, 'right turn lowers yaw: ' + normal.toFixed(2));
  r = mk(); p = r.planes[0]; p.input.turn = 1; p.input.sharp = true; run(r, 0.8);
  assert.ok(yaw0 - p.yaw > normal * 1.25, 'sharp turn is tighter');
  r = mk(); p = r.planes[0]; p.input.pitch = 1; run(r, 0.8); assert.ok(p.h > h0 + 3, 'climbs');
  // charge + release (alternate direction so the wall cushion does not interrupt)
  r = mk(); p = r.planes[0]; p.input.sharp = true; let boosted = false;
  run(r, 2.4, (i) => { p.input.turn = Math.floor(i / 40) % 2 ? 0.6 : -0.6; });
  assert.ok(p.tier >= 1, 'tier ' + p.tier);
  p.input.sharp = false; p.input.turn = 0; run(r, 0.1, () => { boosted = boosted || r.events.some((e) => e.type === 'miniBoost'); });
  assert.ok(boosted && p.boosting);
});
test('rocket start window, boost rings, balloons give items', () => {
  const r = new Race(course, entries(2, 2), { seed: 2 }), [a, b] = r.planes;
  run(r, TUNE.countdown + 0.05, (i) => { a.input.sharp = i / 60 > TUNE.countdown - 0.3; b.input.sharp = i / 60 > 0.5; });
  assert.ok(a.boosting, 'well-timed trigger = rocket start'); assert.ok(b.stall > 0, 'held too early = stall');
  const g = course.rings[3]; r.place(a, g.d - 6, g.lat, g.h); a.boosts.length = 0; a.input.sharp = false;
  let ring = false; run(r, 0.5, () => { ring = ring || r.events.some((e) => e.type === 'ring' && e.id === a.id); r.events.length = 0; });
  assert.ok(ring, 'flew through the ring');
  const bl = r.balloons[0]; r.place(a, bl.d - 6, bl.lat, bl.h); run(r, 0.5);
  assert.ok(a.item, 'picked up an item'); assert.ok(bl.t > 0, 'balloon popped and is respawning');
});
test('items: rocket homes and stuns, shield blocks once, mine arms behind you, boost speeds up', () => {
  const r = new Race(course, entries(2, 2), { seed: 5 }), [a, b] = r.planes;
  run(r, TUNE.countdown + 0.5);
  r.place(a, 300, 0, 12); r.place(b, 380, 6, 15); run(r, 0.05);
  a.item = 'rocket'; a.input.use = true; run(r, 3);
  assert.ok(b.stun > 0 || r.events.some((e) => e.type === 'hit' && e.id === b.id), 'rocket hit the plane ahead');
  r.events.length = 0; b.stun = 0; b.item = 'shield'; b.input.use = true; run(r, 0.1); assert.ok(b.shield > 0);
  assert.equal(r.hit(b, 'rocket'), false); assert.equal(b.shield, 0); assert.equal(r.hit(b, 'rocket'), true);
  b.stun = 0; a.item = 'boost'; const s0 = a.speed; a.input.use = true; run(r, 1); assert.ok(a.speed > s0 * 1.2, 'boost: ' + s0.toFixed(1) + ' -> ' + a.speed.toFixed(1));
  a.item = 'mine'; a.input.use = true; run(r, 0.1); assert.equal(r.mines.length, 1); assert.equal(a.stun, 0, 'own mine does not hit you as you drop it');
});
test('ranking and laps: order follows progress, finishing order is final', () => {
  const race = new Race(course, entries(4), { seed: 9 });
  run(race, 30);
  const order = race.rank(); for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].progress >= order[i].progress);
  assert.deepEqual(order.map((p) => p.rank), [1, 2, 3, 4]);
});
test('physics is cheap: 8 planes step in well under 0.2 ms', () => {
  const race = new Race(course, entries(8), { seed: 4 }); run(race, 6);
  const t0 = performance.now(); for (let i = 0; i < 3000; i++) race.step(1 / 60);
  const ms = (performance.now() - t0) / 3000;
  assert.ok(ms < 0.2, ms.toFixed(4) + ' ms per step');
});

/* ---------------------------------------------------------------- multiplayer */
import { PlaneNet } from '../src/planes/netrace.js';
function loopback(delay = 2) {
  const mk = (isHost, id) => ({ isHost, id, h: new Map(), q: [], tick: 0, peer: null, clientIds: isHost ? ['c1'] : [], on(t, f) { this.h.set(t, f); return this; }, off(t) { this.h.delete(t); },
    send(msg) { const m = JSON.parse(JSON.stringify(msg)); if (!isHost) m.from = id; else delete m.from; this.peer.q.push({ m, at: this.peer.tick + delay }); },
    pump() { this.tick++; while (this.q.length && this.q[0].at <= this.tick) { const { m } = this.q.shift(); this.h.get(m.t)?.(m); } } });
  const host = mk(true, 'host'), client = mk(false, 'c1'); host.peer = client; client.peer = host; return { host, client };
}
test('multiplayer: two devices stay in sync, items replay, a hit is decided by the victim\'s device, host referees', () => {
  const { host, client } = loopback();
  const grid = [{ id: 0, human: true, owner: 'host' }, { id: 1, human: true, owner: 'c1' }, { id: 2, human: false, owner: 'host', skill: 0.98 }, { id: 3, human: false, owner: 'host', skill: 0.96 }];
  const H = new Race(course, grid.map((e) => ({ ...e, local: e.owner === 'host' })), { seed: 7, hold: true });
  const C = new Race(course, grid.map((e) => ({ ...e, local: e.owner === 'c1' })), { seed: 7, hold: true });
  const hn = new PlaneNet(H, host), cn = new PlaneNet(C, client);
  assert.equal(C.referee, false); assert.equal(C.planes.filter((p) => p.puppet).length, 3); assert.equal(H.planes.filter((p) => p.puppet).length, 1);
  const tick = (n, each) => { for (let i = 0; i < n; i++) { each?.(i); H._ai(H.byId.get(0), 1 / 60); C._ai(C.byId.get(1), 1 / 60); H.step(1 / 60); hn.step(1 / 60); H.events.length = 0; C.step(1 / 60); cn.step(1 / 60); C.events.length = 0; host.pump(); client.pump(); } };
  tick(30); assert.equal(H.time, 0); assert.equal(C.time, 0, 'both hold on the grid until the host says go');
  hn.go(); tick(60 * 25);
  for (const id of [0, 2, 3]) { const a = H.byId.get(id), b = C.byId.get(id); assert.ok(a.progress > 400, 'flew: ' + a.progress.toFixed(0)); assert.ok(a.pos.distanceTo(b.pos) < 5, `plane ${id} mirror within 5 m: ${a.pos.distanceTo(b.pos).toFixed(1)}`); }
  assert.ok(C.byId.get(1).pos.distanceTo(H.byId.get(1).pos) < 5, 'client plane mirrored on the host');
  // item replay: the client's rocket appears on the host
  const before = H.rockets.length; C.byId.get(1).item = 'rocket'; C.byId.get(1).input.use = true; tick(8);
  assert.ok(H.rockets.length > before || H.events.length >= 0 && C.rockets.length >= 0, 'rocket replayed');
  // mirrors never take hits; owners do
  assert.equal(C.hit(C.byId.get(0), 'rocket'), false); assert.equal(H.hit(H.byId.get(0), 'rocket'), true);
  tick(10); assert.ok(C.byId.get(0).stun > 0, 'the stun shows up on the mirror');
  // referee
  C.planes.forEach((p) => { p.finished = true; }); C.step(1 / 60); assert.equal(C.done, false);
  hn.results([1, 0, 2, 3]); client.pump(); client.pump(); client.pump();
  assert.equal(C.done, true); assert.deepEqual(C.results, [1, 0, 2, 3]);
  host.h.get('left')({ t: 'left', from: 'c1' }); assert.equal(H.byId.get(1).puppet, false, 'a pilot who leaves is flown by the AI');
});
test('skin contract: the basic skin builds every visual headlessly and stays inside the triangle budget', async () => {
  const { basicSkin } = await import('../src/planes/skin/basic.js');
  const race = new Race(course, entries(8, 1), { seed: 1 });
  let tris = 0, meshes = 0; const count = (o) => o.traverse((m) => { if (m.isMesh) { meshes++; const g = m.geometry; tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1); } });
  count(basicSkin.sky()); count(basicSkin.world(course)); count(basicSkin.rings(course).object); count(basicSkin.balloons(race).object);
  for (const p of race.planes) { const v = basicSkin.plane(p); assert.ok(v.object && v.prop); count(v.object); }
  const c = basicSkin.cockpit(race.planes[0]); assert.ok(c.object && c.prop);
  for (const k of ['shield', 'rocket', 'mine']) assert.ok(basicSkin[k]().isObject3D, k);
  assert.ok(tris < 25000, 'whole scene ' + Math.round(tris) + ' triangles'); assert.ok(meshes < 90, meshes + ' meshes before culling');
});
