import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { getServices, useGame } from '@/app/store';
import { DEFAULT_AIM, aimFromDrag, classifyAimRelease, windRelation, worldAngleToCss, type WindRelation } from '../logic/gestureMath';
import { cx } from './common';

/**
 * Hunting drag-to-aim mini-game. A tiny external store holds the transient
 * gesture (never game state). Both the huntShot button and the right-half
 * zone feed it; the overlay renders from it.
 */
interface AimSession {
  readonly pointerId: number;
  readonly ox: number;
  readonly oy: number;
  x: number;
  y: number;
  readonly t0: number;
  maxDrag: number;
}

let session: AimSession | null = null;
let version = 0;
const subs = new Set<() => void>();
const emit = (): void => {
  version++;
  for (const f of subs) f();
};
const subscribe = (f: () => void): (() => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Can the current leader draw the bow right now? */
export function canAim(): boolean {
  const st = useGame.getState();
  if (st.mode !== 'overworld' || st.ui.chronicleOpen || st.ui.inspectorOpen || st.ui.townshipOpen) return false;
  const hero = getServices().db.heroes[st.leader];
  if (!hero.fieldActions.includes('huntShot')) return false;
  return (st.fieldCooldowns.huntShot ?? 0) <= st.worldTime;
}

export function beginAim(pointerId: number, x: number, y: number): boolean {
  if (session || !canAim()) return false;
  session = { pointerId, ox: x, oy: y, x, y, t0: performance.now(), maxDrag: 0 };
  emit();
  return true;
}

export function moveAim(pointerId: number, x: number, y: number): void {
  if (!session || session.pointerId !== pointerId) return;
  session.x = x;
  session.y = y;
  session.maxDrag = Math.max(session.maxDrag, Math.hypot(x - session.ox, y - session.oy));
  emit();
}

export function cancelAim(pointerId: number): void {
  if (!session || session.pointerId !== pointerId) return;
  session = null;
  emit();
}

export function endAim(pointerId: number, x: number, y: number): void {
  const s = session;
  if (!s || s.pointerId !== pointerId) return;
  moveAim(pointerId, x, y);
  session = null;
  emit();
  const dx = x - s.ox;
  const dy = y - s.oy;
  const reading = aimFromDrag(dx, dy);
  const outcome = classifyAimRelease(s.maxDrag, reading.dragPx, performance.now() - s.t0);
  const perform = useGame.getState().performFieldAction;
  if (outcome === 'tap') perform('huntShot');
  else if (outcome === 'fire') perform('huntShot', { aimAngle: reading.angle, aimPower: reading.power });
}

/** Pointer handlers for any element that starts the aim gesture (captures the pointer). */
export function aimHandlers() {
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!beginAim(e.pointerId, e.clientX, e.clientY)) return;
      e.currentTarget.dataset.pressed = '1';
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => moveAim(e.pointerId, e.clientX, e.clientY),
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      delete e.currentTarget.dataset.pressed;
      endAim(e.pointerId, e.clientX, e.clientY);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      delete e.currentTarget.dataset.pressed;
      cancelAim(e.pointerId);
    },
  };
}

const HINT: Readonly<Record<WindRelation, string>> = {
  tailwind: 'Upwind — your scent rides ahead of the arrow',
  headwind: 'Downwind — the quarry cannot scent you',
  crosswind: 'Crosswind — mind the drift',
  calm: 'Still air',
};

/**
 * Right-half touch zone (`hunt-aim`) shown while the leader can loose a bowshot.
 * Press anywhere and pull back like a slingshot; the arrow flies opposite the drag.
 */
export function HuntZone() {
  const handlers = aimHandlers();
  return <div className="ew-hunt-zone" data-testid="hunt-aim" aria-label="Drag back to draw the bow" {...handlers} />;
}

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

/** Draw ring + trajectory arrow + wind relative to the aim, anchored at the press origin. */
export function HuntAimOverlay() {
  useSyncExternalStore(subscribe, () => version);
  const wind = useGame((s) => s.wind);
  const s = session;
  if (!s) return null;
  const dx = s.x - s.ox;
  const dy = s.y - s.oy;
  const r = aimFromDrag(dx, dy);
  const drawn = s.maxDrag >= DEFAULT_AIM.cancelPx;
  const rel = windRelation(r.angle, wind.direction, wind.speed);
  const range = getServices().db.fieldActions.huntShot?.range ?? 0;
  const len = 34 + 120 * r.power;
  const ax = Math.cos(r.angle) * len;
  const ay = Math.sin(r.angle) * len;
  const windCss = worldAngleToCss(wind.direction);
  const cancelling = drawn && r.inCancelZone;
  return (
    <div className={cx('ew-aim', cancelling && 'is-cancel', rel.relation === 'tailwind' && !r.inCancelZone && 'is-upwind')} style={{ left: s.ox, top: s.oy }} aria-live="polite">
      <svg className="ew-aim__svg" width={320} height={320} viewBox="-160 -160 320 320" aria-hidden="true">
        <circle r={DEFAULT_AIM.cancelPx} className="ew-aim__cancel" />
        <circle r={RING_R} className="ew-aim__ring-bg" />
        <circle r={RING_R} className="ew-aim__ring" strokeDasharray={`${RING_C * r.draw} ${RING_C}`} transform="rotate(-90)" />
        {!r.inCancelZone && (
          <>
            <line x1={0} y1={0} x2={dx} y2={dy} className="ew-aim__string" />
            <line x1={0} y1={0} x2={ax} y2={ay} className="ew-aim__traj" />
            <polygon points="0,-9 7,6 -7,6" className="ew-aim__head" transform={`translate(${ax} ${ay}) rotate(${(worldAngleToCss(r.angle) * 180) / Math.PI})`} />
          </>
        )}
      </svg>
      <div className="ew-aim__readout">
        <span className="ew-aim__power">{cancelling ? 'Release to cancel' : r.inCancelZone ? 'Pull back to draw' : `${Math.round(r.power * 100)}% · ${Math.round(range * Math.max(0.25, r.power))} m`}</span>
        <span className={cx('ew-aim__wind', `is-${rel.relation}`)}>
          <span className="ew-aim__windarrow" style={{ transform: `rotate(${windCss}rad)` }}>
            ↑
          </span>
          {wind.speed.toFixed(1)} m/s{r.inCancelZone ? ' wind' : ` · ${HINT[rel.relation]}`}
        </span>
        {rel.relation === 'tailwind' && !r.inCancelZone && <span className="ew-aim__scent">⚠ Scent warning</span>}
      </div>
    </div>
  );
}
