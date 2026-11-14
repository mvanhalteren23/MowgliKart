import * as THREE from 'three';

const V = THREE.Vector3;
const TAU = Math.PI * 2;
export const wrap = (x, L) => ((x % L) + L) % L;

/**
 * A closed canyon circuit. The centre line is the canyon FLOOR; the flyable corridor at distance d is
 *   |lat| <= halfWidth(d)   and   0 <= h <= ceiling(d)
 * with lat measured along the horizontal "right" vector and h straight up. Everything gameplay needs (walls, pillars,
 * boost rings, item balloons, arches) is described in these track coordinates, so collisions are a few comparisons -
 * no physics engine, no mesh queries.
 */
const WALL = 99; // "to the canyon wall" for block extents
/**
 * Course format. s = 0..1 around the lap.
 *   blocks   solid rock in track coordinates [s0, s1, lat0, lat1, h0, h1]: a DIVIDER (full height, splits the canyon into a
 *            left and right channel) or a SHELF (full width, a rock bridge: fly through the tunnel under it or over the top)
 *   caves    [s0, s1] roofed sections (dark, crystal-lit)
 *   thermals [s, lat, radius] rising air: lifts you (and tops up the daredevil meter)
 *   winds    [s0, s1, push] crosswind zones (m/s sideways, + = to the right), gusting
 *   theme    colours + decoration set used by the skin
 */
