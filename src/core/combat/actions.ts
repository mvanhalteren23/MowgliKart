/**
 * Action validation and resolution for the active combatant.
 *
 * Sync: drake-blooded actors gain +12 after an attack / skill / guard / item,
 * plus the skill's `syncGain` when it lands on at least one target; +8 when hit
 * (see damage.ts). Capped at 100. Transform / revert / flee give no Sync.
 *
 * Items (inventory is tracked by the app): heal +potency HP, ap +potency AP,
 * revive (KO'd ally only) → hp = potency ≤ 1 ? potency × maxHp : potency.
 *
 * Flee: party only, needs `canFlee`. Chance = clamp(0.5 + 0.5 × (pSpd − eSpd) / max(pSpd, eSpd), 0.1, 0.95)
 * with average effective spd of the living on each side; a failed flee uses the turn.
 */
import type { Combatant, CombatAction, CombatantId, CombatState, DragonFormId, SkillDef } from '@/types/contracts';
import { clamp } from '../stats';
import { aliveOnSide, emit, gainSync, patchC, roll, SYNC_ON_ACT, type CombatCtx } from './context';
import { applyStatus, basicAttack, changeAp, heal, performHit, revertForm, runHooks } from './damage';
import { clampVitals, skillsFor, statsFor } from './effective';
import { advance, checkEnd, isOver } from './turns';

export type Validation = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const OK: Validation = { ok: true };
const fail = (reason: string): Validation => ({ ok: false, reason });

function opposite(side: Combatant['side']): Combatant['side'] {
  return side === 'party' ? 'enemy' : 'party';
}

export function formAvailability(ctx: CombatCtx, c: Combatant): readonly { readonly formId: DragonFormId; readonly usable: boolean; readonly reason?: string }[] {
  if (c.heroId === undefined) return [];
  const hero = ctx.db.heroes[c.heroId];
  return hero.dragonForms.map(({ formId, level }) => {
    const form = ctx.db.dragonForms[formId];
    let reason: string | undefined;
    if (!form) reason = 'Unknown form.';
    else if (c.level < level) reason = `Unlocks at Lv ${level}.`;
    else if (!c.alive) reason = 'Knocked out.';
    else if (c.dragon !== null) reason = c.dragon.formId === formId ? 'Already transformed.' : 'Already in another form.';
    else if (c.sync < form.syncRequired) reason = `Needs ${form.syncRequired} Sync (have ${c.sync}).`;
    else if (c.ap < form.apCostToEnter) reason = `Needs ${form.apCostToEnter} AP (have ${c.ap}).`;
    return reason === undefined ? { formId, usable: true } : { formId, usable: false, reason };
  });
}

/** Resolve a skill's targets (alive, relative to the actor's side). */
export function skillTargets(state: CombatState, actor: Combatant, skill: SkillDef, targetId: CombatantId | undefined): readonly CombatantId[] | string {
  const foes = opposite(actor.side);
  switch (skill.target) {
    case 'self':
      return [actor.id];
    case 'allEnemies':
      return aliveOnSide(state, foes).map((c) => c.id);
    case 'allAllies':
      return aliveOnSide(state, actor.side).map((c) => c.id);
    case 'enemy':
    case 'ally': {
      if (targetId === undefined) return 'A target is required.';
      const t = state.combatants[targetId];
      if (!t) return `Unknown target ${targetId}.`;
      if (!t.alive) return `${t.name} is down.`;
      const wanted = skill.target === 'enemy' ? foes : actor.side;
      if (t.side !== wanted) return `${skill.name} must target ${skill.target === 'enemy' ? 'a foe' : 'an ally'}.`;
      return [targetId];
    }
  }
}

