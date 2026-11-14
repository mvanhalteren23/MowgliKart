/**
 * Quick-time-event helpers for the HUD — framework-free, unit tested.
 *
 * The UI only *collects* answers (input + reaction time) and previews them for
 * feedback; the authoritative grade always comes from the core (`qteResult`).
 */
import type { QteGrade, QteInput, QteInputResult, QteWindow } from '@/types/contracts';

/** Minimum pointer travel (CSS px) for a gesture to count as a swipe. */
export const SWIPE_THRESHOLD_PX = 24;

export type Direction = Exclude<QteInput, 'tap'>;

/**
 * Classify a pointer displacement as a directional swipe while the finger is
 * still moving. Screen coordinates: +y is down, so a negative `dy` is 'up'.
 * Returns null while below the threshold or on an exact diagonal tie (no
 * dominant axis yet — keep waiting for more movement).
 */
export function classifySwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD_PX): Direction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) <= threshold) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === ay) return null;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Classify a gesture at release time when no swipe was decided during movement:
 * short travel = 'tap'; a long but tied diagonal is ambiguous (null, ignored).
 */
export function classifyRelease(dx: number, dy: number, threshold = SWIPE_THRESHOLD_PX): QteInput | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) <= threshold) return 'tap';
  return classifySwipe(dx, dy, threshold);
}

/** Desktop mapping: arrows / WASD swipe, Space / Enter tap. */
export function keyToQteInput(code: string): QteInput | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      return 'tap';
    default:
      return null;
  }
}

/* ── Sequence run ─────────────────────────────────────────────────────── */

export interface QteRun {
  readonly sequence: readonly QteInput[];
  readonly windowMs: number;
  /** Index of the prompt being shown (=== sequence.length once complete). */
  readonly index: number;
  /** `performance.now()` of the current prompt's first painted frame (null until painted). */
  readonly shownAt: number | null;
  readonly results: readonly QteInputResult[];
}

export function createQteRun(win: Pick<QteWindow, 'sequence' | 'windowMs'>): QteRun {
  return { sequence: win.sequence, windowMs: Math.max(1, win.windowMs), index: 0, shownAt: null, results: [] };
}

export const isRunComplete = (run: QteRun): boolean => run.index >= run.sequence.length;

export const currentPrompt = (run: QteRun): QteInput | null => run.sequence[run.index] ?? null;

/** Mark the current prompt as painted at `now` (idempotent: the first paint wins). */
export function markShown(run: QteRun, now: number): QteRun {
  if (isRunComplete(run) || run.shownAt !== null) return run;
  return { ...run, shownAt: now };
}

/** Reaction time for an answer at `now`; an answer before the first paint counts as 0 ms. */
export function reactionMs(run: QteRun, now: number): number {
  if (run.shownAt === null) return 0;
  return Math.max(0, Math.round(now - run.shownAt));
}

function advance(run: QteRun, result: QteInputResult): QteRun {
  return { ...run, index: run.index + 1, shownAt: null, results: [...run.results, result] };
}

/**
 * Record an input for the current prompt. Right or wrong, the prompt ends:
 * a wrong input is forwarded as-is so the core grades it. Answers after the
 * window has elapsed are treated as a timeout.
 */
export function answer(run: QteRun, input: QteInput, now: number): QteRun {
  if (isRunComplete(run)) return run;
  const ms = reactionMs(run, now);
  if (run.shownAt !== null && ms > run.windowMs) return advance(run, { input: null, ms: run.windowMs });
  return advance(run, { input, ms });
}

/** Has the current prompt's window elapsed at `now`? */
export function isTimedOut(run: QteRun, now: number): boolean {
  return !isRunComplete(run) && run.shownAt !== null && now - run.shownAt >= run.windowMs;
}

/** Close the current prompt with `input: null` (timed out). */
export function timeout(run: QteRun): QteRun {
  if (isRunComplete(run)) return run;
  return advance(run, { input: null, ms: run.windowMs });
}

/** Remaining fraction (1 → 0) of the current prompt's window, for the shrinking ring. */
export function timerFraction(run: QteRun, now: number): number {
  if (isRunComplete(run)) return 0;
  if (run.shownAt === null) return 1;
  const f = 1 - (now - run.shownAt) / run.windowMs;
  return Math.min(1, Math.max(0, f));
}

/* ── Non-authoritative preview (feedback only) ────────────────────────── */

export type PromptMark = 'perfect' | 'good' | 'wrong' | 'late';

/** Per-prompt feedback mark for an answered prompt. */
export function promptMark(expected: QteInput | undefined, result: QteInputResult, windowMs: number, perfectWithin: number): PromptMark {
  if (result.input === null) return 'late';
  if (result.input !== expected) return 'wrong';
  return result.ms <= perfectWithin * windowMs ? 'perfect' : 'good';
}

/** Preview of what the core is expected to grade. The core's `qteResult` is the source of truth. */
export function previewGrade(win: Pick<QteWindow, 'sequence' | 'windowMs' | 'perfectWithin'>, results: readonly QteInputResult[]): QteGrade {
  if (results.length < win.sequence.length) return 'miss';
  let perfect = true;
  for (let i = 0; i < win.sequence.length; i++) {
    const r = results[i];
    if (!r) return 'miss';
    const mark = promptMark(win.sequence[i], r, win.windowMs, win.perfectWithin);
    if (mark === 'wrong' || mark === 'late') return 'miss';
    if (mark !== 'perfect') perfect = false;
  }
  return perfect ? 'perfect' : 'good';
}

/** Plain text word for a prompt (debug fallback keeps the QTE playable). */
export function promptWord(input: QteInput): string {
  return input === 'tap' ? 'TAP' : `SWIPE ${input.toUpperCase()}`;
}
