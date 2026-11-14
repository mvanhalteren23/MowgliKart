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
/** Clear space (m) between neighbouring sprites' frames. */
export const STAGE_GAP = 0.55;
const ROW_SPACING = 1.7;
const DEFAULT_WIDTH = 1.35;

/**
 * Party in a line on the left, enemies mirrored on the right. `widthOf` gives a
 * combatant's current sprite world width (dragon forms are much wider), so
 * neighbours are spaced edge-to-edge and never overlap.
 */
export function stageLayout(combatants: readonly Combatant[], anchor: Vec2, widthOf: (c: Combatant) => number = () => DEFAULT_WIDTH): Map<CombatantId, StagePlacement> {
  const out = new Map<CombatantId, StagePlacement>();
  for (const side of ['party', 'enemy'] as const) {
    const list = combatants.filter((c) => c.side === side);
    const n = list.length;
    const dir = side === 'party' ? -1 : 1;
    let edge = STAGE_HALF_GAP - DEFAULT_WIDTH / 2; // inner edge of the first sprite
    list.forEach((c, i) => {
      const w = Math.max(0.5, widthOf(c));
      const centre = edge + w / 2;
      edge = centre + w / 2 + STAGE_GAP;
      const lane = i - (n - 1) / 2;
      out.set(c.id, {
        // The battle camera is low and side-on, so separation must come from x, not depth.
        x: anchor.x + dir * centre,
        z: anchor.z + lane * ROW_SPACING * 0.6,
        heading: side === 'party' ? 0 : Math.PI,
      });
    });
  }
  return out;
}

/** Horizontal extent (min/max x incl. half widths) of a layout. */
export function stageExtent(layout: ReadonlyMap<CombatantId, StagePlacement>, widths: ReadonlyMap<CombatantId, number>): { minX: number; maxX: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [id, p] of layout) {
    const hw = (widths.get(id) ?? DEFAULT_WIDTH) / 2;
    minX = Math.min(minX, p.x - hw);
    maxX = Math.max(maxX, p.x + hw);
  }
  return Number.isFinite(minX) ? { minX, maxX } : { minX: 0, maxX: 0 };
}

/** Camera distance so a stage `width` metres wide fits a horizontal FOV, never closer than `min`. */
export function fitDistance(width: number, hfovRad: number, min: number, margin = 1.15): number {
  return Math.max(min, ((width * margin) / 2) / Math.tan(Math.max(0.1, hfovRad) / 2));
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
