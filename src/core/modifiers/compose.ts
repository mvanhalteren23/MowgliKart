/**
 * Decorator composition over the core combat service.
 *
 *   start(setup, seed) = afterStart_n(…afterStart_1(core.start(setup, seed)))
 *   step(state, action):
 *     r = beforeStep chain (middleware: handler i receives `next` = handlers i+1…n, then core.step;
 *         a handler returns a state to short-circuit, or null to pass the action on)
 *     return afterStep_n(state, …afterStep_1(state, r, action), action)
 *
 * afterStep always runs on the final result, whether it came from the core or a
 * short-circuiting beforeStep, so a handler that resolves an action itself (QTE)
 * still gets reactions and hazards. All other methods pass through unchanged.
 */
import type { CombatAction, CombatModifierHandler, CombatState, CoreServices } from '@/types/contracts';

export function decorateCombat(base: CoreServices['combat'], handlers: readonly CombatModifierHandler[]): CoreServices['combat'] {
  const before = (from: number, state: CombatState, action: CombatAction): CombatState => {
    for (let i = from; i < handlers.length; i++) {
      const h = handlers[i];
      if (h?.beforeStep === undefined) continue;
      const r = h.beforeStep(state, action, (s, a) => before(i + 1, s, a));
      if (r !== null) return r;
    }
    return base.step(state, action);
  };
  return {
    start: (setup, seed) => handlers.reduce((s, h) => (h.afterStart ? h.afterStart(s) : s), base.start(setup, seed)),
    step: (state, action) => {
      const r = before(0, state, action);
      return handlers.reduce((n, h) => (h.afterStep ? h.afterStep(state, n, action) : n), r);
    },
    chooseEnemyAction: (state) => base.chooseEnemyAction(state),
    effectiveStats: (state, id) => base.effectiveStats(state, id),
    availableSkills: (state, id) => base.availableSkills(state, id),
    availableForms: (state, id) => base.availableForms(state, id),
  };
}
