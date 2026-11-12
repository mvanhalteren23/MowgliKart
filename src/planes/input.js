import * as THREE from 'three';
import { blankInput } from './sim.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dead = (x, dz, full) => (Math.abs(x) < dz ? 0 : clamp((x - Math.sign(x) * dz) / (full - dz), -1, 1));
const ROLL_FULL = (34 * Math.PI) / 180, PITCH_FULL = (24 * Math.PI) / 180;

/**
 * One pilot's controls from whatever is connected:
 *   Pico G2 remote (VR) - held like a toy plane: roll it to bank/turn, tip it up/down to climb/dive.
 *                         Trigger = sharp turn (hold) / rocket start. Touchpad click = use item.
 *   keyboard            - arrows or WASD (up = climb), Space = sharp turn, Shift / E / Enter = item
 *   gamepad             - left stick (pull back = climb), RT or A = sharp turn, X / LB = item
 *   touch               - drag on the left half = stick; buttons on the right
 */
export class PlaneInput {
  constructor(vr) {
    this.vr = vr; this.keys = new Set(); this.useLatch = false; this.neutralPitch = null; this.invert = false;
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
    addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); if (!e.repeat && ['ShiftLeft', 'ShiftRight', 'KeyE', 'Enter'].includes(e.code)) this.useLatch = true; this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.touch = { x: 0, y: 0, sharp: false, id: null, ox: 0, oy: 0 };
    this._padPrev = false;
    this._touchUi();
  }

  _touchUi() {
    if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) return;
    const root = this.touchRoot = document.createElement('div'); root.id = 'ptouch'; root.className = 'hidden';
    root.innerHTML = '<div class="stick"><i></i></div><button data-b="sharp">SHARP<small>turn · boost</small></button><button data-b="use">ITEM</button>';
    document.body.appendChild(root);
    const stick = root.querySelector('.stick'), nub = stick.firstChild, t = this.touch;
    const move = (e) => { const r = stick.getBoundingClientRect(), R = r.width / 2; t.x = clamp((e.clientX - r.left - R) / (R * 0.8), -1, 1); t.y = clamp((e.clientY - r.top - R) / (R * 0.8), -1, 1); nub.style.transform = `translate(${t.x * R * 0.6}px, ${t.y * R * 0.6}px)`; };
    stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); move(e); });
    stick.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') move(e); });
    const up = () => { t.x = t.y = 0; nub.style.transform = ''; };
    stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
    for (const b of root.querySelectorAll('button')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (b.dataset.b === 'use') this.useLatch = true; else t.sharp = true; b.classList.add('on'); });
      const off = () => { if (b.dataset.b === 'sharp') t.sharp = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
  }
  showTouch(on) { this.touchRoot?.classList.toggle('hidden', !on || this.vr.active); }

  /** Remote pitch / roll in radians (pitch + = nose up, roll + = right side down), or null without a tracked remote. */
  remote() {
    const vr = this.vr;
    if (vr.mode !== 'xr') return null;
    const q = vr.ctrl.visible ? vr.ctrl.quaternion : vr.camera.quaternion; // no remote pose: fall back to the head
    const f = this._f.set(0, 0, -1).applyQuaternion(q), r = this._r.set(1, 0, 0).applyQuaternion(q);
    return { pitch: Math.asin(clamp(f.y, -1, 1)), roll: Math.asin(clamp(-r.y, -1, 1)) };
  }
  /** Call every frame before GO: whatever angle the remote is comfortably held at becomes "level". */
  calibrate(dt) { const r = this.remote(); if (!r) return; this.neutralPitch = this.neutralPitch == null ? r.pitch : this.neutralPitch + (r.pitch - this.neutralPitch) * Math.min(1, 3 * dt); }

  /** Fill `out` for one physics step (item press is an edge, consumed here). */
  read(out = blankInput()) {
    const k = this.keys, vr = this.vr;
    let turn = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let pitch = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    let sharp = k.has('Space'), use = this.useLatch; this.useLatch = false;
    const gp = (navigator.getGamepads?.() ?? []).find(Boolean);
    if (gp && vr.mode !== 'xr') {
      const ax = dead(gp.axes[0] ?? 0, 0.12, 1), ay = dead(gp.axes[1] ?? 0, 0.12, 1);
      if (ax) turn = ax; if (ay) pitch = ay;
      sharp = sharp || (gp.buttons[7]?.value ?? 0) > 0.3 || !!gp.buttons[0]?.pressed;
      const u = !!gp.buttons[2]?.pressed || !!gp.buttons[4]?.pressed; if (u && !this._padPrev) use = true; this._padPrev = u;
    }
    if (this.touchRoot && (this.touch.x || this.touch.y || this.touch.sharp)) { turn = this.touch.x || turn; pitch = -this.touch.y || pitch; sharp = sharp || this.touch.sharp; }
    const r = this.remote();
    if (r) {
      turn = dead(r.roll, 0.05, ROLL_FULL);
      pitch = dead(r.pitch - (this.neutralPitch ?? r.pitch), 0.04, PITCH_FULL);
      const e = vr.takeEdges();
      sharp = vr.in.trigger; if (e.click) use = true;
    }
    out.turn = clamp(turn, -1, 1); out.pitch = clamp(this.invert ? -pitch : pitch, -1, 1); out.sharp = sharp; out.use = use || out.use;
    return out;
  }
}
