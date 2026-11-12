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
export const COURSES = {
  red_rock: {
    name: 'Red Rock Canyon', laps: 3,
    points: [[0, 0, 0], [270, -8, -30], [480, -26, 70], [540, -34, 300], [400, -14, 480], [170, 8, 430], [30, 26, 560], [-210, 16, 630], [-430, -6, 480], [-470, -22, 220], [-310, -10, 50], [-150, 0, -30]],
    width: (s) => 19 + 3.5 * Math.sin(TAU * 3 * s + 0.6),        // half-width in metres, s = 0..1 around the lap
    ceiling: (s) => 30 + 5 * Math.sin(TAU * 2 * s + 1.1),
    arches: [0.16, 0.47, 0.81],                                   // stone arches: the ceiling dips, fly under
    pillars: [[0.10, -6, 3.2], [0.24, 7, 3.6], [0.33, -2, 3.0], [0.40, 7, 3.4], [0.55, -7, 3.4], [0.63, 3, 3.0], [0.72, -7, 3.2], [0.88, 6, 3.4], [0.94, -5, 3.0]], // [s, lat, radius]
    rings: [[0.06, 0, 12], [0.20, -7, 16], [0.29, 8, 9], [0.37, -4, 18], [0.51, 6, 12], [0.60, -8, 15], [0.69, 4, 8], [0.77, -5, 17], [0.86, -6, 11], [0.97, 3, 14]], // boost rings [s, lat, h]
    balloons: [0.13, 0.44, 0.66, 0.91],                           // rows of item balloons
  },
};

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
  /** Signed shortest distance along the lap from a to b (positive = b is ahead of a). */
  gap(a, b) { let g = wrap(b - a, this.length); if (g > this.length / 2) g -= this.length; return g; }
}
