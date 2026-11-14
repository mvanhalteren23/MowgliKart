import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Rootbind — onDamaged, params `chance`, `turns`.
 * When the owner survives any hit (physical or magical, single or AoE) from a
 * living foe, roll rng < `chance` → `stun` the attacker for `turns` of its own
 * turns. Ignores hook-generated hits.
 */
export const rootbindHook: CombatHookImpl = {
  info: { id: HOOK_IDS.rootbind, trigger: 'onDamaged', name: 'Rootbind' },
  run(ctx: HookContext): CombatState {
    const { hit, state } = ctx;
    if (!hit || hit.fromHook || hit.targetId !== ctx.ownerId) return state;
    const owner = liveOwner(ctx, state);
    const attacker = state.combatants[hit.attackerId];
    if (!owner || !attacker || !attacker.alive || attacker.side === owner.side) return state;
    const turns = positiveInt(param(ctx, 'turns', 1));
    if (turns === 0) return state;
    const g = chanceGate(ctx, state);
    if (!g.fire) return g.state;
    const s = announce(ctx, g.state, HOOK_IDS.rootbind, `Roots burst up around ${attacker.name}!`);
    return ctx.kernel.applyStatus(s, attacker.id, { id: 'stun', turns, potency: 0 });
  },
};
