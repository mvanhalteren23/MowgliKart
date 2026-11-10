import * as THREE from 'three';

const W = 1280, H = 800, PW = 2.5, PH = (PW * H) / W;
const V = THREE.Vector3;
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const txt = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * In-headset menus. The game's menus are ordinary DOM screens (#ui); inside an immersive session the DOM is invisible,
 * so this mirrors whatever screen is showing onto a canvas panel and turns the remote into a laser pointer:
 * point + trigger "clicks" the real DOM element. One code path for desktop, phone and VR menus.
 */
export class VRPanel {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, fog: false, toneMapped: false }));
    this.mesh.userData.noOutline = true; this.mesh.renderOrder = 997;
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, fog: false })); this.dot.renderOrder = 999; this.dot.visible = false;
    this.mesh.add(this.dot);
    this.regions = []; this.hover = null; this.dirty = true; this.empty = true;
    new MutationObserver(() => { this.dirty = true; }).observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    this._o = new V(); this._d = new V(); this._p = new V(); this._n = new V(); this._c = new V();
  }

  /** Per frame: redraw if the DOM changed, aim the pointer, click on trigger. Returns true while a menu is showing. */
  update(vr) {
    if (this.dirty) { this.dirty = false; this._draw(); }
    this.mesh.visible = !this.empty;
    vr.laser.visible = vr.mode === 'xr' && !this.empty && vr.ctrl.visible;
    if (this.empty) { this.dot.visible = false; vr.takeSelect(); return false; }
    // ray vs panel plane
    vr.ray(this._o, this._d);
    this.mesh.updateWorldMatrix(true, false);
    this._c.setFromMatrixPosition(this.mesh.matrixWorld); this._n.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
    const den = this._d.dot(this._n); let hit = null;
    if (Math.abs(den) > 1e-4) {
      const t = this._c.clone().sub(this._o).dot(this._n) / den;
      if (t > 0) {
        this._p.copy(this._o).addScaledVector(this._d, t); this.mesh.worldToLocal(this._p);
        if (Math.abs(this._p.x) <= PW / 2 && Math.abs(this._p.y) <= PH / 2) {
          this.dot.position.set(this._p.x, this._p.y, 0.002); this.dot.visible = true; vr.laser.scale.z = t;
          const x = (this._p.x / PW + 0.5) * W, y = (0.5 - this._p.y / PH) * H;
          hit = this.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;
        } else this.dot.visible = false;
      }
    }
    if (hit?.el !== this.hover?.el) { this.hover = hit; this._draw(); if (hit) vr.rumble(0.25, 20); }
    if (vr.takeSelect() && this.hover) this._activate(this.hover.el);
    return true;
  }

  _activate(el) {
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); this.dirty = true; } else el.click();
  }

  /* ------------------------------------------------------------------ drawing */
  _btn(el, x, y, w, h, label, { sel = false, fs = 28, sub = '', icon = '', primary = false, dim = false } = {}) {
    const g = this.g, hov = this.hover?.el === el;
    g.fillStyle = primary ? (hov ? '#ffe066' : '#ffd23a') : sel ? '#2f8de0' : hov ? '#3a4672' : '#222a48';
    g.globalAlpha = dim ? 0.4 : 1;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 14) : g.rect(x, y, w, h); g.fill();
    g.lineWidth = hov ? 5 : 2; g.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.25)'; g.stroke();
    g.fillStyle = primary ? '#1a1300' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (icon) { g.font = `${Math.min(h * 0.34, 84)}px system-ui, sans-serif`; g.fillText(icon, x + w / 2, y + h * 0.3); }
    g.font = `800 ${fs}px system-ui, sans-serif`;
    if (sub) { g.fillText(label, x + w / 2, y + (icon ? h * 0.58 : h * 0.36), w - 16); g.font = `500 ${Math.round(fs * 0.68)}px system-ui, sans-serif`; g.fillStyle = primary ? '#3a2c00' : '#b9c4e4'; this._wrap(sub, x + w / 2, y + (icon ? h * 0.7 : h * 0.66), w - 24, Math.round(fs * 0.82), icon ? 3 : 2); } else g.fillText(label, x + w / 2, y + h / 2 + 1, w - 16);
    g.globalAlpha = 1;
    if (!dim) this.regions.push({ el, x, y, w, h });
  }
  _wrap(text, cx, y, maxW, lh, maxLines) {
    const g = this.g, words = text.split(' '); let line = '', n = 0;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(n === maxLines - 1 ? short(line + ' ' + w, line.length + 2) : line, cx, y + n * lh); n++; line = w; if (n >= maxLines) return; } else line = t;
    }
    if (line && n < maxLines) g.fillText(line, cx, y + n * lh);
  }

  _draw() {
    const g = this.g, root = this.root;
    this.regions = [];
    g.clearRect(0, 0, W, H);
    this.empty = root.classList.contains('hidden') || !root.firstElementChild;
    if (this.empty) { this.tex.needsUpdate = true; return; }
    g.fillStyle = 'rgba(10,14,30,0.9)'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, H, 36) : g.rect(0, 0, W, H); g.fill();
    g.strokeStyle = '#3d4a80'; g.lineWidth = 6; g.stroke();
    const title = txt(root.querySelector('h1, h2'));
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd23a'; g.font = '900 48px system-ui, sans-serif';
    if (title) g.fillText(title, W / 2, 56, W - 60);
    if (root.classList.contains('draft')) this._drawDraft();
    else if (root.classList.contains('standings')) this._drawStandings();
    else this._drawGeneric();
    this.tex.needsUpdate = true;
  }

  _drawDraft() {
    const g = this.g, root = this.root;
    const panel = root.querySelector('.dpanel'); if (!panel) return;
    g.fillStyle = '#cfd6ea'; g.font = '600 26px system-ui, sans-serif'; g.fillText(txt(panel.querySelector('.dname')), W / 2, 108, W - 80);
    const cards = [...panel.querySelectorAll('.card')], cw = 380, gap = 26, x0 = (W - (cw * 3 + gap * 2)) / 2;
    cards.forEach((c, i) => {
      const picked = c.classList.contains('picked'), dim = c.classList.contains('dim');
      this._btn(c, x0 + i * (cw + gap), 140, cw, 560, txt(c.querySelector('h3')), { icon: txt(c.querySelector('.big')), sub: `${txt(c.querySelector('.cat'))} ${txt(c.querySelector('p'))} — ${txt(c.querySelector('.tagline'))}`, sel: picked, dim, fs: 30 });
      if (picked) { g.fillStyle = '#44ff88'; g.font = '900 34px system-ui, sans-serif'; g.fillText('SELECTED ✔', x0 + i * (cw + gap) + cw / 2, 668); }
    });
    g.fillStyle = '#9fb0d0'; g.font = '600 26px system-ui, sans-serif'; g.fillText('Point at a card and pull the trigger', W / 2, 748);
  }

  _drawStandings() {
    const g = this.g, root = this.root;
    const sub = txt(root.querySelector('.champ, .tag'));
    g.fillStyle = '#cfd6ea'; g.font = '600 28px system-ui, sans-serif'; g.fillText(sub, W / 2, 104, W - 80);
    const rows = [...root.querySelectorAll('table.stand tr')].slice(1, 9);
    rows.forEach((tr, i) => {
      const td = [...tr.children].map(txt), y = 150 + i * 60, human = tr.classList.contains('human');
      g.fillStyle = human ? 'rgba(68,255,136,0.16)' : i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'; g.fillRect(90, y - 26, W - 180, 52);
      g.fillStyle = human ? '#8dffb5' : '#fff'; g.font = '700 30px system-ui, sans-serif';
      g.textAlign = 'left'; g.fillText(td[0], 112, y); g.fillText(short(td[1], 22), 180, y);
      g.fillStyle = '#9fb0d0'; g.fillText('this race: ' + td[3], 620, y);
      g.textAlign = 'right'; g.fillStyle = '#ffd23a'; g.fillText(td[td.length - 1] + ' pts', W - 112, y);
    });
    g.textAlign = 'center';
    const next = root.querySelector('[data-next]');
    if (next) this._btn(next, W / 2 - 300, 668, 600, 92, txt(next), { primary: true, fs: 36 });
  }

  /** Any other screen (lobby, rooms, loading): headline text + every control, flowed in rows by DOM parent. */
  _drawGeneric() {
    const g = this.g, root = this.root;
    let y = 104;
    const line = (s, col = '#cfd6ea', fs = 28) => { if (!s) return; g.fillStyle = col; g.font = `600 ${fs}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(s, W / 2, y + fs / 2, W - 80); y += fs + 14; };
    for (const p of root.querySelectorAll('.loading p, p.tag, p.vrline, .roomcode')) line(txt(p), p.classList.contains('roomcode') ? '#44ff88' : '#cfd6ea', p.classList.contains('roomcode') ? 64 : 28);
    const groups = new Map();
    for (const el of root.querySelectorAll('button, select, input[type=checkbox]')) {
      if (el.closest('details, [data-vr-hide]') || el.disabled) continue;
      const row = el.closest('.row, .kartpick, .kidpick, .chk, .vrrow') ?? el.parentElement;
      if (!groups.has(row)) groups.set(row, []);
      groups.get(row).push(el);
    }
    const primaries = [];
    for (const [row, els] of groups) {
      const lead = txt(row.querySelector(':scope > b, :scope > span'));
      const items = [];
      for (const el of els) {
        if (el.classList.contains('go')) { primaries.push(el); continue; }
        let label = el.dataset.vr ?? (el.tagName === 'SELECT' ? `${el.options[el.selectedIndex]?.text ?? ''}  ▸` : el.type === 'checkbox' ? `${el.checked ? '☑' : '☐'} ${short(txt(el.parentElement), 44)}` : txt(el.querySelector('b')) || txt(el));
        label = short(label, 40);
        g.font = '800 24px system-ui, sans-serif';
        items.push({ el, label, w: Math.max(84, g.measureText(label).width + 36), sel: el.classList.contains('sel') });
      }
      if (!items.length) continue;
      const h = 52, x0 = lead ? 250 : 60; let x = x0;
      if (y + h > H - 118) break;
      if (lead) { g.fillStyle = '#9fb0d0'; g.font = '700 23px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(short(lead, 15), 60, y + h / 2); }
      for (const it of items) {
        if (x + it.w > W - 50 && x > x0) { x = x0; y += h + 8; }
        this._btn(it.el, x, y, it.w, h, it.label, { sel: it.sel, fs: 24 });
        x += it.w + 10;
      }
      y += h + 9;
    }
    primaries.slice(0, 2).forEach((el, i, arr) => { const w = arr.length > 1 ? 520 : 640; this._btn(el, W / 2 - (arr.length * (w + 20) - 20) / 2 + i * (w + 20), H - 104, w, 80, short(txt(el), 30), { primary: true, fs: 32 }); });
  }
}

/** A calm place to stand between races: sky dome, snowy disc, the menu panel floating in front of you. */
export class VRRoom {
  constructor(panel) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7fb6ea);
    this.scene.fog = new THREE.Fog(0xbfdcf5, 14, 60);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x6f7f9a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(3, 6, 2); this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 24, 24), new THREE.MeshLambertMaterial({ color: 0xf2f7ff })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.25; this.scene.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a })); ring.rotation.x = -Math.PI / 2; ring.position.y = -1.24; this.scene.add(ring);
    for (let i = 0; i < 26; i++) { // a ring of little firs so the room has depth cues
      const a = (i / 26) * Math.PI * 2 + 0.2, r = 9 + (i % 4) * 2.2, s = 1 + (i % 3) * 0.5;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 3 * s, 7), new THREE.MeshToonMaterial({ color: i % 2 ? 0x2f6f4a : 0x3b8a5a }));
      t.position.set(Math.sin(a) * r, -1.25 + 1.5 * s, -Math.cos(a) * r); this.scene.add(t);
    }
    this.panel = panel;
    this.prop = null; this.t = 0;
  }
  /** Show a turning model (the player's kart) beside the panel. */
  setProp(obj) { if (this.prop) this.scene.remove(this.prop); this.prop = obj; if (obj) { obj.position.set(-1.9, -1.2, -2.2); obj.scale.setScalar(0.8); this.scene.add(obj); } }
  render(vr, dt) {
    this.t += dt;
    if (this.panel.mesh.parent !== this.scene) { this.scene.add(this.panel.mesh); }
    this.panel.mesh.position.set(0, 0.05, -2.3); this.panel.mesh.quaternion.identity();
    if (this.prop) this.prop.rotation.y = this.t * 0.6;
    if (vr.rig.parent !== this.scene) { vr.attach(this.scene); vr.place(new V(0, 0, 0), 0); }
    vr.poll();
    this.panel.update(vr);
    vr.render(this.scene);
  }
}
