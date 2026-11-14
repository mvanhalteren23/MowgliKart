import { useEffect, useRef } from 'react';
import { getServices, useGame } from '@/app/store';
import { consumeReelInput, pressReel, releaseReel, setCrankSource, tapReel } from '../inputBridge';
import { CRANK_IDLE, DEFAULT_CRANK, crankHolding, crankStart, crankStep, crankVelocityAt, type CrankState } from '../logic/gestureMath';
import { lastCast } from './CastPad';
import { Bar, TapButton, cx } from './common';

const PHASE_TEXT = {
  waiting: 'Waiting for a bite…',
  bite: 'BITE! Crank or tap to hook!',
  reeling: 'Crank to reel — ease off before it snaps',
  landed: '',
  escaped: '',
} as const;

/** Drives `fishingInput` every animation frame while a session is live. */
function useFishingLoop(live: boolean, onFrame: (now: number) => void): void {
  const frame = useRef(onFrame);
  frame.current = onFrame;
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const st = useGame.getState();
      const phase = st.fishing?.phase;
      frame.current(now);
      if (st.mode === 'fishing' && phase && phase !== 'landed' && phase !== 'escaped') {
        st.fishingInput(consumeReelInput(), dt);
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      releaseReel();
    };
  }, [live]);
}

/** Circular crank pad (`fishing-crank`): angular speed above a threshold = holding the reel. */
function CrankPad({ bite }: { bite: boolean }) {
  const padRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const crank = useRef<CrankState>(CRANK_IDLE);
  const pointer = useRef<number | null>(null);
  const biteRef = useRef(bite);
  biteRef.current = bite;

  useEffect(() => {
    setCrankSource(() => pointer.current !== null && crankHolding(crank.current, performance.now()));
    let raf = 0;
    const paint = (): void => {
      const now = performance.now();
      const v = pointer.current !== null ? crankVelocityAt(crank.current, now) : 0;
      const frac = Math.min(1, Math.abs(v) / (DEFAULT_CRANK.holdThreshold * 2));
      if (speedRef.current) {
        speedRef.current.style.setProperty('--spd', `${frac * 360}deg`);
        speedRef.current.classList.toggle('is-holding', Math.abs(v) >= DEFAULT_CRANK.holdThreshold);
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(raf);
      setCrankSource(null);
    };
  }, []);

  const rel = (e: { clientX: number; clientY: number }): { dx: number; dy: number } => {
    const r = padRef.current?.getBoundingClientRect();
    return r ? { dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) } : { dx: 0, dy: 0 };
  };
  const end = (): void => {
    pointer.current = null;
    crank.current = CRANK_IDLE;
  };

  return (
    <div
      ref={padRef}
      className={cx('ew-btn', 'ew-crank', bite && 'is-bite')}
      data-testid="fishing-crank"
      role="slider"
      aria-label="Crank in circles to reel"
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        const { dx, dy } = rel(e);
        crank.current = crankStart(dx, dy, e.timeStamp);
        if (biteRef.current) tapReel();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic */
        }
      }}
      onPointerMove={(e) => {
        if (pointer.current !== e.pointerId) return;
        const { dx, dy } = rel(e);
        const before = crank.current;
        crank.current = crankStep(before, dx, dy, e.timeStamp);
        // The first motion during a bite counts as the hook tap.
        if (!before.moved && crank.current.moved && biteRef.current) tapReel();
        if (handleRef.current && crank.current.angle !== null) handleRef.current.style.transform = `rotate(${crank.current.angle}rad)`;
      }}
      onPointerUp={(e) => {
        if (pointer.current === e.pointerId) end();
      }}
      onPointerCancel={(e) => {
        if (pointer.current === e.pointerId) end();
      }}
      onLostPointerCapture={(e) => {
        if (pointer.current === e.pointerId) end();
      }}
    >
      <div ref={speedRef} className="ew-crank__speed" aria-hidden="true" />
      <div ref={handleRef} className="ew-crank__arm" aria-hidden="true">
        <span className="ew-crank__knob" />
      </div>
      <span className="ew-crank__label">⟳ Crank</span>
    </div>
  );
}

export function FishingHud() {
  const session = useGame((s) => s.fishing);
  const endFishing = useGame((s) => s.endFishing);
  const done = session?.phase === 'landed' || session?.phase === 'escaped';
  const tensionRef = useRef<HTMLDivElement>(null);
  useFishingLoop(!!session && !done, () => {
    const t = useGame.getState().fishing?.tension ?? 0;
    tensionRef.current?.classList.toggle('is-snapping', t > 0.88);
  });
  if (!session) return null;
  const { db, systems } = getServices();

  if (done) {
    const result = session.phase === 'landed' ? systems.fishing.result(session) : null;
    return (
      <div className="ew-result-root">
        <section className={cx('ew-result', result ? 'is-victory' : 'is-fled')} data-testid="fishing-result">
          <h2>{result ? 'Landed!' : 'Got away'}</h2>
          {result ? (
            <>
              <p className="ew-strong">
                🐟 {result.fish.name} <span className={cx('ew-badge', `ew-badge--${result.fish.rarity}`)}>{result.fish.rarity}</span>
              </p>
              {result.summonsMerchant && <p>A Brinefolk barge stirs beneath the surface…</p>}
            </>
          ) : (
            <p>The line goes slack.</p>
          )}
          <TapButton className="ew-btn--primary" data-testid="fishing-done" onTap={endFishing}>
            Continue
          </TapButton>
        </section>
      </div>
    );
  }

  const spot = db.world.fishingSpots.find((s) => s.id === session.spotId);
  const danger = session.tension > 0.8;
  return (
    <div className="ew-fishing" data-testid="fishing-hud" data-phase={session.phase}>
      <div className="ew-fishing__panel">
        <div className="ew-fishing__spot">
          {spot?.name ?? 'Fishing'}
          {lastCast.quality !== null && (
            <span className="ew-badge" data-testid="fishing-cast-quality">
              {lastCast.label} cast · {Math.round(lastCast.quality * 100)}%
            </span>
          )}
        </div>
        <div className={cx('ew-fishing__phase', session.phase === 'bite' && 'is-bite')}>{PHASE_TEXT[session.phase]}</div>
        <div ref={tensionRef} className={cx('ew-meter', danger && 'is-danger')}>
          <span className="ew-label">Tension</span>
          <Bar value={session.tension} max={1} tone="tension" />
        </div>
        <div className="ew-meter">
          <span className="ew-label">Progress</span>
          <Bar value={session.progress} max={1} tone="progress" />
        </div>
        <TapButton className="ew-btn--pill" data-testid="fishing-leave" onTap={endFishing}>
          Reel up & leave
        </TapButton>
      </div>
      <div className="ew-fishing__controls">
        <button
          type="button"
          className={cx('ew-btn', 'ew-reel', session.phase === 'bite' && 'is-bite')}
          data-testid="fishing-reel"
          aria-label="Hold to reel"
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* synthetic */
            }
            e.currentTarget.dataset.pressed = '1';
            pressReel();
          }}
          onPointerUp={(e) => {
            delete e.currentTarget.dataset.pressed;
            releaseReel();
          }}
          onPointerCancel={(e) => {
            delete e.currentTarget.dataset.pressed;
            releaseReel();
          }}
          onLostPointerCapture={() => releaseReel()}
        >
          <span className="ew-context__glyph">🎣</span>
          <span className="ew-context__label">{session.phase === 'bite' ? 'HOOK!' : 'Hold'}</span>
        </button>
        <CrankPad bite={session.phase === 'bite'} />
      </div>
    </div>
  );
}
