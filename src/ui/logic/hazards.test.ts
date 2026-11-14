import { describe, expect, it } from 'vitest';
import type { CombatEvent, HazardInstance } from '@/types/contracts';
import { formatCombatEvent } from './combatText';
import { hazardTicksSince, hazardsForSide, roundsLabel } from './hazards';

const hz = (instanceId: number, side: 'party' | 'enemy', roundsLeft: number): HazardInstance => ({ instanceId, hazardId: `h${instanceId}`, side, roundsLeft, sourceId: null });

describe('hazard helpers', () => {
  it('filters by side, drops expired, longest first', () => {
    const list = hazardsForSide([hz(1, 'enemy', 1), hz(2, 'party', 3), hz(3, 'enemy', 3), hz(4, 'enemy', 0)], 'enemy');
    expect(list.map((h) => h.instanceId)).toEqual([3, 1]);
    expect(hazardsForSide(undefined, 'party')).toEqual([]);
  });
  it('collects tick numbers since an index', () => {
    const log: CombatEvent[] = [
      { type: 'hazardTick', hazardId: 'steam', instanceId: 1, targetId: 'hero:kael', amount: 4, element: 'fire' },
      { type: 'guard', actorId: 'hero:kael' },
      { type: 'hazardTick', hazardId: 'steam', instanceId: 1, targetId: 'enemy:0:x', amount: 7, element: 'fire' },
    ];
    expect(hazardTicksSince(log, 0)).toHaveLength(2);
    expect(hazardTicksSince(log, 1)).toEqual([{ key: 2, targetId: 'enemy:0:x', amount: 7, hazardId: 'steam' }]);
  });
  it('labels rounds', () => {
    expect(roundsLabel(1)).toBe('1 rd');
    expect(roundsLabel(3)).toBe('3 rds');
  });
  it('formats reaction / hazard log lines', () => {
    const n = (id: string) => id;
    const extra = { reaction: () => 'Steam Vent', hazard: () => 'Scalding Mist' };
    expect(formatCombatEvent({ type: 'reaction', reactionId: 'r', targetId: 't', element: 'fire' }, n, n, n, extra)).toBe('Steam Vent!');
    expect(formatCombatEvent({ type: 'hazardSpawn', hazardId: 'h', instanceId: 1, side: 'enemy' }, n, n, n, extra)).toBe('Scalding Mist spreads over the enemy line');
    expect(formatCombatEvent({ type: 'hazardExpire', hazardId: 'h', instanceId: 1, side: 'party' }, n, n, n, extra)).toBe('Scalding Mist fades');
    expect(formatCombatEvent({ type: 'hitStop', targetId: 't', ms: 80 }, n, n)).toBeNull();
    expect(formatCombatEvent({ type: 'qteResult', actorId: 'a', grade: 'good', multiplier: 1.2 }, n, n)).toBeNull();
  });
});
