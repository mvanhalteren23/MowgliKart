import * as THREE from 'three';
import { WEAPONS, SHIELDS, weaponCooldown, shieldCooldown } from '../registries/CircuitDraftRegistry.js';
import { ITEMS } from '../registries/ItemRegistry.js';
import { DRIFT_TIERS, FSM } from '../controllers/KartController.js';
import { GREEN, gaugePos } from '../core/StartSequence.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);
const W = 1024, H = 384;

/**
 * Cockpit head-up display for VR: one canvas texture on a curved-feeling panel that rides with the kart (not the head),
 * low in the view like a dashboard. Redrawn ~12x per second - a 1024x384 upload is cheap even on a Snapdragon 835.
 */
export class VRHud {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * H / W), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.position.set(0, -0.5, -1.15); this.mesh.rotation.x = -0.42; this.mesh.scale.setScalar(0.72); this.mesh.renderOrder = 998; this.mesh.frustumCulled = false; this.mesh.userData.noOutline = true;
    // big centre banner (countdown, toasts, yeti warning) floats straight ahead, further away
    this.bc = document.createElement('canvas'); this.bc.width = 1024; this.bc.height = 256; this.bg = this.bc.getContext('2d');
    this.btex = new THREE.CanvasTexture(this.bc); this.btex.colorSpace = THREE.SRGBColorSpace; this.btex.generateMipmaps = false; this.btex.minFilter = THREE.LinearFilter;
    this.banner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: this.btex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.banner.position.set(0, 0.42, -3.2); this.banner.renderOrder = 998; this.banner.frustumCulled = false; this.banner.userData.noOutline = true;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.banner);
    this.t = 0; this.toasts = []; this.lastBanner = '';
  }

  attach(rig) { if (this.group.parent !== rig) rig.add(this.group); this.group.visible = true; }
  hide() { this.group.visible = false; }

  update(session, kart, dt, vr) {
    for (const m of session.messages) if (m.human === kart.index) this.toasts.push({ text: m.text, color: m.color, big: m.big, t: 2.4 });
    if (this.toasts.length > 3) this.toasts.splice(0, this.toasts.length - 3);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.t -= dt;
    const counting = session.state === 'COUNTDOWN';
    if (this.t > 0 && !counting) return;
    this.t = 1 / 12;
    this._drawDash(session, kart);
    this._drawBanner(session, kart, vr);
  }

  _drawDash(session, kart) {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    const box = (x, y, w, h, r = 22) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fill(); };
    g.fillStyle = 'rgba(8,12,26,0.45)'; box(8, 60, W - 16, H - 68);
    g.textBaseline = 'middle';
    // rank
    g.textAlign = 'left'; g.fillStyle = '#ffd23a'; g.font = '900 150px system-ui, sans-serif'; g.fillText(String(kart.rank), 34, 205);
    const rw = g.measureText(String(kart.rank)).width;
    g.font = '800 46px system-ui, sans-serif'; g.fillText(ord(kart.rank).replace(/^\d+/, ''), 40 + rw, 160);
    g.fillStyle = '#cfd6ea'; g.font = '700 34px system-ui, sans-serif'; g.fillText('/ ' + session.karts.length, 40 + rw, 232);
    // speed
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '900 120px system-ui, sans-serif'; g.fillText(String(Math.round(kart.speed * 3.6)), W - 40, 190);
    g.fillStyle = '#9fb0d0'; g.font = '700 30px system-ui, sans-serif'; g.fillText('KM/H', W - 44, 262);
    // slots
    const lo = kart.loadout, slots = [];
    slots.push({ ic: lo.pickup ? ITEMS[lo.pickup].icon : '·', lb: 'ITEM', cd: 0, on: !!lo.pickup, col: '#66ddff' });
    if (lo.weapon) { const Wp = WEAPONS[lo.weapon.id]; slots.push({ ic: Wp.icon, lb: 'Lv' + lo.weapon.level, cd: Math.min(1, lo.weaponCd / weaponCooldown(Wp, lo.weapon.level)), on: lo.weaponCd <= 0, col: '#ff9a3c' }); } else slots.push({ ic: '—', lb: 'WEAPON', cd: 0, on: false, col: '#ff9a3c' });
    if (lo.shield) { const S = SHIELDS[lo.shield.id]; slots.push({ ic: S.icon, lb: lo.shieldActive > 0 ? 'ON!' : 'Lv' + lo.shield.level, cd: Math.min(1, lo.shieldCd / shieldCooldown(S, lo.shield.level)), on: lo.shieldCd <= 0 || lo.shieldActive > 0, col: '#8be9fd' }); } else slots.push({ ic: '—', lb: 'SHIELD', cd: 0, on: false, col: '#8be9fd' });
    { const tg = kart.lassoCd <= 0 ? kart.lassoAim : null; slots.push({ ic: '🤠', lb: tg ? '→ ' + tg.name.split(' ').pop().slice(0, 7) : 'LASSO', cd: Math.min(1, kart.lassoCd / 9), on: kart.lassoCd <= 0, col: tg ? '#44ff88' : '#d9b36a' }); }
    slots.forEach((s, i) => {
      const x = 316 + i * 100, y = 100, sz = 90;
      g.fillStyle = s.on ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'; box(x, y, sz, sz, 18);
      g.strokeStyle = s.on ? s.col : 'rgba(255,255,255,0.25)'; g.lineWidth = s.on ? 6 : 3; g.beginPath(); g.roundRect ? g.roundRect(x, y, sz, sz, 18) : g.rect(x, y, sz, sz); g.stroke();
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '52px system-ui, sans-serif'; g.fillText(s.ic, x + sz / 2, y + sz / 2 + 2);
      if (s.cd > 0) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y + sz * (1 - s.cd), sz, sz * s.cd); }
      g.fillStyle = '#cfd6ea'; g.font = '700 20px system-ui, sans-serif'; g.fillText(s.lb, x + sz / 2, y + sz + 18, sz + 8);
    });
    // drift / slipstream meters
    const drifting = kart.fsm === FSM.DRIFTING, dg = drifting ? Math.min(1, kart.drift.charge / 4) : 0, sl = Math.min(1, kart.slip.draftTimer / 1.5);
    const bar = (y, f, col, label) => { g.fillStyle = 'rgba(255,255,255,0.12)'; box(342, y, 340, 20, 10); if (f > 0) { g.fillStyle = col; box(342, y, 340 * f, 20, 10); } g.textAlign = 'left'; g.fillStyle = '#9fb0d0'; g.font = '700 18px system-ui, sans-serif'; g.fillText(label, 690, y + 11); };
    bar(252, dg, kart.drift.tier ? DRIFT_TIERS[kart.drift.tier - 1].color : '#ffe9a0', 'DRIFT');
    bar(282, sl, '#9be7ff', 'DRAFT');
    // progress along the run with every racer's dot
    const px = 40, pw = W - 80, py = 336;
    g.fillStyle = 'rgba(255,255,255,0.15)'; box(px, py - 5, pw, 10, 5);
    for (const k of session.karts) {
      const f = Math.max(0, Math.min(1, k.maxD / session.track.finishD));
      g.fillStyle = k === kart ? '#44ff88' : k.isHuman || k.remoteHuman ? '#44aaff' : '#e8ecf5';
      g.beginPath(); g.arc(px + pw * f, py, k === kart ? 12 : 7, 0, 6.283); g.fill();
    }
    // header strip: race / track / time
    const T = session.raceTime, m = Math.floor(T / 60), sec = (T % 60).toFixed(1).padStart(4, '0');
    g.textAlign = 'center'; g.fillStyle = 'rgba(8,12,26,0.62)'; box(232, 6, W - 464, 48, 20);
    g.fillStyle = '#fff'; g.font = '700 26px system-ui, sans-serif'; g.fillText(`Race ${session.cup.race}/${session.cup.of} · ${session.def.name} · ${String(m).padStart(2, '0')}:${sec}`, W / 2, 31);
    this.tex.needsUpdate = true;
  }

  _drawBanner(session, kart, vr) {
    const g = this.bg, seq = session.starts.get(kart.id), counting = session.state === 'COUNTDOWN' && seq && !session.netHold;
    let key;
    if (session.netHold) key = 'hold';
    else if (counting) key = 'c' + seq.label() + Math.round(gaugePos(seq.t) * 200) + seq.score.toFixed(1) + (seq.flash ?? '');
    else key = (session.raceTime < 1.4 ? 'DROP' : '') + (kart.finished ? 'F' + kart.rank : '') + (kart.grab ? 'G' : kart.oob ? 'O' + Math.round(kart.yetiDist) : '') + this.toasts.map((t) => t.text).join('|') + (kart.t.blind > 0 ? 'B' : '');
    if (key === this.lastBanner) return;
    this.lastBanner = key;
    g.clearRect(0, 0, 1024, 256);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const out = (text, y, size, col) => { g.font = `900 ${size}px system-ui, sans-serif`; g.lineWidth = size / 7; g.strokeStyle = 'rgba(8,10,20,0.9)'; g.lineJoin = 'round'; g.strokeText(text, 512, y, 1000); g.fillStyle = col; g.fillText(text, 512, y, 1000); };
    if (session.netHold) out('Waiting for all players…', 128, 60, '#fff');
    else if (counting) {
      out(seq.label(), 62, 110, '#fff');
      // rhythm gauge: needle sweeps, green zone = pump now
      const x = 162, w = 700, y = 140;
      g.fillStyle = 'rgba(8,12,26,0.8)'; g.fillRect(x, y, w, 34);
      g.fillStyle = seq.flash === 'bad' ? '#d33' : '#2dc26b'; g.fillRect(x + GREEN[0] * w, y, (GREEN[1] - GREEN[0]) * w, 34);
      g.fillStyle = '#fff'; g.fillRect(x + gaugePos(seq.t) * w - 4, y - 8, 8, 50);
      const xr = vr?.mode === 'xr';
      out(xr ? `Click the touchpad in the green · squeeze the trigger on DROP!   Score ${seq.score.toFixed(1)}` : `Pump in the green · gas on DROP!   Score ${seq.score.toFixed(1)}`, 218, 30, '#ffe14a');
    } else {
      let y = 128;
      if (kart.finished) { out(`FINISHED ${ord(kart.rank)}!`, 84, 96, '#ffd700'); y = 190; }
      else if (kart.grab) { out('GOT YOU!', 84, 96, '#ff5a5a'); y = 190; }
      else if (kart.oob) { out(`YETI ${Math.max(0, Math.round(kart.yetiDist - 3))} m — BACK TO THE SLOPE!`, 84, 64, '#ff5a5a'); y = 190; }
      else if (session.raceTime < 1.4) { out('DROP!', 84, 120, '#44ff88'); y = 200; }
      const t = this.toasts[this.toasts.length - 1];
      if (t) out(t.text, y, t.big ? 54 : 46, t.color);
    }
    this.btex.needsUpdate = true;
  }
  dispose() { this.tex.dispose(); this.btex.dispose(); this.mesh.geometry.dispose(); this.banner.geometry.dispose(); }
}