export const COURSES = {
  red_rock: {
    name: 'Red Rock Canyon', blurb: 'Wide and friendly: one fork, one rock bridge', laps: 3,
    theme: { deco: 'desert', rock: [0x8f3f26, 0xb5532f, 0xcf7a45, 0xe2a262, 0xedc88c], water: 0x2f9fb0, top: 0xe9cf9a, sky: [0x3f8fd8, 0xa9d6ee, 0xf2e3c2], fog: 0xd9e9ee, far: 0xd7b59a, glow: 0xffc928 },
    points: [[0, 0, 0], [270, -8, -30], [480, -26, 70], [540, -34, 300], [400, -14, 480], [170, 8, 430], [30, 26, 560], [-210, 16, 630], [-430, -6, 480], [-470, -22, 220], [-310, -10, 50], [-150, 0, -30]],
    width: (s) => 20 + 3.5 * Math.sin(TAU * 3 * s + 0.6),
    ceiling: (s) => 31 + 5 * Math.sin(TAU * 2 * s + 1.1),
    arches: [0.16, 0.47, 0.81],
    blocks: [[0.255, 0.315, -2.6, 2.6, 0, WALL], [0.555, 0.60, -WALL, WALL, 13, 19]],
    caves: [],
    thermals: [[0.70, 0, 9]],
    winds: [[0.84, 0.90, 7]],
    pillars: [[0.10, -6, 3.2], [0.22, 7, 3.6], [0.36, -2, 3.0], [0.40, 7, 3.4], [0.51, -7, 3.4], [0.64, 3, 3.0], [0.74, -7, 3.2], [0.88, 6, 3.4], [0.94, -5, 3.0]],
    rings: [[0.06, 0, 12], [0.20, -7, 16], [0.285, -11, 10], [0.29, 11, 16], [0.37, -8, 18], [0.51, 6, 12], [0.578, 0, 6.5], [0.585, 8, 25], [0.69, 4, 8], [0.705, 0, 24], [0.77, -5, 17], [0.86, -6, 11], [0.97, 3, 14]],
    balloons: [0.13, 0.44, 0.66, 0.91],
  },
  glacier: {
    name: 'Glacier Gorge', blurb: 'Tight S-bends, a long fork and an ice cave', laps: 3,
    theme: { deco: 'ice', rock: [0x3d5f8a, 0x5d86b3, 0x86b3d6, 0xb9d9ee, 0xeaf6ff], water: 0x1d6f9a, top: 0xffffff, sky: [0x29406e, 0xe58a6a, 0xffd9a8], fog: 0xe9c9b8, far: 0xb8a6c0, glow: 0x7fe8ff },
    points: [[0, 0, 0], [300, -6, 0], [520, -18, 120], [500, -30, 360], [300, -36, 470], [330, -28, 700], [120, -14, 820], [-120, -4, 700], [-80, 6, 460], [-320, 14, 380], [-520, 10, 520], [-700, 0, 330], [-560, -6, 80], [-300, -2, -40]],
    width: (s) => 19 + 3 * Math.sin(TAU * 4 * s + 1.4),
    ceiling: (s) => 30 + 4 * Math.sin(TAU * 3 * s),
    arches: [0.08, 0.63],
    blocks: [[0.19, 0.29, -2.4, 2.4, 0, WALL], [0.70, 0.745, -WALL, WALL, 12, 18], [0.86, 0.90, -2.4, 2.4, 0, WALL]],
    caves: [[0.40, 0.52]],
    thermals: [[0.60, -5, 8], [0.955, 4, 8]],
    winds: [[0.31, 0.37, -8], [0.76, 0.82, 8]],
    pillars: [[0.05, 6, 3.2], [0.13, -6, 3.4], [0.34, 5, 3.0], [0.43, -6, 2.8], [0.48, 6, 2.8], [0.57, -4, 3.4], [0.66, 6, 3.2], [0.80, -5, 3.2], [0.93, 0, 3.0]],
    rings: [[0.03, 0, 12], [0.11, 5, 15], [0.215, -11, 9], [0.24, 11, 18], [0.265, -11, 14], [0.33, -6, 12], [0.42, 5, 9], [0.455, 0, 14], [0.50, -5, 9], [0.605, -5, 24], [0.72, 0, 6], [0.725, -8, 24], [0.79, 6, 13], [0.88, -11, 12], [0.88, 11, 12], [0.96, 4, 23]],
    balloons: [0.09, 0.30, 0.54, 0.68, 0.84],
  },
  jungle: {
    name: 'Jungle Cavern', blurb: 'A long glowing cave, a double-decker bridge and updrafts', laps: 3,
    theme: { deco: 'jungle', rock: [0x3a4a2f, 0x55683a, 0x7a8a4a, 0x9aa85c, 0xc2c77a], water: 0x1f8a6a, top: 0x3f9a4d, sky: [0x1f6fb5, 0x9fe0d0, 0xe9f7c9], fog: 0xcfe9d6, far: 0x7fae8a, glow: 0xff7ad1 },
    points: [[0, 0, 0], [260, 10, -60], [480, 30, -10], [600, 40, 200], [480, 30, 400], [240, 10, 380], [100, -10, 560], [-160, -20, 600], [-380, -10, 440], [-420, 5, 180], [-260, 10, 0], [-120, 5, 60]],
    width: (s) => 19.5 + 3 * Math.sin(TAU * 5 * s + 0.3),
    ceiling: (s) => 32 + 4 * Math.sin(TAU * 2 * s + 2.2),
    arches: [0.56, 0.93],
    blocks: [[0.09, 0.14, -WALL, WALL, 13, 19], [0.42, 0.50, -2.5, 2.5, 0, WALL], [0.66, 0.72, -WALL, WALL, 14, 20], [0.80, 0.84, -2.4, 2.4, 0, WALL]],
    caves: [[0.18, 0.37]],
    thermals: [[0.06, 0, 8], [0.39, -5, 8], [0.63, 5, 8], [0.88, 0, 9]],
    winds: [[0.52, 0.56, 7], [0.74, 0.78, -7]],
    pillars: [[0.04, -6, 3.2], [0.21, 5, 2.8], [0.25, -5, 2.8], [0.29, 5, 2.8], [0.33, -5, 2.8], [0.53, 5, 3.4], [0.60, -6, 3.2], [0.76, 6, 3.2], [0.90, -5, 3.2], [0.96, 5, 3.0]],
    rings: [[0.02, 0, 12], [0.065, 0, 25], [0.115, 0, 6], [0.12, 6, 26], [0.23, -5, 10], [0.27, 5, 14], [0.31, -5, 10], [0.35, 0, 15], [0.395, -5, 24], [0.44, -11, 10], [0.47, 11, 17], [0.58, 0, 12], [0.635, 5, 25], [0.69, 0, 7], [0.695, -7, 27], [0.82, -11, 12], [0.82, 11, 12], [0.885, 0, 25], [0.98, 0, 13]],
    balloons: [0.15, 0.38, 0.57, 0.78, 0.94],
  },
};
export const COURSE_IDS = Object.keys(COURSES);
/** Speed classes (like 50 / 100 / 150 cc): everything flies faster, so the same bends ask for more. */
export const CLASSES = { 50: { speed: 0.8, label: '50cc · Cruise' }, 100: { speed: 1.0, label: '100cc · Sport' }, 150: { speed: 1.22, label: '150cc · Turbo' } };

