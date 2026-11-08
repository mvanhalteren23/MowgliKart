import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WHEEL_R, GROUND_OFFSET } from './_mesh.js';

// Higher-fidelity procedural building blocks (smooth, rounded, many more segments than the original primitives).
// Real authored .glb assets still replace all of this; see ASSET_PIPELINE.md.
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const mat = (T, c, extra = {}) => new T.MeshToonMaterial({ color: c, ...extra });

export function rbox(T, w, h, d, r, color, pos = [0, 0, 0], name) {
  const m = new T.Mesh(new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.16 ? 1 : 2, Math.min(r, Math.min(w, h, d) / 2 - 0.001)), mat(T, color));
  m.position.set(...pos); if (name) m.name = name; return m;
}
export function ball(T, r, color, pos = [0, 0, 0], sc = [1, 1, 1], seg = 14) {
  const m = new T.Mesh(new T.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat(T, color)); m.position.set(...pos); m.scale.set(...sc); return m;
}
/** Capsule limb between two points. */
export function limb(T, a, b, r, color) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B);
  const m = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 9), mat(T, color));
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return m;
}
export function tube(T, a, b, r, color, seg = 8) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B);
  const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg), mat(T, color));
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return m;
}

/** Detailed wheel: rounded tyre with tread blocks, hub cap, spokes, bolts. Pivot at the wheel centre; spin axis = X. */
export function detailedWheel(T, name, pos, { radius = WHEEL_R, width = 0.22, tyre = 0x1c1c22, hub = 0xd5dae0, treads = 18 } = {}) {
  const g = new T.Group(); g.name = name; g.position.set(pos[0], GROUND_OFFSET + radius, pos[2]);
  const side = pos[0] < 0 ? -1 : 1;
  const tire = new T.Mesh(new T.TorusGeometry(radius - width * 0.32, width * 0.5, 16, 40), mat(T, tyre)); tire.rotation.y = Math.PI / 2; tire.scale.set(1, 1, 1); g.add(tire);
  for (let i = 0; i < treads; i++) { // tread blocks around the circumference
    const a = (i / treads) * Math.PI * 2, b = new T.Mesh(new T.BoxGeometry(width * 0.92, 0.05, 0.07), mat(T, 0x121216));
    b.position.set(0, Math.cos(a) * (radius - 0.005), Math.sin(a) * (radius - 0.005)); b.rotation.x = -a; g.add(b);
  }
  const rim = new T.Mesh(new T.CylinderGeometry(radius * 0.62, radius * 0.62, width * 0.7, 28), mat(T, hub)); rim.rotation.z = Math.PI / 2; g.add(rim);
  const cap = new T.Mesh(new T.CylinderGeometry(radius * 0.26, radius * 0.3, width * 0.2, 20), mat(T, 0xf2c14e)); cap.rotation.z = Math.PI / 2; cap.position.x = side * width * 0.4; g.add(cap);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, s = new T.Mesh(new T.BoxGeometry(width * 0.12, radius * 0.5, 0.045), mat(T, 0x9aa3ad)); s.position.set(side * width * 0.36, Math.cos(a) * radius * 0.4, Math.sin(a) * radius * 0.4); s.rotation.x = -a; g.add(s); }
  return g;
}

