import type { Combatant, CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Mending Echo — onTurnStart, param `fraction` (optional `chance`).
 * Heals the living ally (owner included) with the lowest HP fraction, id
 * tiebreak, by `fraction` × the owner's effective maxHp. Does nothing (and
 * draws no rng) when every ally is at full HP.
 */
export const mendingEchoHook: CombatHookImpl = {
  info: { id: HOOK_IDS.mendingEcho, trigger: 'onTurnStart', name: 'Mending Echo' },
  run(ctx: HookContext): CombatState {
    const { state, kernel } = ctx;
    const owner = liveOwner(ctx, state);
    if (!owner) return state;
    const amount = positiveInt(param(ctx, 'fraction', 0) * kernel.stats(state, owner.id).maxHp);
    if (amount === 0) return state;
    let best: Combatant | undefined;
    let bestF = 1;
    const allies = Object.values(state.combatants)
      .filter((c) => c.alive && c.side === owner.side)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const c of allies) {
      const f = c.hp / Math.max(1, kernel.stats(state, c.id).maxHp);
      if (f < bestF) {
        best = c;
        bestF = f;
      }
    }
    if (!best) return state;
    const g = chanceGate(ctx, state);
    if (!g.fire) return g.state;
    const s = announce(ctx, g.state, HOOK_IDS.mendingEcho, `A mending echo from ${owner.name} soothes ${best.name}.`);
    return kernel.heal(s, best.id, amount);
  },
};
