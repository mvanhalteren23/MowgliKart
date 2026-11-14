import type { CoreServices, GameDatabase } from '@/types/contracts';
import type { HookRegistry } from '../hooks';
import { formAvailability, step } from './actions';
import { chooseEnemyAction } from './ai';
import type { CombatCtx } from './context';
import { effectiveStats, skillsFor } from './effective';
import { startCombat } from './setup';

export { heroCombatantId, enemyCombatantId } from './setup';

export function createCombat(db: GameDatabase, registry: HookRegistry): CoreServices['combat'] {
  const ctx: CombatCtx = { db, registry };
  return {
    start: (setup, seed) => startCombat(ctx, setup, seed),
    step: (state, action) => step(ctx, state, action),
    chooseEnemyAction: (state) => chooseEnemyAction(ctx, state),
    effectiveStats: (state, id) => effectiveStats(ctx, state, id),
    availableSkills: (state, id) => {
      const c = state.combatants[id];
      return c ? skillsFor(ctx, c) : [];
    },
    availableForms: (state, id) => {
      const c = state.combatants[id];
      return c ? formAvailability(ctx, state, c) : [];
    },
  };
}
