// Headless test suite:  npm test   (node --test scripts/test.mjs)
// Runs in Node with no GPU/DOM: registries, model contracts, mesh baking, procedural textures (safe fallback), track geometry,
// real RaceSession physics on every track, the yeti out-of-bounds throw, tree collisions, and the cup/draft rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { AssetManager } from '../src/core/AssetManager.js';
import { RaceSession } from '../src/core/RaceSession.js';
import { CircuitManager, POINTS } from '../src/core/CircuitManager.js';
import { TextureFactory } from '../src/core/TextureFactory.js';
import { bakeAssembly, addOutlines, toonGradient, INK } from '../src/core/Toon.js';
import { TrackSpline } from '../src/track/TrackSpline.js';
import { TRACKS, OBSTACLES, TRACK_ORDER } from '../src/registries/TrackRegistry.js';
import { KARTS, PLAYABLE_KARTS } from '../src/registries/KartRegistry.js';
import { CHARACTERS, CHARACTER_IDS } from '../src/registries/CharacterRegistry.js';
import { WEAPONS, SHIELDS, gammaDim, newBuildState, STAT_BOOSTS } from '../src/registries/CircuitDraftRegistry.js';
import { makeMysteryBox, ITEMS } from '../src/registries/ItemRegistry.js';

const meshes = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
const tris = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh && !o.userData.outline) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
const racersOf = (n, human = false) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'T' + i, isHuman: human && i === 0, humanIndex: human && i === 0 ? 0 : undefined, persona: 'balanced_hybrid', kartId: PLAYABLE_KARTS[i % 2].id, charId: CHARACTER_IDS[i], build: newBuildState(), weapon: null, shield: null }));
const mk = async (trackId, racers = racersOf(8), seed = 1) => new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId, racers, seed, quality: 'high' });

/* ---------------------------------------------------------------- models */
test('every kart builds with the full node contract (wheels, mounts, seat, 4 detachable cosmetics)', () => {
  const need = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Weapon_Mount', 'Shield_Mount', 'Driver_Seat', 'Cosmetic_Panel_L', 'Cosmetic_Panel_R', 'Cosmetic_Roof_Spoiler', 'Cosmetic_Bumper_Prop'];
  for (const k of Object.values(KARTS)) { const g = k.proceduralFallback(THREE); for (const n of need) assert.ok(g.getObjectByName(n), `${k.id} missing ${n}`); }
});
test('playable karts have a cockpit (dash + wheel + needle) and wobbling exhausts', () => {
  for (const k of PLAYABLE_KARTS) {
    const g = k.proceduralFallback(THREE);
    for (const n of ['Cockpit', 'Cockpit_Wheel', 'Cockpit_Needle', 'Cockpit_Panel']) assert.ok(g.getObjectByName(n), `${k.id} missing ${n}`);
    let ex = 0; g.traverse((o) => { if (o.name.startsWith('Exhaust')) ex++; }); assert.ok(ex >= 2, `${k.id} needs exhausts`);
  }
});
test('all 12 kids, 13 obstacles, weapons, shields, items and the item box build; kids have blinking eyes', () => {
  assert.equal(CHARACTER_IDS.length, 12);
  for (const id of CHARACTER_IDS) { const g = CHARACTERS[id].proceduralFallback(THREE); let eyes = 0; g.traverse((o) => { if (o.name === 'Eye') eyes++; }); assert.equal(eyes, 2, id); assert.ok(g.userData.unit); }
  assert.equal(Object.keys(OBSTACLES).length, 13);
  for (const o of Object.values(OBSTACLES)) assert.ok(meshes(o.proceduralFallback(THREE)) > 5, o.id);
  for (const w of Object.values(WEAPONS)) assert.ok(w.proceduralFallback(THREE));
  for (const s of Object.values(SHIELDS)) assert.ok(s.proceduralFallback(THREE));
  for (const i of Object.values(ITEMS)) assert.ok(i.proceduralFallback(THREE));
  const box = makeMysteryBox(THREE); assert.ok(box.userData.q, 'item box has a spinning ? node'); assert.ok(meshes(box.userData.q) >= 3);
});
test('baking collapses ~200 primitives into a few draws, keeps animated nodes, and outlines use ink #14141f', () => {
  assert.equal(INK, 0x14141f);
  for (const k of PLAYABLE_KARTS) {
    const g = k.proceduralFallback(THREE); g.getObjectByName('Driver_Seat').add(CHARACTERS.zoe.proceduralFallback(THREE));
    const before = meshes(g); bakeAssembly(g); const after = meshes(g);
    assert.ok(after < before / 5, `${k.id}: ${before} -> ${after}`);
    for (const n of ['Wheel_FL', 'Cosmetic_Panel_L', 'Cosmetic_Roof_Spoiler', 'Cockpit_Wheel', 'Driver_Seat']) assert.ok(g.getObjectByName(n), n);
    addOutlines(g); let hulls = 0; g.traverse((o) => { if (o.userData.outline) hulls++; }); assert.ok(hulls > 5 && hulls <= after);
    assert.ok(tris(g) > 8000, 'still detailed');
  }
  const t = toonGradient(); assert.equal(t.image.width, 3, '3-step ramp'); assert.equal(t.magFilter, THREE.NearestFilter);
});
test('TextureFactory degrades gracefully without a DOM (returns null, never throws)', () => {
  for (const [n, f] of Object.entries(TextureFactory)) if (!n.startsWith('_')) assert.equal(f.call(TextureFactory, TRACKS.whistler_run.theme), null, n);
});

