import { describe, expect, it } from 'vitest';
import type { AnimalState, Vec2, WindState } from '@/types/contracts';
import { gameData as db } from '@/data';
import { SPECIES } from '@/data/ids';
import { createWorldSystems } from '@/systems';

const { hunting } = createWorldSystems(db);
const deer = (pos: Vec2, extra: Partial<AnimalState> = {}): AnimalState => ({
  id: `d${pos.x},${pos.z}`, speciesId: SPECIES.deer, position: pos, heading: 0, mood: 'grazing', alertness: 0, home: pos, ...extra,
});
const eastWind: WindState = { direction: 0, speed: 5 }; // blowing toward +x
const inWater = (p: Vec2) => db.world.water.some((w) => Math.hypot(p.x - w.center.x, p.z - w.center.z) < w.radius);

describe('wind', () => {
  it('is deterministic, bounded and smooth', () => {
    const a = hunting.windAt(123.4, 99);
    expect(hunting.windAt(123.4, 99)).toEqual(a);
    expect(hunting.windAt(123.4, 100)).not.toEqual(a);
    for (let t = 0; t < 3600; t += 7) {
      const w = hunting.windAt(t, 99);
      const n = hunting.windAt(t + 0.25, 99);
      expect(w.speed).toBeGreaterThanOrEqual(0);
      expect(w.speed).toBeLessThanOrEqual(8);
      const dd = Math.abs(Math.atan2(Math.sin(n.direction - w.direction), Math.cos(n.direction - w.direction)));
      expect(dd).toBeLessThan(0.05);
      expect(Math.abs(n.speed - w.speed)).toBeLessThan(0.1);
    }
  });
});

describe('spawn', () => {
  it('places herds of every species deterministically, on land, in bounds', () => {
    const a = hunting.spawn(42);
    expect(hunting.spawn(42)).toEqual(a);
    expect(hunting.spawn(43)).not.toEqual(a);
    for (const sp of Object.values(db.species)) {
      const n = a.filter((x) => x.speciesId === sp.id).length;
      expect(n).toBeGreaterThanOrEqual(sp.herd.min * sp.habitat.length);
      expect(n).toBeLessThanOrEqual(sp.herd.max * sp.habitat.length);
    }
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    for (const x of a) {
      expect(inWater(x.position)).toBe(false);
      expect(x.mood).toBe('grazing');
    }
  });
});

describe('scent', () => {
  const animal = deer({ x: 100, z: 150 });
  it('upwind hunters are detected farther than downwind hunters', () => {
    const upwind = hunting.scent(animal, { x: 80, z: 150 }, eastWind, 0); // wind carries hunter → animal
    const downwind = hunting.scent(animal, { x: 120, z: 150 }, eastWind, 0);
    expect(upwind.upwindFactor).toBeCloseTo(1);
    expect(downwind.upwindFactor).toBeCloseTo(-1);
    expect(upwind.detectionRadius).toBeGreaterThan(downwind.detectionRadius);
    expect(upwind.detected).toBe(true); // 20 m < 16 + 3.2×5
    expect(downwind.detected).toBe(false); // 20 m > 8
    const sp = db.species[SPECIES.deer]!;
    expect(upwind.detectionRadius).toBeCloseTo(sp.alertRadius + sp.scentSensitivity * eastWind.speed);
    expect(downwind.detectionRadius).toBeCloseTo(sp.alertRadius * 0.5);
  });
  it('stealth shrinks detection; crosswind uses only the base radius', () => {
    const cross = hunting.scent(animal, { x: 100, z: 130 }, eastWind, 0);
    expect(cross.upwindFactor).toBeCloseTo(0);
    expect(cross.detectionRadius).toBeCloseTo(db.species[SPECIES.deer]!.alertRadius);
    const sneaky = hunting.scent(animal, { x: 100, z: 130 }, eastWind, 1);
    expect(sneaky.detectionRadius).toBeCloseTo(cross.detectionRadius / 2);
  });
  it('boars smell more than grouse', () => {
    const boar = { ...animal, speciesId: SPECIES.boar };
    const grouse = { ...animal, speciesId: SPECIES.grouse };
    const hunter = { x: 70, z: 150 };
    expect(hunting.scent(boar, hunter, eastWind, 0).detected).toBe(true);
    expect(hunting.scent(grouse, hunter, eastWind, 0).detected).toBe(false);
  });
});