/** Fully detailed seated kid driver (origin at the seat, faces -Z). Per-kid variety from the id hash. */
export function detailedKid(T, c) {
  const h = hash(c.id), g = new T.Group(), helmet = new T.Color(c.helmet).getHex(), skin = new T.Color(c.skin).getHex();
  const HAIR = [0x3b2416, 0xd9a441, 0x14110f, 0xa8431f, 0x6b4a2a, 0xe8d28a], JACKET = [0x2f6fd8, 0xd93a3a, 0x27a870, 0xf2a22a, 0x8a52d9, 0x1b1b24];
  const hair = HAIR[h % 6], jacket = JACKET[(h >>> 3) % 6], lens = [0xffb02e, 0x41d6ff, 0xff5aa8, 0x7dff7a][(h >>> 5) % 4];
  const body = new T.Group(); g.add(body);
  // torso, zipper, collar
  body.add(ball(T, 0.24, jacket, [0, 0.36, 0.02], [1, 1.2, 0.9]));
  body.add(rbox(T, 0.03, 0.34, 0.03, 0.01, 0xe8edf2, [0, 0.38, -0.2]));
  body.add(ball(T, 0.15, jacket, [0, 0.58, 0], [1.25, 0.5, 1]));
  body.add(rbox(T, 0.34, 0.08, 0.12, 0.03, helmet, [0, 0.16, 0.04])); // belt in helmet colour
  // arms to a little steering wheel, gloves
  const sh = [[-0.27, 0.5, 0], [0.27, 0.5, 0]], el = [[-0.3, 0.36, -0.2], [0.3, 0.36, -0.2]], hd = [[-0.15, 0.4, -0.5], [0.15, 0.4, -0.5]];
  for (let i = 0; i < 2; i++) { body.add(limb(T, sh[i], el[i], 0.065, jacket)); body.add(limb(T, el[i], hd[i], 0.055, jacket)); body.add(ball(T, 0.075, 0xf4f6f8, hd[i], [1, 0.9, 1], 14)); }
  const wheel = new T.Mesh(new T.TorusGeometry(0.15, 0.022, 10, 32), mat(T, 0x25262e)); wheel.position.set(0, 0.4, -0.52); wheel.rotation.x = Math.PI / 2.6; body.add(wheel);
  body.add(tube(T, [0, 0.3, -0.5], [0, 0.1, -0.5], 0.02, 0x4a4d57));
  // legs + boots
  for (const x of [-0.12, 0.12]) { body.add(limb(T, [x, 0.1, 0.0], [x, 0.14, -0.3], 0.085, 0x2b3a67)); body.add(limb(T, [x, 0.14, -0.3], [x, 0.0, -0.5], 0.07, 0x2b3a67)); body.add(rbox(T, 0.13, 0.09, 0.2, 0.04, 0x2a2024, [x, -0.02, -0.56])); }
  // head
  const head = new T.Group(); head.position.set(0, 0.86, 0); body.add(head);
  head.add(ball(T, 0.27, skin, [0, 0, 0], [1, 1.02, 1], 26));
  for (const s of [-1, 1]) {
    head.add(ball(T, 0.075, 0xffffff, [s * 0.1, 0.04, -0.23], [1, 1.1, 0.7], 18));            // eye white
    head.add(ball(T, 0.042, [0x2a1a10, 0x1d3a6a, 0x1f5a2a][(h >>> 7) % 3], [s * 0.1, 0.04, -0.28], [1, 1.1, 0.5], 14)); // iris
    head.add(ball(T, 0.02, 0xffffff, [s * 0.1 + 0.015, 0.06, -0.31], [1, 1, 0.6], 8));          // glint
    head.add(limb(T, [s * 0.16, 0.14, -0.22], [s * 0.05, 0.16, -0.26], 0.014, hair));            // brows
    head.add(ball(T, 0.07, 0xff8a8a, [s * 0.16, -0.07, -0.2], [1, 0.7, 0.4], 12));               // cheeks
    head.add(ball(T, 0.05, skin, [s * 0.275, 0.0, 0.02], [0.5, 1, 0.8], 12));                    // ears
  }
  head.add(ball(T, 0.04, skin, [0, -0.02, -0.28], [1, 0.9, 0.9], 12));                          // nose
  const mouth = new T.Mesh(new T.TorusGeometry(0.08, 0.013, 8, 20, Math.PI), mat(T, 0x6a1a22)); mouth.position.set(0, -0.12, -0.25); mouth.rotation.z = Math.PI; mouth.scale.set(1, 0.8, 0.6); head.add(mouth);
  head.add(ball(T, 0.03, 0xffffff, [0, -0.145, -0.26], [2, 0.5, 0.6], 8));                      // little grin teeth
  if (h % 3 === 0) for (let i = 0; i < 5; i++) head.add(ball(T, 0.008, 0x9a5b3a, [((i % 3) - 1) * 0.04 + (i > 2 ? 0.1 : -0.1), -0.03 + (i % 2) * 0.02, -0.27], [1, 1, 0.5], 6)); // freckles
  // hair peeking out from under the helmet
  head.add(ball(T, 0.2, hair, [0, 0.0, 0.12], [1.15, 1, 0.8], 12));
  if (h % 2) head.add(limb(T, [0, 0.0, 0.26], [0, -0.22, 0.34], 0.06, hair)); // ponytail
  // helmet: dome with brim, stripes, vents
  const dome = new T.Mesh(new T.SphereGeometry(0.32, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(T, helmet)); dome.position.set(0, 0.06, 0.02); dome.scale.set(1.04, 1.02, 1.08); head.add(dome);
  const rim = new T.Mesh(new T.TorusGeometry(0.31, 0.022, 6, 28), mat(T, 0x20202a)); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.08, 0.02); rim.scale.set(1.04, 1.1, 1); head.add(rim);
  head.add(rbox(T, 0.07, 0.015, 0.62, 0.007, 0xffffff, [0, 0.375, 0.02]));
  head.add(rbox(T, 0.03, 0.012, 0.6, 0.005, c.id.length % 2 ? 0x222222 : 0xffd23a, [0.07, 0.37, 0.02]));
  for (const s of [-1, 1]) head.add(ball(T, 0.03, 0x20202a, [s * 0.26, 0.24, 0.0], [1, 1.5, 1], 8));
  // goggles on the forehead (strap + two lenses)
  const strap = new T.Mesh(new T.TorusGeometry(0.31, 0.03, 6, 28), mat(T, 0x20202a)); strap.rotation.x = Math.PI / 2; strap.position.set(0, 0.2, 0.02); strap.scale.set(1.0, 1.08, 1); head.add(strap);
  for (const s of [-1, 1]) {
    const fr = new T.Mesh(new T.TorusGeometry(0.075, 0.016, 8, 24), mat(T, 0x2a2b33)); fr.position.set(s * 0.11, 0.2, -0.31); head.add(fr);
    const ln = new T.Mesh(new T.CircleGeometry(0.07, 20), new T.MeshToonMaterial({ color: lens, transparent: true, opacity: 0.85 })); ln.position.set(s * 0.11, 0.2, -0.312); head.add(ln);
  }
  if (h % 4 === 1) for (const s of [-1, 1]) { const gl = new T.Mesh(new T.TorusGeometry(0.058, 0.01, 8, 20), mat(T, 0x30343c)); gl.position.set(s * 0.1, 0.04, -0.3); head.add(gl); } // round glasses
  g.userData.head = head;
  return g;
}

