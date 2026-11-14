/**
 * DynamicActionTurn — elemental reactions, amplification and obscuring.
 *
 * After every step, the newly appended log slice is scanned for *hits*: a
 * `damage` event whose target and element match the most recent `attack` event
 * (burn ticks and modifier damage are never hits). For each hit, in log order,
 * using the hazards as they stand at that moment:
 *
 *   1. Obscure — single-target hits (basic attacks, `enemy`/`ally`/`self` skills)
 *      into a side whose hazards obscure lose `1 − Π(1 − obscures)` of their
 *      damage: the hit's damage event is rewritten in place and the HP refunded
 *      (never above effective max HP).
 *   2. Amplify — hazards on the target's side with `amplifies[element] = m > 1`
 *      add `round(hit × (Π m − 1))` as an extra `damage` event.
 *   3. Reaction — the first `db.reactions` entry by `priority` (ties: data order)
 *      whose `element` matches and whose `when` holds (`targetStatus` on the
 *      target AND/OR `sideHazard` on its side; empty = always). Emits `reaction`,
 *      then `consumes` (status / hazard on the target's side), `spawns` (on the
 *      target's side, refreshing an existing instance), `bonusDamage`
 *      (`round(hit × bonus)` extra damage), `inflicts` (rng roll).
 *
 * Modifier damage never KOs (leaves ≥ 1 HP) and bypasses fusion armor, so
 * victory/defeat detection stays in the core state machine. A hit on a target
 * that is down by the end of the step (e.g. a killing blow) skips obscure and
 * amplify, but its reaction still transforms the terrain: `reaction`, hazard
 * `consumes` and `spawns` apply; status consume, bonus damage and `inflicts` do
 * not (a KO already cleared the target's statuses, so status-gated reactions
 * cannot match). Follow-up events are inserted
 * right after the hit's damage event. Rng is only drawn for `inflicts` rolls.
 */
import type {
  CombatantId,
  CombatEvent,
  CombatModifierHandler,
  CombatState,
  Element,
  ElementalReactionDef,
  GameDatabase,
  SkillId,
} from '@/types/contracts';
import type { CombatCtx } from '../combat/context';
import { statsFor } from '../combat/effective';
import {
  damageNoKo,
  hasHazard,
  hazardsOnSide,
  patchCombatant,
  removeHazard,
  removeStatus,
  rollStatus,
  spawnHazard,
  withSlice,
} from './util';

interface AttackRef {
  readonly actorId: CombatantId;
  readonly targetId: CombatantId;
  readonly element: Element;
  readonly skillId?: SkillId;
}

type DamageEvent = Extract<CombatEvent, { type: 'damage' }>;

export function isSingleTarget(db: GameDatabase, skillId: SkillId | undefined): boolean {
  if (skillId === undefined) return true;
  const t = db.skills[skillId]?.target;
  return t === 'enemy' || t === 'ally' || t === 'self';
}

/** Reactions sorted by priority (stable: data order breaks ties). */
export function sortedReactions(db: GameDatabase): readonly ElementalReactionDef[] {
  return db.reactions.map((r, i) => ({ r, i })).sort((a, b) => a.r.priority - b.r.priority || a.i - b.i).map((x) => x.r);
}

export function findReaction(
  reactions: readonly ElementalReactionDef[],
  s: CombatState,
  targetId: CombatantId,
  element: Element,
): ElementalReactionDef | undefined {
  const t = s.combatants[targetId];
  if (!t) return undefined;
  return reactions.find((r) => {
    if (r.element !== element) return false;
    if (r.when.targetStatus !== undefined && !t.statuses.some((st) => st.id === r.when.targetStatus)) return false;
    if (r.when.sideHazard !== undefined && !hasHazard(s, t.side, r.when.sideHazard)) return false;
    return true;
  });
}

