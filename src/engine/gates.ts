/**
 * Traversal gates (pure, three-free): presence/clearing rules, proximity,
 * side selection and the scripted traversal path for each gate kind.
 */
import { TRAVERSAL_FOR_GATE, type FieldActionId, type FlagValue, type HeroDef, type HeroId, type TraversalGateDef, type TraversalGateKind, type Vec2, type WorldFlags } from '@/types/contracts';
import type { Collider } from './movement';

export const gateAction = (kind: TraversalGateKind): FieldActionId => TRAVERSAL_FOR_GATE[kind];

/** Canonical flag the quest engine folds a traversal into (see `WorldEvent`). */
export const gateFlagKey = (gate: TraversalGateDef): string => `evt:field:${gateAction(gate.kind)}:${gate.id}`;

const truthyCount = (v: FlagValue | undefined): number => (typeof v === 'number' ? v : v === true ? 1 : 0);

/** A permanent gate is gone for good once it has been crossed at least once. */
export function gateCleared(gate: TraversalGateDef, flags: WorldFlags): boolean {
  return gate.clearsPermanently && truthyCount(flags[gateFlagKey(gate)]) >= 1;
}

/** Blocking box of a gate in the movement module's collider format. */
export function gateCollider(gate: TraversalGateDef): Collider {
  return { kind: 'box', x: gate.position.x, z: gate.position.z, hx: gate.width / 2, hz: gate.depth / 2, rot: gate.rotation ?? 0 };
}

/** Distance (m) from a point to the gate's footprint (0 inside). */
export function gateDistance(gate: TraversalGateDef, p: Vec2): number {
  const dx = p.x - gate.position.x;
  const dz = p.z - gate.position.z;
  const rot = gate.rotation ?? 0;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  return Math.hypot(Math.max(Math.abs(lx) - gate.width / 2, 0), Math.max(Math.abs(lz) - gate.depth / 2, 0));
}

/** Index of the side nearer to `p` (ties → 0). */
export function nearerSide(gate: TraversalGateDef, p: Vec2): 0 | 1 {
  const [a, b] = gate.sides;
  return Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(p.x - a.x, p.z - a.z) ? 1 : 0;
}

/** Start (nearer side) and end (other side) of a crossing from `p`. */
export function traversalEnds(gate: TraversalGateDef, p: Vec2): { from: Vec2; to: Vec2 } {
  const i = nearerSide(gate, p);
  const from = gate.sides[i];
  const to = gate.sides[i === 0 ? 1 : 0];
  return { from, to };
}

/** First party member (leader first) who can perform the gate's action. */
export function whoCanClear(gate: TraversalGateDef, leader: HeroId, party: readonly HeroId[], heroes: Readonly<Record<HeroId, HeroDef>>): HeroId | null {
  const action = gateAction(gate.kind);
  const order = [leader, ...party.filter((h) => h !== leader)];
  for (const h of order) if (party.includes(h) && heroes[h]?.fieldActions.includes(action)) return h;
  return null;
}

/** Engine-side validation slack (m) on top of the action range when a request arrives. */
export const GATE_REQUEST_SLACK = 2;

/* ── Traversal choreography ──────────────────────────────────────────────── */

export interface TraversalSample {
  readonly x: number;
  readonly z: number;
  /** Height above the ground at (x, z). */
  readonly lift: number;
  /** 0..1 progress of the gate's own clearing animation (shatter / part / smash). */
  readonly gateFx: number;
  /** True while the body is airborne / in a special pose. */
  readonly airborne: boolean;
}

/** Seconds each traversal takes. */
export const TRAVERSAL_DURATION: Readonly<Record<TraversalGateKind, number>> = {
  boulder: 1.1,
  chasm: 2.2,
  cliff: 1.8,
  river: 1.9,
  grove: 2.0,
  ward: 1.8,
};

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Number of hops a leap chain takes over a crossing of `dist` metres. */
export const leapHops = (dist: number): number => Math.max(2, Math.round(dist / 3.2));

