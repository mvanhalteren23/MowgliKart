import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * "Basic" skin: every visual in the plane racer comes from this one object, so art can be upgraded (or swapped for loaded
 * models) without touching flight, race or network code. Copy this file, change what the functions return, and pass the
 * new skin to the View.
 *
 * Budget rules this skin follows (Pico G2 4K class hardware):
 *   - no lights at all: lighting is baked into vertex colours, everything draws with one unlit material
 *   - static world merged + chunked for culling; repeated props are instanced
 *   - whole scene: ~12k triangles, ~35 draw calls
 *
 * Contract (all return THREE objects in metres, +Y up, planes/rockets pointing down -Z):
 *   fog, clear                      colours / distances
 *   sky()                           Object3D that follows the camera
 *   world(course)                   static canyon, arches, pillars, far scenery (array of chunks is fine: one Group)
 *   rings(course), balloons(race)   -> { object, update(race, time) }
 *   plane(plane)                    -> { object, prop }   (prop spins)
 *   cockpit(plane)                  -> { object, prop }   first-person parts of the pilot's own plane, origin at the eye
 *   shield(), rocket(), mine()      small effect meshes
 */
const SUN = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const UNLIT = new THREE.MeshBasicMaterial({ vertexColors: true });
const c3 = (h) => new THREE.Color(h);
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Flat-shade a geometry into vertex colours: colour(faceCentre, normal) -> THREE.Color, lit by the fixed sun. */
function bake(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3(), out = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(mid.subVectors(c, a)).normalize(); mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    out.copy(typeof colorFn === 'function' ? colorFn(mid, n) : colorFn);
    const lit = 0.58 + 0.42 * Math.max(0, n.dot(SUN)) + 0.08 * Math.max(0, n.y);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = out.r * lit; col[(i + k) * 3 + 1] = out.g * lit; col[(i + k) * 3 + 2] = out.b * lit; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const part = (geo, color, m) => { if (m) geo.applyMatrix4(m); const g = bake(geo, c3(color)); geo.dispose(); return g; };
const T = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const mesh = (geos) => { const g = mergeGeometries(geos, false); geos.forEach((x) => x.dispose()); return new THREE.Mesh(g, UNLIT); };

const ROCK = [c3(0x8f3f26), c3(0xb5532f), c3(0xcf7a45), c3(0xe2a262), c3(0xedc88c)], WATER = c3(0x2f9fb0), SAND = c3(0xe9cf9a);
const strata = (h, ceil) => ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.floor(((h + hash(Math.floor(h / 3), 7) * 2) / (ceil + 12)) * ROCK.length)))];

