import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { availableMounts, getServices, useGame } from '@/app/store';
import type { MountDef } from '@/types/contracts';
import { FALLBACK_SIZE } from '../assetIds';
import { setBoost, setSprint } from '../inputBridge';
import { useUiLocal } from '../uiLocal';
import { AssetSprite } from './AssetSprite';
import { TapButton, cx } from './common';

/** Press-and-hold button with pointer capture (multi-touch safe alongside the stick). */
function HoldButton({ testId, label, onHold, className, children }: { testId: string; label: string; onHold: (held: boolean) => void; className?: string; children: ReactNode }) {
  const pointer = useRef<number | null>(null);
  const hold = useRef(onHold);
  hold.current = onHold;
  useEffect(() => () => hold.current(false), []);
  const end = (el: HTMLButtonElement, id: number): void => {
    if (pointer.current !== id) return;
    pointer.current = null;
    delete el.dataset.pressed;
    hold.current(false);
  };
  return (
    <button
      type="button"
      className={cx('ew-btn', 'ew-hold', className)}
      data-testid={testId}
      aria-label={label}
      onPointerDown={(e) => {
        if (pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
        pointer.current = e.pointerId;
        e.currentTarget.dataset.pressed = '1';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic */
        }
        hold.current(true);
      }}
      onPointerUp={(e) => end(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => end(e.currentTarget, e.pointerId)}
      onLostPointerCapture={(e) => end(e.currentTarget, e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function MountIcon({ mount, size = 30 }: { mount: MountDef; size?: number }) {
  return <AssetSprite className="ew-mount__icon" assetId={mount.iconAssetId} fallback={FALLBACK_SIZE.mountIcon} fit={{ maxW: size, maxH: size }} alt={mount.name} />;
}

function MountPicker({ available, onClose }: { available: readonly MountDef[]; onClose: () => void }) {
  const mount = useGame((s) => s.mount);
  const all = Object.values(getServices().db.mounts ?? {});
  const ok = new Set(available.map((m) => m.id));
  return (
    <div className="ew-mountpick" data-testid="mount-picker" role="dialog" aria-label="Choose a mount">
      <div className="ew-mountpick__head">
        <h3>Mounts</h3>
        <TapButton className="ew-btn--icon" data-testid="mount-picker-close" aria-label="Close" onTap={onClose}>
          ✕
        </TapButton>
      </div>
      {all.length === 0 && <p className="ew-empty">No mounts known.</p>}
      {all.map((m) => {
        const unlocked = ok.has(m.id);
        return (
          <TapButton
            key={m.id}
            className={cx('ew-mountpick__item', !unlocked && 'is-locked')}
            data-testid={`mount-${m.id}`}
            disabled={!unlocked}
            onTap={() => {
              mount(m.id);
              onClose();
            }}
          >
            <MountIcon mount={m} size={36} />
            <span className="ew-mountpick__text">
              <span className="ew-strong">
                {unlocked ? '' : '🔒 '}
                {m.name} <small className="ew-dim">· {m.kind}</small>
              </span>
              <small className={unlocked ? 'ew-dim' : 'ew-warn'}>{unlocked ? m.description : m.unlockText}</small>
            </span>
          </TapButton>
        );
      })}
    </div>
  );
}

/** Sprint hold-button (on foot), mount toggle + picker, boost hold-button (mounted). */
export function MoveControls() {
  const { mountedOn, flags, questLog, party } = useGame(useShallow((s) => ({ mountedOn: s.mountedOn, flags: s.flags, questLog: s.questLog, party: s.party })));
  const dismount = useGame((s) => s.dismount);
  const mount = useGame((s) => s.mount);
  const pickerOpen = useUiLocal((s) => s.mountPickerOpen);
  const setPickerOpen = useUiLocal((s) => s.setMountPickerOpen);
  const { db } = getServices();
  const all = Object.values(db.mounts ?? {});
  const available = useMemo(() => {
    try {
      return availableMounts({ flags, questLog, party });
    } catch {
      return [];
    }
  }, [flags, questLog, party]);
  const current = mountedOn ? db.mounts?.[mountedOn] : undefined;
  const shown = current ?? available[0] ?? all[0];

  // Never leave a hold stuck across a mount change.
  useEffect(() => {
    if (mountedOn) setSprint('button', false);
    else setBoost('button', false);
  }, [mountedOn]);

  return (
    <div className="ew-movectl">
      {mountedOn ? (
        <HoldButton testId="btn-boost" label="Boost" className="ew-hold--boost" onHold={(h) => setBoost('button', h)}>
          <span className="ew-hold__glyph">»</span>
          <span className="ew-hold__label">Boost</span>
        </HoldButton>
      ) : (
        <HoldButton testId="btn-sprint" label="Sprint" onHold={(h) => setSprint('button', h)}>
          <span className="ew-hold__glyph">»</span>
          <span className="ew-hold__label">Sprint</span>
        </HoldButton>
      )}
      {all.length > 0 && (
        <TapButton
          className={cx('ew-mountbtn', mountedOn && 'is-on', available.length === 0 && !mountedOn && 'is-locked')}
          data-testid="btn-mount"
          aria-label={mountedOn ? 'Dismount' : 'Mount'}
          onTap={() => {
            if (mountedOn) dismount();
            else if (available.length === 1 && available[0]) mount(available[0].id);
            else setPickerOpen(!pickerOpen);
          }}
        >
          {shown && <MountIcon mount={shown} />}
          <span className="ew-hold__label">{mountedOn ? 'Dismount' : 'Ride'}</span>
        </TapButton>
      )}
      {pickerOpen && !mountedOn && <MountPicker available={available} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
