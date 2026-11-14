import { describe, expect, it } from 'vitest';
import type { QteWindow } from '@/types/contracts';
import {
  SWIPE_THRESHOLD_PX,
  answer,
  classifyRelease,
  classifySwipe,
  createQteRun,
  currentPrompt,
  isRunComplete,
  isTimedOut,
  keyToQteInput,
  markShown,
  previewGrade,
  promptMark,
  promptWord,
  reactionMs,
  timeout,
  timerFraction,
} from './qte';

const win: QteWindow = { actorId: 'hero:kael', skillId: 's', sequence: ['up', 'tap', 'left'], windowMs: 800, perfectWithin: 0.4 };

describe('swipe classifier', () => {
  it('ignores movement at or below the threshold', () => {
    expect(classifySwipe(SWIPE_THRESHOLD_PX, 0)).toBeNull();
    expect(classifySwipe(10, 10)).toBeNull();
    expect(classifySwipe(25, 0)).toBe('right');
  });
  it('uses the dominant axis; screen up is negative y', () => {
    expect(classifySwipe(-40, 5)).toBe('left');
    expect(classifySwipe(5, -40)).toBe('up');
    expect(classifySwipe(-3, 40)).toBe('down');
    expect(classifySwipe(31, -30)).toBe('right');
  });
  it('waits on an exact diagonal tie', () => {
    expect(classifySwipe(30, 30)).toBeNull();
    expect(classifySwipe(-30, -30)).toBeNull();
  });
  it('respects a custom threshold and rejects non-finite input', () => {
    expect(classifySwipe(30, 0, 40)).toBeNull();
    expect(classifySwipe(Number.NaN, 50)).toBeNull();
  });
  it('release: short travel is a tap, long tie is ambiguous', () => {
    expect(classifyRelease(0, 0)).toBe('tap');
    expect(classifyRelease(12, -10)).toBe('tap');
    expect(classifyRelease(40, 40)).toBeNull();
    expect(classifyRelease(0, 60)).toBe('down');
  });
  it('maps desktop keys', () => {
    expect(keyToQteInput('ArrowUp')).toBe('up');
    expect(keyToQteInput('KeyD')).toBe('right');
    expect(keyToQteInput('Space')).toBe('tap');
    expect(keyToQteInput('KeyQ')).toBeNull();
  });
});

describe('QTE timing', () => {
  it('measures reaction time from the first painted frame', () => {
    let run = createQteRun(win);
    expect(currentPrompt(run)).toBe('up');
    run = markShown(run, 1000);
    run = markShown(run, 1100); // first paint wins
    expect(reactionMs(run, 1250)).toBe(250);
    run = answer(run, 'up', 1250);
    expect(run.results).toEqual([{ input: 'up', ms: 250 }]);
    expect(run.shownAt).toBeNull();
    expect(currentPrompt(run)).toBe('tap');
  });
  it('an answer before the first paint counts as 0 ms', () => {
    const run = answer(createQteRun(win), 'up', 5);
    expect(run.results[0]).toEqual({ input: 'up', ms: 0 });
  });
  it('a wrong input ends the prompt and is forwarded as-is', () => {
    const run = answer(markShown(createQteRun(win), 0), 'down', 100);
    expect(run.results[0]).toEqual({ input: 'down', ms: 100 });
    expect(run.index).toBe(1);
  });
  it('timeout yields input null with the full window', () => {
    let run = markShown(createQteRun(win), 0);
    expect(isTimedOut(run, 799)).toBe(false);
    expect(isTimedOut(run, 800)).toBe(true);
    run = timeout(run);
    expect(run.results[0]).toEqual({ input: null, ms: 800 });
    // late answers also count as timeouts
    const late = answer(markShown(createQteRun(win), 0), 'up', 900);
    expect(late.results[0]).toEqual({ input: null, ms: 800 });
  });
  it('completes after every prompt and ignores further input', () => {
    let run = createQteRun(win);
    for (const [i, inp] of (['up', 'tap', 'left'] as const).entries()) {
      run = markShown(run, i * 1000);
      run = answer(run, inp, i * 1000 + 100);
    }
    expect(isRunComplete(run)).toBe(true);
    expect(run.results).toHaveLength(3);
    expect(answer(run, 'up', 9999)).toBe(run);
    expect(timeout(run)).toBe(run);
    expect(markShown(run, 1)).toBe(run);
    expect(timerFraction(run, 0)).toBe(0);
  });
  it('timer fraction shrinks from 1 to 0', () => {
    const run = markShown(createQteRun(win), 100);
    expect(timerFraction(createQteRun(win), 0)).toBe(1);
    expect(timerFraction(run, 500)).toBeCloseTo(0.5);
    expect(timerFraction(run, 5000)).toBe(0);
  });
});

describe('grade preview (non-authoritative)', () => {
  it('marks prompts', () => {
    expect(promptMark('up', { input: 'up', ms: 300 }, 800, 0.4)).toBe('perfect');
    expect(promptMark('up', { input: 'up', ms: 400 }, 800, 0.4)).toBe('good');
    expect(promptMark('up', { input: 'down', ms: 10 }, 800, 0.4)).toBe('wrong');
    expect(promptMark('up', { input: null, ms: 800 }, 800, 0.4)).toBe('late');
  });
  it('previews perfect / good / miss', () => {
    const fast = [{ input: 'up', ms: 100 }, { input: 'tap', ms: 200 }, { input: 'left', ms: 300 }] as const;
    expect(previewGrade(win, fast)).toBe('perfect');
    expect(previewGrade(win, [...fast.slice(0, 2), { input: 'left', ms: 500 }])).toBe('good');
    expect(previewGrade(win, [...fast.slice(0, 2), { input: null, ms: 800 }])).toBe('miss');
    expect(previewGrade(win, fast.slice(0, 2))).toBe('miss');
  });
  it('words for the debug fallback', () => {
    expect(promptWord('tap')).toBe('TAP');
    expect(promptWord('left')).toBe('SWIPE LEFT');
  });
});
