import type {
  AnimalState, GameDatabase, HuntResult, ItemId, ScentReading, SpeciesDef, Vec2, WindState, WorldSystems,
} from '@/types/contracts';
import { constrain, dist, wrapAngle } from './geometry';
import { RngCursor, mix } from './rng';

/**
 * Wind / scent hunting.
 *
 * Angle convention everywhere (wind direction, animal heading, shot facing):
 * radians, `atan2(dz, dx)` — 0 = +x (east), π/2 = +z (south).
 */

/** Half-angle of Tobin's shot cone (radians). */
export const SHOT_CONE = 0.22;
/** Same-species animals within this distance of a fleeing/shot animal panic too. */
export const HERD_PANIC_RADIUS = 18;
/** Alertness above this makes a grazing animal stop and stare (mood `alert`). */
export const ALERT_THRESHOLD = 0.15;
/** Below this a fleeing animal that is far enough away settles back to grazing. */
export const CALM_THRESHOLD = 0.3;
/** Grazers start steering home when farther than this from it. */
export const HOME_LEASH = 10;

const TAU = Math.PI * 2;
const UINT = 4294967296;

export function createHunting(db: GameDatabase): WorldSystems['hunting'] {
  const water = db.world.water;
  const speciesList: readonly SpeciesDef[] = Object.values(db.species);

  const speciesOf = (id: string): SpeciesDef | undefined => db.species[id];

  function windAt(timeSec: number, seed: number): WindState {
    const p = [0, 1, 2, 3, 4].map((k) => (mix(seed, k + 101) / UINT) * TAU);
    const [p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0] = p;
    const direction = wrapAngle(p0 + 0.9 * Math.sin(timeSec * 0.011 + p1) + 0.35 * Math.sin(timeSec * 0.029 + p2));
    const raw = 3.6 + 1.8 * Math.sin(timeSec * 0.017 + p3) + 0.9 * Math.sin(timeSec * 0.043 + p4);
    const speed = Math.min(8, Math.max(0.4, raw));
    return { direction, speed };
  }

  function spawn(seed: number): readonly AnimalState[] {
    const r = new RngCursor(mix(seed, 7));
    const out: AnimalState[] = [];
    for (const sp of speciesList) {
      sp.habitat.forEach((hab, hi) => {
        const count = r.int(sp.herd.min, sp.herd.max);
        const ha = r.range(0, TAU);
        const hr = r.range(0, hab.radius * 0.4);
        const herdCenter = constrain({ x: hab.center.x + Math.cos(ha) * hr, z: hab.center.z + Math.sin(ha) * hr }, water, 2);
        for (let i = 0; i < count; i++) {
          const a = r.range(0, TAU);
          const d = r.range(1, Math.min(6, hab.radius * 0.5));
          const pos = constrain({ x: herdCenter.x + Math.cos(a) * d, z: herdCenter.z + Math.sin(a) * d }, water, 2);
          out.push({
            id: `${sp.id}:${hi}:${i}`,
            speciesId: sp.id,
            position: pos,
            heading: r.range(-Math.PI, Math.PI),
            mood: 'grazing',
            alertness: 0,
            home: pos,
          });
        }
      });
    }
    return out;
  }

  function scent(animal: AnimalState, hunter: Vec2, wind: WindState, hunterStealth: number): ScentReading {
    const sp = speciesOf(animal.speciesId);
    const stealth = Math.min(1, Math.max(0, hunterStealth));
    const vx = animal.position.x - hunter.x;
    const vz = animal.position.z - hunter.z;
    const d = Math.hypot(vx, vz);
    // Hunter→animal vector aligned with the wind's travel ⇒ hunter is upwind ⇒ +1.
    const upwindFactor = d < 1e-6 ? 1 : (Math.cos(wind.direction) * vx + Math.sin(wind.direction) * vz) / d;
    if (!sp) return { detectionRadius: 0, upwindFactor, detected: false };
    let detectionRadius =
      sp.alertRadius * (1 - 0.5 * stealth) + Math.max(0, upwindFactor) * sp.scentSensitivity * wind.speed;
    if (upwindFactor < 0) detectionRadius *= 1 + 0.5 * upwindFactor; // downwind: shrinks to half at worst
    const detected = animal.mood !== 'downed' && d <= detectionRadius;
    return { detectionRadius, upwindFactor, detected };
  }

  function update(
    animals: readonly AnimalState[], hunter: Vec2, wind: WindState, hunterStealth: number, dt: number, rng: number,
  ): { readonly animals: readonly AnimalState[]; readonly rng: number } {
    const r = new RngCursor(rng);
    const step = Math.max(0, dt);
    const nextAnimals: AnimalState[] = [];
    const panicked = new Set<number>();

    animals.forEach((animal, idx) => {
      const sp = speciesOf(animal.speciesId);
      const jitter = r.float(); // always consume one value per animal for stable sequences
      if (!sp || animal.mood === 'downed') {
        nextAnimals.push(animal);
        return;
      }
      const reading = scent(animal, hunter, wind, hunterStealth);
      const d = dist(animal.position, hunter);
      let { alertness, heading, mood } = animal;
      let speed = 0;

      if (mood === 'fleeing') {
        const calmDistance = Math.max(30, reading.detectionRadius * 2);
        if (d > calmDistance && !reading.detected) {
          alertness = Math.max(0, alertness - step * 0.35);
          if (alertness <= CALM_THRESHOLD) mood = 'grazing';
        } else {
          alertness = 1;
        }
        if (mood === 'fleeing') {
          heading = Math.atan2(animal.position.z - hunter.z, animal.position.x - hunter.x) + (jitter - 0.5) * 0.3;
          speed = sp.speed;
        }
      } else {
        if (reading.detected) {
          const closeness = reading.detectionRadius > 0 ? Math.max(0, 1 - d / reading.detectionRadius) : 1;
          alertness = Math.min(1, alertness + step * (0.5 + 1.5 * closeness));
        } else {
          alertness = Math.max(0, alertness - step * 0.2);
        }
        if (alertness >= 1) {
          mood = 'fleeing';
          panicked.add(idx);
          heading = Math.atan2(animal.position.z - hunter.z, animal.position.x - hunter.x);
          speed = sp.speed;
        } else if (alertness > ALERT_THRESHOLD) {
          mood = 'alert';
          heading = Math.atan2(hunter.z - animal.position.z, hunter.x - animal.position.x);
        } else {
          mood = 'grazing';
          heading += (jitter - 0.5) * 2 * step;
          const toHome = dist(animal.position, animal.home);
          if (toHome > HOME_LEASH) {
            const homeAngle = Math.atan2(animal.home.z - animal.position.z, animal.home.x - animal.position.x);
            heading += wrapAngle(homeAngle - heading) * Math.min(1, step * 1.5);
          }
          speed = sp.wanderSpeed;
        }
      }

      heading = wrapAngle(heading);
      const moved = speed > 0
        ? constrain({ x: animal.position.x + Math.cos(heading) * speed * step, z: animal.position.z + Math.sin(heading) * speed * step }, water, 1)
        : animal.position;
      nextAnimals.push({ ...animal, position: moved, heading, mood, alertness });
    });

    // Herd panic: one bolting animal takes its herd with it (transitively).
    const queue = [...panicked];
    while (queue.length > 0) {
      const i = queue.pop();
      if (i === undefined) break;
      const src = nextAnimals[i];
      if (!src) continue;
      nextAnimals.forEach((other, j) => {
        if (j === i || other.speciesId !== src.speciesId) return;
        if (other.mood === 'fleeing' || other.mood === 'downed') return;
        if (dist(other.position, src.position) > HERD_PANIC_RADIUS) return;
        const heading = Math.atan2(other.position.z - hunter.z, other.position.x - hunter.x);
        nextAnimals[j] = { ...other, mood: 'fleeing', alertness: 1, heading: wrapAngle(heading) };
        queue.push(j);
      });
    }

    return { animals: nextAnimals, rng: r.state };
  }

  function rollDrops(sp: SpeciesDef, r: RngCursor): { itemId: ItemId; qty: number }[] {
    const drops: { itemId: ItemId; qty: number }[] = [];
    for (const d of sp.drops) {
      if (r.float() < d.chance) drops.push({ itemId: d.itemId, qty: 1 });
    }
    return drops;
  }

  /** Down `targetIdx`, roll drops, and spook its herd. */
  function resolveHit(animals: readonly AnimalState[], targetIdx: number, threat: Vec2, rng: number): HuntResult {
    const target = animals[targetIdx];
    const sp = target ? speciesOf(target.speciesId) : undefined;
    if (!target || !sp) return { hit: false, drops: [], animals, rng };
    const r = new RngCursor(rng);
    const drops = rollDrops(sp, r);
    const next = animals.map((a, i): AnimalState => {
      if (i === targetIdx) return { ...a, mood: 'downed', alertness: 0 };
      if (a.mood === 'downed' || a.speciesId !== target.speciesId) return a;
      if (dist(a.position, target.position) > HERD_PANIC_RADIUS) return a;
      return { ...a, mood: 'fleeing', alertness: 1, heading: Math.atan2(a.position.z - threat.z, a.position.x - threat.x) };
    });
    return { hit: true, animalId: target.id, speciesId: target.speciesId, drops, animals: next, rng: r.state };
  }

  function shoot(animals: readonly AnimalState[], hunter: Vec2, facing: number, range: number, rng: number): HuntResult {
    let best = -1;
    let bestD = Infinity;
    animals.forEach((a, i) => {
      if (a.mood === 'downed') return;
      const d = dist(a.position, hunter);
      if (d > range || d < 1e-6) return;
      const ang = Math.atan2(a.position.z - hunter.z, a.position.x - hunter.x);
      if (Math.abs(wrapAngle(ang - facing)) > SHOT_CONE) return;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return { hit: false, drops: [], animals, rng };
    return resolveHit(animals, best, hunter, rng);
  }

  function dashStrike(animals: readonly AnimalState[], dashEnd: Vec2, radius: number, rng: number): HuntResult {
    let best = -1;
    let bestD = Infinity;
    animals.forEach((a, i) => {
      if (a.mood === 'downed') return;
      const d = dist(a.position, dashEnd);
      if (d <= radius && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return { hit: false, drops: [], animals, rng };
    return resolveHit(animals, best, dashEnd, rng);
  }

  return { windAt, spawn, scent, update, shoot, dashStrike };
}
