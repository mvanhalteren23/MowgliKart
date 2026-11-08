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
    this.autoGas = false; this.touch = null; this.touchWanted = false;
    this.padListeners = new Set();
    // hot-plug: browsers only expose a pad after its first button press, so the event is the cue to refresh the UI
    addEventListener('gamepadconnected', (e) => { this.flash(`🎮 Controller ${e.gamepad.index + 1} connected`); this._padChanged(); });
    addEventListener('gamepaddisconnected', (e) => { this.flash(`🎮 Controller ${e.gamepad.index + 1} disconnected`); this._padChanged(); });
    this._initTouch();
  }

  _padChanged() { this._applyTouch(); for (const f of this.padListeners) f(this.padCount()); }
  onPadChange(fn) { this.padListeners.add(fn); return () => this.padListeners.delete(fn); }
  padCount() { return Math.min(4, this.pads().length); }
  /** Small transient message (controller connected, etc.). */
  flash(text) {
    let el = document.getElementById('flash');
    if (!el) { el = document.createElement('div'); el.id = 'flash'; document.body.appendChild(el); }
    el.textContent = text; el.classList.add('on'); clearTimeout(this._ft);
    this._ft = setTimeout(() => el.classList.remove('on'), 2200);
  }
  /** Rumble a pad (Chrome/Edge/Android) or buzz the phone for player 1 when no pad is attached. */
  rumble(i, strong = 0.6, weak = 0.6, ms = 180) {
    const gp = this.pads()[i];
    try {
      if (gp?.vibrationActuator?.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      else if (gp?.hapticActuators?.[0]?.pulse) gp.hapticActuators[0].pulse(strong, ms);
      else if (i === 0 && this.touch && navigator.vibrate) navigator.vibrate(ms);
    } catch { /* haptics are best-effort */ }
  }
  _applyTouch() { this.touch?.root.classList.toggle('hidden', !this.touchWanted || this.padCount() > 0); }

  /** On-screen controls for phones/tablets (player 1). Gas is automatic once the race is running (not during the push-start). */
  _initTouch() {
    if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) return;
    document.body.classList.add('touch');
    const held = { left: false, right: false, gas: false, brake: false, hop: false, item: false, weapon: false, shield: false };
    const root = document.createElement('div'); root.id = 'touch'; root.className = 'hidden';
    const defs = [['left', '◀', 'steer l'], ['right', '▶', 'steer r'], ['hop', 'DRIFT<small>hop · trick</small>', 'act big'], ['gas', 'GAS', 'act mid'], ['brake', 'BRAKE', 'act small'],
      ['item', '🎁', 'act sm2 i1'], ['weapon', '⚔', 'act sm2 i2'], ['shield', '🛡', 'act sm2 i3']];
    for (const [name, label, cls] of defs) {
      const b = document.createElement('button'); b.className = 'tb ' + cls; b.innerHTML = label; b.dataset.t = name; b.setAttribute('aria-label', name);
      const down = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); if (!held[name] && this.latch[0][name] !== undefined) this.latch[0][name] = true; held[name] = true; b.classList.add('on'); };
      const up = (e) => { e.preventDefault(); held[name] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      root.appendChild(b);
    }
    document.body.appendChild(root);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.touch = { held, root };
  }
  showTouch(on) { this.touchWanted = on; this._applyTouch(); }

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
      edge('confirm', b(0)); edge('up', b(12) || (gp.axes[1] ?? 0) < -0.6); edge('down', b(13) || (gp.axes[1] ?? 0) > 0.6); edge('start', b(9));
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
      let ax = gp.axes[GAMEPAD.axis] ?? 0;
      if (gp.mapping !== 'standard' && Math.abs(ax) < 0.05 && gp.axes.length > 6) ax = gp.axes[0]; // odd mappings: first stick axis
      // d-pad also steers (some phones' pads report it as buttons 14/15)
      if (gp.buttons[14]?.pressed) ax = -1; else if (gp.buttons[15]?.pressed) ax = 1;
      const dz = 0.1, adj = Math.abs(ax) < dz ? 0 : Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz); // dead-zone + rescale for smooth analogue steering
      if (adj !== 0) steer = Math.abs(adj) > Math.abs(steer) ? adj : steer;
      const rt = gp.buttons[7]?.value ?? 0;
      throttle = Math.max(throttle, rt, gp.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, gp.buttons[6]?.value ?? 0);
      for (const a of ACTIONS) hold[a] = hold[a] || this.padHeld[i][a];
    }
    if (i === 0 && this.touch) {
      const t = this.touch.held;
      steer += (t.right ? 1 : 0) - (t.left ? 1 : 0);
      throttle = Math.max(throttle, t.gas || (this.autoGas && !t.brake) ? 1 : 0);
      brake = Math.max(brake, t.brake ? 1 : 0);
      for (const a of ACTIONS) hold[a] = hold[a] || t[a];
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
    if (i === 0 && this.touch?.held.gas) return true;
    return (m && this.keys.has(m.up)) || (gp && ((gp.buttons[7]?.value ?? 0) > 0.3 || gp.buttons[0]?.pressed)) || false;
  }
}
