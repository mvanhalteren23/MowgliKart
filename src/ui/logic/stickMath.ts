/**
 * Virtual analog stick math — framework-free, unit tested.
 * Screen coordinates: +x right, +y down (matches `runtime.input.moveY`: up = −1).
 */

export interface StickVector {
  /** Normalised axis output, −1..1, inside the unit circle. */
  readonly x: number;
  readonly y: number;
  /** 0..1 after dead-zone rescale. */
  readonly magnitude: number;
  /** Knob offset in px from the stick origin, clamped to `radius`. */
  readonly knobX: number;
  readonly knobY: number;
}

export const ZERO_STICK: StickVector = { x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 };

/**
 * @param dx finger x − origin x (px)
 * @param dy finger y − origin y (px)
 * @param radius max knob travel (px)
 * @param deadZone fraction of `radius` (0..1) that outputs zero
 */
export function computeStick(dx: number, dy: number, radius: number, deadZone: number): StickVector {
  const dist = Math.hypot(dx, dy);
  if (!(radius > 0) || dist === 0 || !Number.isFinite(dist)) return ZERO_STICK;
  const dirX = dx / dist;
  const dirY = dy / dist;
  const clamped = Math.min(dist, radius);
  const knobX = dirX * clamped;
  const knobY = dirY * clamped;
  const dz = Math.min(Math.max(deadZone, 0), 0.95);
  const norm = clamped / radius;
  if (norm <= dz) return { x: 0, y: 0, magnitude: 0, knobX, knobY };
  const magnitude = Math.min(1, (norm - dz) / (1 - dz));
  return { x: dirX * magnitude, y: dirY * magnitude, magnitude, knobX, knobY };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Keep a floating stick base fully inside its zone (zone-local px). */
export function clampOrigin(p: Point, zoneW: number, zoneH: number, margin: number): Point {
  const clampAxis = (v: number, max: number): number => (max <= margin * 2 ? max / 2 : Math.min(Math.max(v, margin), max - margin));
  return { x: clampAxis(p.x, zoneW), y: clampAxis(p.y, zoneH) };
}

/**
 * Floating origin: when the finger travels further than `maxDist` from the
 * origin, drag the origin along so the stick never feels "stuck".
 */
export function followOrigin(origin: Point, finger: Point, maxDist: number): Point {
  const dx = finger.x - origin.x;
  const dy = finger.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDist || dist === 0) return origin;
  const k = (dist - maxDist) / dist;
  return { x: origin.x + dx * k, y: origin.y + dy * k };
}

/** Digital (keyboard) direction → unit-length analog vector. */
export function keysToVector(left: boolean, right: boolean, up: boolean, down: boolean): Point {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

/** Stick wins while it is deflected; otherwise keyboard; blocked → zero. */
export function combineMove(stick: Point, keys: Point, blocked: boolean): Point {
  if (blocked) return { x: 0, y: 0 };
  if (stick.x !== 0 || stick.y !== 0) return stick;
  return keys;
}
