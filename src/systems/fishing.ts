import type { FishDef, FishingSession, GameDatabase, ItemId, WorldSystems } from '@/types/contracts';
import { RngCursor, next } from './rng';

/**
 * Fishing tension minigame.
 *
 *  waiting → (timer ≥ biteAt) → bite → (tap within BITE_WINDOW) → reeling → landed | escaped
 *
 * While reeling the fish pulls with an oscillating surge driven by `fight`:
 *   surge(t) = 0.5 + 0.5·sin(t·ω + φ),  ω = 2 + 4·fight,  φ from the session rng.
 *   holding:  tension += (0.3 + 0.9·fight·(0.5 + surge))·dt,   progress += 0.26·(1 − 0.4·fight)·dt
 *   released: tension += (−0.85 + 0.5·fight·surge)·dt,         progress −= 0.06·fight·(0.5 + surge)·dt
 * Tension ≥ 1 snaps the line; progress ≥ 1 lands the fish. Reeling longer than MAX_REEL tires the line out.
 * "Hold while tension < 0.7" lands commons in ~6 s, rares in ~12 s, the legend only after ~33 s of the 45 s limit;
 * simply holding snaps every line within ~2 s (sooner for strong fish).
 */
export const BITE_WINDOW = 1.4;
export const MAX_REEL = 45;
/** Weight multiplier for fish whose preferred lure is used. */
export const LURE_BONUS = 3;
/** Max weight bonus for non-common fish at castQuality 1 (+50 %). */
export const RARE_CAST_BONUS = 0.5;
const HOOK_TENSION = 0.2;
const HOOK_PROGRESS = 0.1;

export function createFishing(db: GameDatabase): WorldSystems['fishing'] {
  const fishOf = (id: string): FishDef | undefined => db.fish[id];

  function cast(spotId: string, lureId: ItemId | null, seed: number, castQuality = 0.5): FishingSession {
    const q = Number.isFinite(castQuality) ? Math.min(1, Math.max(0, castQuality)) : 0.5;
    const spot = db.world.fishingSpots.find((s) => s.id === spotId);
    if (!spot) throw new Error(`Unknown fishing spot: ${spotId}`);
    const pool = spot.fish.map((id) => fishOf(id)).filter((f): f is FishDef => f !== undefined);
    if (pool.length === 0) throw new Error(`Fishing spot ${spotId} has no fish`);
    const r = new RngCursor(seed);
    // A good cast reaches deeper water: uncommon-and-rarer fish gain up to +50 % weight at quality 1.
    const weights = pool.map(
      (f) => f.weight * (lureId !== null && f.preferredLure === lureId ? LURE_BONUS : 1) * (f.rarity === 'common' ? 1 : 1 + RARE_CAST_BONUS * q),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = r.float() * total;
    let chosen = pool[pool.length - 1];
    if (!chosen) throw new Error(`Fishing spot ${spotId} has no fish`);
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i] ?? 0;
      const f = pool[i];
      if (roll < 0 && f) {
        chosen = f;
        break;
      }
    }
    // Rarer fish keep you waiting a little longer.
    const rarityDelay = { common: 0, uncommon: 0.5, rare: 1.2, legend: 2 }[chosen.rarity];
    // Better casts land where the fish are: ×1.3 wait at quality 0, ×1 at 0.5, ×0.7 at 1.
    const biteAt = (2 + r.float() * 3.5 + rarityDelay) * (1.3 - 0.6 * q);
    return {
      spotId, fishId: chosen.id, lureId, phase: 'waiting', timer: 0, biteAt, tension: 0, progress: 0, rng: r.state,
    };
  }

  function tick(session: FishingSession, input: { readonly holding: boolean; readonly tapped: boolean }, dt: number): FishingSession {
    const step = Math.max(0, dt);
    switch (session.phase) {
      case 'landed':
      case 'escaped':
        return session;
      case 'waiting': {
        const timer = session.timer + step;
        if (timer >= session.biteAt) return { ...session, phase: 'bite', timer: 0 };
        return { ...session, timer };
      }
      case 'bite': {
        if (input.tapped) return { ...session, phase: 'reeling', timer: 0, tension: HOOK_TENSION, progress: HOOK_PROGRESS };
        const timer = session.timer + step;
        if (timer > BITE_WINDOW) return { ...session, phase: 'escaped', timer };
        return { ...session, timer };
      }
      case 'reeling': {
        const fish = fishOf(session.fishId);
        const fight = fish?.fight ?? 0.3;
        const timer = session.timer + step;
        const phi = (next(session.rng).value) * Math.PI * 2;
        const surge = 0.5 + 0.5 * Math.sin(timer * (2 + 4 * fight) + phi);
        let tension = session.tension;
        let progress = session.progress;
        if (input.holding) {
          tension += (0.3 + 0.9 * fight * (0.5 + surge)) * step;
          progress += 0.26 * (1 - 0.4 * fight) * step;
        } else {
          tension += (-0.85 + 0.5 * fight * surge) * step;
          progress -= 0.06 * fight * (0.5 + surge) * step;
        }
        tension = Math.max(0, tension);
        progress = Math.max(0, progress);
        if (tension >= 1) return { ...session, phase: 'escaped', timer, tension: 1, progress };
        if (progress >= 1) return { ...session, phase: 'landed', timer, tension, progress: 1 };
        if (timer > MAX_REEL) return { ...session, phase: 'escaped', timer, tension, progress };
        return { ...session, timer, tension, progress };
      }
    }
  }

  function result(session: FishingSession): { readonly fish: FishDef; readonly itemId: ItemId; readonly summonsMerchant: boolean } | null {
    if (session.phase !== 'landed') return null;
    const fish = fishOf(session.fishId);
    if (!fish) return null;
    const spot = db.world.fishingSpots.find((s) => s.id === session.spotId);
    return { fish, itemId: fish.itemId, summonsMerchant: spot?.merchantFish === fish.id };
  }

  return { cast, tick, result };
}