export function validate(ctx: CombatCtx, state: CombatState, action: CombatAction): Validation {
  if (state.phase !== 'awaitingInput' && state.phase !== 'enemyTurn') return fail(`Battle is over (${state.phase}).`);
  if (state.activeId === null) return fail('No active combatant.');
  const actor = state.combatants[state.activeId];
  if (!actor || !actor.alive) return fail('Active combatant cannot act.');

  switch (action.type) {
    case 'attack': {
      const t = state.combatants[action.targetId];
      if (!t) return fail(`Unknown target ${action.targetId}.`);
      if (!t.alive) return fail(`${t.name} is down.`);
      if (t.side === actor.side) return fail('Cannot attack an ally.');
      return OK;
    }
    case 'skill': {
      const skill = ctx.db.skills[action.skillId];
      if (!skill) return fail(`Unknown skill ${action.skillId}.`);
      if (!skillsFor(ctx, actor).includes(action.skillId)) return fail(`${actor.name} cannot use ${skill.name} now.`);
      if (actor.ap < skill.apCost) return fail(`Not enough AP for ${skill.name}.`);
      const targets = skillTargets(state, actor, skill, action.targetId);
      if (typeof targets === 'string') return fail(targets);
      if (targets.length === 0) return fail('No valid targets.');
      return OK;
    }
    case 'guard':
      return OK;
    case 'item': {
      if (actor.side !== 'party') return fail('Only the party can use items.');
      const item = ctx.db.items[action.itemId];
      if (!item) return fail(`Unknown item ${action.itemId}.`);
      const t = state.combatants[action.targetId];
      if (!t) return fail(`Unknown target ${action.targetId}.`);
      if (t.side !== actor.side) return fail('Items target allies.');
      if (item.kind === 'revive') return t.alive ? fail(`${t.name} is not down.`) : OK;
      if (item.kind !== 'heal' && item.kind !== 'ap') return fail(`${item.name} cannot be used in battle.`);
      if (!t.alive) return fail(`${t.name} is down.`);
      return OK;
    }
    case 'transform': {
      const entry = formAvailability(ctx, actor).find((f) => f.formId === action.formId);
      if (!entry) return fail(`${actor.name} has no form ${action.formId}.`);
      return entry.usable ? OK : fail(entry.reason ?? 'Form unavailable.');
    }
    case 'revert':
      return actor.dragon === null ? fail(`${actor.name} is not transformed.`) : OK;
    case 'flee':
      if (actor.side !== 'party') return fail('Only the party can flee.');
      if (!state.canFlee) return fail('There is no escape from this battle.');
      return OK;
  }
}

function avgSpd(ctx: CombatCtx, cs: readonly Combatant[]): number {
  if (cs.length === 0) return 0;
  return cs.reduce((n, c) => n + statsFor(ctx, c).spd, 0) / cs.length;
}

export function fleeChance(ctx: CombatCtx, state: CombatState): number {
  const p = avgSpd(ctx, aliveOnSide(state, 'party'));
  const e = avgSpd(ctx, aliveOnSide(state, 'enemy'));
  const m = Math.max(p, e, 1);
  return clamp(0.5 + (0.5 * (p - e)) / m, 0.1, 0.95);
}

function resolveSkill(ctx: CombatCtx, state: CombatState, actor: Combatant, skill: SkillDef, targetId: CombatantId | undefined): CombatState {
  const targets = skillTargets(state, actor, skill, targetId);
  if (typeof targets === 'string') return state;
  let s = skill.apCost > 0 ? changeAp(ctx, state, actor.id, -skill.apCost) : state;
  let landed = false;
  const single = skill.target === 'enemy' || skill.target === 'ally' || skill.target === 'self';
  for (const tid of targets) {
    const t = s.combatants[tid];
    if (!t || !t.alive) continue;
    if (skill.kind === 'physical' || skill.kind === 'magical') {
      s = performHit(ctx, s, actor.id, tid, { kind: skill.kind, power: skill.power, element: skill.element, singleTarget: single, isCounter: false, skillId: skill.id });
      landed = true;
    } else {
      s = emit(s, { type: 'attack', actorId: actor.id, targetId: tid, skillId: skill.id, element: skill.element });
      if (skill.kind === 'heal') {
        const a = s.combatants[actor.id];
        if (a) s = heal(ctx, s, tid, statsFor(ctx, a).mag * skill.power);
      }
      landed = true;
    }
    const inf = skill.inflicts;
    if (inf && s.combatants[tid]?.alive) {
      const r = roll(s);
      s = r.state;
      if (r.value < inf.chance) s = applyStatus(s, tid, { id: inf.status, turns: inf.turns, potency: inf.potency });
    }
    if (isOver(s) || !s.combatants[actor.id]?.alive) break;
  }
  if (landed && skill.syncGain !== undefined) s = gainSync(ctx, s, actor.id, skill.syncGain);
  return s;
}

