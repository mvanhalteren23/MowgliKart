import { describe, expect, it } from 'vitest';
import type { CombatState, EncounterSetup, PartyMemberSetup } from '@/types/contracts';
import { HOOK_COUNTER_ATTACK, HOOK_IDS } from '@/types/contracts';
import { fixtureDb } from '../__fixtures__/db';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';
import { BUILTIN_HOOKS, createHookRegistry, type CombatHookImpl } from '../hooks';
import { createCombat } from './index';

const VESNA = 'hero:vesna';
const TOBIN = 'hero:tobin';
const BRUTE = 'enemy:0:en.brute';

const withTalon = (o: Partial<PartyMemberSetup> = {}) => member('vesna', { loadout: { signature: 'gear.talon' }, ...o });
const setup = (encounterId: string, party: PartyMemberSetup[]): EncounterSetup => ({ encounterId, party, liberatedRegions: 0 });

function enemyTurn(s: CombatState): CombatState {
  expect(s.phase).toBe('enemyTurn');
  return core.combat.step(s, core.combat.chooseEnemyAction(s));
}

describe('signature gear: counter-attack hook', () => {
  it('registers the hook on the wearer only', () => {
    const s = core.combat.start(setup('enc.brute', [withTalon(), member('tobin')]), 1);
    expect(get(s, VESNA).hooks).toEqual([{ hookId: HOOK_COUNTER_ATTACK, params: { chance: 1, power: 1 }, sourceGear: 'gear.talon' }]);
    expect(get(s, TOBIN).hooks).toEqual([]);
  });

  it('fires with chance 1: hook event, then a normal attack + damage back at the attacker', () => {
    const s0 = core.combat.start(setup('enc.brute', [withTalon()]), 7);
    const s1 = enemyTurn(s0);
    const ev = eventsSince(s0, s1);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(i).toBeGreaterThan(0);
    expect(ev[i - 1]).toMatchObject({ type: 'damage', targetId: VESNA });
    expect(ev[i]).toMatchObject({ type: 'hook', ownerId: VESNA, hookId: HOOK_COUNTER_ATTACK, sourceGear: 'gear.talon' });
    expect(ev[i + 1]).toEqual({ type: 'attack', actorId: VESNA, targetId: BRUTE, element: 'physical' });
    expect(ev[i + 2]).toMatchObject({ type: 'damage', targetId: BRUTE });
    expect(get(s1, BRUTE).hp).toBeLessThan(5000);
    expect(s1.activeId).toBe(VESNA); // counter does not consume the wearer's turn
  });

  it('scales the counter by `power`', () => {
    let s = core.combat.start(setup('enc.brute', [withTalon()]), 7);
    s = patch(s, VESNA, { hooks: [{ hookId: HOOK_COUNTER_ATTACK, params: { chance: 1, power: 2 }, sourceGear: 'gear.talon' }] });
    const after = enemyTurn(s);
    const dmg = ofType(eventsSince(s, after), 'damage').find((d) => d.targetId === BRUTE);
    expect(dmg?.amount).toBeGreaterThanOrEqual(Math.floor(33 * 2 * 0.9));
  });

  it('never fires with chance 0', () => {
    const s0 = core.combat.start(setup('enc.brute', [member('vesna', { loadout: { signature: 'gear.talonNever' } })]), 7);
    const s1 = enemyTurn(s0);
    expect(ofType(eventsSince(s0, s1), 'hook')).toEqual([]);
    expect(get(s1, BRUTE).hp).toBe(5000);
  });

  it('never chains: a counter is not countered, even when the attacker also has the hook', () => {
    let s = core.combat.start(setup('enc.brute', [withTalon()]), 7);
    s = patch(s, BRUTE, { hooks: [{ hookId: HOOK_COUNTER_ATTACK, params: { chance: 1, power: 1 }, sourceGear: 'test' }] });
    const a = enemyTurn(s); // brute hits → vesna counters → brute must NOT counter back
    expect(ofType(eventsSince(s, a), 'hook').map((h) => h.ownerId)).toEqual([VESNA]);
    const b = core.combat.step(a, { type: 'attack', targetId: BRUTE }); // vesna hits → brute counters → vesna must NOT counter
    expect(ofType(eventsSince(a, b), 'hook').map((h) => h.ownerId)).toEqual([BRUTE]);
  });

  it('does not fire on magical hits', () => {
    const s0 = core.combat.start(setup('enc.caster', [withTalon()]), 7);
    const s1 = enemyTurn(s0);
    expect(ofType(eventsSince(s0, s1), 'attack')[0]?.skillId).toBe('skill.hex');
    expect(ofType(eventsSince(s0, s1), 'hook')).toEqual([]);
  });

  it('does not fire on AoE hits', () => {
    const s0 = core.combat.start(setup('enc.sweeper', [withTalon()]), 7);
    const s1 = enemyTurn(s0);
    expect(ofType(eventsSince(s0, s1), 'damage').some((d) => d.targetId === VESNA)).toBe(true);
    expect(ofType(eventsSince(s0, s1), 'hook')).toEqual([]);
  });

  it('only fires for the wearer', () => {
    const s0 = core.combat.start(setup('enc.brute', [withTalon(), member('tobin')]), 7);
    const s1 = enemyTurn(s0);
    expect(ofType(eventsSince(s0, s1), 'damage')[0]?.targetId).toBe(TOBIN);
    expect(ofType(eventsSince(s0, s1), 'hook')).toEqual([]);
  });

  it('does not fire when the wearer is knocked out', () => {
    const s0 = core.combat.start(setup('enc.brute', [withTalon({ hp: 1 })]), 7);
    const s1 = enemyTurn(s0);
    expect(s1.phase).toBe('defeat');
    expect(ofType(eventsSince(s0, s1), 'hook')).toEqual([]);
  });
});

describe('hook registry extensibility', () => {
  it('a new hook is one object; the combat machine dispatches it by trigger', () => {
    const rallying: CombatHookImpl = {
      info: { id: 'hook.test.rally', trigger: 'onTurnStart', name: 'Rally' },
      run: ({ state, ownerId, sourceGear, kernel }) =>
        kernel.emit(state, { type: 'hook', ownerId, hookId: 'hook.test.rally', sourceGear, note: 'rally' }),
    };
    const registry = createHookRegistry([...BUILTIN_HOOKS, rallying]);
    expect(registry.list().map((h) => h.id)).toEqual([...Object.values(HOOK_IDS), 'hook.test.rally']);
    const db = {
      ...fixtureDb,
      gear: {
        ...fixtureDb.gear,
        'gear.banner': { id: 'gear.banner', name: 'Banner', slot: 'signature' as const, description: '', stats: {}, icon: 'b', archetype: 'signature' as const, hookId: 'hook.test.rally', hookParams: {}, hookText: '' },
      },
    };
    const combat = createCombat(db, registry);
    const s = combat.start(setup('enc.dummy', [member('tobin', { loadout: { signature: 'gear.banner' } })]), 1);
    expect(ofType(s.log, 'hook')).toEqual([{ type: 'hook', ownerId: TOBIN, hookId: 'hook.test.rally', sourceGear: 'gear.banner', note: 'rally' }]);
    // Unknown hook ids are not attached by the default registry.
    const plain = core.combat.start(setup('enc.dummy', [member('tobin')]), 1);
    expect(get(plain, TOBIN).hooks).toEqual([]);
    expect(runEnemies(plain).phase).toBe('awaitingInput');
  });
});
