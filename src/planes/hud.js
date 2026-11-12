import * as THREE from 'three';
import { TUNE, ITEM_ICON } from './sim.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);
const TIER = ['#ffe9a0', '#00d4ff', '#ff7700', '#ff00ea'];
const MSG = {
  go: ['GO!', '#44ff88'], startBoost: ['ROCKET START!', '#ffd700'], stall: ['ENGINE SPUTTER!', '#b0b6c0'], miniBoost: ['MINI-BOOST!', '#ff8a2a'], ring: ['BOOST RING!', '#ffd23a'],
  draft: ['SLIPSTREAM!', '#9be7ff'], hit: ['HIT!', '#ff5a5a'], blocked: ['BLOCKED!', '#7fe8ff'], scrape: ['SCRAPE!', '#ffc04a'],
};

/**
 * One HUD for every display: two canvases (instrument strip + big centre banner). In the headset they are textures on
 * panels fixed to the cockpit; on a flat screen the same canvases are simply laid over the page.
 */
export class PlaneHud {
  constructor() {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.dash = mk(768, 192); this.banner = mk(1024, 256);
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
    this.dt = tex(this.dash); this.bt = tex(this.banner);
    const mat = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.group = new THREE.Group();
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), mat(this.dt)); d.position.set(0, -0.42, -1.05); d.rotation.x = -0.38; d.renderOrder = 998;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), mat(this.bt)); b.position.set(0, 0.5, -3.4); b.renderOrder = 998;
    this.group.add(d, b); d.frustumCulled = b.frustumCulled = false;
    this.dom = document.createElement('div'); this.dom.id = 'phud'; this.dom.append(this.banner, this.dash);
    this.toasts = []; this.t = 0; this.key = '';
  }
  /** VR: parent the panels to the rig. Flat: show the canvases as an overlay. */
  mount(vrRig) { if (vrRig) { vrRig.add(this.group); this.dom.remove(); } else { this.group.removeFromParent(); if (!this.dom.parentNode) document.body.appendChild(this.dom); } this.vrMode = !!vrRig; }
  unmount() { this.group.removeFromParent(); this.dom.remove(); }
  say(text, color = '#fff', big = false) { this.toasts.push({ text, color, big, t: 1.8 }); if (this.toasts.length > 2) this.toasts.shift(); }
  onEvent(e, me, race) {
    if (e.type === 'go') { this.say(...MSG.go, true); return; }
    if (e.id !== me?.id) return;
    if (MSG[e.type]) this.say(...MSG[e.type]);
    else if (e.type === 'lap') this.say(e.lap === race.course.laps ? 'FINAL LAP!' : `LAP ${e.lap} / ${race.course.laps}`, '#ffd23a', true);
    else if (e.type === 'pickup') this.say(`${ITEM_ICON[e.item]} ${e.item.toUpperCase()}`, '#66ddff');
    else if (e.type === 'finish') this.say(`FINISHED ${ord(me.rank)}!`, '#ffd700', true);
  }

  update(race, me, dt, hint = '') {
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.t -= dt;
    if (this.t > 0 || !me) return;
    this.t = 0.1;
    // ---- instrument strip
    let g = this.dash.getContext('2d'); const W = 768, H = 192;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,12,26,0.5)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, W - 8, H - 8, 24) : g.rect(4, 4, W - 8, H - 8); g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ffd23a'; g.font = '900 110px system-ui, sans-serif'; g.fillText(String(me.rank), 26, 92);
    const rw = g.measureText(String(me.rank)).width;
    g.font = '800 34px system-ui, sans-serif'; g.fillText(ord(me.rank).replace(/^\d+/, ''), 30 + rw, 62);
    g.fillStyle = '#cfd6ea'; g.font = '700 26px system-ui, sans-serif'; g.fillText('/ ' + race.planes.length, 30 + rw, 112);
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 34px system-ui, sans-serif';
    g.fillText(`LAP ${Math.min(race.course.laps, Math.max(1, me.lap + 1))}/${race.course.laps}`, 300, 52);
    // item slot
    g.strokeStyle = me.item ? '#66ddff' : 'rgba(255,255,255,0.3)'; g.lineWidth = me.item ? 6 : 3; g.fillStyle = 'rgba(255,255,255,0.1)';
    g.beginPath(); g.roundRect ? g.roundRect(396, 22, 104, 104, 18) : g.rect(396, 22, 104, 104); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '64px system-ui, sans-serif'; g.fillText(me.item ? ITEM_ICON[me.item] : '·', 448, 78);
    if (me.shield > 0) { g.fillStyle = '#7fe8ff'; g.font = '800 22px system-ui, sans-serif'; g.fillText('🛡 ' + Math.ceil(me.shield) + 's', 448, 146); }
    // speed
    g.textAlign = 'right'; g.fillStyle = me.boosting ? '#ffb03a' : '#fff'; g.font = '900 84px system-ui, sans-serif'; g.fillText(String(Math.round(me.speed * 3.6)), W - 28, 74);
    g.fillStyle = '#9fb0d0'; g.font = '700 22px system-ui, sans-serif'; g.fillText('KM/H', W - 30, 126);
    // sharp-turn charge bar with the three tier marks
    const bx = 196, bw = 320, by = 156, f = Math.min(1, me.charge / TUNE.charge[2]);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, by, bw, 16);
    if (f > 0) { g.fillStyle = TIER[me.tier]; g.fillRect(bx, by, bw * f, 16); }
    g.fillStyle = '#fff'; for (const c of TUNE.charge) g.fillRect(bx + bw * (c / TUNE.charge[2]) - 2, by - 4, 3, 24);
    // lap progress with every plane as a dot
    const px = 540, pw = 200, py = 164;
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(px, py - 3, pw, 6);
    for (const p of race.planes) { g.fillStyle = p === me ? '#44ff88' : p.human ? '#44aaff' : '#e8ecf5'; g.beginPath(); g.arc(px + pw * (p.d / race.course.length), py, p === me ? 9 : 5, 0, 6.283); g.fill(); }
    this.dt.needsUpdate = true;
    // ---- banner (only redrawn when its content changes)
    const counting = race.state === 'COUNT', top = this.toasts[this.toasts.length - 1];
    const wrong = race.state === 'RACE' && !me.finished && Math.cos(me.yaw - me.trackYaw) < -0.2;
    const key = race.state === 'GRID' ? 'grid' : counting ? 'c' + Math.ceil(race.count) : (me.finished ? 'F' + me.rank : '') + (wrong ? 'W' : '') + (top ? top.text : '') + hint;
    if (key === this.key) return;
    this.key = key;
    g = this.banner.getContext('2d'); g.clearRect(0, 0, 1024, 256); g.textAlign = 'center'; g.textBaseline = 'middle';
    const out = (text, y, size, col) => { g.font = `900 ${size}px system-ui, sans-serif`; g.lineJoin = 'round'; g.lineWidth = size / 6; g.strokeStyle = 'rgba(8,10,20,0.9)'; g.strokeText(text, 512, y, 1000); g.fillStyle = col; g.fillText(text, 512, y, 1000); };
    if (race.state === 'GRID') out('Waiting for all pilots…', 128, 60, '#fff');
    else if (counting) { out(String(Math.max(1, Math.ceil(race.count))), 96, 150, '#fff'); out(hint || 'Squeeze the trigger just before GO for a rocket start', 214, 30, '#ffe14a'); }
    else {
      let y = 128;
      if (me.finished) { out(`FINISHED ${ord(me.rank)}!`, 84, 96, '#ffd700'); y = 196; } else if (wrong) { out('WRONG WAY', 84, 90, '#ff5a5a'); y = 196; }
      if (top) out(top.text, y, top.big ? 84 : 52, top.color);
    }
    this.bt.needsUpdate = true;
  }
}
