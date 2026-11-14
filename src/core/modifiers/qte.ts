/**
 * Quick-time events for heavy skills.
 *
 * Opening: when the active PARTY combatant (phase `awaitingInput`) issues a
 * valid `skill` action whose `SkillDef.qte` is set and no window is open, the
 * core is not called. The state gets `qte: QteWindow` with `prompts` (clamped
 * 1..5) inputs drawn from `pool` by successive mulberry32 steps of `state.rng`
 * (index = floor(value × pool.length)), and a `qteStart` event. Enemy turns
 * never open windows. Invalid skill actions fall through to the core (→ `invalid`).
 *
 * While a window is open the only valid action is `{ type: 'qte', results }`;
 * anything else appends `invalid`. A `qte` action with no open window is invalid.
 *
 * Grading (`gradeQte`): one result per prompt, every input matches and every
 * `0 ≤ ms ≤ windowMs` → good; additionally every `ms ≤ windowMs × perfectWithin`
 * → perfect; anything else (wrong input, timeout `null`, late, wrong count) → miss.
 * Multiplier: miss 1, good `goodMultiplier`, perfect `perfectMultiplier`.
 *
 * Resolution: the window is cleared and the original skill runs through the
 * rest of the pipeline / core `step`. For every target the skill damaged (sum of
 * the actor's hits with that skill before the next `turnStart`, as computed by
 * the core) an extra `damage` event of `round((multiplier − 1) × damage)` is
 * applied (`crit: true`), followed on good/perfect by `hitStop` (spec
 * `hitStopMs`) per damaged target. `qteResult` is inserted before the skill's
 * events; the extra damage / hit-stops are inserted right after the skill's
 * resolution (before the next actor's `turnStart`). Unlike terrain damage this
 * extra CAN knock out: KO, end detection and (if the newly active combatant
 * fell) turn advance reuse the core's own `knockOut` / `checkEnd` / `advance`.
 */
import type {
  CombatAction,
  CombatantId,
  CombatEvent,
  CombatModifierHandler,
  CombatState,
  Element,
  QteGrade,
  QteInput,
  QteInputResult,
  QteSpec,
  QteWindow,
} from '@/types/contracts';
import { validate } from '../combat/actions';
import { isOver, type CombatCtx } from '../combat/context';
import { knockOut } from '../combat/damage';
import { advance, checkEnd } from '../combat/turns';
import { next as rngNext } from '../rng';
import type { AffinityLabel } from './util';

export const QTE_MIN_PROMPTS = 1;
export const QTE_MAX_PROMPTS = 5;

export function gradeQte(
  window: Pick<QteWindow, 'sequence' | 'windowMs' | 'perfectWithin'>,
  results: readonly QteInputResult[],
): QteGrade {
  if (results.length !== window.sequence.length || results.length === 0) return 'miss';
  let perfect = true;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const want = window.sequence[i];
    if (!r || r.input === null || r.input !== want) return 'miss';
    if (!Number.isFinite(r.ms) || r.ms < 0 || r.ms > window.windowMs) return 'miss';
    if (r.ms > window.windowMs * window.perfectWithin) perfect = false;
  }
  return perfect ? 'perfect' : 'good';
}

export function qteMultiplier(spec: QteSpec | undefined, grade: QteGrade): number {
  if (!spec || grade === 'miss') return 1;
  return grade === 'perfect' ? spec.perfectMultiplier : spec.goodMultiplier;
}

/** Deterministic prompt sequence drawn from `spec.pool`. */
export function drawQteSequence(spec: QteSpec, rng: number): { readonly sequence: readonly QteInput[]; readonly rng: number } {
  const pool: readonly QteInput[] = spec.pool.length > 0 ? spec.pool : ['tap'];
  const n = Math.min(QTE_MAX_PROMPTS, Math.max(QTE_MIN_PROMPTS, Math.floor(spec.prompts)));
  const sequence: QteInput[] = [];
  let r = rng;
  for (let i = 0; i < n; i++) {
    const step = rngNext(r);
    r = step.rng;
    sequence.push(pool[Math.floor(step.value * pool.length)] ?? 'tap');
  }
  return { sequence, rng: r };
}

function invalid(state: CombatState, reason: string): CombatState {
  return { ...state, log: [...state.log, { type: 'invalid', reason }] };
}

interface Damaged {
  readonly targetId: CombatantId;
  readonly amount: number;
  readonly element: Element;
  readonly affinity: AffinityLabel;
}

