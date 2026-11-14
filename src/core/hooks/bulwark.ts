import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Bulwark — onGuard, params `armor`, `turns`, `potency` (optional `chance`).
 * When the owner guards: refill `armor` points of its fusion armor pool (only
 * if fused and not broken; capped at armorMax), then apply `guardUp`
 * (`turns`, `potency`) to the owner and every living ally.
 */
export const bulwarkHook: CombatHookImpl = {
  info: { id: HOOK_IDS.bulwark, trigger: 'onGuard', name: 'Bulwark' },
  run(ctx: HookContext): CombatState {
    const owner = liveOwner(ctx, ctx.state);
    if (!owner) return ctx.state;
    const turns = positiveInt(param(ctx, 'turns', 2));
    const armor = positiveInt(param(ctx, 'armor', 0));
    const g = chanceGate(ctx, ctx.state);
    if (!g.fire) return g.state;
    let s = announce(ctx, g.state, HOOK_IDS.bulwark, `${owner.name} raises a bulwark over the line.`);
    if (armor > 0) s = ctx.kernel.restoreArmor(s, owner.id, armor);
    if (turns === 0) return s;
    const potency = param(ctx, 'potency', 0.25);
    const allies = Object.values(s.combatants)
      .filter((c) => c.alive && c.side === owner.side)
      .map((c) => c.id)
      .sort();
    for (const id of allies) s = ctx.kernel.applyStatus(s, id, { id: 'guardUp', turns, potency });
    return s;
  },
};
