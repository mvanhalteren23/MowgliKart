import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { setSprint, setStickVector } from '../inputBridge';
import { isDoubleTapHold, type TapMark } from '../logic/stamina';
import { clampOrigin, computeStick, followOrigin, type Point } from '../logic/stickMath';

const RADIUS = 52;
const DEAD_ZONE = 0.14;
const MARGIN = RADIUS + 14;

/** Floating-origin virtual analog stick filling the lower-left zone. Writes via refs only. */
export function Stick() {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; origin: Point } | null>(null);
  /** Last release (for double-tap-and-hold → sprint). */
  const lastUp = useRef<TapMark | null>(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = zoneRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const place = (origin: Point | null): void => {
    const base = baseRef.current;
    if (!base) return;
    if (origin) {
      base.style.left = `${origin.x}px`;
      base.style.top = `${origin.y}px`;
      base.style.bottom = 'auto';
      base.classList.add('is-active');
    } else {
      base.style.left = '';
      base.style.top = '';
      base.style.bottom = '';
      base.classList.remove('is-active');
    }
  };

  const update = (finger: Point): void => {
    const a = active.current;
    const zone = zoneRef.current;
    if (!a || !zone) return;
    const followed = followOrigin(a.origin, finger, RADIUS * 1.35);
    if (followed !== a.origin) {
      a.origin = clampOrigin(followed, zone.clientWidth, zone.clientHeight, MARGIN);
      place(a.origin);
    }
    const v = computeStick(finger.x - a.origin.x, finger.y - a.origin.y, RADIUS, DEAD_ZONE);
    if (knobRef.current) knobRef.current.style.transform = `translate(${v.knobX}px, ${v.knobY}px)`;
    setStickVector(v.x, v.y);
  };

  const release = (finger?: Point): void => {
    if (finger && active.current) lastUp.current = { t: performance.now(), x: finger.x, y: finger.y };
    active.current = null;
    setSprint('stick', false);
    zoneRef.current?.classList.remove('is-sprinting');
    place(null);
    if (knobRef.current) knobRef.current.style.transform = '';
    setStickVector(0, 0);
  };

  useEffect(() => {
    const onBlur = (): void => release();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      setStickVector(0, 0);
      setSprint('stick', false);
    };
  }, []);

  return (
    <div
      ref={zoneRef}
      className="ew-stick-zone"
      data-testid="stick"
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (active.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const zone = zoneRef.current;
        if (!zone) return;
        const p = local(e);
        const origin = clampOrigin(p, zone.clientWidth, zone.clientHeight, MARGIN);
        active.current = { id: e.pointerId, origin };
        if (isDoubleTapHold(lastUp.current, { t: performance.now(), x: p.x, y: p.y })) {
          setSprint('stick', true);
          zone.classList.add('is-sprinting');
        }
        lastUp.current = null;
        try {
          zone.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic */
        }
        place(origin);
        update(local(e));
      }}
      onPointerMove={(e) => {
        if (active.current?.id === e.pointerId) update(local(e));
      }}
      onPointerUp={(e) => {
        if (active.current?.id === e.pointerId) release(local(e));
      }}
      onPointerCancel={(e) => {
        if (active.current?.id === e.pointerId) release();
      }}
      onLostPointerCapture={(e) => {
        if (active.current?.id === e.pointerId) release();
      }}
    >
      <div ref={baseRef} className="ew-stick">
        <div ref={knobRef} className="ew-stick__knob" />
      </div>
    </div>
  );
}