export class Course {
  constructor(def, step = 4) {
    this.def = def; this.laps = def.laps ?? 3;
    const curve = new THREE.CatmullRomCurve3(def.points.map((p) => new V(...p)), true, 'centripetal');
    const L = curve.getLength(), n = Math.ceil(L / step);
    this.length = L; this.n = n; this.ds = L / n;
    this.P = []; this.T = []; this.R = []; this.halfW = new Float32Array(n); this.ceil = new Float32Array(n); this.kappa = new Float32Array(n);
    const up = new V(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const u = i / n, s = u;
      this.P.push(curve.getPointAt(u)); const t = curve.getTangentAt(u).normalize(); this.T.push(t);
      this.R.push(new V().crossVectors(t, up).normalize());
      let c = def.ceiling(s);
      for (const a of def.arches) { let ds = Math.abs(s - a); ds = Math.min(ds, 1 - ds) * L; c -= 11 * Math.exp(-(ds * ds) / (2 * 9 * 9)); } // arch: ~11 m dip, ~20 m long
      this.halfW[i] = def.width(s); this.ceil[i] = c;
    }
    for (let i = 0; i < n; i++) { // signed horizontal curvature (+ = right-hand bend), for the AI and tests
      const a = this.T[(i - 1 + n) % n], b = this.T[(i + 1) % n];
      this.kappa[i] = (a.z * b.x - a.x * b.z) / (2 * this.ds);
    }
    this.blocks = (def.blocks ?? []).map(([s0, s1, lat0, lat1, h0, h1]) => ({ d0: s0 * L, d1: s1 * L, mid: ((s0 + s1) / 2) * L, half: ((s1 - s0) / 2) * L, lat0, lat1, h0, h1, kind: h0 <= 0 ? 'divider' : 'shelf' }));
    for (const b of this.blocks) if (b.kind === 'shelf') for (let i = this.idx(b.d0 - 30); i !== this.idx(b.d1 + 30); i = (i + 1) % n) this.ceil[i] = Math.max(this.ceil[i], b.h1 + 11); // always room to go over the top
    this.caves = (def.caves ?? []).map(([s0, s1]) => ({ d0: s0 * L, d1: s1 * L }));
    this.thermals = (def.thermals ?? []).map(([s, lat, r]) => ({ d: s * L, lat, r }));
    this.winds = (def.winds ?? []).map(([s0, s1, push]) => ({ d0: s0 * L, d1: s1 * L, push }));
    this.pillars = def.pillars.map(([s, lat, r]) => ({ d: s * L, lat, r }));
    this.rings = def.rings.map(([s, lat, h]) => ({ d: s * L, lat, h, r: 5.5 }));
    this.arches = def.arches.map((s) => ({ d: s * L }));
    this.balloons = [];
    for (const s of def.balloons) for (const lat of [-9, -3, 3, 9]) this.balloons.push({ d: s * L, lat, h: 11 + (lat > 0 ? 3 : -2), r: 3.4 });
  }

  idx(d) { return Math.floor(wrap(d, this.length) / this.ds) % this.n; }
  /** Interpolated frame at distance d: { P, T, R, halfW, ceil }. */
  frame(d, out = {}) {
    const x = wrap(d, this.length) / this.ds, i = Math.floor(x) % this.n, j = (i + 1) % this.n, f = x - Math.floor(x);
    out.P = (out.P ?? new V()).lerpVectors(this.P[i], this.P[j], f);
    out.T = (out.T ?? new V()).lerpVectors(this.T[i], this.T[j], f).normalize();
    out.R = (out.R ?? new V()).lerpVectors(this.R[i], this.R[j], f).normalize();
    out.halfW = this.halfW[i] + (this.halfW[j] - this.halfW[i]) * f; out.ceil = this.ceil[i] + (this.ceil[j] - this.ceil[i]) * f;
    return out;
  }
  /** World position of track coordinates (d, lat, h). */
  point(d, lat, h, out = new V()) { const f = this.frame(d, (this._f ??= {})); return out.copy(f.P).addScaledVector(f.R, lat).setY(f.P.y + h + 0 * lat); }
  /** Track coordinates of a world position. hint = last sample index (or -1 for a full search). */
  locate(pos, hint = -1, out = {}) {
    const n = this.n; let best = 0, bd = Infinity;
    const scan = (i) => { const p = this.P[i], dx = pos.x - p.x, dz = pos.z - p.z, dy = (pos.y - p.y) * 0.3, q = dx * dx + dz * dz + dy * dy; if (q < bd) { bd = q; best = i; } };
    if (hint < 0) for (let i = 0; i < n; i++) scan(i); else for (let k = -10; k <= 14; k++) scan((hint + k + n) % n);
    const p = this.P[best], t = this.T[best], r = this.R[best];
    const along = (pos.x - p.x) * t.x + (pos.y - p.y) * t.y + (pos.z - p.z) * t.z;
    out.i = best; out.d = wrap(best * this.ds + along, this.length);
    out.lat = (pos.x - p.x) * r.x + (pos.z - p.z) * r.z;
    out.h = pos.y - (p.y + t.y * along);
    const x = out.d / this.ds, i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
    out.halfW = this.halfW[i] + (this.halfW[j] - this.halfW[i]) * f; out.ceil = this.ceil[i] + (this.ceil[j] - this.ceil[i]) * f;
    out.trackYaw = Math.atan2(-t.x, -t.z);
    return out;
  }
  inCave(d) { for (const c of this.caves) if (d >= c.d0 && d <= c.d1) return true; return false; }
  /** Signed shortest distance along the lap from a to b (positive = b is ahead of a). */
  gap(a, b) { let g = wrap(b - a, this.length); if (g > this.length / 2) g -= this.length; return g; }
}