/* ---------------------------------------------------------------- tracks */
test('tracks: windy + hilly, no road crossings, kickers on straights, shortcuts 12-35% shorter', () => {
  for (const id of TRACK_ORDER) {
    const t = new TrackSpline(TRACKS[id]), F = t.frames;
    let minP = 99, maxP = -99, minSep = Infinity, maxK = 0;
    for (let i = 1; i < F.M; i++) { const p = Math.asin(-F.T[i].y) * 57.3; minP = Math.min(minP, p); maxP = Math.max(maxP, p); maxK = Math.max(maxK, Math.abs(F.kappa[i])); }
    for (let i = 0; i <= F.M; i += 4) for (let j = i + 1; j <= F.M; j += 4) if (F.dist[j] - F.dist[i] > 800 && Math.abs(F.P[i].y - F.P[j].y) < 25) minSep = Math.min(minSep, Math.hypot(F.P[i].x - F.P[j].x, F.P[i].z - F.P[j].z));
    assert.ok(maxP - minP > 14, `${id}: hills ${minP.toFixed(1)}..${maxP.toFixed(1)}`);
    assert.ok(minP < 0, `${id}: has short climbs`);
    assert.ok(maxK > 0.008, `${id}: winding`);
    assert.ok(minSep > 120, `${id}: legs too close (${minSep.toFixed(0)} m)`);
    for (const r of t.jumpRamps.filter((x) => x.pathId === 'main')) assert.ok(Math.abs(t.curvature(r.lipD)) < 0.0052, `${id}: kicker at ${r.lipD.toFixed(0)} on a bend`);
    for (const s of t.shortcuts) assert.ok(s.saving > 0.12 && s.saving < 0.35, `${id}/${s.id}: saving ${(s.saving * 100).toFixed(0)}%`);
    assert.ok(t.length > 4300 && t.length < 4700);
  }
});
test('Whistler is an open slope: wide, groove + powder + out-of-bounds terrain colliders', () => {
  const t = new TrackSpline(TRACKS.whistler_run), m = t.buildMeshes();
  assert.equal(t.width, 44); assert.equal(t.grooveHalf, 9); assert.ok(m.open && m.powder.length === 2 && m.physicsPowder.indices.length > 50000 && t.oobLimit > 30);
});

