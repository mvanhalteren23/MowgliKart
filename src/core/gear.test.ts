import { describe, expect, it } from 'vitest';
import type { GearDef } from '@/types/contracts';
import { HOOK_COUNTER_ATTACK } from '@/types/contracts';
import { fixtureDb } from './__fixtures__/db';
import { core } from './__fixtures__/helpers';
import { relicCurve } from './gear';

function g(id: string): GearDef {
  const def = fixtureDb.gear[id];
  if (!def) throw new Error(id);
  return def;
}

describe('relic curves', () => {
  it('are 0 at n=0 and follow the documented formulas', () => {
    for (const c of ['linear', 'sqrt', 'log'] as const) expect(relicCurve(c, 0)).toBe(0);
    expect(relicCurve('linear', 9)).toBe(9);
    expect(relicCurve('sqrt', 9)).toBe(9);
    expect(relicCurve('log', 9)).toBeCloseTo(Math.log(10) * 4);
  });
});

describe('Progression-Scaling Relic', () => {
  it('scales linearly by level and liberated regions, floored and capped', () => {
    const relic = g('gear.relicLinear');
    expect(core.gear.bonus(relic, { level: 1, liberatedRegions: 0 })).toMatchObject({ atk: 2, mag: 0, def: 0 });
    expect(core.gear.bonus(relic, { level: 5, liberatedRegions: 0 })).toMatchObject({ atk: 10, mag: 4 });
    expect(core.gear.bonus(relic, { level: 5, liberatedRegions: 2 })).toMatchObject({ atk: 16, mag: 4 });
    // cap: 2 + 2×29 = 60 → 40; mag is uncapped
    expect(core.gear.bonus(relic, { level: 30, liberatedRegions: 0 })).toMatchObject({ atk: 40, mag: 29 });
    expect(core.gear.bonus(relic, { level: 1, liberatedRegions: 20 })).toMatchObject({ atk: 40 });
  });

  it('scales with sqrt and log curves', () => {
    const sq = g('gear.relicSqrt');
    expect(core.gear.bonus(sq, { level: 2, liberatedRegions: 0 }).atk).toBe(6);
    expect(core.gear.bonus(sq, { level: 5, liberatedRegions: 0 }).atk).toBe(12);
    expect(core.gear.bonus(sq, { level: 10, liberatedRegions: 3 })).toMatchObject({ atk: 18, def: 6 });
    const lg = g('gear.relicLog');
    expect(core.gear.bonus(lg, { level: 2, liberatedRegions: 0 }).atk).toBe(5);
    expect(core.gear.bonus(lg, { level: 10, liberatedRegions: 0 }).atk).toBe(18);
  });

  it('is monotonic in level and regions for every curve', () => {
    for (const id of ['gear.relicLinear', 'gear.relicSqrt', 'gear.relicLog']) {
      const relic = g(id);
      for (let r = 0; r < 4; r++) {
        let prev = core.gear.bonus(relic, { level: 1, liberatedRegions: r });
        for (let l = 2; l <= 60; l++) {
          const cur = core.gear.bonus(relic, { level: l, liberatedRegions: r });
          expect(cur.atk).toBeGreaterThanOrEqual(prev.atk);
          expect(cur.def).toBeGreaterThanOrEqual(prev.def);
          prev = cur;
        }
        const more = core.gear.bonus(relic, { level: 10, liberatedRegions: r + 1 });
        const less = core.gear.bonus(relic, { level: 10, liberatedRegions: r });
        expect(more.atk + more.def).toBeGreaterThanOrEqual(less.atk + less.def);
      }
    }
  });

  it('log grows slower than linear late', () => {
    const at = (id: string, level: number) => core.gear.bonus(g(id), { level, liberatedRegions: 0 }).atk;
    expect(at('gear.relicLog', 50)).toBeLessThan(at('gear.relicSqrt', 50));
  });
});

describe('standard + signature gear, loadouts', () => {
  it('standard and signature gear return flat stats', () => {
    expect(core.gear.bonus(g('gear.ironSword'), { level: 50, liberatedRegions: 9 })).toMatchObject({ atk: 5, def: 0, maxHp: 0 });
    expect(core.gear.bonus(g('gear.talon'), { level: 1, liberatedRegions: 0 }).atk).toBe(3);
  });

  it('applies a whole loadout on top of level stats', () => {
    const kael = fixtureDb.heroes.kael;
    const s = core.gear.statsWithLoadout(kael, { weapon: 'gear.ironSword', armor: 'gear.leather', relic: 'gear.relicLinear' }, { level: 3, liberatedRegions: 1 });
    const base = core.progression.statsAt(kael, 3);
    expect(s.atk).toBe(base.atk + 5 + (2 + 4 + 3));
    expect(s.def).toBe(base.def + 4);
    expect(s.maxHp).toBe(base.maxHp + 10);
  });

  it('ignores gear bound to another hero, unknown ids and slot mismatches', () => {
    const tobin = fixtureDb.heroes.tobin;
    const base = core.progression.statsAt(tobin, 1);
    expect(core.gear.statsWithLoadout(tobin, { relic: 'gear.relicLinear', weapon: 'nope', armor: 'gear.ironSword' }, { level: 1, liberatedRegions: 0 })).toEqual(base);
  });

  it('canEquip respects boundHero', () => {
    expect(core.gear.canEquip('kael', g('gear.relicLinear'))).toBe(true);
    expect(core.gear.canEquip('vesna', g('gear.relicLinear'))).toBe(false);
    expect(core.gear.canEquip('tobin', g('gear.ironSword'))).toBe(true);
  });

  it('exposes the hook registry including the counter-attack hook', () => {
    expect(core.gear.hooks()).toContainEqual({ id: HOOK_COUNTER_ATTACK, trigger: 'onDamaged', name: 'Counter-attack' });
  });
});
