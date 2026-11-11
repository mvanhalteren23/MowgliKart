// Tiny helpers for building cartoon primitives. `THREE` is always passed in so the
// registries stay importable from Node tooling (scripts/gen-pipeline.js).
export const toon = (THREE, color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });

export function box(THREE, w, h, d, color, pos = [0, 0, 0], name) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(THREE, color));
  m.position.set(...pos);
  if (name) m.name = name;
  return m;
}
export function cyl(THREE, rt, rb, h, color, pos = [0, 0, 0], rot = [0, 0, 0], seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toon(THREE, color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}
export function cone(THREE, r, h, color, pos = [0, 0, 0], rot = [0, 0, 0], seg = 12) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), toon(THREE, color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}
export function sphere(THREE, r, color, pos = [0, 0, 0], seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), toon(THREE, color));
  m.position.set(...pos);
  return m;
}

export const WHEEL_R = 0.25;
// Wheel mount points in chassis-local space (forward = -Z). Shared by physics + visuals.
export const WHEEL_MOUNTS = {
  FL: [-0.62, 0, -0.78],
  FR: [0.62, 0, -0.78],
  RL: [-0.62, 0, 0.78],
  RR: [0.62, 0, 0.78],
};
// Ground sits 0.68 m below the chassis centre at rest (L_rest 0.45 + wheel radius 0.25 - ~0.02 sag).
export const GROUND_OFFSET = -0.68;

function wheel(THREE, name, pos, color = 0x222222, radius = WHEEL_R, width = 0.22) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pos[0], GROUND_OFFSET + radius, pos[2]);
  const tire = cyl(THREE, radius, radius, width, color, [0, 0, 0], [0, 0, Math.PI / 2], 14);
  const hub = cyl(THREE, radius * 0.5, radius * 0.5, width + 0.02, 0xcccccc, [0, 0, 0], [0, 0, Math.PI / 2], 8);
  g.add(tire, hub);
  return g;
}

/**
 * Generic soapbox used by the 10 expansion karts (and as a safety net). Honors the full
 * ASSET_PIPELINE node contract: Wheel_*, Weapon_Mount, Shield_Mount, Cosmetic_* nodes.
 */
export function makeGenericKart(THREE, o = {}) {
  const body = o.body ?? 0xe03030;
  const trim = o.trim ?? 0xffffff;
  const root = new THREE.Group();
  root.add(box(THREE, 1.1, 0.34, 2.0, body, [0, -0.28, 0]));
  root.add(box(THREE, 0.9, 0.5, 0.5, trim, [0, 0.05, 0.55]));
  for (const k of Object.keys(WHEEL_MOUNTS)) root.add(o.wheelFn ? o.wheelFn(THREE, `Wheel_${k}`, WHEEL_MOUNTS[k]) : wheel(THREE, `Wheel_${k}`, WHEEL_MOUNTS[k], 0x222222, WHEEL_R));
  root.add(box(THREE, 0.08, 0.5, 1.2, trim, [-0.62, -0.1, 0.1], 'Cosmetic_Panel_L'));
  root.add(box(THREE, 0.08, 0.5, 1.2, trim, [0.62, -0.1, 0.1], 'Cosmetic_Panel_R'));
  root.add(box(THREE, 1.0, 0.1, 0.5, o.accent ?? 0xffcc00, [0, 0.62, 0.85], 'Cosmetic_Roof_Spoiler'));
  root.add(box(THREE, 0.9, 0.22, 0.2, o.accent ?? 0xffcc00, [0, -0.28, -1.08], 'Cosmetic_Bumper_Prop'));
  const wm = new THREE.Object3D(); wm.name = 'Weapon_Mount'; wm.position.set(0, 0.45, -0.2); root.add(wm);
  const sm = new THREE.Object3D(); sm.name = 'Shield_Mount'; sm.position.set(0, 0.2, 0); root.add(sm);
  const seat = new THREE.Object3D(); seat.name = 'Driver_Seat'; seat.position.set(0, 0.12, 0.25); root.add(seat);
  if (o.extra) o.extra(THREE, root);
  return root;
}

/** Rainbow "oil-slick / soap-bubble" texture (conic gradient). Returns null without a DOM. */
export function iridescentTexture(THREE, alpha = 1) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const stops = ['#ff6ad5', '#ffd86a', '#7dff9a', '#6ad8ff', '#a28bff', '#ff6ad5'];
  g.globalAlpha = alpha;
  if (g.createConicGradient) { // Chrome 99+, Firefox 112+, Safari 16.4+
    const cone = g.createConicGradient(0, 128, 128);
    stops.forEach((col, i, a) => cone.addColorStop(i / (a.length - 1), col));
    g.fillStyle = cone; g.fillRect(0, 0, 256, 256);
  } else { // older headset browsers (Firefox Reality, stock Pico): paint the same sweep as 180 coloured wedges
    const n = 180, hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
    for (let i = 0; i < n; i++) {
      const f = (i / n) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(f)), t = f - k, c0 = hex(stops[k]), c1 = hex(stops[k + 1]);
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1.5) / n) * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * t)).join(',')})`;
      g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 200, a0, a1); g.closePath(); g.fill();
    }
  }
  const fade = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  fade.addColorStop(0, 'rgba(255,255,255,0.55)'); fade.addColorStop(0.6, 'rgba(255,255,255,0.1)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 1; g.globalCompositeOperation = 'lighter'; g.fillStyle = fade; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Soap-bubble sphere: fresnel-ish rim + rainbow tint. */
export function bubbleMaterial(THREE, tint = 0xbfe8ff, opacity = 0.4) {
  const map = iridescentTexture(THREE);
  return new THREE.MeshBasicMaterial({ color: map ? 0xffffff : tint, map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}