/* ---------------------------------------------------------------- physics / gameplay */
for (const id of TRACK_ORDER) {
  test(`session on ${id}: 8 AI race for 12 s without errors and make progress`, async () => {
    const s = await mk(id);
    s.state = 'RACING'; for (const k of s.karts) k.hold = false;
    for (let i = 0; i < 60 * 12; i++) s.step(1 / 60);
    const moved = s.karts.filter((k) => k.d > 120).length;
    assert.ok(moved >= 6, `${id}: only ${moved}/8 karts progressed`);
    for (const k of s.karts) { assert.ok(Number.isFinite(k.pos.x + k.pos.y + k.pos.z)); assert.ok(k.respawns <= 2, `${id}: ${k.name} respawned ${k.respawns}x`); }
    s.dispose();
  });
}
test('yeti: out of bounds -> chase -> grab -> scripted throw lands ON the groove, exactly one obstacle penalty', async () => {
  for (const side of [1, -1]) {
    const s = await mk('whistler_run', racersOf(1)); const k = s.karts[0]; s.ais.delete(0); s.state = 'RACING'; k.hold = false;
    k.placeAt(s.track, 1500, side * 46, 0); k.hint = -1;
    const seen = { oob: 0, grabbed: 0, thrown: 0, slam: 0 }; let landedLat = null;
    const orig = s._events.bind(s); s._events = function () { for (const e of k.events) { if (e.type === 'oob') seen.oob++; if (e.type === 'grabbed') seen.grabbed++; if (e.type === 'thrown') seen.thrown++; if (e.type === 'yetiSlam') { seen.slam++; landedLat = k.lat; } } orig(); };
    for (let i = 0; i < 60 * 9 && !seen.slam; i++) { k.input.throttle = 1; k.input.steer = 0; s.step(1 / 60); }
    assert.equal(seen.grabbed, 1, 'grabbed once'); assert.equal(seen.thrown, 1, 'thrown once'); assert.equal(seen.slam, 1, 'one penalty');
    assert.ok(landedLat !== null && Math.abs(landedLat) < s.track.grooveHalf + 3, `landed at lat ${landedLat} (side ${side})`);
    s.dispose();
  }
});
test('trees are solid: a kart driven at full speed into a trunk stops or bounces back', async () => {
  const s = await mk('whistler_run', racersOf(1)); const k = s.karts[0]; s.ais.delete(0); s.state = 'RACING'; k.hold = false;
  const t = s.trees[40], loc = s.track.locate(t.p, -1, 0, {});
  k.placeAt(s.track, loc.d - 28, loc.lat, 22); k.hint = -1; let minV = 99;
  for (let i = 0; i < 60 * 3; i++) { k.input.throttle = 1; k.input.steer = 0; s.step(1 / 60); if (i > 40) minV = Math.min(minV, k.speed); }
  assert.ok(minV < 6, `kart never slowed (min ${minV.toFixed(1)} m/s)`); s.dispose();
});
test('powder is slower than the groomed groove', async () => {
  const run = async (lat) => { const s = await mk('whistler_run', racersOf(1)); const k = s.karts[0]; s.ais.delete(0); s.state = 'RACING'; k.hold = false; k.placeAt(s.track, 700, lat, 15); k.hint = -1; for (let i = 0; i < 60 * 5; i++) { k.input.throttle = 1; k.input.steer = 0; s.step(1 / 60); } const v = k.speed; s.dispose(); return v; };
  const groove = await run(0), powder = await run(16);
  assert.ok(powder < groove, `powder ${powder.toFixed(1)} vs groove ${groove.toFixed(1)}`);
});

/* ---------------------------------------------------------------- cup / draft rules */
test('cup: 4 races, points table, diminishing-return stats, weapon/shield upgrade on duplicate', () => {
  assert.deepEqual(POINTS, [15, 12, 10, 8, 6, 4, 2, 1]);
  assert.equal(gammaDim(0), 1); assert.ok(Math.abs(gammaDim(2) - 0.88) < 1e-9); assert.equal(gammaDim(10), 0.75);
  const c = new CircuitManager(racersOf(8, true), (() => { let x = 1; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })());
  c.dealAll(); assert.equal(c.hands.get(0).length, 3);
  const hand = c.hands.get(0), cats = hand.map((h) => h.category).sort(); assert.deepEqual(cats, ['shield', 'stat', 'weapon']);
  c.apply(0, hand.find((h) => h.category === 'weapon')); assert.equal(c.byId.get(0).weapon.level, 1);
  c.hands.set(0, [{ category: 'weapon', id: c.byId.get(0).weapon.id }]); c.apply(0, c.hands.get(0)[0]); assert.equal(c.byId.get(0).weapon.level, 2);
  c.recordResults([3, 1, 0, 2, 4, 5, 6, 7]); assert.equal(c.byId.get(3).points, 15); assert.equal(c.byId.get(7).points, 1);
  for (let i = 0; i < 3; i++) assert.ok(c.advance()); assert.equal(c.advance(), false);
});