export function createQte(ctx: CombatCtx): CombatModifierHandler {
  const { db } = ctx;

  function open(state: CombatState, action: Extract<CombatAction, { type: 'skill' }>, spec: QteSpec, actorId: CombatantId): CombatState {
    const { sequence, rng } = drawQteSequence(spec, state.rng);
    const window: QteWindow = {
      actorId,
      skillId: action.skillId,
      ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
      sequence,
      windowMs: spec.windowMs,
      perfectWithin: spec.perfectWithin,
    };
    const ev: CombatEvent = { type: 'qteStart', actorId, skillId: action.skillId, sequence, windowMs: spec.windowMs };
    return { ...state, rng, qte: window, log: [...state.log, ev] };
  }

  function resolve(
    state: CombatState,
    win: QteWindow,
    results: readonly QteInputResult[],
    next: (s: CombatState, a: CombatAction) => CombatState,
  ): CombatState {
    const spec = db.skills[win.skillId]?.qte;
    const grade = gradeQte(win, results);
    const multiplier = qteMultiplier(spec, grade);
    const skillAction: CombatAction = { type: 'skill', skillId: win.skillId, ...(win.targetId !== undefined ? { targetId: win.targetId } : {}) };
    const start = state.log.length;
    const r = next({ ...state, qte: null }, skillAction);
    const slice = r.log.slice(start);
    if (slice.length === 1 && slice[0]?.type === 'invalid') return { ...r, qte: null };

    // Damage dealt by the skill itself, per target (first-hit order), up to the next turn start.
    let boundary = r.log.length;
    const damaged = new Map<CombatantId, Damaged>();
    let last: { readonly targetId: CombatantId; readonly element: Element } | null = null;
    for (let i = start; i < r.log.length; i++) {
      const e = r.log[i];
      if (!e) continue;
      if (e.type === 'turnStart') {
        boundary = i;
        break;
      }
      if (e.type === 'attack') {
        last = e.actorId === win.actorId && e.skillId === win.skillId ? { targetId: e.targetId, element: e.element } : null;
      } else if (e.type === 'damage' && last !== null && last.targetId === e.targetId && last.element === e.element) {
        const prev = damaged.get(e.targetId);
        damaged.set(e.targetId, { targetId: e.targetId, amount: (prev?.amount ?? 0) + e.amount, element: e.element, affinity: prev?.affinity ?? e.affinity });
        last = null;
      }
    }

    const result: CombatEvent = { type: 'qteResult', actorId: win.actorId, grade, multiplier };
    let s: CombatState = { ...r, qte: null, log: [...r.log.slice(0, start), result, ...r.log.slice(start, boundary)] };
    const over = isOver(r);
    let killed = false;
    for (const d of damaged.values()) {
      const extra = Math.round((multiplier - 1) * d.amount);
      const t = s.combatants[d.targetId];
      if (!over && extra > 0 && t && t.alive) {
        const amount = Math.min(extra, t.hp);
        const hp = t.hp - amount;
        s = { ...s, combatants: { ...s.combatants, [t.id]: { ...t, hp } } };
        s = { ...s, log: [...s.log, { type: 'damage', targetId: t.id, amount, element: d.element, crit: true, affinity: d.affinity, absorbedByArmor: 0 }] };
        if (hp === 0) {
          s = knockOut(ctx, s, t.id);
          killed = true;
        }
      }
      if (grade !== 'miss' && spec) s = { ...s, log: [...s.log, { type: 'hitStop', targetId: d.targetId, ms: spec.hitStopMs }] };
    }
    s = { ...s, log: [...s.log, ...r.log.slice(boundary)] };
    if (killed) {
      s = checkEnd(ctx, s);
      const active = s.activeId === null ? undefined : s.combatants[s.activeId];
      if (!isOver(s) && (!active || !active.alive)) s = advance(ctx, s);
    }
    return s;
  }

  return {
    id: 'qte',
    afterStart: (state) => ({ ...state, qte: state.qte ?? null }),
    beforeStep(state, action, next) {
      const win = state.qte ?? null;
      if (win !== null) {
        if (action.type !== 'qte') return invalid(state, 'Answer the quick-time prompt first.');
        return resolve(state, win, action.results, next);
      }
      if (action.type === 'qte') return invalid(state, 'No quick-time window is open.');
      if (action.type !== 'skill' || state.phase !== 'awaitingInput' || state.activeId === null) return null;
      const spec = db.skills[action.skillId]?.qte;
      const actor = state.combatants[state.activeId];
      if (spec === undefined || !actor || actor.side !== 'party') return null;
      if (!validate(ctx, state, action).ok) return null;
      return open(state, action, spec, actor.id);
    },
  };
}
