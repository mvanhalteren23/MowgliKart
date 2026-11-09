import * as THREE from 'three';
import { mulberry32, moguls } from './TrackSpline.js';
import { TextureFactory } from '../core/TextureFactory.js';

const V = THREE.Vector3;
const hexs = (n) => '#' + n.toString(16).padStart(6, '0');
const hasDOM = typeof document !== 'undefined';
const M = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });

/** Shared wind clock (seconds); trees sway in the vertex shader, phase-shifted per instance. */
export const wind = { value: 0 };
function swayMat(color) {
  const m = M(color);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
        #else
        float ph = 0.0;
        #endif
        float hh = max(position.y * 0.5 + 1.0, 0.0);
        transformed.x += sin(uWind * 1.5 + ph) * hh * 0.02;
        transformed.z += cos(uWind * 1.2 + ph * 1.3) * hh * 0.014;`);
  };
  return m;
}

/** Powder-snow material for the off-piste zones of the open slope. */
export function powderMaterial(theme) {
  const map = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f7ff'; g.fillRect(0, 0, w, h);
    const r = mulberry32(8);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(140,175,225,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 5); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, [2, 2]);
  return new THREE.MeshToonMaterial({ color: map ? 0xffffff : 0xf2f7ff, map, side: THREE.DoubleSide, normalMap: snowNormal(), normalScale: new THREE.Vector2(1.2, 1.2) });
}

function tex(w, h, draw, repeat) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(...repeat);
  return t;
}

/** Tileable procedural snow normal map (fine drift ripples + sparkle bumps) for the ground materials. */
let _snowN = null;
export function snowNormal() {
  if (_snowN || !hasDOM) return _snowN;
  const S = 256, h = new Float32Array(S * S), r = mulberry32(21);
  for (const [cells, amp] of [[8, 1], [16, 0.55], [32, 0.3], [64, 0.16]]) {
    const grid = Float32Array.from({ length: cells * cells }, () => r());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = (x / S) * cells, gy = (y / S) * cells, x0 = Math.floor(gx) % cells, y0 = Math.floor(gy) % cells, x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      h[y * S + x] += amp * ((grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx) * (1 - sy) + (grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx) * sy);
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -dx * 2.4, ny = -dy * 2.4, inv = 1 / Math.hypot(nx, ny, 1), o = (y * S + x) * 4;
    img.data[o] = (nx * inv * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * inv * 0.5 + 0.5) * 255; img.data[o + 2] = (inv * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _snowN = new THREE.CanvasTexture(c); _snowN.wrapS = _snowN.wrapT = THREE.RepeatWrapping; _snowN.repeat.set(5, 5);
  return _snowN;
}

/** Ground texture: speckle + (for snow) long ski-track streaks running down the slope. */
export function terrainMaterial(theme) {
  const snow = theme.scenery === 'pine';
  const map = tex(256, 256, (g, w, h) => {
    g.fillStyle = hexs(theme.ground); g.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 700; i++) { g.fillStyle = snow ? `rgba(120,160,215,${r() * 0.1})` : `rgba(0,0,0,${r() * 0.07})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 8); }
    if (snow) for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(130,170,225,${0.18 + r() * 0.25})`; g.lineWidth = 1 + r() * 2.2; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 24, h * 0.3, x + (r() - 0.5) * 24, h * 0.7, x + (r() - 0.5) * 8, h); g.stroke(); }
  }, [5, 1]);
  return new THREE.MeshToonMaterial({ color: map ? 0xffffff : theme.ground, map, side: THREE.DoubleSide, normalMap: snow ? snowNormal() : null, normalScale: new THREE.Vector2(0.9, 0.9) });
}

/** Instanced scatter helper: parts = [{geo, color, y, s?}], places `n` instances via fn(i)->{p, scale, rot} (or null). */
function scatter(group, parts, n, fn) {
  const meshes = parts.map((p) => { const m = new THREE.InstancedMesh(p.geo, p.sway ? swayMat(p.color) : M(p.color), n); m.frustumCulled = false; m.userData.outline = true; m.castShadow = m.receiveShadow = true; return m; });
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = fn(i);
    parts.forEach((p, j) => {
      if (!a || (p.every && i % p.every)) o.scale.setScalar(0.0001);
      else o.scale.set(a.scale * (p.sx ?? 1), a.scale * (p.sy ?? 1), a.scale * (p.sx ?? 1));
      if (a) { o.position.set(a.p.x, a.p.y + (p.y ?? 0) * a.scale, a.p.z); o.rotation.set(0, a.rot, 0); }
      o.updateMatrix(); meshes[j].setMatrixAt(i, o.matrix);
    });
  }
  meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; group.add(m); });
}

/** Instanced row of boxes oriented along the track (walls, fences). */
function alongTrack(group, track, geo, color, spacing, lat, y, jitter = 0) {
  const n = Math.floor(track.length / spacing) * 2;
  const m = new THREE.InstancedMesh(geo, M(color), n); m.frustumCulled = false;
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const side = i & 1 ? 1 : -1, d = (i >> 1) * spacing + 2;
    const fr = track.atDist(d);
    const p = fr.P.clone().addScaledVector(fr.B, side * lat).addScaledVector(fr.N, y);
    basis.makeBasis(fr.B, fr.N, fr.T.clone().negate()); q.setFromRotationMatrix(basis);
    mat.compose(p, q, new V(1, 1 + jitter * Math.sin(i * 12.9898), 1)); m.setMatrixAt(i, mat);
  }
  m.instanceMatrix.needsUpdate = true; group.add(m);
}

export function buildScenery(session) {
  const { track, def, scene } = session;
  session.trees = [];
  const th = def.theme, rnd = mulberry32(def.seed * 31), hw = track.width / 2;
  const g = new THREE.Group(); scene.add(g);
  const place = (minOff, spread, pw = 1.5) => (i) => {
    const d = rnd() * track.length, side = rnd() < 0.5 ? -1 : 1, off = hw + minOff + Math.pow(rnd(), pw) * spread;
    const p = track.surface(d, side * off);
    p.y = p.y - 0.5 - 0.16 * (off - hw);
    return { p, scale: 0.8 + rnd() * 1.3, rot: rnd() * 6.28 };
  };
  const rock = new THREE.DodecahedronGeometry(1, 0);

  if (th.scenery === 'pine') {
    // dense snow-capped fir forest + boulders + chalets; on the open slope also individually collidable trees in the powder
    const open = track.open, edge = open ? hw + 5.5 : hw, forest = [];
    const gy = (off) => (open ? 3.1 - 0.16 * Math.max(0, off - edge) : -0.5 - 0.16 * (off - hw));
    const placeF = (minOff, spread, pw = 1.5) => () => {
      for (let t = 0; t < 40; t++) {
        const d = rnd() * track.length, side = rnd() < 0.5 ? -1 : 1, off = edge + minOff + Math.pow(rnd(), pw) * spread;
        const p = track.surface(d, side * off); p.y += gy(off);
        if (nearDeck(p)) continue;
        const tr = { p, scale: 0.8 + rnd() * 1.4, rot: rnd() * 6.28 };
        if (open && off < edge + 55) forest.push(tr); // solid trunks for the first stretch of forest, so the OOB zone isn't a ghost forest
        return tr;
      }
      return null;
    };
    const nearDeck = (p) => track.shortcuts.some((sc) => { const P = sc.frames.P; for (let i = 0; i < P.length; i += 4) { const dx = P[i].x - p.x, dz = P[i].z - p.z; if (dx * dx + dz * dz < 110) return true; } return false; });
    const layer = (r, h, y, color) => ({ geo: new THREE.ConeGeometry(r, h, 12), color, y, sway: true });
    const parts = () => [
      { geo: new THREE.CylinderGeometry(0.3, 0.42, 1.8, 6), color: 0x6b4a2a, y: 0.9 },
      layer(2.5, 3.4, 3.2, 0x2a7a3c), layer(2.0, 3.0, 5.2, 0x328a45), layer(1.4, 2.6, 7.0, 0x3b9a50), layer(0.9, 2.2, 8.7, 0x46ab5c),
      { geo: new THREE.ConeGeometry(2.1, 2.2, 8), color: 0xffffff, y: 3.9, sway: true }, { geo: new THREE.ConeGeometry(1.65, 2.0, 8), color: 0xffffff, y: 5.9, sway: true }, { geo: new THREE.ConeGeometry(1.1, 1.8, 10), color: 0xf4fbff, y: 7.7, sway: true }, { geo: new THREE.ConeGeometry(0.62, 1.4, 8), color: 0xffffff, y: 9.3, sway: true },
    ];
    scatter(g, parts(), open ? 2600 : 1500, placeF(open ? 2 : 4, open ? 95 : 70, 1.35));
    scatter(g, [{ geo: rock, color: 0x8b95a5, y: 0.2, sy: 0.6 }, { geo: new THREE.SphereGeometry(1, 8, 5), color: 0xffffff, y: 0.65, sy: 0.35, sx: 0.9 }], 140, placeF(1, 50));
    if (open) {
      // trunks you have to steer between: rejection-sampled with >= 5.5 m spacing so there is always a gap
      const gr = track.grooveHalf, trees = [];
      const blocked = (d) => track.jumpRamps.some((r) => r.pathId === 'main' && d > r.startD - 35 && d < r.lipD + 60) || d < 150 || d > track.length - 160;
      for (let tries = 0; tries < 9000 && trees.length < 300; tries++) {
        const d = 150 + rnd() * (track.length - 310), lat = (rnd() < 0.5 ? -1 : 1) * (gr + 2 + Math.pow(rnd(), 0.8) * (hw - gr - 4.5));
        if (blocked(d)) continue;
        const p = track.surface(d, lat); p.y += moguls(d, lat, gr, hw);
        if (nearDeck(p) || trees.some((t) => (t.p.x - p.x) ** 2 + (t.p.z - p.z) ** 2 < 84)) continue;
        trees.push({ p, scale: 1.1 + rnd() * 0.9, rot: rnd() * 6.28 });
      }
      scatter(g, parts(), trees.length, (i) => trees[i]);
      session.trees = trees; session.forestTrees = forest;
    }
    for (let i = 0; i < 16; i++) { // chalets on the slopes
      const d = rnd() * track.length, side = rnd() < 0.5 ? -1 : 1, off = edge + 28 + rnd() * 40;
      const p = track.surface(d, side * off); p.y += gy(off);
      if (nearDeck(p)) continue;
      const c = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 5), M(0x9c6b3c)); body.position.y = 1.7; c.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.6, 4), M(0xf2f6ff)); roof.position.y = 4.6; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); c.add(roof);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), M(0xffe9a0)); win.position.set(0, 1.9, -2.55); c.add(win);
      c.position.copy(p); c.rotation.y = rnd() * 6.28; g.add(c);
    }
  } else if (th.scenery === 'palm') {
    scatter(g, [
      { geo: new THREE.CylinderGeometry(0.28, 0.45, 8, 6), color: 0x9c7a4a, y: 4 },
      { geo: new THREE.SphereGeometry(2.6, 8, 5), color: 0x2fa84a, y: 8.4, sy: 0.45 }, { geo: new THREE.SphereGeometry(1.8, 8, 5), color: 0x3cc05a, y: 9.0, sy: 0.4 },
    ], 700, place(3.5, 40, 1.3));
    const pastel = [0xf4e1c0, 0xffd6c0, 0xcfe8ff, 0xfff2b0, 0xe9d4ff];
    scatter(g, pastel.map((c, k) => ({ geo: new THREE.BoxGeometry(8, 6 + k * 2, 7), color: c, y: (6 + k * 2) / 2, every: 5 })), 300, (i) => (i % 5 === 0 || true ? ((a) => (a ? { ...a, scale: 1 + rnd() * 0.5 } : a))(place(18, 40, 1)(i)) : null));
  } else if (th.scenery === 'tower') {
    // crenellated stone battlements along both edges + watchtowers + hills of shrubs
    alongTrack(g, track, new THREE.BoxGeometry(0.9, 1.7, 4.0), 0x9c9486, 4, hw + 1.3, 0.85);
    alongTrack(g, track, new THREE.BoxGeometry(0.9, 0.7, 1.3), 0x8a8274, 4, hw + 1.3, 2.05);
    scatter(g, [{ geo: new THREE.CylinderGeometry(2.8, 3.4, 9, 8), color: 0x9c9486, y: 4.5 }, { geo: new THREE.BoxGeometry(5.2, 1.5, 5.2), color: 0x7d776a, y: 9.7 }, { geo: new THREE.ConeGeometry(4, 2.4, 4), color: 0xb23a2a, y: 11.6, every: 1 }], 70, place(9, 26, 1));
    scatter(g, [{ geo: new THREE.SphereGeometry(2, 7, 5), color: 0x4f8a3a, y: 1, sy: 0.8 }, { geo: new THREE.ConeGeometry(2.2, 6, 6), color: 0x3b7a3a, y: 3 }], 600, place(8, 70, 1.2));
  } else { // jungle / zoo
    alongTrack(g, track, new THREE.BoxGeometry(0.18, 1.5, 0.18), 0x7a5a32, 4, hw + 1.6, 0.75);
    alongTrack(g, track, new THREE.BoxGeometry(0.1, 0.12, 4.1), 0xb38a52, 4, hw + 1.6, 1.15);
    alongTrack(g, track, new THREE.BoxGeometry(0.1, 0.12, 4.1), 0xb38a52, 4, hw + 1.6, 0.6);
    scatter(g, [ // baobabs
      { geo: new THREE.CylinderGeometry(0.9, 1.5, 7, 7), color: 0x8b6b4a, y: 3.5 },
      { geo: new THREE.SphereGeometry(4, 8, 5), color: 0x3a9a4a, y: 8, sy: 0.5 },
    ], 420, place(7, 70, 1.3));
    scatter(g, [{ geo: new THREE.CylinderGeometry(0.2, 0.3, 4, 6), color: 0x6b4a2a, y: 2 }, { geo: new THREE.SphereGeometry(2.2, 7, 5), color: 0x2e9e4a, y: 5 }, { geo: new THREE.ConeGeometry(0.8, 2, 6), color: 0xff8a50, y: 2.4 }], 360, place(5, 40, 1.2));
    scatter(g, [{ geo: rock, color: 0xb59a78, y: 0.4, sy: 0.7 }], 90, place(6, 45));
  }
  return g;
}

/** Distant low-poly mountain ring (follows the camera; unfogged but tinted toward the horizon). */
export function buildMountains(theme) {
  const g = new THREE.Group(), r = mulberry32(99);
  const snow = theme.scenery === 'pine', base = snow ? 0x8fa6c8 : theme.scenery === 'tower' ? 0x6f8f78 : theme.scenery === 'palm' ? 0xb9a27a : 0x6aa66a;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.2, dist = 1500 + r() * 500, h = 260 + r() * 420, rad = 260 + r() * 320;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6 + ((r() * 3) | 0)), new THREE.MeshToonMaterial({ color: base, fog: false }));
    m.position.set(Math.cos(a) * dist, h / 2 - 330, Math.sin(a) * dist);
    g.add(m);
    if (snow || theme.scenery === 'tower') {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.42, 6), new THREE.MeshToonMaterial({ color: 0xffffff, fog: false }));
      cap.position.set(m.position.x, m.position.y + h * 0.3, m.position.z); g.add(cap);
    }
  }
  return g;
}

/** Wooden kicker overlays (planks, side beams, lip face) so jump ramps read as ramps like the reference art. */
export function buildRampOverlays(session, frames, deckMat) { // deckMat = neon-chevron ramp material
  const { track, scene } = session, hw = track.grooveHalf - 0.4;
  const pos = [], idx = [], uv = [];
  const wood = deckMat;
  for (const r of track.jumpRamps.filter((x) => x.pathId === 'main')) {
    const rows = 16;
    const base = pos.length / 3;
    for (let k = 0; k <= rows; k++) {
      const d = r.startD + ((r.lipD - r.startD) * k) / rows - (k === rows ? 0.02 : 0);
      const fr = frames.sample(d, {});
      for (const s of [-1, 1]) { const p = fr.P.clone().addScaledVector(fr.B, s * hw).addScaledVector(fr.N, 0.07); pos.push(p.x, p.y, p.z); uv.push(s < 0 ? 0 : 1, k / rows); }
    }
    for (let k = 0; k < rows; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    // lip face + side beams as boxes
    const lip = frames.sample(r.lipD - 0.02, {}), after = frames.sample(r.lipD + 0.05, {});
    const h = Math.max(0.2, lip.P.y - after.P.y);
    const face = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, h, 0.3), wood); face.position.copy(lip.P).addScaledVector(lip.N, 0.07 - h / 2);
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lip.B, lip.N, lip.T.clone().negate()));
    scene.add(face);
    for (const s of [-1, 1]) {
      const mid = frames.sample((r.startD + r.lipD) / 2, {});
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, r.lipD - r.startD), M(0x6b4423));
      beam.position.copy(mid.P).addScaledVector(mid.B, s * (hw + 0.1)).addScaledVector(mid.N, 0.25);
      const tilt = Math.atan2(lip.P.y - frames.sample(r.startD, {}).P.y, r.lipD - r.startD);
      beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(mid.B, mid.N, mid.T.clone().negate())); beam.rotateX(tilt * 0.9);
      scene.add(beam);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, wood); scene.add(mesh);
}


/* ------------------------------------------------------------------ roadside dressing (all GPU-instanced) */
function waveMat(opts, vertexBody) {
  const m = new THREE.MeshToonMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;\n#else\nfloat ph = 0.0;\n#endif\n${vertexBody}`);
  };
  m.customProgramCacheKey = () => vertexBody;
  return m;
}

