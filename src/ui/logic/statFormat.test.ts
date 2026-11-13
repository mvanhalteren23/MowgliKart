import { describe, expect, it } from 'vitest';
import type { Stats } from '@/types/contracts';
import { deltaTone, formatDelta, formatMultipliers, formatStatBlock, statRows } from './statFormat';

const s = (v: Partial<Stats>): Stats => ({ maxHp: 0, maxAp: 0, atk: 0, def: 0, mag: 0, res: 0, spd: 0, luck: 0, ...v });

describe('formatDelta', () => {
  it('signs and rounds, empty for zero', () => {
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(-2)).toBe('−2');
    expect(formatDelta(0)).toBe('');
    expect(formatDelta(0.4)).toBe('');
    expect(formatDelta(2.6)).toBe('+3');
    expect(deltaTone(-1)).toBe('down');
    expect(deltaTone(0.2)).toBe('flat');
  });
});

describe('statRows', () => {
  it('builds base → gear → fusion columns with deltas', () => {
    const rows = statRows(s({ maxHp: 76, atk: 16 }), s({ maxHp: 87, atk: 22 }), s({ maxHp: 87, atk: 26.4, def: -1 }));
    expect(rows).toHaveLength(8);
    const hp = rows[0]!;
    expect(hp).toMatchObject({ label: 'HP', base: 76, gear: 87, fused: 87, gearDelta: '+11', fusionDelta: '', fusionTone: 'flat' });
    const atk = rows.find((r) => r.key === 'atk')!;
    expect(atk).toMatchObject({ gearDelta: '+6', gearTone: 'up', fused: 26, fusionDelta: '+4' });
    const def = rows.find((r) => r.key === 'def')!;
    expect(def).toMatchObject({ fusionDelta: '−1', fusionTone: 'down' });
  });
});

describe('blocks', () => {
  it('summarises flat and multiplier blocks in stat order', () => {
    expect(formatStatBlock({ atk: 2, maxHp: 5, def: 0 })).toBe('HP +5 · ATK +2');
    expect(formatMultipliers({ atk: 1.2, def: 1, mag: 0.9 })).toBe('ATK ×1.2 · MAG ×0.9');
  });
});
