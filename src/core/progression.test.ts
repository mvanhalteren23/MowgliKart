import { describe, expect, it } from 'vitest';
import { fixtureDb } from './__fixtures__/db';
import { core } from './__fixtures__/helpers';
import { hash01, next, seed } from './rng';

const kael = fixtureDb.heroes.kael;

describe('rng (mulberry32)', () => {
  it('is deterministic and threads state', () => {
    const a = next(42);
    const b = next(42);
    expect(a).toEqual(b);
    expect(next(a.rng).value).not.toBe(a.value);
  });

  it('produces values in [0,1) with a sane mean', () => {
    let r = seed(7);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const s = next(r);
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThan(1);
      expect(Number.isInteger(s.rng) && s.rng >= 0 && s.rng <= 0xffffffff).toBe(true);
      sum += s.value;
      r = s.rng;
    }
    expect(sum / 2000).toBeGreaterThan(0.45);
    expect(sum / 2000).toBeLessThan(0.55);
  });

  it('normalises seeds and hashes statelessly', () => {
    expect(seed(-1)).toBe(0xffffffff);
    expect(seed(Number.NaN)).toBe(0);
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
  });
});

describe('progression', () => {
  it('scales stats with growth × (level − 1), floored', () => {
    expect(core.progression.statsAt(kael, 1)).toEqual(kael.baseStats);
    const l4 = core.progression.statsAt(kael, 4);
    expect(l4.maxHp).toBe(150);
    expect(l4.mag).toBe(Math.floor(15 + 1.5 * 3)); // 19
    expect(l4.spd).toBe(13); // 12 + 1.5 floored
  });

  it('has an increasing xp curve', () => {
    expect(core.progression.xpToNext(1)).toBe(60);
    for (let l = 1; l < 50; l++) expect(core.progression.xpToNext(l + 1)).toBeGreaterThan(core.progression.xpToNext(l));
  });

  it('grants xp across multiple level-ups with leftovers', () => {
    expect(core.progression.grantXp(1, 0, 59)).toEqual({ level: 1, xp: 59, levelsGained: 0 });
    expect(core.progression.grantXp(1, 0, 60)).toEqual({ level: 2, xp: 0, levelsGained: 1 });
    const r = core.progression.grantXp(1, 10, 60 + 153 + 5);
    expect(r).toEqual({ level: 3, xp: 15, levelsGained: 2 });
  });

  it('lists skills by level', () => {
    expect(core.progression.skillsAt(kael, 1)).toEqual(['skill.drakeCall', 'skill.mend']);
    expect(core.progression.skillsAt(kael, 5)).toEqual(['skill.drakeCall', 'skill.mend', 'skill.flameLash']);
  });
});
