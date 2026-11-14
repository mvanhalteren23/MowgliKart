import { useEffect, useRef, useState } from 'react';
import { getServices } from '@/app/store';
import type { CombatSide, CombatState, HazardInstance } from '@/types/contracts';
import { FALLBACK_SIZE } from '../assetIds';
import { hazardTicksSince, hazardsForSide, roundsLabel, type TickNumber } from '../logic/hazards';
import { AssetSprite } from './AssetSprite';
import { TapButton, cx } from './common';

const LONG_PRESS_MS = 420;

function HazardChip({ h }: { h: HazardInstance }) {
  const def = getServices().db.hazards?.[h.hazardId];
  const [open, setOpen] = useState(false);
  const longFired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <span className="ew-hazard-wrap">
      <TapButton
        className={cx('ew-hazard', `is-${h.side}`, open && 'is-open')}
        data-testid={`hazard-${h.side}-${h.hazardId}`}
        aria-expanded={open}
        aria-label={`${def?.name ?? h.hazardId}, ${roundsLabel(h.roundsLeft)} left`}
        onPointerDownCapture={() => {
          longFired.current = false;
          clear();
          timer.current = setTimeout(() => {
            longFired.current = true;
            setOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerLeave={clear}
        suppress={() => {
          clear();
          return longFired.current;
        }}
        onTap={() => setOpen((o) => !o)}
      >
        {def ? <AssetSprite className="ew-hazard__icon" assetId={def.iconAssetId} fallback={FALLBACK_SIZE.hazardIcon} fit={{ maxW: 26, maxH: 26 }} /> : null}
        <span className="ew-hazard__name">{def?.name ?? h.hazardId}</span>
        <span className="ew-hazard__rounds">{roundsLabel(h.roundsLeft)}</span>
      </TapButton>
      {open && (
        <span className="ew-hazard__desc" role="tooltip" data-testid={`hazard-desc-${h.hazardId}`}>
          {def?.description ?? 'An unknown hazard.'}
        </span>
      )}
    </span>
  );
}

/** Active terrain hazards on one side of the field. */
export function HazardChips({ combat, side }: { combat: CombatState; side: CombatSide }) {
  const list = hazardsForSide(combat.hazards, side);
  if (list.length === 0) return null;
  return (
    <div className={cx('ew-hazards', `ew-hazards--${side}`)} data-testid={`hazards-${side}`}>
      {list.map((h) => (
        <HazardChip key={h.instanceId} h={h} />
      ))}
    </div>
  );
}

/** Recent hazard tick numbers (auto-expire) for per-combatant floating damage. */
export function useHazardTicks(combat: CombatState): readonly TickNumber[] {
  const seen = useRef(combat.log.length);
  const [ticks, setTicks] = useState<readonly TickNumber[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
      set.clear();
    };
  }, []);
  useEffect(() => {
    const fresh = hazardTicksSince(combat.log, seen.current);
    seen.current = combat.log.length;
    if (fresh.length === 0) return;
    setTicks((prev) => [...prev, ...fresh].slice(-12));
    const keys = new Set(fresh.map((t) => t.key));
    const id = setTimeout(() => {
      timers.current.delete(id);
      setTicks((prev) => prev.filter((t) => !keys.has(t.key)));
    }, 1600);
    timers.current.add(id);
  }, [combat.log]);
  return ticks;
}

export function TickNumbers({ ticks, id }: { ticks: readonly TickNumber[]; id: string }) {
  const mine = ticks.filter((t) => t.targetId === id);
  if (mine.length === 0) return null;
  return (
    <span className="ew-ticks" data-testid={`hazard-tick-${id}`}>
      {mine.map((t) => (
        <span key={t.key} className="ew-tick">
          −{t.amount}
        </span>
      ))}
    </span>
  );
}
