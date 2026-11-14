import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Marked Quarry — onAttackLanded (per hit), params `chance`, `turns`, `potency`.
 * When one of the owner's own hits lands on a living foe, roll rng < `chance`
 * → apply `defDown` (`turns`, `potency`) to that foe. Ignores hook-generated hits.
 */
export const markedQuarryHook: CombatHookImpl = {
  info: { id: HOOK_IDS.markedQuarry, trigger: 'onAttackLanded', name: 'Marked Quarry' },
  run(ctx: HookContext): CombatState {
    const { hit } = ctx;
    if (!hit || hit.fromHook || hit.attackerId !== ctx.ownerId) return ctx.state;
    const owner = liveOwner(ctx, ctx.state);
    const target = ctx.state.combatants[hit.targetId];
    if (!owner || !target || !target.alive || target.side === owner.side) return ctx.state;
    const turns = positiveInt(param(ctx, 'turns', 2));
    if (turns === 0) return ctx.state;
    const g = chanceGate(ctx, ctx.state);
    if (!g.fire) return g.state;
    const s = announce(ctx, g.state, HOOK_IDS.markedQuarry, `${owner.name} marks ${target.name} as quarry.`);
    return ctx.kernel.applyStatus(s, target.id, { id: 'defDown', turns, potency: param(ctx, 'potency', 0.25) });
  },
};
