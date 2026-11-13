import { useMemo, useRef, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { heroPortrait, spritePortrait } from '@/engine/bootstrapAssets';
import type { HeroId, SpriteSheetId } from '@/types/contracts';
import { ratio } from '../logic/hudMath';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'type'>;

export interface TapButtonProps extends NativeButton {
  readonly onTap: () => void;
  /** Return true to swallow the tap (e.g. it turned into a swipe). */
  readonly suppress?: () => boolean;
  readonly children?: ReactNode;
}

/**
 * Multi-touch safe button: fires on pointer-up inside its bounds using pointer
 * capture, so a thumb on the stick never blocks or steals another thumb's tap.
 * Keyboard activation (click with detail 0) still works.
 */
export function TapButton({ onTap, suppress, disabled, className, children, ...rest }: TapButtonProps) {
  const pointer = useRef<number | null>(null);
  const reset = (el: HTMLButtonElement): void => {
    pointer.current = null;
    delete el.dataset.pressed;
  };
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      className={cx('ew-btn', className)}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        pointer.current = e.pointerId;
        e.currentTarget.dataset.pressed = '1';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events have no capturable pointer */
        }
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLButtonElement>) => {
        const el = e.currentTarget;
        if (pointer.current !== e.pointerId) return;
        reset(el);
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
        if (inside && !disabled && !(suppress?.() ?? false)) onTap();
      }}
      onPointerCancel={(e) => reset(e.currentTarget)}
      onLostPointerCapture={(e) => {
        if (pointer.current === e.pointerId) reset(e.currentTarget);
      }}
      onClick={(e) => {
        if (e.detail === 0 && !disabled) onTap();
      }}
    >
      {children}
    </button>
  );
}

export function Bar({ value, max, tone, label, thin }: { value: number; max: number; tone: 'hp' | 'ap' | 'sync' | 'tension' | 'progress' | 'armor'; label?: string; thin?: boolean }) {
  const pct = ratio(value, max) * 100;
  return (
    <div className={cx('ew-bar', `ew-bar--${tone}`, thin && 'ew-bar--thin')} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="ew-bar__fill" style={{ width: `${pct}%` }} />
      {label !== undefined && !thin && (
        <span className="ew-bar__label">
          {label} {Math.round(value)}/{Math.round(max)}
        </span>
      )}
    </div>
  );
}

function safe(fn: () => string): string {
  try {
    return fn();
  } catch {
    return '';
  }
}

export function HeroPortrait({ heroId, className }: { heroId: HeroId; className?: string }) {
  const src = useMemo(() => safe(() => heroPortrait(heroId)), [heroId]);
  return src ? <img className={cx('ew-portrait', className)} src={src} alt="" draggable={false} /> : <span className={cx('ew-portrait', 'ew-portrait--blank', className)} />;
}

export function SpritePortrait({ sprite, className }: { sprite: SpriteSheetId; className?: string }) {
  const src = useMemo(() => safe(() => spritePortrait(sprite)), [sprite]);
  return src ? <img className={cx('ew-portrait', className)} src={src} alt="" draggable={false} /> : <span className={cx('ew-portrait', 'ew-portrait--blank', className)} />;
}

/** Drawer / sheet chrome with a backdrop that closes on tap. */
export function Sheet({ kind, title, onClose, closeTestId, children, sub }: { kind: 'drawer' | 'sheet' | 'panel'; title: ReactNode; sub?: ReactNode; onClose: () => void; closeTestId: string; children: ReactNode }) {
  return (
    <div className={cx('ew-sheet-root', `ew-sheet-root--${kind}`)}>
      <div className="ew-backdrop" onPointerUp={onClose} />
      <section className={cx('ew-sheet', `ew-sheet--${kind}`)} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="ew-sheet__head">
          <div className="ew-sheet__title">
            <h2>{title}</h2>
            {sub && <div className="ew-sheet__sub">{sub}</div>}
          </div>
          <TapButton className="ew-btn--icon" onTap={onClose} data-testid={closeTestId} aria-label="Close">
            ✕
          </TapButton>
        </header>
        <div className="ew-sheet__body">{children}</div>
      </section>
    </div>
  );
}
