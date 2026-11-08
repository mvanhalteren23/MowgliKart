import * as THREE from 'three';
import { mulberry32 } from './TrackSpline.js';

const V = THREE.Vector3;
const hexs = (n) => '#' + n.toString(16).padStart(6, '0');
const hasDOM = typeof document !== 'undefined';
const M = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });

function tex(w, h, draw, repeat) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(...repeat);
  return t;
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
  return new THREE.MeshToonMaterial({ color: map ? 0xffffff : theme.ground, map, side: THREE.DoubleSide });
}

/** Instanced scatter helper: parts = [{geo, color, y, s?}], places `n` instances via fn(i)->{p, scale, rot} (or null). */
function scatter(group, parts, n, fn) {
  const meshes = parts.map((p) => { const m = new THREE.InstancedMesh(p.geo, M(p.color), n); m.frustumCulled = false; m.userData.outline = true; return m; });
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
    // dense snow-capped fir forest + boulders + chalets
    const layer = (r, h, y, color) => ({ geo: new THREE.ConeGeometry(r, h, 8), color, y });
    scatter(g, [
      { geo: new THREE.CylinderGeometry(0.3, 0.42, 1.8, 6), color: 0x6b4a2a, y: 0.9 },
      layer(2.5, 3.4, 3.2, 0x2a7a3c), layer(2.0, 3.0, 5.2, 0x328a45), layer(1.4, 2.6, 7.0, 0x3b9a50),
      { geo: new THREE.ConeGeometry(2.1, 2.2, 8), color: 0xffffff, y: 3.9 }, { geo: new THREE.ConeGeometry(1.65, 2.0, 8), color: 0xffffff, y: 5.9 }, { geo: new THREE.ConeGeometry(1.1, 1.8, 8), color: 0xf4fbff, y: 7.7 },
    ], 1500, place(4, 70, 1.35));
    scatter(g, [{ geo: rock, color: 0x8b95a5, y: 0.2, sy: 0.6 }, { geo: new THREE.SphereGeometry(1, 8, 5), color: 0xffffff, y: 0.65, sy: 0.35, sx: 0.9 }], 120, place(3, 40));
    for (let i = 0; i < 16; i++) { // chalets on the slopes
      const d = rnd() * track.length, side = rnd() < 0.5 ? -1 : 1, off = hw + 28 + rnd() * 40;
      const p = track.surface(d, side * off); p.y = p.y - 0.5 - 0.16 * (off - hw);
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
export function buildRampOverlays(session, frames, deckMat) {
  const { track, scene } = session, hw = track.width * 0.5 - 0.4;
  const pos = [], idx = [], uv = [];
  const wood = deckMat;
  for (const r of track.jumpRamps.filter((x) => x.pathId === 'main')) {
    const rows = 16;
    const base = pos.length / 3;
    for (let k = 0; k <= rows; k++) {
      const d = r.startD + ((r.lipD - r.startD) * k) / rows - (k === rows ? 0.02 : 0);
      const fr = frames.sample(d, {});
      for (const s of [-1, 1]) { const p = fr.P.clone().addScaledVector(fr.B, s * hw).addScaledVector(fr.N, 0.07); pos.push(p.x, p.y, p.z); uv.push(s < 0 ? 0 : 1, k / 2); }
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
