import { useEffect, useRef } from 'react';
import { runtime } from '@/app/runtime';
import { useGame } from '@/app/store';
import { FALLBACK_SIZE, STAMINA_FILL_ASSET, STAMINA_FRAME_ASSET } from '../assetIds';
import { gaugeMode, staminaFraction, staminaPercent } from '../logic/stamina';
import { AssetSprite } from './AssetSprite';

/**
 * Compact stamina gauge near the stick. Reads `runtime.stamina` every animation
 * frame and writes the DOM through refs (no React state per frame). Fades when
 * full and idle; pulses while exhausted.
 */
export function StaminaGauge() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastMode = '';
    let lastPct = -1;
    let lastClip = '';
    const tick = (): void => {
      const s = runtime.stamina;
      const spending = runtime.input.sprint || runtime.input.boost || useGame.getState().mountedOn !== null;
      const mode = gaugeMode(s, spending);
      const root = rootRef.current;
      if (root && mode !== lastMode) {
        root.dataset.mode = mode;
        lastMode = mode;
      }
      const clip = `inset(0 ${((1 - staminaFraction(s)) * 100).toFixed(1)}% 0 0)`;
      if (fillRef.current && clip !== lastClip) {
        fillRef.current.style.clipPath = clip;
        lastClip = clip;
      }
      const pct = staminaPercent(s);
      if (pctRef.current && pct !== lastPct) {
        pctRef.current.textContent = `${pct}%`;
        root?.setAttribute('aria-valuenow', String(pct));
        lastPct = pct;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="ew-stamina" data-testid="stamina" data-mode="idle" role="meter" aria-label="Stamina" aria-valuemin={0} aria-valuemax={100}>
      <AssetSprite className="ew-stamina__frame" assetId={STAMINA_FRAME_ASSET} fallback={FALLBACK_SIZE.staminaFrame} fit={{ maxW: 128, maxH: 24 }} />
      <span ref={fillRef} className="ew-stamina__fill">
        <AssetSprite assetId={STAMINA_FILL_ASSET} fallback={FALLBACK_SIZE.staminaFill} fit={{ maxW: 120, maxH: 16 }} />
      </span>
      <span ref={pctRef} className="ew-stamina__pct" />
    </div>
  );
}