export const basicSkin = {
  name: 'basic',
  clear: 0xbfe3f2,
  fog: { color: 0xd9e9ee, near: 140, far: 520 },

  sky() {
    const g = new THREE.SphereGeometry(900, 16, 8), p = g.attributes.position, col = new Float32Array(p.count * 3);
    const top = c3(0x3f8fd8), mid = c3(0xa9d6ee), low = c3(0xf2e3c2), o = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 900; o.copy(t > 0 ? mid : low).lerp(t > 0 ? top : mid, t > 0 ? Math.min(1, t * 1.6) : 1 + t); col[i * 3] = o.r; col[i * 3 + 1] = o.g; col[i * 3 + 2] = o.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10; m.frustumCulled = false;
    return m;
  },

  world(course) {
    const root = new THREE.Group(), n = course.n, STEP = 2, PER = 12; // one ring of quads every 8 m, 12 rings per culling chunk
    const section = (i) => { // 10 points across the canyon at sample i, left rim -> right rim, as world positions + (h, ceil)
      const P = course.P[i], R = course.R[i], W = course.halfW[i], C = course.ceil[i], j = (k) => hash(i * 0.37, k) * 2.6;
      const pts = [[-(W + 150), C + 26 + j(9) * 4], [-(W + 20 + j(1) * 3), C + 20 + j(2)], [-(W + 4 + j(3)), C + 15], [-(W + 0.8 + j(4)), C * 0.55], [-W, 0], [W, 0], [W + 0.8 + j(5), C * 0.55], [W + 4 + j(6), C + 15], [W + 20 + j(7) * 3, C + 20 + j(8)], [W + 150, C + 26 + j(10) * 4]];
      return pts.map(([lat, h]) => ({ v: new THREE.Vector3(P.x + R.x * lat, P.y + h, P.z + R.z * lat), h, C }));
    };
    const rings = []; for (let i = 0; i < n; i += STEP) rings.push(section(i));
    for (let c0 = 0; c0 < rings.length; c0 += PER) {
      const pos = [];
      for (let r = c0; r < Math.min(c0 + PER, rings.length); r++) {
        const A = rings[r], B = rings[(r + 1) % rings.length];
        for (let k = 0; k < 9; k++) { const a = A[k].v, b = A[k + 1].v, c = B[k + 1].v, d = B[k].v; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z); } // wound to face the inside of the canyon / up
      }
      const raw = new THREE.BufferGeometry(); raw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const base = course.P[(c0 * STEP) % n].y, ceil = course.ceil[(c0 * STEP) % n];
      const g = bake(raw, (mid, nrm) => (nrm.y > 0.93 && mid.y - base < 3 ? WATER : nrm.y > 0.75 && mid.y - base > ceil + 10 ? SAND : strata(mid.y - base, ceil)));
      raw.dispose(); g.computeBoundingSphere();
      root.add(new THREE.Mesh(g, UNLIT));
    }
    // arches + pillars: one merged mesh
    const props = [];
    for (const a of course.arches) {
      const f = course.frame(a.d), yaw = Math.atan2(-f.T.x, -f.T.z), w = f.halfW * 2 + 10;
      props.push(part(new THREE.BoxGeometry(w, 9, 16, 4, 1, 2), 0xb5532f, T(f.P.x, f.P.y + f.ceil + 4.6, f.P.z, 0, yaw, 0)));
      props.push(part(new THREE.BoxGeometry(w * 0.7, 3, 11), 0xcf7a45, T(f.P.x, f.P.y + f.ceil - 1.2, f.P.z, 0, yaw, 0)));
    }
    for (const p of course.pillars) {
      const f = course.frame(p.d), x = f.P.x + f.R.x * p.lat, z = f.P.z + f.R.z * p.lat, H = f.ceil + 10;
      props.push(bake(new THREE.CylinderGeometry(p.r * 0.8, p.r * 1.12, H, 7, 3).applyMatrix4(T(x, f.P.y + H / 2 - 1, z, 0, p.d, 0)), (mid) => strata(mid.y - f.P.y, f.ceil)));
      props.push(part(new THREE.CylinderGeometry(p.r * 1.25, p.r * 0.8, 2.2, 7), 0xedc88c, T(x, f.P.y + H, z, 0, p.d, 0)));
    }
    // far mesas so the horizon above the rim is not empty (static, hazy colours, ignore fog)
    const far = [], cx = course.P.reduce((a, p) => a + p.x, 0) / n, cz = course.P.reduce((a, p) => a + p.z, 0) / n;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash(i, 1), d = 1100 + hash(i, 2) * 500, w = 160 + hash(i, 3) * 260, h = 110 + hash(i, 4) * 170;
      far.push(part(new THREE.BoxGeometry(w, h, w * (0.6 + hash(i, 5) * 0.6)), i % 3 ? 0xd7b59a : 0xc99f8a, T(cx + Math.cos(a) * d, h / 2 - 40, cz + Math.sin(a) * d, 0, hash(i, 6) * 3, 0)));
    }
    const pm = mesh(props); pm.frustumCulled = false; root.add(pm);
    const fm = mesh(far); fm.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }); fm.frustumCulled = false; root.add(fm);
    // start / finish gate: checkered bar across the canyon at d = 0
    { const f = course.frame(0), yaw = Math.atan2(-f.T.x, -f.T.z), bits = [], w = f.halfW * 2, nq = 16;
      for (let k = 0; k < nq; k++) for (let r = 0; r < 2; r++) bits.push(part(new THREE.BoxGeometry(w / nq, 1.6, 0.6), (k + r) % 2 ? 0xffffff : 0x1b1f2a, T(0, 0, 0).premultiply(T((k + 0.5 - nq / 2) * (w / nq), f.ceil * 0.82 + r * 1.6, 0)).premultiply(T(f.P.x, f.P.y, f.P.z, 0, yaw, 0))));
      root.add(mesh(bits)); }
    return root;
  },

  rings(course) {
    const g = new THREE.TorusGeometry(5.5, 0.5, 5, 18), m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffc928 }), course.rings.length);
    const o = new THREE.Object3D();
    course.rings.forEach((r, i) => { const f = course.frame(r.d); course.point(r.d, r.lat, r.h, o.position); o.rotation.set(0, Math.atan2(-f.T.x, -f.T.z), 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false;
    return { object: m, update() {} };
  },

  balloons(race) {
    const list = race.balloons, g = new THREE.IcosahedronGeometry(2.6, 1), m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
    const o = new THREE.Object3D(), cols = [0xff5a7a, 0x44c2ff, 0x7dff9a, 0xffd23a].map(c3), shown = list.map(() => null);
    list.forEach((b, i) => m.setColorAt(i, cols[i % 4]));
    m.frustumCulled = false;
    return { object: m, update(r, time) {
      let dirty = false;
      list.forEach((b, i) => { const on = b.t <= 0; if (shown[i] === on) return; shown[i] = on; dirty = true; r.course.point(b.d, b.lat, b.h, o.position); o.scale.setScalar(on ? 1 : 0.001); o.scale.y *= 1.15; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      if (dirty) m.instanceMatrix.needsUpdate = true;
    } };
  },

  plane(plane) {
    const col = plane.color, dark = c3(col).multiplyScalar(0.55).getHex();
    const body = mesh([
      part(new THREE.CylinderGeometry(0.55, 0.3, 4.4, 8), col, T(0, 0, 0.3, Math.PI / 2, 0, 0)),          // fuselage, tapering to the tail
      part(new THREE.CylinderGeometry(0.6, 0.55, 0.7, 8), 0xe9edf2, T(0, 0, -2.2, Math.PI / 2, 0, 0)),    // nose cowl
      part(new THREE.BoxGeometry(8.4, 0.14, 1.5), col, T(0, 0.12, -0.5)),                                  // wing
      part(new THREE.BoxGeometry(1.1, 0.16, 1.52), 0xffffff, T(-3.4, 0.12, -0.5)), part(new THREE.BoxGeometry(1.1, 0.16, 1.52), 0xffffff, T(3.4, 0.12, -0.5)), // wing-tip stripes
      part(new THREE.BoxGeometry(3.0, 0.1, 0.9), dark, T(0, 0.1, 2.15)),                                   // tailplane
      part(new THREE.BoxGeometry(0.12, 1.15, 1.0), dark, T(0, 0.6, 2.15)),                                 // fin
      part(new THREE.BoxGeometry(0.7, 0.42, 1.1), 0x1f2a44, T(0, 0.52, 0.25)),                              // canopy
      part(new THREE.BoxGeometry(0.1, 0.6, 0.1), 0x444a55, T(-1.1, -0.45, -0.6)), part(new THREE.BoxGeometry(0.1, 0.6, 0.1), 0x444a55, T(1.1, -0.45, -0.6)), // gear legs
    ]);
    const prop = mesh([part(new THREE.BoxGeometry(2.3, 0.2, 0.05), 0x2a2f3a), part(new THREE.BoxGeometry(0.2, 2.3, 0.05), 0x2a2f3a)]);
    prop.position.set(0, 0, -2.62); body.add(prop);
    return { object: body, prop };
  },

  /** What the pilot sees of their own plane: nose, spinning prop, wing roots low at the sides, a dash lip. Origin = pilot's eye. */
  cockpit(plane) {
    const col = plane.color;
    const body = mesh([
      part(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8), col, T(0, -0.62, -1.75, Math.PI / 2, 0, 0)),
      part(new THREE.CylinderGeometry(0.44, 0.42, 0.35, 8), 0xe9edf2, T(0, -0.62, -2.65, Math.PI / 2, 0, 0)),
      part(new THREE.BoxGeometry(3.4, 0.12, 1.3), col, T(-2.5, -0.72, -0.5)), part(new THREE.BoxGeometry(3.4, 0.12, 1.3), col, T(2.5, -0.72, -0.5)),
      part(new THREE.BoxGeometry(0.9, 0.13, 1.32), 0xffffff, T(-3.75, -0.72, -0.5)), part(new THREE.BoxGeometry(0.9, 0.13, 1.32), 0xffffff, T(3.75, -0.72, -0.5)),
      part(new THREE.BoxGeometry(0.7, 0.05, 0.2), 0x1f2a44, T(0, -0.42, -1.05, 0.5, 0, 0)),
    ]);
    const prop = mesh([part(new THREE.BoxGeometry(1.9, 0.16, 0.04), 0x2a2f3a), part(new THREE.BoxGeometry(0.16, 1.9, 0.04), 0x2a2f3a)]);
    prop.position.set(0, -0.62, -2.86); body.add(prop);
    return { object: body, prop };
  },

  shield() { return new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.28, depthWrite: false })); },
  rocket() { return mesh([part(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 6), 0xf04a3a, T(0, 0, 0, Math.PI / 2, 0, 0)), part(new THREE.ConeGeometry(0.28, 0.7, 6), 0xffffff, T(0, 0, -1.45, -Math.PI / 2, 0, 0)), part(new THREE.BoxGeometry(1.1, 0.06, 0.5), 0x333a48, T(0, 0, 0.9))]); },
  mine() { return new THREE.Mesh(bake(new THREE.IcosahedronGeometry(2.4, 0), c3(0x4b5568)), UNLIT); },
};
