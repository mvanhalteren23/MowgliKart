import type { Combatant, CombatantId, CombatEvent, CombatState, CoreServices, PartyMemberSetup } from '@/types/contracts';
import { createCoreServices } from '../index';
import { fixtureDb } from './db';

export const core: CoreServices = createCoreServices(fixtureDb);

export function member(heroId: PartyMemberSetup['heroId'], o: Partial<PartyMemberSetup> = {}): PartyMemberSetup {
  return { heroId, level: 1, hp: 9999, ap: 9999, loadout: {}, fusion: [], ...o };
}

export function patch(state: CombatState, id: CombatantId, p: Partial<Combatant>): CombatState {
  const c = state.combatants[id];
  if (!c) throw new Error(`no combatant ${id}`);
  return { ...state, combatants: { ...state.combatants, [id]: { ...c, ...p } } };
}

export function get(state: CombatState, id: CombatantId): Combatant {
  const c = state.combatants[id];
  if (!c) throw new Error(`no combatant ${id}`);
  return c;
}

/** Let the AI play every pending enemy turn. */
export function runEnemies(state: CombatState, svc: CoreServices = core): CombatState {
  let s = state;
  for (let i = 0; i < 100 && s.phase === 'enemyTurn'; i++) s = svc.combat.step(s, svc.combat.chooseEnemyAction(s));
  return s;
}

export function eventsSince(before: CombatState, after: CombatState): readonly CombatEvent[] {
  return after.log.slice(before.log.length);
}

export function ofType<T extends CombatEvent['type']>(events: readonly CombatEvent[], type: T): Extract<CombatEvent, { type: T }>[] {
  return events.filter((e): e is Extract<CombatEvent, { type: T }> => e.type === type);
}
