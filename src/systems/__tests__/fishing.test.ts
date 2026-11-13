import { describe, expect, it } from 'vitest';
import type { FishingSession } from '@/types/contracts';
import { gameData as db } from '@/data';
import { SPOT } from '@/data/ids';
import { BITE_WINDOW, createWorldSystems } from '@/systems';

const { fishing } = createWorldSystems(db);
const DT = 1 / 30;

type Policy = (s: FishingSession) => { holding: boolean; tapped: boolean };
const naive: Policy = (s) => ({ holding: s.phase === 'reeling' && s.tension < 0.7, tapped: s.phase === 'bite' });
const greedy: Policy = (s) => ({ holding: true, tapped: s.phase === 'bite' });
const asleep: Policy = () => ({ holding: false, tapped: false });

function play(session: FishingSession, policy: Policy, maxSec = 120): FishingSession & { reelTime: number } {
  let s = session;
  let reelTime = 0;
  for (let t = 0; t < maxSec && s.phase !== 'landed' && s.phase !== 'escaped'; t += DT) {
    if (s.phase === 'reeling') reelTime += DT;
    s = fishing.tick(s, policy(s), DT);
  }
  return { ...s, reelTime };
}
/** Force a specific fish onto a cast (tests the minigame per fish). */
const withFish = (fishId: string, seed = 5): FishingSession => ({ ...fishing.cast(SPOT.tarnShore, null, seed), fishId });

describe('cast', () => {
  it('is deterministic and only picks fish from the spot', () => {
    const a = fishing.cast(SPOT.pier, null, 99);
    expect(fishing.cast(SPOT.pier, null, 99)).toEqual(a);
    expect(a.phase).toBe('waiting');
    expect(a.biteAt).toBeGreaterThan(1);
    const pier = db.world.fishingSpots.find((s) => s.id === SPOT.pier)!;
    for (let seed = 0; seed < 200; seed++) expect(pier.fish).toContain(fishing.cast(SPOT.pier, null, seed).fishId);
    expect(() => fishing.cast('spot.nowhere', null, 1)).toThrow();
  });

  it('weights favour common fish; the preferred lure boosts its fish', () => {
    const count = (lure: string | null, fishId: string) => {
      let n = 0;
      for (let seed = 0; seed < 2000; seed++) if (fishing.cast(SPOT.pier, lure, seed * 7919).fishId === fishId) n++;
      return n;
    };
    expect(count(null, 'fish.silverHerring')).toBeGreaterThan(count(null, 'fish.lanternEel') * 3);
    expect(count('item.lure.emberFly', 'fish.lanternEel')).toBeGreaterThan(count(null, 'fish.lanternEel') * 2);
  });
});

describe('tick', () => {
  it('waits, bites, then escapes if nobody taps', () => {
    const s0 = fishing.cast(SPOT.tarnShore, null, 3);
    let s = s0;
    while (s.phase === 'waiting') s = fishing.tick(s, { holding: false, tapped: false }, 0.1);
    expect(s.phase).toBe('bite');
    const end = play(s, asleep);
    expect(end.phase).toBe('escaped');
    expect(end.timer).toBeGreaterThan(BITE_WINDOW);
  });

  it('"hold while tension < 0.7" lands every common fish (and fast)', () => {
    for (const f of Object.values(db.fish).filter((x) => x.rarity === 'common')) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const end = play(withFish(f.id, seed), naive);
        expect(end.phase, f.id).toBe('landed');
        expect(end.reelTime).toBeLessThan(15);
        const res = fishing.result(end);
        expect(res?.fish.id).toBe(f.id);
        expect(res?.itemId).toBe(f.itemId);
      }
    }
  });

  it('rarer fish take markedly longer with the same strategy', () => {
    const t = (id: string) => play(withFish(id, 9), naive).reelTime;
    const common = t('fish.tarnPerch');
    expect(t('fish.ashfinKoi')).toBeGreaterThan(common * 1.5);
    expect(t('fish.cinderwyrmGar')).toBeGreaterThan(common * 4);
  });

  it('holding the reel the whole time snaps the line', () => {
    for (const id of ['fish.tarnPerch', 'fish.cinderwyrmGar']) {
      const end = play(withFish(id), greedy);
      expect(end.phase).toBe('escaped');
      expect(end.tension).toBe(1);
      expect(fishing.result(end)).toBeNull();
    }
  });

  it('is deterministic for identical inputs', () => {
    expect(play(withFish('fish.reedPike', 77), naive)).toEqual(play(withFish('fish.reedPike', 77), naive));
  });

  it('landing the merchant fish at the pier summons the barge', () => {
    const eel = play({ ...fishing.cast(SPOT.pier, null, 1), fishId: 'fish.lanternEel' }, naive);
    expect(eel.phase).toBe('landed');
    expect(fishing.result(eel)?.summonsMerchant).toBe(true);
    const herring = play({ ...fishing.cast(SPOT.pier, null, 1), fishId: 'fish.silverHerring' }, naive);
    expect(fishing.result(herring)?.summonsMerchant).toBe(false);
  });
});
