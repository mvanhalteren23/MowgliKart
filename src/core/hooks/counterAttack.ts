import type { CombatState } from '@/types/contracts';
import { HOOK_COUNTER_ATTACK } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';

/**
 * Counter-attack (e.g. Cinder Ring Talon).
 * Trigger: onDamaged. When the owner survives a single-target *physical* hit
 * from an opposing combatant, roll rng < `chance` → immediately make a basic
 * attack back at `power`× (default 1). Counters never trigger counters.
 */
export const counterAttackHook: CombatHookImpl = {
  info: { id: HOOK_COUNTER_ATTACK, trigger: 'onDamaged', name: 'Counter-attack' },
  run(ctx: HookContext): CombatState {
    const { state, ownerId, hit, kernel } = ctx;
    if (!hit || hit.targetId !== ownerId) return state;
    if (hit.isCounter || hit.kind !== 'physical' || !hit.singleTarget) return state;
    const owner = state.combatants[ownerId];
    const attacker = state.combatants[hit.attackerId];
    if (!owner || !attacker || !owner.alive || !attacker.alive) return state;
    if (owner.side === attacker.side) return state;

    const chance = ctx.params['chance'] ?? 0;
    const power = ctx.params['power'] ?? 1;
    const rolled = kernel.roll(state);
    if (!(rolled.value < chance)) return rolled.state;

    const announced = kernel.emit(rolled.state, {
      type: 'hook',
      ownerId,
      hookId: HOOK_COUNTER_ATTACK,
      sourceGear: ctx.sourceGear,
      note: `${owner.name} counters ${attacker.name}!`,
    });
    return kernel.basicAttack(announced, ownerId, hit.attackerId, { power, isCounter: true });
  },
};
