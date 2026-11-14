import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/store';
import { flickQuality, type GesturePoint } from '../logic/gestureMath';
import { TapButton, cx } from './common';

/** Last cast (shown by the fishing HUD); transient UI memory, not game state. */
export const lastCast: { quality: number | null; label: string } = { quality: null, label: '' };

/**
 * Cast pad (`fishing-cast`): flick upward — speed and straightness become
 * `castQuality`, then the store starts the session.
 */
export function CastPad({ onClose }: { onClose: () => void }) {
  const perform = useGame((s) => s.performFieldAction);
  const atSpot = useGame((s) => s.contextAction?.kind === 'fish');
  const samples = useRef<GesturePoint[]>([]);
  const pointer = useRef<number | null>(null);
  const bobRef = useRef<HTMLSpanElement>(null);
  const [hint, setHint] = useState('Flick upward to cast');

  useEffect(() => {
    if (!atSpot) onClose();
  }, [atSpot, onClose]);

  const cast = (quality: number, label: string): void => {
    lastCast.quality = quality;
    lastCast.label = label;
    onClose();
    perform('fish', { castQuality: quality });
  };

  return (
    <div className="ew-cast-root">
      <section className="ew-cast" aria-label="Cast your line">
        <header className="ew-cast__head">
          <span className="ew-strong">Cast</span>
          <TapButton className="ew-btn--icon" data-testid="fishing-cast-close" aria-label="Close" onTap={onClose}>
            ✕
          </TapButton>
        </header>
        <div
          className="ew-cast__pad"
          data-testid="fishing-cast"
          onPointerDown={(e) => {
            if (pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
            pointer.current = e.pointerId;
            samples.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
            e.currentTarget.dataset.pressed = '1';
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* synthetic */
            }
          }}
          onPointerMove={(e) => {
            if (pointer.current !== e.pointerId) return;
            samples.current.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
            if (samples.current.length > 64) samples.current.splice(0, samples.current.length - 64);
            const first = samples.current[0];
            if (bobRef.current && first) bobRef.current.style.transform = `translate(${e.clientX - first.x}px, ${Math.min(0, e.clientY - first.y)}px)`;
          }}
          onPointerUp={(e) => {
            if (pointer.current !== e.pointerId) return;
            pointer.current = null;
            delete e.currentTarget.dataset.pressed;
            samples.current.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
            if (bobRef.current) bobRef.current.style.transform = '';
            const r = flickQuality(samples.current);
            if (!r.valid) {
              setHint('Flick upward — quick and straight!');
              return;
            }
            cast(r.quality, r.label);
          }}
          onPointerCancel={(e) => {
            if (pointer.current !== e.pointerId) return;
            pointer.current = null;
            delete e.currentTarget.dataset.pressed;
            if (bobRef.current) bobRef.current.style.transform = '';
          }}
        >
          <span className="ew-cast__lane" aria-hidden="true">
            <span className="ew-cast__chev">⌃</span>
            <span className="ew-cast__chev">⌃</span>
            <span className="ew-cast__chev">⌃</span>
          </span>
          <span ref={bobRef} className="ew-cast__bob" aria-hidden="true">
            🎣
          </span>
          <span className={cx('ew-cast__hint')}>{hint}</span>
        </div>
        <TapButton className="ew-btn--pill" data-testid="fishing-cast-quick" onTap={() => cast(0.5, 'Easy')}>
          Easy cast
        </TapButton>
      </section>
    </div>
  );
}
