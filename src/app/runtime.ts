import type { RuntimeBus } from '@/types/contracts';

/** Mutable per-frame bus shared by engine and UI. Never store this in React state. */
export const runtime: RuntimeBus = {
  input: { moveX: 0, moveY: 0, reelHeld: false, sprint: false, boost: false },
  stamina: { current: 100, max: 100, exhausted: false, idleSec: 0 },
  player: { x: 0, z: 0, facing: 0, moving: false, speed: 0 },
  camera: { combatBlend: 0, yaw: 0 },
  requests: { fieldAction: null, huntAim: null, traverseGate: null, flyTo: null },
  perf: { drawCalls: 0, fps: 0, triangles: 0 },
};
