import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param } from './util';

/**
 * Spell Echo — onAttackLanded (once per cast), params `chance`, `power`.
 * After one of the owner's *magical* skills finishes landing, roll rng < `chance`
 * → cast it again at `power`× its power, free of AP and Sync gain, against the
 * same target (single-target) or every living foe (AoE). The echo is
 * hook-generated, so it never echoes again nor triggers other hooks.
 */
export const spellEchoHook: CombatHookImpl = {
  info: { id: HOOK_IDS.spellEcho, trigger: 'onAttackLanded', name: 'Spell Echo' },
  run(ctx: HookContext): CombatState {
    const { cast, state, kernel } = ctx;
    if (!cast || cast.fromHook || cast.kind !== 'magical' || cast.actorId !== ctx.ownerId || cast.hitTargets.length === 0) return state;
    const owner = liveOwner(ctx, state);
    if (!owner) return state;
    if (!kernel.canCast(state, owner.id, cast.skillId, cast.targetId)) return state;
    const g = chanceGate(ctx, state);
    if (!g.fire) return g.state;
    const s = announce(ctx, g.state, HOOK_IDS.spellEcho, `The spell echoes from ${owner.name}'s focus!`);
    return kernel.castSkill(s, owner.id, cast.skillId, cast.targetId, { powerScale: param(ctx, 'power', 0.5) });
  },
};
