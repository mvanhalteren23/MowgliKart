import { useEffect } from 'react';
import { getServices, useGame } from '@/app/store';
import { clearMoveKeys, pressReel, releaseReel, setMoveKey } from './inputBridge';
import { visibleChoices } from './components/DialogueBox';

const MOVE: Readonly<Record<string, 'left' | 'right' | 'up' | 'down'>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * Desktop keyboard: WASD/arrows move, Space/Enter context action (advance
 * dialogue, hold-to-reel while fishing, continue after combat), Q/E cycle
 * leader, 1–3 swap (or pick a dialogue choice), F field action, C chronicle,
 * I inspector, T township, Esc closes drawers.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = MOVE[e.code];
      if (dir) {
        setMoveKey(dir, true);
        e.preventDefault();
        return;
      }
      const st = useGame.getState();
      const isAction = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
      if (isAction) e.preventDefault();

      if (st.mode === 'fishing') {
        if (isAction) {
          const phase = st.fishing?.phase;
          if (phase === 'landed' || phase === 'escaped') {
            if (!e.repeat) st.endFishing();
          } else pressReel();
        } else if (e.code === 'Escape') st.endFishing();
        return;
      }
      if (e.repeat) return;

      if (st.mode === 'dialogue') {
        const choices = visibleChoices(st);
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit && choices.length > 0) {
          const c = choices[Number(digit[1]) - 1];
          if (c) st.advanceDialogue(c.id);
        } else if (isAction && choices.length === 0) st.advanceDialogue();
        return;
      }
      if (st.mode === 'combat') {
        const ph = st.combat?.phase;
        if (isAction && (ph === 'victory' || ph === 'defeat' || ph === 'fled')) st.endCombat();
        return;
      }
      if (st.mode !== 'overworld') return;

      const drawer = st.ui.chronicleOpen || st.ui.inspectorOpen || st.ui.townshipOpen;
      switch (e.code) {
        case 'Escape':
          if (st.ui.chronicleOpen) st.toggleChronicle(false);
          if (st.ui.inspectorOpen) st.toggleInspector(false);
          if (st.ui.townshipOpen) st.toggleTownship(false);
          return;
        case 'KeyC':
          st.toggleChronicle();
          return;
        case 'KeyI':
          st.toggleInspector();
          return;
        case 'KeyT':
          st.toggleTownship();
          return;
      }
      if (drawer) return;
      switch (e.code) {
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          st.triggerContextAction();
          return;
        case 'KeyQ':
          st.cycleLeader(-1);
          return;
        case 'KeyE':
          st.cycleLeader(1);
          return;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3': {
          const h = st.party[Number(e.code.slice(5)) - 1];
          if (h) st.setLeader(h);
          return;
        }
        case 'KeyF': {
          const actions = getServices().db.heroes[st.leader].fieldActions.filter((a) => a !== 'none');
          // Fishing only makes sense at a spot; otherwise prefer the secondary action.
          const pick = actions.find((a) => a !== 'fish' || st.contextAction?.kind === 'fish') ?? actions[0];
          if (pick) st.performFieldAction(pick);
          return;
        }
      }
    };
    const onUp = (e: KeyboardEvent): void => {
      const dir = MOVE[e.code];
      if (dir) setMoveKey(dir, false);
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') releaseReel();
    };
    const onBlur = (): void => {
      clearMoveKeys();
      releaseReel();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);
}
