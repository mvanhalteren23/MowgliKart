import { describe, expect, it } from 'vitest';
import type { ProgressionContext, RelicGearDef, Stats } from '@/types/contracts';
import { relicBreakdown, relicSparkline, relicStatKeys, sampleLevels, sparkPoints } from './relicBreakdown';

const zero: Stats = { maxHp: 0, maxAp: 0, atk: 0, def: 0, mag: 0, res: 0, spd: 0, luck: 0 };

const relic: RelicGearDef = {
  id: 'relic.test',
  name: 'Test Horn',
  slot: 'relic',
  archetype: 'relic',
  description: '',
  icon: '🐲',
  stats: { atk: 2, maxHp: 5 },
  scaling: {
    perLevel: { atk: 2, maxHp: 6 },
    levelCurve: 'linear',
    perLiberatedRegion: { atk: 1, res: 1 },
    cap: { atk: 14, res: 5 },
  },
};

/** Reference implementation of the contract formula (linear curve). */
const bonusAt = (ctx: ProgressionContext): Stats => {
  const n = ctx.level - 1;
  const out: Record<keyof Stats, number> = { ...zero };
  for (const k of Object.keys(zero) as (keyof Stats)[]) {
    let v = (relic.stats[k] ?? 0) + (relic.scaling.perLevel[k] ?? 0) * n + (relic.scaling.perLiberatedRegion[k] ?? 0) * ctx.liberatedRegions;
    v = Math.floor(v);
    const cap = relic.scaling.cap?.[k];
    if (cap !== undefined) v = Math.min(v, cap);
    out[k] = v;
  }
  return out;
};

describe('relicBreakdown', () => {
  it('lists every stat the relic touches', () => {
    expect(relicStatKeys(relic)).toEqual(['maxHp', 'atk', 'res']);
  });

  it('decomposes total into base + level term + region term', () => {
    const b = relicBreakdown(relic, { level: 3, liberatedRegions: 2 }, bonusAt);
    const atk = b.rows.find((r) => r.key === 'atk')!;
    expect(atk).toMatchObject({ base: 2, levelTerm: 4, regionTerm: 2, total: 8, cap: 14, capped: false, perLevel: 2, perRegion: 1 });
    const res = b.rows.find((r) => r.key === 'res')!;
    expect(res).toMatchObject({ base: 0, levelTerm: 0, regionTerm: 2, total: 2, cap: 5 });
    for (const r of b.rows) expect(r.base + r.levelTerm + r.regionTerm).toBe(r.total);
    expect(b.formula).toContain('(Lv − 1)');
  });

  it('flags capped stats and keeps terms consistent after the cap', () => {
    const b = relicBreakdown(relic, { level: 10, liberatedRegions: 3 }, bonusAt);
    const atk = b.rows.find((r) => r.key === 'atk')!;
    expect(atk.total).toBe(14);
    expect(atk.capped).toBe(true);
    expect(atk.regionTerm).toBe(0); // level term already hit the cap
    expect(atk.base + atk.levelTerm + atk.regionTerm).toBe(14);
  });
});

describe('sparkline', () => {
  it('samples levels evenly and includes the current level', () => {
    expect(sampleLevels(10, 4)).toEqual([1, 4, 7, 10]);
    expect(sampleLevels(10, 4, 5)).toEqual([1, 4, 5, 7, 10]);
  });

  it('builds one series per level-scaling stat', () => {
    const sp = relicSparkline(relic, 0, [1, 2, 3], bonusAt);
    expect(sp.series.map((s) => s.key)).toEqual(['maxHp', 'atk']);
    expect(sp.series[0]!.values).toEqual([5, 11, 17]);
    expect(sp.max).toBe(17);
  });

  it('maps values into an SVG box with y up', () => {
    expect(sparkPoints([0, 10], 10, 100, 20, 0)).toBe('0.0,20.0 100.0,0.0');
    expect(sparkPoints([], 10, 100, 20)).toBe('');
    expect(sparkPoints([5], 0, 100, 20, 0)).toBe('0.0,0.0');
  });
});