/**
 * Body position at normalized time `t` (0..1) of crossing `from → to`.
 *  roll    — quick tuck-and-roll dash, the boulder bursts at ~35 %.
 *  glide   — hop up, long arcing float on the wind, soft landing.
 *  grapple — throw (pause), pulled up the face (lift rises), step onto the ledge.
 *  leap    — a chain of hops across the stepping stones.
 *  commune — kneel while the grove parts, then walk through.
 *  unseal  — channel while the ward shatters, then walk through.
 */
export function traversalSample(kind: TraversalGateKind, from: Vec2, to: Vec2, t: number): TraversalSample {
  const u = clamp01(t);
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const at = (k: number, lift: number, gateFx: number, airborne: boolean): TraversalSample => ({ x: lerp(from.x, to.x, k), z: lerp(from.z, to.z, k), lift, gateFx: clamp01(gateFx), airborne });
  switch (kind) {
    case 'boulder': {
      const k = smooth(u);
      return at(k, Math.abs(Math.sin(u * Math.PI * 3)) * 0.25 * (1 - u), (u - 0.25) / 0.25, u < 0.8);
    }
    case 'chasm': {
      const k = u < 0.12 ? 0 : smooth((u - 0.12) / 0.88);
      const lift = u < 0.12 ? (u / 0.12) * 1.4 : (1 - k) * 1.4 + Math.sin(k * Math.PI) * Math.min(5, 1 + dist * 0.25);
      return at(k, lift, u, u > 0.02 && u < 0.98);
    }
    case 'cliff': {
      // 0..0.2 throw, 0.2..0.75 pulled up (horizontal creeps to the face), 0.75..1 over the lip.
      const pull = clamp01((u - 0.2) / 0.55);
      const k = u < 0.75 ? pull * 0.5 : lerp(0.5, 1, smooth((u - 0.75) / 0.25));
      const lift = u < 0.75 ? smooth(pull) * 4 : 4 * (1 - smooth((u - 0.75) / 0.25));
      return at(k, lift, u / 0.2, u >= 0.2);
    }
    case 'river': {
      const hops = leapHops(dist);
      const k = u;
      const phase = (k * hops) % 1;
      return at(k, Math.sin(phase * Math.PI) * 1.1, u, phase > 0.05 && phase < 0.95 && u < 1);
    }
    case 'grove': {
      const k = u < 0.45 ? 0 : smooth((u - 0.45) / 0.55);
      return at(k, 0, u / 0.45, false);
    }
    case 'ward': {
      const k = u < 0.4 ? 0 : smooth((u - 0.4) / 0.6);
      return at(k, 0, u / 0.4, false);
    }
  }
}

/* ── Hunting aim ─────────────────────────────────────────────────────────── */

/** Weakest draw still counts as a quarter-range shot. */
export const MIN_DRAW = 0.25;

export interface ShotRay {
  readonly origin: Vec2;
  /** World angle, atan2(dz, dx). */
  readonly angle: number;
  readonly range: number;
  readonly end: Vec2;
}

/** Aim gesture → shot ray: range scales with draw power, floored at `MIN_DRAW`. */
export function shotRay(origin: Vec2, angle: number, power: number, baseRange: number): ShotRay {
  const p = Number.isFinite(power) ? Math.min(1, Math.max(MIN_DRAW, power)) : 1;
  const range = baseRange * p;
  return { origin, angle, range, end: { x: origin.x + Math.cos(angle) * range, z: origin.z + Math.sin(angle) * range } };
}

/**
 * Where followers land after a crossing: abreast of the leader on the far side,
 * stepping sideways (perpendicular to the crossing), alternating left/right.
 */
export function followerLandings(from: Vec2, to: Vec2, count: number, gap: number): Vec2[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = Math.floor(i / 2) + 1;
    out.push({ x: to.x + px * side * gap * k + (dx / len) * 0.4, z: to.z + pz * side * gap * k + (dz / len) * 0.4 });
  }
  return out;
}
