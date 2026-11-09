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