/** Waving race flags on poles, sponsor banners between poles, guardrails, and a bouncing crowd: ~15 draw calls total. */
export function buildRoadside(session) {
  const { track, def, scene } = session, th = def.theme, open = track.open, hw = track.width / 2;
  const edge = open ? track.grooveHalf + 1.8 : hw + 1.5, rnd = mulberry32(def.seed * 17 + 3), g = new THREE.Group(); scene.add(g);
  const skip = (d) => track.shortcuts.some((s) => d > s.dEntry - 30 && d < s.dExit + 30) || track.jumpRamps.some((r) => r.pathId === 'main' && d > r.startD - 25 && d < r.lipD + 30);
  const at = (d, lat, up = 0) => { const f = track.atDist(d); return { f, p: f.P.clone().addScaledVector(f.B, lat).addScaledVector(f.N, up) }; };
  const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const mat = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const palette = [0xd92b2b, 0xffd23a, 0x2f8de0, 0xffffff, 0x2dc26b].map((c) => new THREE.Color(c));

  // flags: pole + waving cloth, alternating colours, both sides every 55 m
  const slots = [];
  for (let d = 130; d < track.length - 150; d += 55) { if (skip(d)) continue; for (const side of [-1, 1]) slots.push({ d, side }); }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.075, 5.2, 8), new THREE.MeshToonMaterial({ color: 0xe8edf2 }), slots.length);
  const cloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 0.9, 12, 3).translate(0.75, 0, 0),
    waveMat({ color: 0xffffff, side: THREE.DoubleSide }, 'transformed.z += sin(position.x * 4.2 + uWind * 6.0 + ph) * position.x * 0.16; transformed.y += sin(position.x * 3.0 + uWind * 5.0 + ph) * position.x * 0.05;'), slots.length);
  slots.forEach((s, i) => {
    const { f, p } = at(s.d, s.side * edge);
    mat.compose(p.clone().addScaledVector(f.N, 2.6), basis(f.B, f.N, f.T.clone().negate()), one); poles.setMatrixAt(i, mat);
    const q = basis(f.B, f.N, f.T.clone().negate()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.side > 0 ? Math.PI : 0));
    mat.compose(p.clone().addScaledVector(f.N, 4.7), q, one); cloth.setMatrixAt(i, mat); cloth.setColorAt(i, palette[(i >> 1) % palette.length]);
  });
  poles.castShadow = true; for (const m of [poles, cloth]) { m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; g.add(m); }
  if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;

  // sponsor banners strung between two poles, facing the road, every 230 m
  const texts = [['MOWGLI KART', 0xd92b2b, 0xffd23a], ['RED SNOW', 0x2f8de0, 0xffffff], ['GO GO GO!', 0x2dc26b, 0xffd23a]];
  const spots = []; for (let d = 210; d < track.length - 200; d += 230) if (!skip(d)) spots.push({ d, side: spots.length % 2 ? 1 : -1 });
  const bPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8), new THREE.MeshToonMaterial({ color: 0x59606b }), spots.length * 2);
  const banners = texts.map(([t, a, b]) => { const tx = TextureFactory.banner(t, a, b); return new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ color: tx ? 0xffffff : a, map: tx, side: THREE.DoubleSide }), spots.length); });
  const used = [0, 0, 0];
  spots.forEach((s, i) => {
    const { f, p } = at(s.d, s.side * (edge + 0.6)), faceZ = f.B.clone().multiplyScalar(-s.side), x = f.T.clone().multiplyScalar(s.side);
    for (const k of [-1, 1]) { const pp = p.clone().addScaledVector(f.T, k * 2.4).addScaledVector(f.N, 2.2); mat.compose(pp, basis(f.B, f.N, f.T.clone().negate()), one); bPoles.setMatrixAt(i * 2 + (k > 0 ? 1 : 0), mat); }
    const v = i % banners.length; mat.compose(p.clone().addScaledVector(f.N, 3.55), basis(x, f.N, faceZ), one); banners[v].setMatrixAt(used[v]++, mat);
  });
  banners.forEach((b, v) => { b.count = used[v]; b.frustumCulled = false; b.instanceMatrix.needsUpdate = true; g.add(b); });
  bPoles.frustumCulled = false; bPoles.instanceMatrix.needsUpdate = true; g.add(bPoles);

  // crowd: bouncing spectators clustered near the start, the finish and along the run (vertex-shader hop, one draw call per body part)
  const clusters = [48, track.finishD - 25, track.finishD + 20];
  for (let d = 500; d < track.length - 400; d += 520) clusters.push(d);
  const spectators = []; for (const d of clusters) for (let k = 0; k < 14; k++) spectators.push({ d: d + (rnd() - 0.5) * 36, lat: (rnd() < 0.5 ? -1 : 1) * (edge + 3.2 + rnd() * 5), sc: 0.85 + rnd() * 0.35 });
  const hop = 'transformed.y += abs(sin(uWind * 5.5 + ph * 3.0)) * 0.3;';
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.55, 3, 8).translate(0, 0.62, 0), waveMat({ color: 0xffffff }, hop), spectators.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 1.32, 0), waveMat({ color: 0xffffff }, hop), spectators.length);
  const skins = [0xffd9b0, 0xe8b88a, 0xb98154, 0x7a4a2a].map((c) => new THREE.Color(c));
  spectators.forEach((s, i) => {
    const { f, p } = at(Math.min(track.length - 5, Math.max(5, s.d)), s.lat);
    const q = basis(f.B, f.N, f.T.clone().negate()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s.lat > 0 ? 1 : -1) * (-Math.PI / 2)));
    mat.compose(p, q, new THREE.Vector3(s.sc, s.sc, s.sc)); bodies.setMatrixAt(i, mat); heads.setMatrixAt(i, mat);
    bodies.setColorAt(i, palette[i % palette.length]); heads.setColorAt(i, skins[i % skins.length]);
  });
  for (const m of [bodies, heads]) { m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; g.add(m); }

  // guardrails on the curbed tracks that don't already have walls/fences (San Diego streets)
  if (th.scenery === 'palm') {
    alongTrack(g, track, new THREE.BoxGeometry(0.14, 0.95, 0.14), 0x8a939e, 6, hw + 1.2, 0.48);
    alongTrack(g, track, new THREE.BoxGeometry(0.1, 0.16, 6.1), 0xd0d7de, 6, hw + 1.2, 0.62);
    alongTrack(g, track, new THREE.BoxGeometry(0.1, 0.16, 6.1), 0xd0d7de, 6, hw + 1.2, 0.9);
  }
  return g;
}