/* ---------------------------------------------------------------- headset tier + multiplayer */
import { NetRace } from '../src/net/NetRace.js';
import { chunkMesh, liteThree } from '../src/core/Lod.js';

test('headset tier: lite geometry namespace cuts kart + kid triangles by more than a third, same node contract', () => {
  const L = liteThree(0.5);
  for (const k of PLAYABLE_KARTS) {
    const full = tris(k.proceduralFallback(THREE)), g = k.proceduralFallback(L), lite = tris(g);
    assert.ok(lite < full * 0.67, `${k.id}: ${lite} vs ${full}`);
    for (const n of ['Wheel_FL', 'Driver_Seat', 'Cockpit_Wheel']) assert.ok(g.getObjectByName(n), n);
  }
  const kid = CHARACTERS[CHARACTER_IDS[0]];
  assert.ok(tris(kid.proceduralFallback(L)) < tris(kid.proceduralFallback(THREE)) * 0.67);
});
test('headset tier: chunkMesh splits a long mesh into cullable pieces without losing triangles', () => {
  const g = new THREE.PlaneGeometry(1000, 10, 200, 2).rotateX(-Math.PI / 2), parent = new THREE.Group();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); parent.add(m);
  const parts = chunkMesh(m, 160);
  assert.ok(parts.length >= 6);
  assert.equal(parts.reduce((a, c) => a + c.geometry.index.count, 0), g.index.count);
  assert.ok(parts.every((c) => c.geometry.boundingSphere.radius < 200));
  assert.equal(m.parent, null);
});
test('headset quality session ("vr"): chunked world, far karts become proxies, AI still races', async () => {
  const s = await mk('whistler_run', racersOf(8, true));
  s.dispose();
  const v = new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId: 'whistler_run', racers: racersOf(8), seed: 1, quality: 'vr' });
  assert.ok(v.lod.length > 20, 'static world is chunked: ' + v.lod.length);
  assert.ok(v.visuals.every((x) => x.proxy));
  for (let i = 0; i < 60 * 8; i++) { v.step(1 / 60); if (i % 30 === 0) v.updateVisuals(1 / 60, 1); }
  assert.ok(v.karts.filter((k) => k.maxD > 60).length >= 6);
  v.dispose();
  new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId: 'whistler_run', racers: racersOf(2), seed: 1, quality: 'high' }).dispose(); // resets the global detail tier
});

