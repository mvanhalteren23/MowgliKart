/**
 * UI → runtime bus input bridge. Merges the virtual stick and the keyboard
 * into `runtime.input` and zeroes movement whenever the HUD blocks it
 * (mode ≠ overworld, or a drawer is open). Never touches React state.
 */
import { runtime } from '@/app/runtime';
import { combineMove, keysToVector, type Point } from './logic/stickMath';

type Dir = 'left' | 'right' | 'up' | 'down';

const state = {
  stick: { x: 0, y: 0 } as Point,
  keys: { left: false, right: false, up: false, down: false } as Record<Dir, boolean>,
  blocked: true,
  reelHeld: false,
  reelTapped: false,
};

function flush(): void {
  const k = state.keys;
  const v = combineMove(state.stick, keysToVector(k.left, k.right, k.up, k.down), state.blocked);
  runtime.input.moveX = v.x;
  runtime.input.moveY = v.y;
}

export function setStickVector(x: number, y: number): void {
  state.stick = { x, y };
  flush();
}

export function setMoveKey(dir: Dir, down: boolean): void {
  if (state.keys[dir] === down) return;
  state.keys[dir] = down;
  flush();
}

export function clearMoveKeys(): void {
  state.keys = { left: false, right: false, up: false, down: false };
  flush();
}

export function setMovementBlocked(blocked: boolean): void {
  state.blocked = blocked;
  flush();
}

/* ── Fishing reel (shared by the hold button and the keyboard) ─────────── */

export function pressReel(): void {
  if (!state.reelHeld) state.reelTapped = true;
  state.reelHeld = true;
  runtime.input.reelHeld = true;
}

export function releaseReel(): void {
  state.reelHeld = false;
  runtime.input.reelHeld = false;
}

/** Read the reel input for this frame; `tapped` is consumed (one-shot). */
export function consumeReelInput(): { readonly holding: boolean; readonly tapped: boolean } {
  const out = { holding: state.reelHeld, tapped: state.reelTapped };
  state.reelTapped = false;
  return out;
}

/** Reset everything (unmount / window blur). */
export function resetAllInput(): void {
  state.stick = { x: 0, y: 0 };
  clearMoveKeys();
  releaseReel();
  state.reelTapped = false;
}
