/**
 * Battle staging (pure, three-free): where combatants stand around the
 * encounter anchor, and which animation cues the combat log implies.
 */
import type { CombatantId, CombatEvent, Combatant, Vec2 } from '@/types/contracts';

export interface StagePlacement {
  readonly x: number;
  readonly z: number;
  /** World heading radians (party faces +x, enemies face −x). */
  readonly heading: number;
}

export const STAGE_HALF_GAP = 1.8;
const ROW_SPACING = 1.7;

/** Party in a staggered line on the left, enemies mirrored on the right. */
export function stageLayout(combatants: readonly Combatant[], anchor: Vec2): Map<CombatantId, StagePlacement> {
  const out = new Map<CombatantId, StagePlacement>();
  for (const side of ['party', 'enemy'] as const) {
    const list = combatants.filter((c) => c.side === side);
    const n = list.length;
    const dir = side === 'party' ? -1 : 1;
    list.forEach((c, i) => {
      const lane = i - (n - 1) / 2;
      out.set(c.id, {
        // The battle camera is low and side-on, so separation must come from x, not depth.
        x: anchor.x + dir * (STAGE_HALF_GAP + i * 1.9),
        z: anchor.z + lane * ROW_SPACING * 0.6,
        heading: side === 'party' ? 0 : Math.PI,
      });
    });
  }
  return out;
}

export type CueKind = 'lunge' | 'hit' | 'heal' | 'ko' | 'transform' | 'revert' | 'guard' | 'armorBreak' | 'armorRestore' | 'status' | 'turn';

export interface ActorCue {
  readonly kind: CueKind;
  readonly actorId: CombatantId;
  /** Lunge direction target, when relevant. */
  readonly targetId?: CombatantId;
  /** Seconds after the batch starts. */
  readonly delay: number;
  readonly amount?: number;
}

/** Translate a slice of the combat log into staggered animation cues. */
export function cuesFromEvents(events: readonly CombatEvent[]): ActorCue[] {
  const cues: ActorCue[] = [];
  let t = 0;
  for (const e of events) {
    switch (e.type) {
      case 'turnStart':
        cues.push({ kind: 'turn', actorId: e.actorId, delay: t });
        break;
      case 'attack':
        cues.push({ kind: 'lunge', actorId: e.actorId, targetId: e.targetId, delay: t });
        t += 0.2;
        break;
      case 'damage':
        cues.push({ kind: 'hit', actorId: e.targetId, delay: t, amount: e.amount });
        break;
      case 'heal':
        cues.push({ kind: 'heal', actorId: e.targetId, delay: t, amount: e.amount });
        break;
      case 'ko':
        cues.push({ kind: 'ko', actorId: e.targetId, delay: t + 0.15 });
        break;
      case 'transform':
        cues.push({ kind: 'transform', actorId: e.actorId, delay: t });
        break;
      case 'revert':
        cues.push({ kind: 'revert', actorId: e.actorId, delay: t });
        break;
      case 'guard':
        cues.push({ kind: 'guard', actorId: e.actorId, delay: t });
        break;
      case 'armorBreak':
        cues.push({ kind: 'armorBreak', actorId: e.targetId, delay: t });
        break;
      case 'armorRestore':
        cues.push({ kind: 'armorRestore', actorId: e.targetId, delay: t });
        break;
      case 'status':
        if (e.applied) cues.push({ kind: 'status', actorId: e.targetId, delay: t });
        break;
      default:
        break;
    }
  }
  return cues;
}

/** Lunge offset (0..1 of the lunge distance) over a 0.45 s strike. */
export function lungeCurve(t: number): number {
  if (t <= 0 || t >= 0.45) return 0;
  return t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.3;
}
