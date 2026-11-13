import { describe, expect, it } from 'vitest';
import { armorPips, formatCombatEvent, targetModeFor } from './combatText';

const nameOf = (id: string): string => (id === 'hero:kael' ? 'Kael' : 'Bandit');
const skillName = (id: string): string => (id === 'skill.cinderSlash' ? 'Cinder Slash' : id);

describe('targetModeFor', () => {
  it('maps SkillDef.target to a picking mode', () => {
    expect(targetModeFor('enemy')).toBe('enemy');
    expect(targetModeFor('ally')).toBe('ally');
    expect(targetModeFor('self')).toBe('none');
    expect(targetModeFor('allEnemies')).toBe('none');
    expect(targetModeFor('allAllies')).toBe('none');
  });
});

describe('formatCombatEvent', () => {
  it('formats attacks, skills and damage', () => {
    expect(formatCombatEvent({ type: 'attack', actorId: 'hero:kael', targetId: 'enemy:0:x', element: 'physical' }, nameOf, skillName)).toBe('Kael attacks Bandit');
    expect(formatCombatEvent({ type: 'attack', actorId: 'hero:kael', targetId: 'enemy:0:x', skillId: 'skill.cinderSlash', element: 'fire' }, nameOf, skillName)).toBe('Kael uses Cinder Slash');
    expect(
      formatCombatEvent({ type: 'damage', targetId: 'enemy:0:x', amount: 12, element: 'fire', crit: true, affinity: 'weak', absorbedByArmor: 0 }, nameOf, skillName),
    ).toBe('Critical! Bandit takes 12 — weak!');
    expect(
      formatCombatEvent({ type: 'damage', targetId: 'hero:kael', amount: 3, element: 'physical', crit: false, affinity: 'neutral', absorbedByArmor: 4 }, nameOf, skillName),
    ).toBe('Kael takes 3 (4 to armor)');
  });

  it('skips bookkeeping events', () => {
    expect(formatCombatEvent({ type: 'turnStart', actorId: 'hero:kael', round: 1 }, nameOf, skillName)).toBeNull();
    expect(formatCombatEvent({ type: 'apChange', targetId: 'hero:kael', amount: -3 }, nameOf, skillName)).toBeNull();
    expect(formatCombatEvent({ type: 'status', targetId: 'hero:kael', status: 'burn', applied: false }, nameOf, skillName)).toBeNull();
  });

  it('formats transformations, breaks and outcomes', () => {
    expect(formatCombatEvent({ type: 'transform', actorId: 'hero:kael', formId: 'f' }, nameOf, skillName, () => 'Ember Whelp')).toBe('Kael becomes Ember Whelp!');
    expect(formatCombatEvent({ type: 'revert', actorId: 'hero:kael', reason: 'apDepleted' }, nameOf, skillName)).toBe('Kael reverts (AP spent)');
    expect(formatCombatEvent({ type: 'armorBreak', targetId: 'hero:kael' }, nameOf, skillName)).toBe("Kael's fusion BREAKS!");
    expect(formatCombatEvent({ type: 'flee', success: false }, nameOf, skillName)).toBe('Could not escape!');
    expect(formatCombatEvent({ type: 'end', outcome: 'victory' }, nameOf, skillName)).toBe('Victory!');
  });
});

describe('armorPips', () => {
  it('splits the pool into at most N pips', () => {
    expect(armorPips(0, 0)).toEqual([0, 0]);
    expect(armorPips(30, 30)).toEqual([6, 6]);
    expect(armorPips(15, 30)).toEqual([3, 6]);
    expect(armorPips(1, 30)).toEqual([1, 6]);
    expect(armorPips(0, 30)).toEqual([0, 6]);
    expect(armorPips(3, 4)).toEqual([3, 4]);
  });
});
