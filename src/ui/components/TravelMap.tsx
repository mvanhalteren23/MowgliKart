import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runtime } from '@/app/runtime';
import { availableMounts, discoveredWaypoints, getServices, useGame } from '@/app/store';
import { BIOME_FILL, chunkBounds, chunkTiles, waypointPins, worldToMap } from '../logic/travelMap';
import { useUiLocal } from '../uiLocal';
import { Sheet, TapButton, cx } from './common';

/** Fast-travel map: authored chunks as tiles, discovered waypoints as flight buttons. */
export function TravelMap() {
  const setMapOpen = useUiLocal((s) => s.setMapOpen);
  const { flags, questLog, party, mountedOn } = useGame(useShallow((s) => ({ flags: s.flags, questLog: s.questLog, party: s.party, mountedOn: s.mountedOn })));
  const flyTo = useGame((s) => s.flyTo);
  const { db } = getServices();

  const bounds = useMemo(() => chunkBounds(db.world.chunks), [db]);
  const tiles = useMemo(() => chunkTiles(db.world.chunks, bounds), [db, bounds]);
  const discovered = useMemo(() => {
    try {
      return discoveredWaypoints({ flags });
    } catch {
      return [];
    }
  }, [flags]);
  const pins = useMemo(() => waypointPins(db.world.regions, new Set(discovered.map((r) => r.id)), bounds), [db, discovered, bounds]);
  const flight = useMemo(() => {
    try {
      return availableMounts({ flags, questLog, party }).find((m) => m.kind === 'flight') ?? null;
    } catch {
      return null;
    }
  }, [flags, questLog, party]);
  const lockedReason = flight ? null : Object.values(db.mounts ?? {}).find((m) => m.kind === 'flight')?.unlockText ?? 'No flight mount yet.';

  const youRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const p = worldToMap(runtime.player.x, runtime.player.z, bounds);
      const el = youRef.current;
      if (el) {
        el.style.left = `${p.left}%`;
        el.style.top = `${p.top}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bounds]);

  const disabledReason = lockedReason;
  const flying = flight !== null && mountedOn === flight.id;

  return (
    <Sheet kind="sheet" title="Fast Travel" sub={flight ? `${flying ? 'Riding' : 'By'} ${flight.name}` : 'Waypoints'} onClose={() => setMapOpen(false)} closeTestId="map-close">
      <div className="ew-travel" data-testid="travel-map">
        {disabledReason && (
          <p className="ew-travel__reason ew-warn" data-testid="travel-disabled">
            🔒 {disabledReason}
          </p>
        )}
        <div className="ew-travel__map" style={{ aspectRatio: `${bounds.cols} / ${bounds.rows}`, width: `min(100%, calc((100dvh - 130px) * ${(bounds.cols / bounds.rows).toFixed(3)}))`, gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`, gridTemplateRows: `repeat(${bounds.rows}, 1fr)` }}>
          {tiles.map((t) => (
            <div key={t.key} className="ew-travel__tile" style={{ gridColumn: t.col, gridRow: t.row, background: BIOME_FILL[t.biome] }} data-testid={`chunk-${t.cx}-${t.cz}`}>
              <span className="ew-travel__tilename">{t.name}</span>
            </div>
          ))}
          {pins.map((p) => (
            <span key={p.regionId} className="ew-travel__marker" style={{ left: `${p.point.left}%`, top: `${p.point.top}%` }} aria-hidden="true">
              <span className="ew-travel__dot" />
              <span className="ew-travel__mlabel">{p.name}</span>
            </span>
          ))}
          <span ref={youRef} className="ew-travel__you" data-testid="map-you" aria-label="You are here" />
        </div>
        <div className="ew-travel__list" role="list" aria-label="Waypoints">
          {pins.length === 0 && <p className="ew-empty">No waypoints discovered yet — explore to find them.</p>}
          {pins.map((p) => (
            <TapButton
              key={p.regionId}
              role="listitem"
              className={cx('ew-travel__pin', disabledReason && 'is-disabled')}
              data-testid={`travel-${p.regionId}`}
              disabled={disabledReason !== null}
              aria-label={`Fly to ${p.name}`}
              onTap={() => {
                flyTo(p.regionId);
                setMapOpen(false);
              }}
            >
              <span className="ew-travel__dot" />
              <span className="ew-travel__label">{p.name}</span>
            </TapButton>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** "In flight → region" banner with a cancel (dismount) button. */
export function FlightBanner() {
  const target = useGame((s) => s.flightTarget);
  const dismount = useGame((s) => s.dismount);
  if (!target) return null;
  const region = getServices().db.world.regions.find((r) => r.id === target);
  return (
    <div className="ew-flight" data-testid="flight-banner" role="status">
      <span className="ew-flight__text">
        In flight → <strong>{region?.name ?? target}</strong>
      </span>
      <TapButton className="ew-btn--pill" data-testid="btn-flight-cancel" onTap={dismount}>
        Cancel
      </TapButton>
    </div>
  );
}