/** Apply an already-validated action. Does not advance the turn. */
function resolve(ctx: CombatCtx, state: CombatState, actor: Combatant, action: CombatAction): CombatState {
  switch (action.type) {
    case 'attack':
      return gainSync(ctx, basicAttack(ctx, state, actor.id, action.targetId, { power: 1, isCounter: false }), actor.id, SYNC_ON_ACT);
    case 'skill': {
      const skill = ctx.db.skills[action.skillId];
      if (!skill) return state;
      return gainSync(ctx, resolveSkill(ctx, state, actor, skill, action.targetId), actor.id, SYNC_ON_ACT);
    }
    case 'guard': {
      let s = patchC(state, actor.id, (x) => ({ ...x, guarding: true }));
      s = emit(s, { type: 'guard', actorId: actor.id });
      s = runHooks(ctx, s, actor.id, 'onGuard');
      return gainSync(ctx, s, actor.id, SYNC_ON_ACT);
    }
    case 'item': {
      const item = ctx.db.items[action.itemId];
      if (!item) return state;
      let s = state;
      if (item.kind === 'heal') s = heal(ctx, s, action.targetId, item.potency);
      else if (item.kind === 'ap') s = changeAp(ctx, s, action.targetId, item.potency);
      else if (item.kind === 'revive') {
        const t = s.combatants[action.targetId];
        if (t) {
          const max = statsFor(ctx, t).maxHp;
          const hp = clamp(item.potency <= 1 ? Math.floor(max * item.potency) : Math.floor(item.potency), 1, max);
          s = patchC(s, t.id, (x) => ({ ...x, alive: true, hp: 0 }));
          s = heal(ctx, s, t.id, hp);
        }
      }
      return gainSync(ctx, s, actor.id, SYNC_ON_ACT);
    }
    case 'transform': {
      const form = ctx.db.dragonForms[action.formId];
      if (!form) return state;
      let s = changeAp(ctx, state, actor.id, -form.apCostToEnter);
      s = patchC(s, actor.id, (x) => ({ ...x, dragon: { formId: action.formId, turnsInForm: 0 } }));
      s = emit(s, { type: 'transform', actorId: actor.id, formId: action.formId });
      return clampVitals(ctx, s, actor.id);
    }
    case 'revert':
      return revertForm(ctx, state, actor.id, 'manual');
    case 'flee': {
      const r = roll(state);
      const success = r.value < fleeChance(ctx, state);
      const s = emit(r.state, { type: 'flee', success });
      if (!success) return s;
      return emit({ ...s, phase: 'fled', activeId: null }, { type: 'end', outcome: 'fled' });
    }
  }
}

export function step(ctx: CombatCtx, state: CombatState, action: CombatAction): CombatState {
  const v = validate(ctx, state, action);
  if (!v.ok) return emit(state, { type: 'invalid', reason: v.reason });
  const actor = state.activeId === null ? undefined : state.combatants[state.activeId];
  if (!actor) return emit(state, { type: 'invalid', reason: 'No active combatant.' });
  const s = checkEnd(ctx, resolve(ctx, state, actor, action));
  if (isOver(s)) return s;
  return advance(ctx, s);
}
