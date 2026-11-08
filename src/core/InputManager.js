import { blankInput } from '../controllers/KartController.js';

const ACTIONS = ['hop', 'item', 'weapon', 'shield'];
// SPEC 3.7.4 keyboard layouts (two simultaneous local keyboard players)
const KEYMAPS = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', hop: 'Space', item: 'ShiftLeft', weapon: 'KeyE', shield: 'KeyQ' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', hop: 'Enter', item: 'ShiftRight', weapon: 'Slash', shield: 'Period' },
];
const GAMEPAD = { throttleBtn: [7, 0], brake: 6, hop: 5, item: 4, weapon: [2], shield: [1, 3], axis: 0 };

/**
 * Keyboard + Web Gamepad multiplexer. Player i reads gamepad i (if connected) merged with keyboard scheme i (i < 2).
 * "pressed" edges are latched until consumed by the next physics step so quick taps are never lost.
 */
export class InputManager {
  constructor() {
    this.keys = new Set();
    this.latch = Array.from({ length: 4 }, () => Object.fromEntries(ACTIONS.map((a) => [a, false])));
    this.padHeld = Array.from({ length: 4 }, () => Object.fromEntries(ACTIONS.map((a) => [a, false])));
    this.menuEdges = [];
    this.padPrev = Array.from({ length: 4 }, () => ({}));
    this.listeners = new Set();
    addEventListener('keydown', (e) => this._down(e));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _down(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Enter'].includes(e.code) && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      if (!(e.code === 'Enter' && e.target instanceof HTMLButtonElement) && !(e.code === 'Space' && e.target instanceof HTMLButtonElement)) e.preventDefault();
    }
    if (!e.repeat) {
      KEYMAPS.forEach((m, i) => { for (const a of ACTIONS) if (e.code === m[a]) this.latch[i][a] = true; });
      for (const fn of this.listeners) fn(e.code);
    }
    this.keys.add(e.code);
  }
  onKey(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  pads() { return (navigator.getGamepads?.() ?? []).filter(Boolean); }

  /** Call once per rendered frame: converts pad button edges to latches and records menu navigation. */
  poll() {
    this.menuEdges = [];
    const pads = this.pads();
    pads.slice(0, 4).forEach((gp, i) => {
      const b = (n) => !!gp.buttons[n]?.pressed;
      const held = {
        hop: b(GAMEPAD.hop), item: b(GAMEPAD.item), weapon: GAMEPAD.weapon.some(b), shield: GAMEPAD.shield.some(b),
      };
      for (const a of ACTIONS) { if (held[a] && !this.padHeld[i][a]) this.latch[i][a] = true; this.padHeld[i][a] = held[a]; }
      const edge = (name, val) => { if (val && !this.padPrev[i][name]) this.menuEdges.push({ player: i, name }); this.padPrev[i][name] = val; };
      edge('left', b(14) || (gp.axes[0] ?? 0) < -0.6);
      edge('right', b(15) || (gp.axes[0] ?? 0) > 0.6);
      edge('confirm', b(0));
    });
  }

  /** Current analogue/held state for player i, with pressed-edges consumed (call once per physics step). */
  read(i, out = blankInput()) {
    const k = this.keys, m = KEYMAPS[i];
    let steer = 0, throttle = 0, brake = 0;
    const hold = { hop: false, item: false, weapon: false, shield: false };
    if (m) {
      steer += (k.has(m.right) ? 1 : 0) - (k.has(m.left) ? 1 : 0);
      throttle = k.has(m.up) ? 1 : 0; brake = k.has(m.down) ? 1 : 0;
      for (const a of ACTIONS) hold[a] = k.has(m[a]);
    }
    const gp = this.pads()[i];
    if (gp) {
      const ax = gp.axes[GAMEPAD.axis] ?? 0;
      if (Math.abs(ax) > 0.12) steer = Math.abs(ax) > Math.abs(steer) ? ax : steer;
      const rt = gp.buttons[7]?.value ?? 0;
      throttle = Math.max(throttle, rt, gp.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, gp.buttons[6]?.value ?? 0);
      for (const a of ACTIONS) hold[a] = hold[a] || this.padHeld[i][a];
    }
    out.steer = Math.max(-1, Math.min(1, steer));
    out.throttle = throttle; out.brake = brake;
    for (const a of ACTIONS) {
      out[a] = hold[a];
      out[a + 'Pressed'] = this.latch[i][a];
      this.latch[i][a] = false;
    }
    return out;
  }
  /** Peek without consuming (HUD / start-sequence rhythm button). */
  throttleHeld(i) {
    const m = KEYMAPS[i], gp = this.pads()[i];
    return (m && this.keys.has(m.up)) || (gp && ((gp.buttons[7]?.value ?? 0) > 0.3 || gp.buttons[0]?.pressed)) || false;
  }
}
