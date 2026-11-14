/**
 * EMBERWAKE core — pure, deterministic simulation.
 * Only depends on `@/types/contracts`; content arrives via the injected `GameDatabase`.
 *
 * `combat` is the core state machine (`./combat`, frozen since Phase 3) decorated
 * with the built-in `CombatModifierHandler`s (QTE, elemental reactions, hazards).
 */
import type { CoreServices, GameDatabase } from '@/types/contracts';
import { createCombat } from './combat';
import type { CombatCtx } from './combat/context';
import { createFusion } from './fusion';
import { createGear } from './gear';
import { createHookRegistry } from './hooks';
import { builtinModifiers, decorateCombat } from './modifiers';
import { createProgression } from './progression';
import { createQuests } from './quests';
import { createStamina } from './stamina';

export function createCoreServices(db: GameDatabase): CoreServices {
  const registry = createHookRegistry();
  const ctx: CombatCtx = { db, registry };
  return {
    progression: createProgression(),
    gear: createGear(db, registry),
    fusion: createFusion(db),
    combat: decorateCombat(createCombat(db, registry), builtinModifiers(ctx)),
    stamina: createStamina(),
    quests: createQuests(db),
  };
}

export { next as rngNext, seed as rngSeed, hash01 } from './rng';
export { relicCurve } from './gear';
export { BaseHeroProfile, ProfileDecorator, ResonanceDecorator, SpiritDecorator, buildChain, type ProfileComponent } from './fusion';
export { BUILTIN_HOOKS, createHookRegistry, type CombatHookImpl, type HookContext, type HookKernel, type HitInfo } from './hooks';
export { heroCombatantId, enemyCombatantId, createCombat } from './combat';
export { foldEvent } from './quests';
export {
  builtinModifiers,
  createDynamicActionTurn,
  createHazards,
  createQte,
  decorateCombat,
  drawQteSequence,
  gradeQte,
  qteMultiplier,
} from './modifiers';
export { createStamina, staminaCanDrain, staminaInitial, staminaTick } from './stamina';
