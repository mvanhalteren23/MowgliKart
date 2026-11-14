import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, param } from './util';

/**
 * Counter-attack — onDamaged, params `chance`, `power`.
 * When the owner survives a single-target *physical* hit from an opposing
 * combatant, roll rng < `chance` → immediately make a basic attack back at
 * `power`× (default 1). The counter is hook-generated, so it never triggers
 * counters (or any other hook) in turn.
 */
export const counterAttackHook: CombatHookImpl = {
  info: { id: HOOK_IDS.counterAttack, trigger: 'onDamaged', name: 'Counter-attack' },
  run(ctx: HookContext): CombatState {
    const { state, ownerId, hit, kernel } = ctx;
    if (!hit || hit.targetId !== ownerId) return state;
    if (hit.fromHook || hit.kind !== 'physical' || !hit.singleTarget) return state;
    const owner = state.combatants[ownerId];
    const attacker = state.combatants[hit.attackerId];
    if (!owner || !attacker || !owner.alive || !attacker.alive) return state;
    if (owner.side === attacker.side) return state;

    const rolled = kernel.roll(state);
    if (!(rolled.value < param(ctx, 'chance', 0))) return rolled.state;
    const s = announce(ctx, rolled.state, HOOK_IDS.counterAttack, `${owner.name} counters ${attacker.name}!`);
    return kernel.basicAttack(s, ownerId, hit.attackerId, { power: param(ctx, 'power', 1), fromHook: true });
  },
};
