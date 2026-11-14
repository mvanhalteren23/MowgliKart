/**
 * Built-in combat modifiers, composed over the core combat service in this order:
 *   qte (beforeStep) → core step → dynamicActionTurn (reactions) → hazards (lifecycle).
 * Reactions run before hazard ticks so a hazard spawned by a hit already ticks at
 * the next turn start on that side within the same step.
 */
import type { CombatModifierHandler } from '@/types/contracts';
import type { CombatCtx } from '../combat/context';
import { createDynamicActionTurn } from './dynamicActionTurn';
import { createHazards } from './hazards';
import { createQte } from './qte';

export { decorateCombat } from './compose';
export { createDynamicActionTurn, findReaction, sortedReactions, isSingleTarget } from './dynamicActionTurn';
export { createHazards } from './hazards';
export { createQte, gradeQte, qteMultiplier, drawQteSequence } from './qte';

export function builtinModifiers(ctx: CombatCtx): readonly CombatModifierHandler[] {
  return [createQte(ctx), createDynamicActionTurn(ctx), createHazards(ctx)];
}
