import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getServices, useGame } from '@/app/store';
import type { CombatState, QteGrade, QteInput, QteWindow } from '@/types/contracts';
import { FALLBACK_SIZE, HITSTOP_FLASH_ASSET, QTE_GRADE_ASSET, QTE_PROMPT_ASSET, QTE_RING_ASSET } from '../assetIds';
import {
  answer,
  classifyRelease,
  classifySwipe,
  createQteRun,
  currentPrompt,
  isRunComplete,
  keyToQteInput,
  markShown,
  promptMark,
  promptWord,
  timeout,
  type QteRun,
} from '../logic/qte';
import { AssetSprite } from './AssetSprite';
import { cx } from './common';

interface Track {
  readonly x: number;
  readonly y: number;
  decided: boolean;
}

/**
 * Quick-time overlay: one centred prompt at a time with a shrinking timer ring.
 * Swipes are decided on movement (passive listeners), taps on release; arrows /
 * WASD / Space on desktop. Reaction time runs from the prompt's first painted
 * frame. The collected answers go to the core, which grades them.
 */
export function QteOverlay({ qte }: { qte: QteWindow }) {
  const act = useGame((s) => s.combatAct);
  const [run, setRun] = useState<QteRun>(() => createQteRun(qte));
  const runRef = useRef(run);
  const submitted = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(
    (next: QteRun): void => {
      if (next === runRef.current) return;
      runRef.current = next;
      setRun(next);
      if (isRunComplete(next) && !submitted.current) {
        submitted.current = true;
        act({ type: 'qte', results: next.results });
      }
    },
    [act],
  );

  const input = useCallback(
    (i: QteInput): void => {
      const r = runRef.current;
      if (isRunComplete(r)) return;
      commit(answer(r, i, performance.now()));
    },
    [commit],
  );

  // Start the clock on the prompt's first painted frame; time out after the window.
  const index = run.index;
  useLayoutEffect(() => {
    if (index >= qte.sequence.length) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const raf = requestAnimationFrame(() => {
      const now = performance.now();
      const shown = markShown(runRef.current, now);
      commit(shown);
      timer = setTimeout(() => {
        const r = runRef.current;
        if (r.index === index && !isRunComplete(r)) commit(timeout(r));
      }, shown.windowMs);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [index, qte.sequence.length, commit]);

  // Low-latency gesture capture: passive native listeners, swipe decided on movement.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const tracks = new Map<number, Track>();
    const down = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracks.set(e.pointerId, { x: e.clientX, y: e.clientY, decided: false });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic */
      }
    };
    const move = (e: PointerEvent): void => {
      const t = tracks.get(e.pointerId);
      if (!t || t.decided) return;
      const dir = classifySwipe(e.clientX - t.x, e.clientY - t.y);
      if (dir) {
        t.decided = true;
        input(dir);
      }
    };
    const up = (e: PointerEvent): void => {
      const t = tracks.get(e.pointerId);
      tracks.delete(e.pointerId);
      if (!t || t.decided) return;
      const r = classifyRelease(e.clientX - t.x, e.clientY - t.y);
      if (r) input(r);
    };
    const cancel = (e: PointerEvent): void => {
      tracks.delete(e.pointerId);
    };
    const opts: AddEventListenerOptions = { passive: true };
    el.addEventListener('pointerdown', down, opts);
    el.addEventListener('pointermove', move, opts);
    el.addEventListener('pointerup', up, opts);
    el.addEventListener('pointercancel', cancel, opts);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [input]);

  // Desktop: capture-phase so the global keyboard handler never sees QTE keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = keyToQteInput(e.code);
      if (!k) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) input(k);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [input]);

  const prompt = currentPrompt(run);
  const skillName = getServices().db.skills[qte.skillId]?.name ?? qte.skillId;
  const shown = run.shownAt !== null;

  return (
    <div ref={rootRef} className="ew-qte" data-testid="qte-overlay" role="application" aria-label={`Quick-time: ${skillName}`}>
      <div className="ew-qte__head">
        <span className="ew-qte__skill">{skillName}</span>
        <span className="ew-qte__steps" data-testid="qte-progress">
          {qte.sequence.map((exp, i) => {
            const r = run.results[i];
            const mark = r ? promptMark(exp, r, qte.windowMs, qte.perfectWithin) : null;
            return <span key={i} className={cx('ew-qte__step', i === run.index && 'is-current', mark && `is-${mark}`)} />;
          })}
          <span className="ew-qte__count">
            {Math.min(run.index + 1, qte.sequence.length)}/{qte.sequence.length}
          </span>
        </span>
      </div>
      {prompt && (
        <div key={run.index} className={cx('ew-qte__prompt', shown && 'is-live')} data-testid={`qte-prompt-${run.index}`} data-input={prompt}>
          <span className="ew-qte__ring" style={{ ['--qte-ms' as string]: `${qte.windowMs}ms` }}>
            <AssetSprite assetId={QTE_RING_ASSET} fallback={FALLBACK_SIZE.qteRing} fit={{ maxW: 168, maxH: 168 }} />
          </span>
          <AssetSprite
            className="ew-qte__glyph"
            assetId={QTE_PROMPT_ASSET[prompt]}
            fallback={FALLBACK_SIZE.qtePrompt}
            fit={{ maxW: 112, maxH: 112 }}
            fallbackText={<strong className="ew-qte__word">{promptWord(prompt)}</strong>}
            alt={promptWord(prompt)}
          />
        </div>
      )}
    </div>
  );
}

/** Grade banner (`qteResult`) and impact flash (`hitStop`) driven by new log events. */
export function QteFeedback({ combat }: { combat: CombatState }) {
  const seen = useRef(combat.log.length);
  const [banner, setBanner] = useState<{ key: number; grade: QteGrade; multiplier: number } | null>(null);
  const [flash, setFlash] = useState<{ key: number; ms: number } | null>(null);

  useEffect(() => {
    const from = seen.current;
    seen.current = combat.log.length;
    for (let i = from; i < combat.log.length; i++) {
      const ev = combat.log[i];
      if (ev?.type === 'qteResult') setBanner({ key: i, grade: ev.grade, multiplier: ev.multiplier });
      if (ev?.type === 'hitStop') {
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) setFlash({ key: i, ms: Math.max(90, Math.min(400, ev.ms)) });
      }
    }
  }, [combat.log]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.ms + 60);
    return () => clearTimeout(t);
  }, [flash]);

  const label = banner ? (banner.grade === 'perfect' ? 'PERFECT' : banner.grade === 'good' ? 'GOOD' : 'MISS') : '';
  return (
    <>
      {flash && (
        <div key={flash.key} className="ew-flash" data-testid="hitstop-flash" style={{ animationDuration: `${flash.ms}ms` }}>
          <AssetSprite assetId={HITSTOP_FLASH_ASSET} fallback={FALLBACK_SIZE.flash} />
        </div>
      )}
      {banner && (
        <div key={banner.key} className={cx('ew-qte-banner', `is-${banner.grade}`)} data-testid="qte-grade" data-grade={banner.grade} role="status">
          <AssetSprite assetId={QTE_GRADE_ASSET[banner.grade]} fallback={FALLBACK_SIZE.qteGrade} fit={{ maxW: 260, maxH: 96 }} fallbackText={label} alt={label} />
          {banner.grade !== 'miss' && <span className="ew-qte-banner__mult">×{banner.multiplier.toFixed(2)}</span>}
        </div>
      )}
    </>
  );
}
