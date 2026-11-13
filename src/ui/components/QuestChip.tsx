import { useEffect, useMemo, useRef } from 'react';
import { getServices, useGame } from '@/app/store';
import { runtime } from '@/app/runtime';
import { compassBearing, compassLabel, formatDistance, windArrowAngle } from '../logic/hudMath';
import { currentObjective, trackerMarker } from '../logic/questSelectors';
import { TapButton } from './common';

/** Tracked quest + objective + live compass arrow (rAF → refs), and wind for hunters. */
export function QuestChip() {
  const trackedId = useGame((s) => s.trackedQuestId);
  const log = useGame((s) => s.questLog);
  const flags = useGame((s) => s.flags);
  const leader = useGame((s) => s.leader);
  const wind = useGame((s) => s.wind);
  const toggleChronicle = useGame((s) => s.toggleChronicle);
  const { db, core } = getServices();

  const quest = trackedId ? db.quests.find((q) => q.id === trackedId) : undefined;
  const { objective, marker } = useMemo(() => {
    if (!quest) return { objective: null, marker: null };
    return { objective: currentObjective(quest, log, flags, core.quests.evaluate), marker: trackerMarker(quest, log, flags, core.quests.evaluate) };
  }, [quest, log, flags, core]);

  const arrowRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!marker) return;
    let raf = 0;
    let lastText = '';
    const tick = (): void => {
      const b = compassBearing(runtime.player, marker);
      if (arrowRef.current) arrowRef.current.style.transform = `rotate(${b.angle}rad)`;
      const text = `${formatDistance(b.distance)} ${b.distance >= 3 ? compassLabel(b.angle) : ''}`.trim();
      if (distRef.current && text !== lastText) {
        distRef.current.textContent = text;
        lastText = text;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [marker]);

  const hunter = db.heroes[leader].fieldActions.some((a) => a === 'huntShot' || a === 'huntDash');

  return (
    <div className="ew-topright">
      <TapButton className="ew-quest" data-testid="quest-chip" onTap={() => toggleChronicle(true)} aria-label="Open Chronicle">
        {marker && (
          <span className="ew-quest__compass">
            <span ref={arrowRef} className="ew-quest__arrow">
              ▲
            </span>
          </span>
        )}
        <span className="ew-quest__text">
          <span className="ew-quest__title">{quest?.title ?? 'No quest tracked'}</span>
          <span className="ew-quest__obj">{objective?.text ?? (quest ? 'Report back' : 'Open the Chronicle')}</span>
          {marker && <span ref={distRef} className="ew-quest__dist" data-testid="quest-distance" />}
        </span>
      </TapButton>
      {hunter && (
        <div className="ew-wind" data-testid="wind" aria-label={`Wind ${wind.speed.toFixed(1)} metres per second`}>
          <span className="ew-wind__arrow" style={{ transform: `rotate(${windArrowAngle(wind.direction)}rad)` }}>
            ➤
          </span>
          <span className="ew-wind__speed">{wind.speed.toFixed(1)} m/s</span>
        </div>
      )}
    </div>
  );
}

/** Small round buttons for the drawers. */
export function MenuButtons() {
  const toggleChronicle = useGame((s) => s.toggleChronicle);
  const toggleInspector = useGame((s) => s.toggleInspector);
  const toggleTownship = useGame((s) => s.toggleTownship);
  return (
    <div className="ew-menu">
      <TapButton className="ew-btn--round" data-testid="btn-chronicle" aria-label="Chronicle" onTap={() => toggleChronicle()}>
        📜
      </TapButton>
      <TapButton className="ew-btn--round" data-testid="btn-inspector" aria-label="Equipment" onTap={() => toggleInspector()}>
        ⚔
      </TapButton>
      <TapButton className="ew-btn--round" data-testid="btn-township" aria-label="Township" onTap={() => toggleTownship()}>
        🏠
      </TapButton>
    </div>
  );
}
