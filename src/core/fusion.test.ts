import { describe, expect, it } from 'vitest';
import { fixtureDb } from './__fixtures__/db';
import { core } from './__fixtures__/helpers';
import { BaseHeroProfile, ResonanceDecorator, SpiritDecorator, buildChain } from './fusion';

const kael = fixtureDb.heroes.kael;
const base = kael.baseStats; // atk 20, def 10, mag 15, res 10
const skills = ['skill.drakeCall', 'skill.mend'];
const owned = ['ashka', 'mirelle', 'zephra'] as const;

describe('Warden fusion decorators', () => {
  it('an empty stack is the base profile', () => {
    const p = core.fusion.compose(kael, base, skills, []);
    expect(p.stats).toEqual(base);
    expect(p.skills).toEqual(skills);
    expect(p.basicAttackElement).toBe('physical');
    expect(p.armorMax).toBe(0);
    expect(p.layers).toEqual([]);
    expect(p.title).toBe('Kael');
  });

  it('single spirit: multipliers then flat bonuses, affinities multiplied, skills unioned', () => {
    const p = core.fusion.compose(kael, base, skills, ['ashka']);
    expect(p.stats.atk).toBe(40); // 20 × 1.5 + 10
    expect(p.stats.mag).toBe(20);
    expect(p.stats.def).toBe(10);
    expect(p.affinities.fire).toBeCloseTo(0.25); // host 0.5 × 0.5
    expect(p.affinities.water).toBeCloseTo(1.5);
    expect(p.skills).toEqual(['skill.drakeCall', 'skill.mend', 'skill.flameLash']);
    expect(p.basicAttackElement).toBe('fire');
    expect(p.armorMax).toBe(60);
    expect(p.layers).toHaveLength(1);
    expect(p.layers[0]).toContain('Ashka');
    expect(p.auraColors).toEqual(['#ff6a2a']);
    expect(p.spirits).toEqual(['ashka']);
    expect(p.title).toBe('Kael · Ashka-bound');
  });

  it('double stack folds innermost-first and adds a resonance layer', () => {
    const p = core.fusion.compose(kael, base, skills, ['ashka', 'mirelle']);
    // ashka: atk 40, mag 20 → mirelle: atk 40×1.1+4 = 48, def 16, res 12 → Steamheart: mag ×1.2 = 24
    expect(p.stats).toMatchObject({ atk: 48, def: 16, res: 12, mag: 24 });
    expect(p.affinities.fire).toBeCloseTo(0.2);
    expect(p.affinities.water).toBeCloseTo(0.75);
    expect(p.skills).toEqual(['skill.drakeCall', 'skill.mend', 'skill.flameLash', 'skill.tideWard']);
    expect(p.basicAttackElement).toBe('water');
    expect(p.armorMax).toBe(100); // 60 + 40
    expect(p.resonances).toEqual(['Steamheart']);
    expect(p.layers).toHaveLength(3);
    expect(p.layers[2]).toContain('Steamheart');
  });

  it('order matters observably', () => {
    const am = core.fusion.compose(kael, base, skills, ['ashka', 'mirelle']);
    const ma = core.fusion.compose(kael, base, skills, ['mirelle', 'ashka']);
    expect(ma.stats.atk).toBe(49); // (20×1.1+4)×1.5+10
    expect(am.stats.atk).not.toBe(ma.stats.atk);
    expect(ma.basicAttackElement).toBe('fire');
    expect(am.basicAttackElement).toBe('water');
    expect(ma.skills).toEqual(['skill.drakeCall', 'skill.mend', 'skill.tideWard', 'skill.flameLash']);
    // commutative parts stay equal
    expect(ma.armorMax).toBe(am.armorMax);
    expect(ma.resonances).toEqual(am.resonances);
  });

  it('is built from real decorator objects', () => {
    const chain = buildChain(fixtureDb, kael, base, skills, ['ashka', 'mirelle']);
    expect(chain).toBeInstanceOf(ResonanceDecorator);
    const manual = new SpiritDecorator(new SpiritDecorator(new BaseHeroProfile(kael, base, skills), fixtureDb.spirits.ashka), fixtureDb.spirits.mirelle);
    const r = manual.resolve();
    expect(r.stats.atk).toBe(48);
    expect(r.resonances).toEqual([]); // no resonance layer when wrapped manually
  });

  it('does not mutate inputs', () => {
    const s = [...skills];
    const b = { ...base };
    core.fusion.compose(kael, b, s, ['ashka', 'mirelle']);
    expect(s).toEqual(skills);
    expect(b).toEqual(base);
  });
});

describe('canFuse validation', () => {
  it('accepts valid stacks (incl. empty)', () => {
    expect(core.fusion.canFuse(kael, [], [...owned]).ok).toBe(true);
    expect(core.fusion.canFuse(kael, ['ashka'], [...owned]).ok).toBe(true);
    expect(core.fusion.canFuse(kael, ['mirelle', 'ashka'], [...owned]).ok).toBe(true);
  });

  it('rejects over-stacking, duplicates, wrong host, sealed and unowned spirits', () => {
    const over = core.fusion.canFuse(kael, ['ashka', 'mirelle', 'zephra'], [...owned]);
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/At most 2/);
    expect(core.fusion.canFuse(kael, ['ashka', 'ashka'], [...owned]).ok).toBe(false);
    expect(core.fusion.canFuse(fixtureDb.heroes.tobin, ['ashka'], [...owned]).reason).toMatch(/cannot host/);
    expect(core.fusion.canFuse(kael, ['zephra'], [...owned]).reason).toMatch(/sealed/);
    expect(core.fusion.canFuse(kael, ['mirelle'], ['ashka']).reason).toMatch(/not been bound/);
  });
});