describe('herd AI', () => {
  const herd = [deer({ x: 100, z: 150 }), deer({ x: 104, z: 152 }), deer({ x: 98, z: 155 })];

  it('grazes calmly when the hunter is far away and downwind, staying near home', () => {
    let s = { animals: herd as readonly AnimalState[], rng: 1 };
    for (let i = 0; i < 300; i++) s = hunting.update(s.animals, { x: 200, z: 150 }, eastWind, 0, 0.1, s.rng);
    for (const a of s.animals) {
      expect(a.mood).toBe('grazing');
      expect(Math.hypot(a.position.x - a.home.x, a.position.z - a.home.z)).toBeLessThan(20);
    }
  });

  it('an upwind hunter alarms the herd and the whole herd flees away from him', () => {
    const hunter = { x: 82, z: 150 };
    let s = { animals: herd as readonly AnimalState[], rng: 7 };
    let sawAlert = false;
    for (let i = 0; i < 40; i++) {
      s = hunting.update(s.animals, hunter, eastWind, 0, 0.1, s.rng);
      if (s.animals.some((a) => a.mood === 'alert')) sawAlert = true;
    }
    expect(sawAlert).toBe(true);
    for (const a of s.animals) expect(a.mood).toBe('fleeing');
    const before = herd.map((a) => Math.hypot(a.position.x - hunter.x, a.position.z - hunter.z));
    for (let i = 0; i < 10; i++) s = hunting.update(s.animals, hunter, eastWind, 0, 0.1, s.rng);
    s.animals.forEach((a, i) => expect(Math.hypot(a.position.x - hunter.x, a.position.z - hunter.z)).toBeGreaterThan(before[i]!));
  });

  it('a downwind hunter at the same distance goes unnoticed', () => {
    let s = { animals: herd as readonly AnimalState[], rng: 7 };
    for (let i = 0; i < 40; i++) s = hunting.update(s.animals, { x: 118, z: 150 }, eastWind, 0, 0.1, s.rng);
    for (const a of s.animals) expect(a.mood).not.toBe('fleeing');
  });

  it('panic spreads to herd-mates outside detection range', () => {
    const far = deer({ x: 115, z: 150 });
    const near = deer({ x: 100, z: 150 }, { alertness: 0.99 });
    const s = hunting.update([near, far], { x: 95, z: 150 }, { direction: Math.PI / 2, speed: 0 }, 1, 0.1, 3);
    expect(s.animals[0]?.mood).toBe('fleeing');
    expect(s.animals[1]?.mood).toBe('fleeing');
  });

  it('fleeing animals calm down once far away and drift home', () => {
    let s = { animals: [deer({ x: 100, z: 150 }, { mood: 'fleeing', alertness: 1, home: { x: 60, z: 150 } })] as readonly AnimalState[], rng: 5 };
    const hunter = { x: 200, z: 150 };
    for (let i = 0; i < 400; i++) s = hunting.update(s.animals, hunter, eastWind, 0, 0.1, s.rng);
    const a = s.animals[0]!;
    expect(a.mood).toBe('grazing');
    expect(Math.hypot(a.position.x - 60, a.position.z - 150)).toBeLessThan(45);
  });

  it('never leaves the map or walks into water, and is deterministic', () => {
    const lakeSide = [deer({ x: 148, z: 74 }), deer({ x: 3, z: 3 })];
    let s = { animals: lakeSide as readonly AnimalState[], rng: 11 };
    let t = { animals: lakeSide as readonly AnimalState[], rng: 11 };
    for (let i = 0; i < 200; i++) {
      s = hunting.update(s.animals, { x: 148, z: 95 }, { direction: -Math.PI / 2, speed: 6 }, 0, 0.2, s.rng);
      t = hunting.update(t.animals, { x: 148, z: 95 }, { direction: -Math.PI / 2, speed: 6 }, 0, 0.2, t.rng);
      for (const a of s.animals) {
        expect(inWater(a.position)).toBe(false);
        expect(a.position.x).toBeGreaterThanOrEqual(0);
        expect(a.position.z).toBeGreaterThanOrEqual(0);
        expect(a.position.x).toBeLessThanOrEqual(250);
        expect(a.position.z).toBeLessThanOrEqual(250);
      }
    }
    expect(s).toEqual(t);
  });
});