/* ------------------------------------------------------------------ playable karts */
const mount = (T, name, p) => { const o = new T.Object3D(); o.name = name; o.position.set(...p); return o; };
const grp = (T, name, p) => { const g = new T.Group(); g.name = name; g.position.set(...p); return g; };

export function detailedGroceryKart(T) {
  const root = new T.Group(), steel = 0xc9d0d8, steelD = 0x8d96a2, red = 0xd92b2b;
  root.add(rbox(T, 1.12, 0.12, 2.0, 0.05, steelD, [0, -0.38, 0.05]));                       // chassis plate
  for (const z of [-0.78, 0.78]) root.add(tube(T, [-0.62, -0.4, z], [0.62, -0.4, z], 0.035, 0x444b55, 10)); // axles
  for (const x of [-0.5, 0.5]) root.add(tube(T, [x, -0.38, -0.8], [x * 0.9, -0.1, -0.55], 0.03, steelD));  // front struts
  // basket floor: grid of wire
  for (let i = 0; i < 9; i++) root.add(tube(T, [-0.5 + i * 0.125, -0.2, -0.65], [-0.5 + i * 0.125, -0.2, 0.45], 0.012, steel, 6));
  for (let k = 0; k < 6; k++) root.add(tube(T, [-0.5, -0.2, -0.65 + k * 0.22], [0.5, -0.2, -0.65 + k * 0.22], 0.012, steel, 6));
  // side gates (detachable): rails + vertical wires
  for (const s of [-1, 1]) {
    const gate = grp(T, s < 0 ? 'Cosmetic_Panel_L' : 'Cosmetic_Panel_R', [s * 0.52, 0.02, -0.1]);
    gate.add(tube(T, [0, 0.24, -0.75], [0, 0.24, 0.55], 0.025, steel)); gate.add(tube(T, [0, -0.18, -0.75], [0, -0.18, 0.55], 0.02, steel));
    for (let i = 0; i < 12; i++) gate.add(tube(T, [0, -0.18, -0.75 + i * 0.118], [0, 0.24, -0.75 + i * 0.118], 0.011, steel, 6));
    gate.add(tube(T, [0, 0.0, -0.75], [0, 0.0, 0.55], 0.012, steel, 6));
    root.add(gate);
  }
  // front basket bumper (detachable): bent rail + bars, with a hazard stripe
  const bump = grp(T, 'Cosmetic_Bumper_Prop', [0, -0.05, -0.86]);
  bump.add(tube(T, [-0.54, 0.2, 0], [0.54, 0.2, 0], 0.03, steel)); bump.add(tube(T, [-0.54, -0.15, 0], [0.54, -0.15, 0], 0.025, steel));
  for (let i = 0; i < 8; i++) bump.add(tube(T, [-0.5 + i * 0.143, -0.15, 0], [-0.5 + i * 0.143, 0.2, 0], 0.011, steel, 6));
  bump.add(rbox(T, 0.5, 0.07, 0.04, 0.02, 0xffd23a, [0, 0.0, -0.03])); bump.add(rbox(T, 0.16, 0.12, 0.04, 0.02, red, [0.35, 0.0, -0.04]));
  root.add(bump);
  // child-seat flap (detachable "spoiler"): hinged panel at the back of the basket
  const flap = grp(T, 'Cosmetic_Roof_Spoiler', [0, 0.38, 0.62]); flap.rotation.x = 0.55;
  flap.add(rbox(T, 0.9, 0.06, 0.5, 0.03, red, [0, 0, 0])); for (let i = 0; i < 6; i++) flap.add(tube(T, [-0.4 + i * 0.16, 0.02, -0.2], [-0.4 + i * 0.16, 0.02, 0.2], 0.012, steel, 6));
  flap.add(ball(T, 0.05, 0xffffff, [0, 0.05, 0.2], [1.6, 0.5, 0.5], 10)); root.add(flap);
  // pushing handle with grip
  for (const x of [-0.5, 0.5]) root.add(tube(T, [x, -0.1, 0.78], [x, 0.55, 1.0], 0.03, steel));
  root.add(tube(T, [-0.5, 0.55, 1.0], [0.5, 0.55, 1.0], 0.04, 0x2b2f38)); root.add(tube(T, [-0.3, 0.55, 1.0], [0.3, 0.55, 1.0], 0.05, 0xd92b2b));
  // seat cushion + groceries in the basket
  root.add(rbox(T, 0.72, 0.14, 0.5, 0.06, 0x3a3f4a, [0, -0.02, 0.28]));
  root.add(rbox(T, 0.16, 0.34, 0.16, 0.03, 0xf2f6ff, [-0.32, 0.12, -0.42])); root.add(rbox(T, 0.17, 0.08, 0.17, 0.02, 0x3a8dde, [-0.32, 0.3, -0.42])); // milk carton
  root.add(limb(T, [0.25, 0.0, -0.5], [0.4, 0.3, -0.2], 0.05, 0xd9a050));                          // baguette
  root.add(ball(T, 0.11, 0xff7a1a, [0.1, 0.0, -0.5], [1, 1, 1], 12)); root.add(ball(T, 0.06, 0x3aa34a, [0.1, 0.12, -0.5], [1, 0.8, 1], 8)); // orange
  // twin firework rockets with paper wrap, fuses and nozzles
  for (const x of [-0.38, 0.38]) {
    const r = grp(T, 'rocket', [x, 0.12, 1.0]);
    const body = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 1.2, 20), new T.MeshToonMaterial({ color: red })); body.rotation.x = Math.PI / 2; r.add(body);
    const nose = new T.Mesh(new T.ConeGeometry(0.17, 0.4, 20), new T.MeshToonMaterial({ color: 0xffffff })); nose.rotation.x = -Math.PI / 2; nose.position.z = -0.8; r.add(nose);
    for (const z of [-0.35, 0.0, 0.35]) { const ring = new T.Mesh(new T.TorusGeometry(0.172, 0.018, 8, 24), new T.MeshToonMaterial({ color: 0xffd23a })); ring.position.z = z; r.add(ring); }
    const noz = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 0.22, 16), new T.MeshToonMaterial({ color: 0x2a2d35 })); noz.rotation.x = Math.PI / 2; noz.position.z = 0.7; r.add(noz);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, f = rbox(T, 0.03, 0.2, 0.28, 0.01, 0xffffff, [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.45]); f.rotation.z = a; r.add(f); }
    r.add(tube(T, [0, 0.17, -0.2], [0.06, 0.3, -0.3], 0.01, 0x6b4a2a, 6));
    root.add(r);
  }
  root.add(tube(T, [-0.38, -0.05, 0.78], [-0.38, -0.3, 0.9], 0.03, steelD)); root.add(tube(T, [0.38, -0.05, 0.78], [0.38, -0.3, 0.9], 0.03, steelD));
  // little pennant on a pole
  root.add(tube(T, [0.5, 0.2, -0.6], [0.5, 0.9, -0.6], 0.012, 0xffffff, 6)); const pen = rbox(T, 0.26, 0.15, 0.015, 0.004, 0xffd23a, [0.64, 0.84, -0.6]); root.add(pen);
  root.add(ball(T, 0.07, 0xfff3b0, [-0.4, -0.05, -0.9], [1, 1, 0.7], 12)); root.add(ball(T, 0.07, 0xfff3b0, [0.4, -0.05, -0.9], [1, 1, 0.7], 12)); // headlamps
  for (const k of Object.keys({ FL: [-0.62, 0, -0.78], FR: [0.62, 0, -0.78], RL: [-0.62, 0, 0.78], RR: [0.62, 0, 0.78] })) {
    const p = { FL: [-0.62, 0, -0.78], FR: [0.62, 0, -0.78], RL: [-0.62, 0, 0.78], RR: [0.62, 0, 0.78] }[k];
    root.add(detailedWheel(T, `Wheel_${k}`, p, { radius: 0.25, width: 0.2, tyre: 0x23252d, hub: 0xe6eaf0, treads: 16 }));
  }
  root.add(mount(T, 'Weapon_Mount', [0, 0.55, -0.3]), mount(T, 'Shield_Mount', [0, 0.2, 0]), mount(T, 'Driver_Seat', [0, 0.1, 0.28]));
  return root;
}

