/**
 * Camera math (pure, three-free): HD-2D tilted follow framing, low side-on
 * battle framing and the eased blend between them.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  readonly pos: V3;
  readonly look: V3;
}

export interface Framing {
  /** Downward pitch in radians. */
  readonly pitch: number;
  /** Distance from the look target (m). */
  readonly distance: number;
  /** Look target height above the subject's feet (m). */
  readonly lookHeight: number;
}

export const CAMERA_FOV = 30;
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 900;
/** Fixed yaw: the camera sits south of the player looking north. */
export const CAMERA_YAW = 0;
export const COMBAT_BLEND_SECONDS = 0.8;

export const OVERWORLD_FRAMING: Framing = { pitch: (35 * Math.PI) / 180, distance: 34, lookHeight: 1 };
export const COMBAT_FRAMING: Framing = { pitch: (11 * Math.PI) / 180, distance: 16, lookHeight: 1.25 };

export function cameraPose(target: V3, framing: Framing, yaw: number = CAMERA_YAW): CameraPose {
  const look = { x: target.x, y: target.y + framing.lookHeight, z: target.z };
  const horiz = Math.cos(framing.pitch) * framing.distance;
  return {
    look,
    pos: { x: look.x + Math.sin(yaw) * horiz, y: look.y + Math.sin(framing.pitch) * framing.distance, z: look.z + Math.cos(yaw) * horiz },
  };
}

export const easeInOut = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Advance a linear 0..1 blend toward `target` over `duration` seconds. */
export function stepBlend(current: number, target: number, dt: number, duration: number = COMBAT_BLEND_SECONDS): number {
  const step = dt / Math.max(1e-4, duration);
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function blendPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    pos: { x: lerp(a.pos.x, b.pos.x, t), y: lerp(a.pos.y, b.pos.y, t), z: lerp(a.pos.z, b.pos.z, t) },
    look: { x: lerp(a.look.x, b.look.x, t), y: lerp(a.look.y, b.look.y, t), z: lerp(a.look.z, b.look.z, t) },
  };
}

/** Frame-rate independent exponential smoothing factor. */
export const dampFactor = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);
