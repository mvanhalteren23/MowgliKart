import { useEffect } from 'react';
import { getServices, useGame } from '@/app/store';
import { consumeReelInput, pressReel, releaseReel } from '../inputBridge';
import { Bar, TapButton, cx } from './common';

const PHASE_TEXT = { waiting: 'Waiting for a bite…', bite: 'BITE! Tap to hook!', reeling: 'Hold to reel — ease off before it snaps', landed: '', escaped: '' } as const;

/** Drives `fishingInput` every animation frame while a session is live. */
function useFishingLoop(live: boolean): void {
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const st = useGame.getState();
      const phase = st.fishing?.phase;
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

export function FishingHud() {
  const session = useGame((s) => s.fishing);
  const endFishing = useGame((s) => s.endFishing);
  const done = session?.phase === 'landed' || session?.phase === 'escaped';
  useFishingLoop(!!session && !done);
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
        <div className="ew-fishing__spot">{spot?.name ?? 'Fishing'}</div>
        <div className={cx('ew-fishing__phase', session.phase === 'bite' && 'is-bite')}>{PHASE_TEXT[session.phase]}</div>
        <div className={cx('ew-meter', danger && 'is-danger')}>
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
        <span className="ew-context__label">{session.phase === 'bite' ? 'HOOK!' : 'Reel'}</span>
      </button>
    </div>
  );
}