export function detailedCoopKart(T) {
  const root = new T.Group(), wood = [0xb5651d, 0xa35a18], woodD = 0x7a4a12, cedar = 0xc98a4b, redRoof = 0xc0392b;
  root.add(rbox(T, 1.3, 0.16, 2.05, 0.06, woodD, [0, -0.4, 0.05]));
  for (const z of [-0.78, 0.78]) root.add(tube(T, [-0.66, -0.4, z], [0.66, -0.4, z], 0.04, 0x3a3f46, 10));
  // hut (front half): stacked planks with corner posts
  for (let i = 0; i < 7; i++) root.add(rbox(T, 1.12, 0.12, 1.2, 0.03, wood[i % 2], [0, -0.26 + i * 0.125, -0.38]));
  for (const x of [-0.58, 0.58]) for (const z of [-0.96, 0.2]) root.add(rbox(T, 0.08, 0.95, 0.08, 0.03, woodD, [x, 0.17, z]));
  // dark entrance with a hen peeking out
  root.add(rbox(T, 0.46, 0.5, 0.05, 0.03, 0x1c120a, [0, 0.0, -0.99]));
  const hen = grp(T, 'hen', [0, 0.02, -1.03]); hen.add(ball(T, 0.17, 0xfff6e6, [0, -0.05, 0], [1, 1, 0.8], 16)); hen.add(ball(T, 0.1, 0xfff6e6, [0, 0.12, -0.02], [1, 1, 1], 14));
  hen.add(new T.Mesh(new T.ConeGeometry(0.035, 0.09, 8), new T.MeshToonMaterial({ color: 0xff9a1a }))); hen.children[hen.children.length - 1].rotation.x = -Math.PI / 2; hen.children[hen.children.length - 1].position.set(0, 0.11, -0.12);
  for (const x of [-0.03, 0, 0.03]) hen.add(ball(T, 0.03, 0xd62a2a, [x, 0.23, 0.0], [1, 1.3, 1], 8));
  for (const s of [-1, 1]) hen.add(ball(T, 0.018, 0x111111, [s * 0.05, 0.14, -0.09], [1, 1, 1], 8));
  root.add(hen);
  // barn roof: two shingled slopes + ridge
  for (const s of [-1, 1]) {
    const slope = grp(T, 'roofslope', [s * 0.36, 0.78, -0.38]); slope.rotation.z = -s * 0.62;
    slope.add(rbox(T, 0.9, 0.06, 1.35, 0.02, redRoof, [0, 0, 0]));
    for (let i = 0; i < 6; i++) slope.add(rbox(T, 0.9, 0.025, 0.13, 0.01, 0x9c2b20, [0, 0.04, -0.62 + i * 0.25]));
    root.add(slope);
  }
  const ridge = grp(T, 'Cosmetic_Roof_Spoiler', [0, 1.12, -0.38]);
  ridge.add(rbox(T, 0.12, 0.1, 1.42, 0.04, 0x8f2a20, [0, 0, 0])); for (const z of [-0.65, 0.65]) ridge.add(ball(T, 0.07, 0xffd24a, [0, 0.05, z], [1, 1, 1], 10)); root.add(ridge);
  // windows + cedar shutters (detachable L/R)
  for (const s of [-1, 1]) {
    root.add(rbox(T, 0.04, 0.34, 0.36, 0.02, 0x1c120a, [s * 0.57, 0.25, -0.38]));
    const sh = grp(T, s < 0 ? 'Cosmetic_Panel_L' : 'Cosmetic_Panel_R', [s * 0.64, 0.25, -0.38]);
    sh.add(rbox(T, 0.05, 0.42, 0.34, 0.02, cedar, [0, 0, 0])); for (let i = 0; i < 4; i++) sh.add(rbox(T, 0.02, 0.025, 0.28, 0.01, 0x8a5a26, [s * 0.03, -0.14 + i * 0.09, 0]));
    sh.add(ball(T, 0.025, 0x3a3f46, [s * 0.04, 0, 0.12], [1, 1, 1], 8)); root.add(sh);
  }
  // weather-vane rooster hood ornament (detachable "bumper prop")
  const vane = grp(T, 'Cosmetic_Bumper_Prop', [0, -0.05, -1.1]);
  vane.add(tube(T, [0, -0.2, 0], [0, 0.3, 0], 0.025, 0x3a3f46)); vane.add(tube(T, [-0.2, 0.3, 0], [0.2, 0.3, 0], 0.012, 0xffd24a, 6));
  vane.add(ball(T, 0.11, 0xe8a02a, [0, 0.42, 0], [1.2, 0.9, 0.7], 14)); vane.add(ball(T, 0.06, 0xe8a02a, [0, 0.52, -0.08], [1, 1, 1], 12)); vane.add(ball(T, 0.03, 0xd62a2a, [0, 0.6, -0.08], [1, 1.4, 1], 8));
  const tail = new T.Mesh(new T.ConeGeometry(0.07, 0.22, 8), new T.MeshToonMaterial({ color: 0x2f8d4e })); tail.position.set(0, 0.5, 0.14); tail.rotation.x = 0.9; vane.add(tail); root.add(vane);
  root.add(rbox(T, 0.3, 0.46, 0.3, 0.04, 0xb23a2a, [0.34, 1.25, 0.05]));                              // chimney
  // open driving bench behind the hut + hay + nest box with eggs + feed bucket
  root.add(rbox(T, 1.0, 0.1, 0.6, 0.04, cedar, [0, -0.1, 0.62])); for (const x of [-0.5, 0.5]) root.add(rbox(T, 0.06, 0.4, 0.6, 0.02, woodD, [x, 0.1, 0.62]));
  root.add(rbox(T, 0.5, 0.2, 0.34, 0.04, 0xd9a05b, [0.2, -0.05, 1.02])); for (let i = 0; i < 3; i++) root.add(ball(T, 0.06, 0xfff1d6, [0.08 + i * 0.12, 0.08, 1.02], [1, 1.2, 1], 10));
  root.add(new T.Mesh(new T.CylinderGeometry(0.13, 0.1, 0.2, 16), new T.MeshToonMaterial({ color: 0x8aa0b0 }))); root.children[root.children.length - 1].position.set(-0.38, -0.05, 1.0);
  for (const p of [[-0.62, 0, -0.78], [0.62, 0, -0.78], [-0.62, 0, 0.78], [0.62, 0, 0.78]].entries()) {
    const [i, pos] = p; root.add(detailedWheel(T, `Wheel_${['FL', 'FR', 'RL', 'RR'][i]}`, pos, { radius: 0.25, width: 0.3, tyre: 0x1a1a1f, hub: 0xcf4a2a, treads: 14 }));
  }
  root.add(mount(T, 'Weapon_Mount', [0, 1.35, -0.3]), mount(T, 'Shield_Mount', [0, 0.2, 0]), mount(T, 'Driver_Seat', [0, 0.02, 0.62]));
  return root;
}