/** Two in-memory "devices" wired back to back with a little latency, same message shapes as the real transport. */
function loopback(delaySteps = 2) {
  const mk1 = (isHost, id) => ({ isHost, id, h: new Map(), raceHook: null, q: [], on(t, f) { this.h.set(t, f); return this; }, off(t) { this.h.delete(t); }, clientIds: isHost ? ['c1'] : [], peer: null,
    send(msg) { const m = JSON.parse(JSON.stringify(msg)); if (isHost) delete m.from; else m.from = id; this.peer.q.push({ m, at: this.peer.tick + delaySteps }); }, tick: 0,
    pump() { this.tick++; while (this.q.length && this.q[0].at <= this.tick) { const { m } = this.q.shift(); this.h.get(m.t)?.(m); } } });
  const host = mk1(true, 'host'), client = mk1(false, 'c1'); host.peer = client; client.peer = host;
  return { host, client };
}
test('multiplayer: host + joined device stay in sync (puppets track owners, events relay, host referees the result)', async () => {
  const { host, client } = loopback();
  const grid = Array.from({ length: 4 }, (_, i) => ({ id: i, owner: i === 1 ? 'c1' : 'host', name: 'R' + i, isHuman: i < 2, humanIndex: i === 0 ? 0 : undefined, persona: 'balanced_hybrid', kartId: PLAYABLE_KARTS[i % 2].id, charId: CHARACTER_IDS[i], build: newBuildState(), weapon: { id: 'ballistic_chicken', level: 1 }, shield: { id: 'bubble_wrap_shield', level: 1 } }));
  const view = (me) => grid.map((r) => (r.owner === me ? { ...r, humanIndex: r.isHuman ? 0 : undefined, autopilot: r.isHuman } : { ...r, isHuman: false, humanIndex: undefined, puppet: true, remoteHuman: r.isHuman }));
  const mkS = async (net, me) => new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId: 'san_diego_streets', racers: view(me), seed: 7, quality: 'low', net });
  const H = await mkS(host, 'host'), C = await mkS(client, 'c1');
  const hh = new NetRace(H, host), ch = new NetRace(C, client);
  assert.equal(C.karts.filter((k) => k.puppet).length, 3); assert.equal(H.karts.filter((k) => k.puppet).length, 1);
  assert.equal(H.allHumans.length, 2);
  for (let i = 0; i < 30; i++) { H.step(1 / 60); C.step(1 / 60); host.pump(); client.pump(); }
  assert.equal(H.time, 0, 'held on the grid until go'); assert.equal(C.time, 0);
  hh.go();
  let fired = 0; const of = C.items.fireWeapon.bind(C.items); C.items.fireWeapon = (k) => { if (k.puppet) fired++; return of(k); };
  const realNow = performance.now; let fake = realNow.call(performance); performance.now = () => fake; // deterministic snapshot ages
  try {
    for (let i = 0; i < 60 * 30; i++) { fake += 1000 / 60; H.step(1 / 60); C.step(1 / 60); host.pump(); client.pump(); }
  } finally { performance.now = realNow; }
  const byId = (s, id) => s.karts.find((k) => k.id === id);
  for (const id of [0, 2, 3]) { const a = byId(H, id), b = byId(C, id); assert.ok(a.maxD > 150, `host kart ${id} raced: ${a.maxD}`); assert.ok(a.pos.distanceTo(b.pos) < 6, `kart ${id} puppet within 6 m of its owner: ${a.pos.distanceTo(b.pos).toFixed(1)}`); }
  { const a = byId(C, 1), b = byId(H, 1); assert.ok(a.maxD > 150, 'client kart raced'); assert.ok(a.pos.distanceTo(b.pos) < 6, `client kart mirrored on host: ${a.pos.distanceTo(b.pos).toFixed(1)}`); }
  assert.ok(fired > 0, 'weapon fire by host-owned karts is replayed on the client');
  // a puppet never takes status effects locally
  const p = byId(C, 0); p.spinOut(2); p.addBoost(2, 2, 'x'); assert.equal(p.t.spin, 0); assert.equal(p.boosts.filter((b) => b.src === 'x').length, 0);
  // client never ends the race by itself; the host's results do
  C.karts.forEach((k) => { k.finished = true; }); C.step(1 / 60); assert.equal(C.done, false);
  hh.results([1, 0, 2, 3]); client.pump(); client.pump(); client.pump();
  assert.equal(C.done, true); assert.deepEqual(C.results, [1, 0, 2, 3]);
  // player drops: host hands the kart to the AI
  host.h.get('left')({ t: 'left', from: 'c1' });
  assert.equal(byId(H, 1).puppet, false); assert.ok(H.ais.has(1));
  hh.dispose(); ch.dispose(); H.dispose(); C.dispose();
});

test('skybox trick: the distant landscape is one baked cube map (fake renderer captures 6 faces, live sky + mountains switch off)', async () => {
  const { bakeSkybox } = await import('../src/core/SkyBake.js');
  const s = new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId: 'whistler_run', racers: racersOf(2), seed: 1, quality: 'vr' });
  let faces = 0, sceneTris = 0;
  const gl = { toneMapping: 0, autoClear: false, shadowMap: { enabled: true }, xr: { enabled: false }, coordinateSystem: THREE.WebGLCoordinateSystem,
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setRenderTarget() {}, render(sc) { faces++; sceneTris = 0; sc.traverse((o) => { if (o.isMesh) sceneTris += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); }); } };
  const rt = bakeSkybox(gl, s, 256);
  assert.equal(faces, 6);
  assert.ok(s.skyboxTris > 100000, 'detailed bake scene: ' + s.skyboxTris);
  assert.ok(s.scene.background === rt.texture && rt.texture.isCubeTexture);
  assert.equal(s.sky.visible, false); assert.equal(s.mountains.visible, false);
  assert.equal(gl.shadowMap.enabled, true, 'renderer state restored');
  s.dispose();
  new RaceSession({ physics: await PhysicsWorld.create(), assets: new AssetManager(), trackId: 'whistler_run', racers: racersOf(2), seed: 1, quality: 'high' }).dispose();
});
