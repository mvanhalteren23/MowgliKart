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
import './hud.css';

/**
 * Root HUD overlay. Mounted above the WebGL canvas once services are bound.
 * The root is `pointer-events: none`; only controls opt back in.
 */
export function Hud() {
  const mode = useGame((s) => s.mode);
  const chronicleOpen = useGame((s) => s.ui.chronicleOpen);
  const inspectorOpen = useGame((s) => s.ui.inspectorOpen);
  const townshipOpen = useGame((s) => s.ui.townshipOpen);
  const drawerOpen = chronicleOpen || inspectorOpen || townshipOpen;
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

  return (
    <div className="ew-hud" data-mode={mode} data-testid="hud">
      {overworld && !drawerOpen && <Stick />}
      {overworld && !drawerOpen && canHunt && <HuntZone />}
      {overworld && <PartyRail />}
      {(overworld || mode === 'dialogue') && <QuestChip />}
      {overworld && <MenuButtons />}
      {overworld && <ActionCluster />}
      {overworld && canHunt && <HuntAimOverlay />}
      {mode === 'combat' && <CombatHud />}
      {mode === 'dialogue' && <DialogueBox />}
      {mode === 'fishing' && <FishingHud />}
      {overworld && chronicleOpen && <Chronicle />}
      {overworld && inspectorOpen && <Inspector />}
      {overworld && townshipOpen && <TownshipPanel />}
      <Toasts />
      <PerfChip />
      <RotateVeil />
    </div>
  );
}
