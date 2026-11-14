import { useEffect } from 'react';
import { getServices, useGame } from '@/app/store';
import { resetAllInput, setMovementBlocked } from './inputBridge';
import { useKeyboard } from './useKeyboard';
import { ActionCluster } from './components/ActionCluster';
import { Chronicle } from './components/Chronicle';
import { CombatHud } from './components/CombatHud';
import { DialogueBox } from './components/DialogueBox';
import { FishingHud } from './components/FishingHud';
import { HuntAimOverlay, HuntZone } from './components/HuntAim';
import { Inspector } from './components/Inspector';
import { PerfChip, RotateVeil, Toasts } from './components/Overlays';
import { PartyRail } from './components/PartyRail';
import { MenuButtons, QuestChip } from './components/QuestChip';
import { Stick } from './components/Stick';
import { TownshipPanel } from './components/TownshipPanel';
import { MoveControls } from './components/MoveControls';
import { StaminaGauge } from './components/Stamina';
import { FlightBanner, TravelMap } from './components/TravelMap';
import { useUiLocal } from './uiLocal';
import './hud.css';
import './phase3.css';

/**
 * Root HUD overlay. Mounted above the WebGL canvas once services are bound.
 * The root is `pointer-events: none`; only controls opt back in.
 */
export function Hud() {
  const mode = useGame((s) => s.mode);
  const chronicleOpen = useGame((s) => s.ui.chronicleOpen);
  const inspectorOpen = useGame((s) => s.ui.inspectorOpen);
  const townshipOpen = useGame((s) => s.ui.townshipOpen);
  const mapOpen = useUiLocal((s) => s.mapOpen);
  const setMapOpen = useUiLocal((s) => s.setMapOpen);
  const drawerOpen = chronicleOpen || inspectorOpen || townshipOpen || mapOpen;
  const overworld = mode === 'overworld';
  const blocked = !overworld || drawerOpen;
  const canHunt = useGame((s) => {
    try {
      return getServices().db.heroes[s.leader].fieldActions.includes('huntShot');
    } catch {
      return false;
    }
  });

  useKeyboard();
  useEffect(() => setMovementBlocked(blocked), [blocked]);
  useEffect(() => () => resetAllInput(), []);
  // The map is a HUD-local sheet: close it when another drawer opens or the mode changes.
  useEffect(() => {
    if (!overworld || chronicleOpen || inspectorOpen || townshipOpen) setMapOpen(false);
  }, [overworld, chronicleOpen, inspectorOpen, townshipOpen, setMapOpen]);

  return (
    <div className="ew-hud" data-mode={mode} data-testid="hud">
      {overworld && !drawerOpen && <Stick />}
      {overworld && !drawerOpen && canHunt && <HuntZone />}
      {overworld && <PartyRail />}
      {(overworld || mode === 'dialogue') && <QuestChip />}
      {overworld && <MenuButtons />}
      {overworld && <ActionCluster />}
      {overworld && <StaminaGauge />}
      {overworld && !drawerOpen && <MoveControls />}
      {overworld && <FlightBanner />}
      {overworld && canHunt && <HuntAimOverlay />}
      {mode === 'combat' && <CombatHud />}
      {mode === 'dialogue' && <DialogueBox />}
      {mode === 'fishing' && <FishingHud />}
      {overworld && chronicleOpen && <Chronicle />}
      {overworld && inspectorOpen && <Inspector />}
      {overworld && townshipOpen && <TownshipPanel />}
      {overworld && mapOpen && <TravelMap />}
      <Toasts />
      <PerfChip />
      <RotateVeil />
    </div>
  );
}