export function createDynamicActionTurn(ctx: CombatCtx): CombatModifierHandler {
  const { db } = ctx;
  const reactions = sortedReactions(db);

  function resolveHit(s0: CombatState, out: CombatEvent[], hit: AttackRef, ev: DamageEvent): CombatState {
    let s = s0;
    const target = s.combatants[hit.targetId];
    if (!target || ev.amount <= 0) {
      out.push(ev);
      return s;
    }
    if (!target.alive) {
      out.push(ev);
      const r = findReaction(reactions, s, target.id, hit.element);
      if (r === undefined) return s;
      out.push({ type: 'reaction', reactionId: r.id, targetId: target.id, element: hit.element });
      if (r.consumes?.hazard !== undefined) s = removeHazard(s, out, r.consumes.hazard, target.side);
      if (r.spawns !== undefined) s = spawnHazard(db, s, out, r.spawns, target.side, hit.actorId);
      return s;
    }
    const here = hazardsOnSide(s, target.side).flatMap((h) => {
      const def = db.hazards[h.hazardId];
      return def ? [def] : [];
    });

    // 1. Obscure (single-target only)
    let dmg = ev;
    if (isSingleTarget(db, hit.skillId)) {
      const keep = here.reduce((k, d) => k * (1 - Math.min(1, Math.max(0, d.obscures ?? 0))), 1);
      const wanted = Math.floor(ev.amount * (1 - keep));
      if (wanted > 0) {
        const max = statsFor(ctx, target).maxHp;
        const hp = Math.min(max, target.hp + wanted);
        const refund = hp - target.hp;
        if (refund > 0) {
          s = patchCombatant(s, target.id, (x) => ({ ...x, hp }));
          dmg = { ...ev, amount: ev.amount - refund };
        }
      }
    }
    out.push(dmg);

    // 2. Amplify
    const amp = here.reduce((m, d) => m * (d.amplifies?.[hit.element] ?? 1), 1);
    if (amp > 1) s = damageNoKo(s, out, target.id, Math.round(dmg.amount * (amp - 1)), hit.element, dmg.affinity);

    // 3. Reaction
    const r = findReaction(reactions, s, target.id, hit.element);
    if (r === undefined) return s;
    out.push({ type: 'reaction', reactionId: r.id, targetId: target.id, element: hit.element });
    if (r.consumes?.status !== undefined) s = removeStatus(s, out, target.id, r.consumes.status);
    if (r.consumes?.hazard !== undefined) s = removeHazard(s, out, r.consumes.hazard, target.side);
    if (r.spawns !== undefined) s = spawnHazard(db, s, out, r.spawns, target.side, hit.actorId);
    if (r.bonusDamage !== undefined && r.bonusDamage > 0) {
      s = damageNoKo(s, out, target.id, Math.round(dmg.amount * r.bonusDamage), hit.element, dmg.affinity);
    }
    if (r.inflicts) s = rollStatus(s, out, target.id, r.inflicts);
    return s;
  }

  return {
    id: 'dynamicActionTurn',
    afterStep(prev, next) {
      const start = prev.log.length;
      if (next.log.length <= start) return next;
      const slice = next.log.slice(start);
      if (!slice.some((e) => e.type === 'damage')) return next;
      let s = next;
      const out: CombatEvent[] = [];
      let last: AttackRef | null = null;
      let touched = false;
      for (const e of slice) {
        if (e.type === 'attack') {
          last = { actorId: e.actorId, targetId: e.targetId, element: e.element, ...(e.skillId !== undefined ? { skillId: e.skillId } : {}) };
          out.push(e);
        } else if (e.type === 'turnStart') {
          last = null;
          out.push(e);
        } else if (e.type === 'damage' && last !== null && last.targetId === e.targetId && last.element === e.element) {
          const hit = last;
          last = null;
          s = resolveHit(s, out, hit, e);
          touched = true;
        } else out.push(e);
      }
      return touched ? withSlice(s, prev.log, out) : next;
    },
  };
}
