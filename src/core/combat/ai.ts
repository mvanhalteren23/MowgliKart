/**
 * Enemy AI — deterministic from state, never consumes `state.rng`.
 *   h = hash(rng, round, turnIndex)
 *   if h < skillBias and a skill is usable (known, affordable, has targets):
 *     pick usable[floor(hash(rng, round, 7) × n)]
 *   else basic attack.
 * Hostile targets: the living foe with the lowest HP fraction (id tiebreak).
 * Friendly single targets (heals/buffs): the living ally with the lowest HP fraction.
 */
import type { Combatant, CombatAction, CombatState } from '@/types/contracts';
import { hash01 } from '../rng';
import { aliveOnSide, type CombatCtx } from './context';
import { skillsFor, statsFor } from './effective';

function lowestHpFraction(ctx: CombatCtx, cs: readonly Combatant[]): Combatant | undefined {
  let best: Combatant | undefined;
  let bestF = Number.POSITIVE_INFINITY;
  for (const c of cs) {
    const f = c.hp / Math.max(1, statsFor(ctx, c).maxHp);
    if (f < bestF || (f === bestF && best !== undefined && c.id < best.id)) {
      best = c;
      bestF = f;
    }
  }
  return best;
}

export function chooseEnemyAction(ctx: CombatCtx, state: CombatState): CombatAction {
  const actor = state.activeId === null ? undefined : state.combatants[state.activeId];
  if (!actor || !actor.alive) return { type: 'guard' };
  const foes = aliveOnSide(state, actor.side === 'enemy' ? 'party' : 'enemy');
  const friends = aliveOnSide(state, actor.side);
  const foe = lowestHpFraction(ctx, foes);
  if (!foe) return { type: 'guard' };

  const bias = actor.enemyId !== undefined ? (ctx.db.enemies[actor.enemyId]?.skillBias ?? 0) : 0;
  const h = hash01(state.rng, state.round, state.turnIndex);
  if (h < bias) {
    const usable = skillsFor(ctx, actor).flatMap((id) => {
      const sk = ctx.db.skills[id];
      return sk && sk.apCost <= actor.ap ? [sk] : [];
    });
    if (usable.length > 0) {
      const pick = usable[Math.floor(hash01(state.rng, state.round, 7) * usable.length)] ?? usable[0];
      if (pick) {
        if (pick.target === 'enemy') return { type: 'skill', skillId: pick.id, targetId: foe.id };
        if (pick.target === 'ally') {
          const ally = lowestHpFraction(ctx, friends);
          if (ally) return { type: 'skill', skillId: pick.id, targetId: ally.id };
        } else return { type: 'skill', skillId: pick.id };
      }
    }
  }
  return { type: 'attack', targetId: foe.id };
}