describe('shoot & dash', () => {
  const animals = [deer({ x: 120, z: 100 }), deer({ x: 130, z: 100 }), deer({ x: 100, z: 120 })];
  const hunter = { x: 100, z: 100 };

  it('the shot hits the nearest animal inside the cone and rolls drops', () => {
    const r = hunting.shoot(animals, hunter, 0, 40, 1234);
    expect(r.hit).toBe(true);
    expect(r.animalId).toBe(animals[0]!.id);
    expect(r.speciesId).toBe(SPECIES.deer);
    expect(r.animals[0]?.mood).toBe('downed');
    for (const d of r.drops) expect(db.species[SPECIES.deer]!.drops.map((x) => x.itemId)).toContain(d.itemId);
    expect(r.rng).not.toBe(1234);
    expect(hunting.shoot(animals, hunter, 0, 40, 1234)).toEqual(r);
    // the herd-mate 10 m away bolts
    expect(r.animals[1]?.mood).toBe('fleeing');
  });

  it('misses outside the cone or range and skips downed animals', () => {
    expect(hunting.shoot(animals, hunter, Math.PI, 40, 1).hit).toBe(false);
    expect(hunting.shoot(animals, hunter, 0, 10, 1).hit).toBe(false);
    const miss = hunting.shoot(animals, hunter, Math.PI / 4, 40, 1);
    expect(miss.hit).toBe(false);
    expect(miss.animals).toBe(animals);
    const downed = animals.map((a, i) => (i === 0 ? { ...a, mood: 'downed' as const } : a));
    expect(hunting.shoot(downed, hunter, 0, 40, 1).animalId).toBe(animals[1]!.id);
  });

  it('the dash tackles the nearest animal within radius of the dash end', () => {
    const r = hunting.dashStrike(animals, { x: 101, z: 118 }, 4, 9);
    expect(r.hit).toBe(true);
    expect(r.animalId).toBe(animals[2]!.id);
    expect(hunting.dashStrike(animals, { x: 200, z: 200 }, 4, 9).hit).toBe(false);
  });

  it('drop rates follow the species table over many kills', () => {
    let rng = 77;
    let hides = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const r = hunting.dashStrike([deer({ x: 50, z: 50 })], { x: 50, z: 50 }, 2, rng);
      rng = r.rng;
      if (r.drops.some((d) => d.itemId === 'item.softHide')) hides++;
    }
    expect(hides / N).toBeGreaterThan(0.82);
    expect(hides / N).toBeLessThan(0.97);
  });
});

describe('campaign habitats', () => {
  const chunkOf = (p: Vec2) => `${Math.floor(p.x / 250)},${Math.floor(p.z / 250)}`;

  it('spawns every habitat on the continent, ≤ 60 animals, each inside its habitat chunk', () => {
    const animals = hunting.spawn(db.world.seed);
    expect(animals.length).toBeLessThanOrEqual(60);
    const chunks = new Set(animals.map((a) => chunkOf(a.position)));
    expect(chunks.size).toBe(db.world.chunks.length);
    for (const a of animals) {
      const sp = db.species[a.speciesId]!;
      expect(sp.habitat.some((h) => chunkOf(h.center) === chunkOf(a.position)), a.id).toBe(true);
      expect(chunkOf(a.home)).toBe(chunkOf(a.position));
      expect(inWater(a.position), a.id).toBe(false);
    }
  });

  it('a fleeing animal never leaves its chunk, even when chased toward the edge', () => {
    const rim = db.species.rimeElk!;
    const home = rim.habitat[0]!.center;
    const elk: AnimalState = { id: 'elk', speciesId: rim.id, position: { x: home.x, z: home.z }, heading: 0, mood: 'fleeing', alertness: 1, home };
    let s = { animals: [elk] as readonly AnimalState[], rng: 9 };
    const hunter = { x: home.x + 10, z: home.z };
    for (let i = 0; i < 400; i++) {
      s = hunting.update(s.animals, hunter, { direction: Math.PI, speed: 6 }, 0, 0.2, s.rng);
      expect(chunkOf(s.animals[0]!.position)).toBe(chunkOf(home));
      expect(inWater(s.animals[0]!.position)).toBe(false);
    }
  });
});
