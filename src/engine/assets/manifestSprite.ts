/**
 * Frame math for delivered sprite sheets described by a manifest entry's
 * `grid` / `animation_states` (pure, three-free).
 *
 * Directional sheets name their states `<anim>_<facing>` (facing = lowercase
 * `FACING_NAMES`, e.g. `move_sw`); single-row sheets just use `<anim>` or the whole row.
 * UV convention matches `SpriteSheetMeta`: (offsetX, offsetY, scaleX, scaleY) with
 * row 0 at the top of the image (offsetY = 1 − (row + 1) / rows).
 */
import { FACING_NAMES, type AssetManifestEntry, type Facing8 } from '@/types/contracts';

export type UvRect = [number, number, number, number];

export interface ResolvedState {
  readonly row: number;
  readonly from: number;
  readonly count: number;
}

/** Find the frames for `anim` at `facing` (falls back to any facing, then the first row). */
export function resolveState(entry: AssetManifestEntry, anim: string, facing: Facing8 | null): ResolvedState {
  const states = entry.animation_states ?? [];
  const dir = facing === null ? null : FACING_NAMES[facing].toLowerCase();
  const exact = dir ? states.find((s) => s.name === `${anim}_${dir}`) : undefined;
  const plain = exact ?? states.find((s) => s.name === anim) ?? states.find((s) => s.name.startsWith(`${anim}_`));
  if (plain) return { row: plain.row, from: plain.from, count: Math.max(1, plain.count) };
  const idle = states.find((s) => s.name === `idle_${dir ?? 's'}`) ?? states.find((s) => s.name.startsWith('idle'));
  if (idle) return { row: idle.row, from: idle.from, count: Math.max(1, idle.count) };
  const cols = entry.grid?.columns ?? 1;
  const rows = entry.grid?.rows ?? 1;
  return { row: facing !== null && rows >= 8 ? facing : 0, from: 0, count: cols };
}

/** Column index at `timeSec` (loops, or holds the last frame for one-shots). */
export function stateColumn(state: ResolvedState, timeSec: number, fps: number, loop = true): number {
  const n = Math.max(0, Math.floor(Math.max(0, timeSec) * Math.max(0.01, fps)));
  const k = loop ? n % state.count : Math.min(n, state.count - 1);
  return state.from + k;
}

export function gridUv(entry: AssetManifestEntry, row: number, col: number): UvRect {
  const cols = Math.max(1, entry.grid?.columns ?? 1);
  const rows = Math.max(1, entry.grid?.rows ?? 1);
  return [col / cols, 1 - (row + 1) / rows, 1 / cols, 1 / rows];
}

/** UV rect for an animation frame. `loop` defaults to the entry's `loop` (true when unset). */
export function manifestFrameRect(entry: AssetManifestEntry, anim: string, facing: Facing8 | null, timeSec: number, loop: boolean = entry.loop ?? true): UvRect {
  const st = resolveState(entry, anim, facing);
  return gridUv(entry, st.row, stateColumn(st, timeSec, entry.fps ?? 8, loop));
}

/** Frame aspect (height / width) from the manifest — sizes debug wireframes before delivery. */
export function frameAspect(entry: AssetManifestEntry | null): number {
  if (!entry) return 1;
  const w = entry.grid?.frame_width ?? entry.resolution.width;
  const h = entry.grid?.frame_height ?? entry.resolution.height;
  return w > 0 && h > 0 ? h / w : 1;
}
