import * as THREE from 'three';
import { mulberry32 } from '../track/TrackSpline.js';

/**
 * Procedural canvas textures. Everything is drawn once, cached by key, and shared (so zero per-frame cost and a
 * handful of 256-512 px textures in VRAM). Returns null without a DOM (Node tests / headless sim) - callers fall back to flat colours.
 */
const cache = new Map();
const hasDOM = typeof document !== 'undefined';
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function make(key, w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  if (!hasDOM) return null;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = aniso;
  cache.set(key, t); return t;
}
const grain = (g, w, h, n, alpha, light = false, seed = 3) => {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = light ? `rgba(255,255,255,${r() * alpha})` : `rgba(0,0,0,${r() * alpha})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
};

export const TextureFactory = {
  /** Track road. Snow: packed-snow grain + faint blue ski ruts; asphalt/dirt/stone: fine aggregate grain. Painted dashed centre line + edge lines. */
  road(theme) {
    const snow = theme.scenery === 'pine';
    return make('road:' + theme.road + theme.line, 256, 256, (g, w, h) => {
      g.fillStyle = hex(theme.road); g.fillRect(0, 0, w, h);
      grain(g, w, h, 900, snow ? 0.07 : 0.18, false, 4); grain(g, w, h, 500, snow ? 0.55 : 0.12, true, 5);
      if (snow) { g.strokeStyle = 'rgba(120,160,215,0.22)'; g.lineWidth = 3; for (const x of [w * 0.3, w * 0.38, w * 0.62, w * 0.7]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, h); g.stroke(); } }
      else { const r = mulberry32(9); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.stroke(); } }
      g.fillStyle = hex(theme.line); g.fillRect(w * 0.03, 0, 6, h); g.fillRect(w * 0.97 - 6, 0, 6, h);        // edge lines
      g.fillRect(w / 2 - 5, 0, 10, h * 0.45);                                                               // dashed centre line
    });
  },
  /** Black-and-white checkered strip (start line) or banner with FINISH lettering. */
  checker(cols = 16, rows = 4, label = false) {
    return make(`checker:${cols}x${rows}:${label}`, 512, 128, (g, w, h) => {
      const cw = w / cols, ch = h / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { g.fillStyle = (x + y) % 2 ? '#14141f' : '#ffffff'; g.fillRect(x * cw, y * ch, cw, ch); }
      if (label) { g.fillStyle = '#d92b2b'; g.fillRect(w * 0.18, h * 0.22, w * 0.64, h * 0.56); g.fillStyle = '#fff'; g.font = '900 64px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#14141f'; g.strokeText('FINISH', w / 2, h / 2 + 3); g.fillText('FINISH', w / 2, h / 2 + 3); }
    }, { repeat: [1, 1] });
  },
  /** Wood planks with grain, knots and nails. `tone` = base colour. */
  planks(tone = 0x8a5a2b, boards = 4) {
    return make(`planks:${tone}:${boards}`, 256, 256, (g, w, h) => {
      const r = mulberry32(tone & 0xffff), bw = w / boards;
      for (let b = 0; b < boards; b++) {
        const k = 0.82 + r() * 0.3, c = new THREE.Color(tone).multiplyScalar(k);
        g.fillStyle = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`; g.fillRect(b * bw, 0, bw, h);
        for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(40,20,5,${0.08 + r() * 0.16})`; g.lineWidth = 0.6 + r() * 1.2; const x = b * bw + r() * bw; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 10, h * 0.3, x + (r() - 0.5) * 10, h * 0.7, x + (r() - 0.5) * 6, h); g.stroke(); }
        if (r() < 0.6) { const kx = b * bw + bw * (0.3 + r() * 0.4), ky = r() * h; g.fillStyle = 'rgba(50,25,8,0.55)'; g.beginPath(); g.ellipse(kx, ky, 5, 8, 0, 0, 7); g.fill(); }
        g.fillStyle = '#2a2a30'; g.fillRect(b * bw + 4, 6, 3, 3); g.fillRect(b * bw + bw - 7, 6, 3, 3); g.fillRect(b * bw + 4, h - 9, 3, 3); g.fillRect(b * bw + bw - 7, h - 9, 3, 3);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(b * bw, 0, 2, h);
      }
    });
  },
  /** Wood planks + painted neon chevron boost arrows (albedo). Pair with `neonMask()` as emissiveMap for the glow. */
  boostRamp(tone = 0x7a4a22) {
    return make(`boostramp:${tone}`, 256, 256, (g, w, h) => {
      const base = TextureFactory.planks(tone, 4); g.drawImage(base.image, 0, 0);
      g.fillStyle = 'rgba(8,8,24,0.55)'; g.fillRect(w * 0.14, 0, w * 0.72, h);
      TextureFactory._chevrons(g, w, h, '#2dffb4', '#ffe14a');
    });
  },
  neonMask() {
    return make('neonmask', 256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); TextureFactory._chevrons(g, w, h, '#2dffb4', '#ffe14a', true); }, { srgb: true });
  },
  _chevrons(g, w, h, c1, c2, glowOnly = false) {
    for (let i = 0; i < 3; i++) {
      const y = h * (0.16 + i * 0.3), col = i === 2 ? c2 : c1;
      g.save(); g.shadowColor = col; g.shadowBlur = glowOnly ? 14 : 8; g.strokeStyle = col; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(w * 0.24, y + h * 0.15); g.lineTo(w * 0.5, y); g.lineTo(w * 0.76, y + h * 0.15); g.stroke(); g.restore();
    }
  },
  /** Brushed metal (anisotropic scratches). */
  brushedMetal(tone = 0xb9c0c9) {
    return make(`metal:${tone}`, 256, 256, (g, w, h) => {
      g.fillStyle = hex(tone); g.fillRect(0, 0, w, h); const r = mulberry32(tone & 0xfff);
      for (let i = 0; i < 700; i++) { const y = r() * h, l = 30 + r() * 140, x = r() * w; g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.2})` : `rgba(0,0,0,${0.04 + r() * 0.12})`; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 1.5); g.stroke(); }
      const sheen = g.createLinearGradient(0, 0, w, 0); sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.18)'); sheen.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    });
  },
  /** Racing stripes (twin stripes with pin-lines) on a transparent background. */
  racingStripes(color = 0xffffff, accent = 0x14141f) {
    return make(`stripes:${color}:${accent}`, 128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = hex(color); g.fillRect(w * 0.26, 0, w * 0.18, h); g.fillRect(w * 0.56, 0, w * 0.18, h);
      g.fillStyle = hex(accent); g.fillRect(w * 0.22, 0, w * 0.025, h); g.fillRect(w * 0.455, 0, w * 0.025, h); g.fillRect(w * 0.52, 0, w * 0.025, h); g.fillRect(w * 0.755, 0, w * 0.025, h);
    }, { srgb: true });
  },
  /** Round number decal (race number on a coloured disc with ink rim). */
  numberDecal(n = 7, fill = 0xffffff, ink = 0x14141f) {
    return make(`num:${n}:${fill}`, 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = hex(fill); g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = hex(ink); g.stroke();
      g.fillStyle = hex(ink); g.font = '900 76px "Trebuchet MS", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 5);
    }, { srgb: true });
  },
  /** First-person dashboard: speedo dial, tach arc, warning lamps, rivets. Drawn once; the needle is a separate mesh. */
  dashboard() {
    return make('dash', 512, 256, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2b2f3a'); bg.addColorStop(1, '#14161d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      grain(g, w, h, 600, 0.12, true, 11);
      const dial = (cx, cy, r, label, max) => {
        g.fillStyle = '#0c0e13'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#8f98a6'; g.stroke();
        for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + 1.4 * (i / 10)); g.strokeStyle = i > 7 ? '#ff4a4a' : '#e8edf5'; g.lineWidth = i % 5 === 0 ? 4 : 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); g.stroke(); }
        g.fillStyle = '#9fe8ff'; g.font = '700 18px sans-serif'; g.textAlign = 'center'; g.fillText(label, cx, cy + r * 0.45);
      };
      dial(w * 0.3, h * 0.55, 88, 'KM/H', 160); dial(w * 0.72, h * 0.6, 62, 'BOOST', 100);
      [['#2dff7a', 0.46], ['#ffcf3a', 0.52], ['#ff4a4a', 0.58]].forEach(([c, x]) => { g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 10; g.beginPath(); g.arc(w * x, h * 0.2, 9, 0, 7); g.fill(); g.shadowBlur = 0; });
      g.fillStyle = '#ffd23a'; g.fillRect(0, h - 14, w, 8);
      for (const x of [14, w - 14]) { g.fillStyle = '#aab2bf'; g.beginPath(); g.arc(x, 14, 5, 0, 7); g.fill(); g.beginPath(); g.arc(x, h - 30, 5, 0, 7); g.fill(); }
    });
  },
  /** Rocket paper wrap with bands + stars. */
  rocketWrap(color = 0xd92b2b) {
    return make('rocketwrap:' + color, 128, 128, (g, w, h) => {
      g.fillStyle = hex(color); g.fillRect(0, 0, w, h); grain(g, w, h, 200, 0.12, false, 6);
      g.fillStyle = '#ffd23a'; g.fillRect(0, h * 0.12, w, h * 0.08); g.fillRect(0, h * 0.8, w, h * 0.08);
      g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const x = w * (0.12 + i * 0.25), y = h * 0.5; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 6 : 14; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
    });
  },
  /** Roadside banner / race flag cloth. */
  banner(text = 'MOWGLI KART', a = 0xd92b2b, b = 0xffd23a) {
    return make(`banner:${text}:${a}`, 512, 128, (g, w, h) => {
      g.fillStyle = hex(a); g.fillRect(0, 0, w, h); g.fillStyle = hex(b); for (let i = 0; i < 8; i++) g.fillRect(i * 64, 0, 32, 10), g.fillRect(i * 64 + 32, h - 10, 32, 10);
      g.fillStyle = '#fff'; g.font = '900 72px "Trebuchet MS", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = '#14141f'; g.strokeText(text, w / 2, h / 2 + 3); g.fillText(text, w / 2, h / 2 + 3);
    }, { srgb: true });
  },
  flag() {
    return make('flag', 64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#14141f' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  },
  /** Fine dark rubber with tread nubs. */
  rubber() { return make('rubber', 64, 64, (g, w, h) => { g.fillStyle = '#23252d'; g.fillRect(0, 0, w, h); grain(g, w, h, 160, 0.3, true, 12); }); },
};
