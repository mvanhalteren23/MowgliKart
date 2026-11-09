import * as THREE from 'three';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UP = new V3(0, 1, 0);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ Catmull-Rom (SPEC 3.1.1-2) */
// C(t) = 1/2 [1 t t² t³] M_CR [P(i-1) P(i) P(i+1) P(i+2)]ᵀ  (tension τ = 0.5)
function crPoint(p0, p1, p2, p3, t, o) {
  const t2 = t * t, t3 = t2 * t;
  for (const k of ['x', 'y', 'z']) {
    o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return o;
}
function crTangent(p0, p1, p2, p3, t, o) {
  const t2 = t * t;
  for (const k of ['x', 'y', 'z']) {
    o[k] = 0.5 * ((-p0[k] + p2[k]) + 2 * (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t + 3 * (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t2);
  }
  return o;
}

/** A Catmull-Rom curve with an arc-length table (distance <-> spline parameter). */
export class CurvePath {
  constructor(points, sub = 24) {
    const n = points.length;
    this.pts = points;
    this.ext = [points[0].clone().multiplyScalar(2).sub(points[1]), ...points,
      points[n - 1].clone().multiplyScalar(2).sub(points[n - 2])];
    const N = (n - 1) * sub;
    this.tabU = new Float64Array(N + 1);
    this.tabD = new Float64Array(N + 1);
    const prev = new V3(), cur = new V3();
    this.pointAtU(0, prev);
    let acc = 0;
    for (let i = 1; i <= N; i++) {
      const u = (i / N) * (n - 1);
      this.pointAtU(u, cur);
      acc += cur.distanceTo(prev);
      this.tabU[i] = u; this.tabD[i] = acc;
      prev.copy(cur);
    }
    this.length = acc;
  }
  pointAtU(u, out = new V3()) {
    const n = this.pts.length;
    u = clamp(u, 0, n - 1 - 1e-9);
    const i = Math.floor(u), e = this.ext;
    return crPoint(e[i], e[i + 1], e[i + 2], e[i + 3], u - i, out);
  }
  tangentAtU(u, out = new V3()) {
    const n = this.pts.length;
    u = clamp(u, 0, n - 1 - 1e-9);
    const i = Math.floor(u), e = this.ext;
    return crTangent(e[i], e[i + 1], e[i + 2], e[i + 3], u - i, out).normalize();
  }
  uAtDist(d) {
    const D = this.tabD, U = this.tabU;
    d = clamp(d, 0, this.length);
    let lo = 0, hi = D.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
    const span = D[hi] - D[lo] || 1;
    return U[lo] + ((d - D[lo]) / span) * (U[hi] - U[lo]);
  }
}

/* ------------------------------------------------------------------ Frenet / banking frames (SPEC 3.1.3) */
export class PathFrames {
  /**
   * Samples `count` evenly spaced (by arc length) frames. Each has centre P, tangent T, road-lateral B (right),
   * surface normal N = B x T. Banking angle phi is derived from curvature then applied with Rodrigues' formula.
   */
  static fromPath(path, count, { bankK = 25, bankMax = 0.2, bank = true, rampH = null } = {}) {
    const f = new PathFrames();
    f.M = count;
    f.length = path.length;
    f.P = []; f.T = []; f.B = []; f.N = [];
    f.dist = new Float64Array(count + 1);
    for (let k = 0; k <= count; k++) {
      const d = (path.length * k) / count;
      const u = path.uAtDist(d);
      const p = path.pointAtU(u), t = path.tangentAtU(u);
      f.dist[k] = d;
      if (rampH) p.y += rampH(d);
      f.P.push(p); f.T.push(t);
    }
    // signed curvature (positive = right turn) from heading change between neighbours
    const kap = new Float64Array(count + 1);
    for (let k = 1; k < count; k++) {
      const c = new V3().crossVectors(f.T[k - 1], f.T[k + 1]);
      kap[k] = -c.y / (f.dist[k + 1] - f.dist[k - 1]);
    }
    kap[0] = kap[1]; kap[count] = kap[count - 1];
    f.kappa = kap;
    // smooth banking over +-12 m
    const w = Math.max(1, Math.round(12 / (path.length / count)));
    const phi = new Float64Array(count + 1);
    if (bank) {
      for (let k = 0; k <= count; k++) {
        let s = 0, c = 0;
        for (let j = Math.max(0, k - w); j <= Math.min(count, k + w); j++) { s += kap[j]; c++; }
        phi[k] = clamp(bankK * (s / c), -bankMax, bankMax);
      }
    }
    for (let k = 0; k <= count; k++) {
      const T = f.T[k];
      const B0 = new V3().crossVectors(T, UP).normalize();
      // Rodrigues about T by phi (T.B0 = 0): B = B0 cos + (T x B0) sin
      const TxB = new V3().crossVectors(T, B0);
      const B = B0.multiplyScalar(Math.cos(phi[k])).addScaledVector(TxB, Math.sin(phi[k])).normalize();
      f.B.push(B);
      f.N.push(new V3().crossVectors(B, T).normalize());
    }
    return f;
  }

  /** Interpolated frame at distance d into `out` {P,T,B,N,i,t}. */
  sample(d, out = {}) {
    const x = clamp(d / this.length, 0, 1) * this.M;
    const i = Math.min(this.M - 1, Math.floor(x)), t = x - i;
    out.P = (out.P ?? new V3()).lerpVectors(this.P[i], this.P[i + 1], t);
    out.T = (out.T ?? new V3()).lerpVectors(this.T[i], this.T[i + 1], t).normalize();
    out.B = (out.B ?? new V3()).lerpVectors(this.B[i], this.B[i + 1], t).normalize();
    out.N = (out.N ?? new V3()).lerpVectors(this.N[i], this.N[i + 1], t).normalize();
    out.i = i; out.t = t;
    return out;
  }
  surface(d, lat, out = new V3()) {
    const s = this.sample(d, PathFrames._tmp);
    return out.copy(s.P).addScaledVector(s.B, lat);
  }
  curvature(d) { return this.kappa[clamp(Math.round((d / this.length) * this.M), 0, this.M)]; }

  /**
   * Project a world position onto the path near `hint` (a frame index, or -1 for a global search).
   * Returns {d, lat, idx, dist2}.
   */
  locate(pos, hint = -1, win = 40, out = {}) {
    const M = this.M;
    let lo = 0, hi = M, stride = 6;
    if (hint >= 0) { lo = Math.max(0, hint - win); hi = Math.min(M, hint + win); stride = 1; }
    let best = Infinity, bi = lo;
    for (let i = lo; i <= hi; i += stride) {
      const p = this.P[i];
      const dx = p.x - pos.x, dy = p.y - pos.y, dz = p.z - pos.z;
      const d2 = dx * dx + dy * dy * 0.5 + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    best = Infinity;
    let bk = bi, bt = 0;
    for (let k = Math.max(0, bi - stride - 1); k <= Math.min(M - 1, bi + stride); k++) {
      const a = this.P[k], b = this.P[k + 1];
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      const t = clamp(((pos.x - a.x) * abx + (pos.y - a.y) * aby + (pos.z - a.z) * abz) / len2, 0, 1);
      const dx = a.x + abx * t - pos.x, dy = a.y + aby * t - pos.y, dz = a.z + abz * t - pos.z;
      const d2 = dx * dx + dy * dy * 0.5 + dz * dz;
      if (d2 < best) { best = d2; bk = k; bt = t; }
    }
    const a = this.P[bk], b = this.P[bk + 1], Ba = this.B[bk], Bb = this.B[bk + 1];
    const cx = a.x + (b.x - a.x) * bt, cz = a.z + (b.z - a.z) * bt;
    const bx = Ba.x + (Bb.x - Ba.x) * bt, bz = Ba.z + (Bb.z - Ba.z) * bt;
    const bl = Math.hypot(bx, bz) || 1;
    out.lat = ((pos.x - cx) * bx + (pos.z - cz) * bz) / bl;
    out.d = this.dist[bk] + (this.dist[bk + 1] - this.dist[bk]) * bt;
    out.idx = bt > 0.5 ? bk + 1 : bk;
    out.dist2 = best;
    return out;
  }
}
PathFrames._tmp = {};

/* ------------------------------------------------------------------ procedural downhill centre line */
export function generateCenterline(def) {
  const rnd = mulberry32(def.seed);
  const L = def.length, step = 5, every = 60;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const [pMin, pMax] = def.pitch;
  const kappaAt = (d) => {
    let k = def.gentle * (0.55 * Math.sin((d / 520) * 6.283 + ph[0]) + 0.3 * Math.sin((d / 230) * 6.283 + ph[1]) + 0.25 * Math.sin((d / 135) * 6.283 + ph[2]));
    for (const s of def.sweepers) {
      if (d >= s.d && d <= s.d + s.len) {
        const u = (d - s.d) / s.len;
        const prof = smoothstep(0, 0.2, u) * smoothstep(0, 0.2, 1 - u);
        k += (s.dir * (s.turn * Math.PI / 180)) / (0.8 * s.len) * prof;
      }
    }
    return k;
  };
  let psi = 0;
  const pos = new V3(0, def.startHeight ?? 600, 0);
  const pts = [pos.clone()];
  for (let d = 0; d < L; d += step) {
    psi += kappaAt(d + step / 2) * step;
    const H = def.hills; // rolling crests and dips (radius of curvature stays > ~180 m so karts stay planted at speed)
    const pitchDeg = H
      ? Math.min(pMax, Math.max(pMin, H.mean + H.a1 * Math.sin((d / H.l1) * 6.283 + ph[2]) + H.a2 * Math.sin((d / H.l2) * 6.283 + ph[0])))
      : pMin + (pMax - pMin) * (0.5 + 0.5 * Math.sin((d / 700) * 6.283 + ph[2]));
    const blend = smoothstep(0, 90, d) * (1 - 0.7 * smoothstep(L - 250, L - 40, d));
    const pitch = ((2 + (pitchDeg - 2) * blend) * Math.PI) / 180;
    pos.x += Math.sin(psi) * Math.cos(pitch) * step;
    pos.y -= Math.sin(pitch) * step;
    pos.z -= Math.cos(psi) * Math.cos(pitch) * step;
    const dn = d + step;
    if (Math.round(dn) % every === 0 || dn >= L) pts.push(pos.clone());
  }
  pts.kappaAt = kappaAt;
  return pts;
}

/* ------------------------------------------------------------------ geometry builders */
/** Extrude a cross-section (array of {lat, up}) along frames. Returns typed arrays. */
/** Powder-field moguls (zero inside the groomed groove and fading out at the snowbank). */
export const moguls = (d, lat, g, hw) => {
  const a = Math.abs(lat), w = Math.min(1, Math.max(0, (a - g) / 3)) * Math.min(1, Math.max(0, (hw - 1.5 - a) / 4));
  return w * 0.3 * (Math.sin(d * 0.55 + lat * 0.9) * Math.sin(lat * 0.7 - d * 0.21) + 0.25 * Math.sin(d * 1.7 + lat));
};

export function buildRibbon(frames, section, { uvScale = 0.25, colorFn = null, offsetUp = 0, yFn = null } = {}) {
  const rows = frames.M + 1, cols = section.length;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const colors = colorFn ? new Float32Array(rows * cols * 3) : null;
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const P = frames.P[r], B = frames.B[r];
    for (let j = 0; j < cols; j++) {
      const o = (r * cols + j) * 3, s = section[j];
      positions[o] = P.x + B.x * s.lat;
      positions[o + 1] = P.y + B.y * s.lat + s.up + offsetUp + (yFn ? yFn(frames.dist[r], s.lat) : 0);
      positions[o + 2] = P.z + B.z * s.lat;
      uvs[(r * cols + j) * 2] = j / (cols - 1);
      uvs[(r * cols + j) * 2 + 1] = frames.dist[r] * uvScale;
      if (colors) { colorFn(r, j, frames.dist[r], c); colors[o] = c.r; colors[o + 1] = c.g; colors[o + 2] = c.b; }
    }
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = r * cols + j, b = r * cols + j + 1, a2 = (r + 1) * cols + j, b2 = (r + 1) * cols + j + 1;
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  return { positions, indices: new Uint32Array(idx), uvs, colors };
}

export const toBufferGeometry = (m) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  if (m.colors) g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
};

export function mergeMeshes(list) {
  let vc = 0, ic = 0;
  for (const m of list) { vc += m.positions.length; ic += m.indices.length; }
  const positions = new Float32Array(vc), indices = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const m of list) {
    positions.set(m.positions, vo);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo / 3;
    vo += m.positions.length; io += m.indices.length;
  }
  return { positions, indices };
}

/* ------------------------------------------------------------------ Janky Shortcut branch (SPEC 3.1.4) */
export const RAMP_LEN = 8;          // m, kicker length
export const RAMP_SLOPE = Math.tan((18 * Math.PI) / 180); // +18 deg incline (spec: 18-25)
export const TRICK_ZONE = 4.5;      // m before the lip (isJumpZone)

export const KICK_LEN = 8;   // entry kicker length (m)
export const KICK_SLOPE = Math.tan((25 * Math.PI) / 180); // steep 25 deg kicker (spec: 18-25)
export const KICK_GAP = 24;  // gap between the kicker lip and the deck start (m)

/**
 * Janky shortcut: a solid entry KICKER on the hairpin's inside lane, a 24 m gap, then an elevated 4.2 m wooden
 * deck that cuts a chord across the horseshoe and simply ENDS in a lip (karts drop back onto the road).
 * Entry needs ~0.9-0.95 v_top (or a trick / nitro boost) to clear the gap; a miss lands on the road below with the
 * 0.65x mud drag. Nothing descends across the road lane, so main-line traffic can never be trapped under it.
 */
export class ShortcutBranch {
  constructor(track, def) {
    Object.assign(this, { id: def.id, name: def.name, dEntry: def.dEntry, dExit: def.dExit });
    this.width = 4.2;
    this.track = track;
    const main = track.frames;
    // The shortcut lives on the INSIDE lane of the hairpin: sign of mean curvature (+ = right turn).
    let kSum = 0;
    for (let d = this.dEntry; d < this.dExit; d += 10) kSum += main.curvature(d);
    this.lat = def.lat ?? (kSum >= 0 ? 6.9 : -6.9);
    this.entryLipD = this.dEntry + KICK_LEN;
    this.deckStartD = this.entryLipD + KICK_GAP;
    const span = this.dExit - this.deckStartD;
    // Deck height is derived from the kicker so the jump is always makeable at ~0.95 v_top: the deck (before its
    // 1.9 m landing-lip dip) sits 1.7 m below the kicker lip, then tapers to 2.8 m above the road at the exit lip.
    const lipY = main.surface(this.entryLipD, this.lat).y + KICK_LEN * KICK_SLOPE;
    this.lift0 = Math.max(2.5, lipY - 1.7 - main.surface(this.deckStartD, this.lat).y);
    this.liftEnd = 2.8;
    const nSeg = Math.max(12, Math.round(span / 12));
    const a = main.surface(this.deckStartD, this.lat), b = main.surface(this.dExit, this.lat);
    const pts = [];
    for (let k = 0; k <= nSeg; k++) {
      const u = k / nSeg;
      const mp = main.surface(this.deckStartD + span * u, this.lat);
      const chord = a.clone().lerp(b, u);
      const bl = smoothstep(0.0, 0.34, u) * (1 - smoothstep(0.66, 1.0, u));
      const p = mp.lerp(chord, bl);
      p.y += this.lift0 + (this.liftEnd - this.lift0) * smoothstep(0, 1, u);
      pts.push(p);
    }
    this.path = new CurvePath(pts);
    this.length = this.path.length;
    this.frames = PathFrames.fromPath(this.path, Math.max(20, Math.round(this.length / 1.25)), { bank: false });
    // sloped landing lip: the first 12 m of the deck rises from 1.9 m below deck level (catches slightly low landings)
    for (let i = 0; i < this.frames.P.length; i++) {
      const dd = this.frames.dist[i];
      if (dd > 12) break;
      this.frames.P[i].y -= 1.9 * (1 - smoothstep(0, 12, dd));
    }
    this.mainLength = this.dExit - this.dEntry;
    // saving = how much shorter the chord route is than the main arc over the same stretch
    this.saving = 1 - (this.length + KICK_LEN + KICK_GAP) / this.mainLength;
  }

  /** Solid wedge kicker on the road (top + closed sides) as a mesh-data record. */
  _kickerMesh() {
    const main = this.track.frames, hw = this.width / 2, rows = Math.ceil(KICK_LEN / 0.5);
    const pos = [], idx = [];
    const v = (p) => { pos.push(p.x, p.y, p.z); return pos.length / 3 - 1; };
    for (let r = 0; r <= rows; r++) {
      const d = this.dEntry + (KICK_LEN * r) / rows, h = (d - this.dEntry) * KICK_SLOPE;
      const fr = main.sample(d, {});
      const c = fr.P;
      const pL = c.clone().addScaledVector(fr.B, this.lat - hw), pR = c.clone().addScaledVector(fr.B, this.lat + hw);
      const base = (q) => q.clone().setY(q.y - 0.25);
      const top = (q) => q.clone().setY(q.y + h);
      v(top(pL)); v(top(pR)); v(base(pL)); v(base(pR));
    }
    for (let r = 0; r < rows; r++) {
      const o = r * 4, n = o + 4; // [topL, topR, baseL, baseR]
      idx.push(o, o + 1, n, o + 1, n + 1, n);              // top
      idx.push(o, n, o + 2, n, n + 2, o + 2);              // left side
      idx.push(o + 1, o + 3, n + 1, o + 3, n + 3, n + 1);  // right side
    }
    const last = rows * 4;
    idx.push(last, last + 2, last + 1, last + 1, last + 2, last + 3); // lip face
    const n = pos.length / 3;
    const uvs = new Float32Array(n * 2);
    for (let r = 0; r <= rows; r++) for (let k = 0; k < 4; k++) { uvs[(r * 4 + k) * 2] = k & 1; uvs[(r * 4 + k) * 2 + 1] = r / rows; }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx), uvs, colors: null };
  }

  buildMesh() {
    const hw = this.width / 2, F = this.frames;
    const deck = buildRibbon(F, [{ lat: -hw, up: 0 }, { lat: hw, up: 0 }], { uvScale: 0.5 });
    const under = buildRibbon(F, [{ lat: -hw, up: -0.35 }, { lat: hw, up: -0.35 }], { uvScale: 0.5 });
    const sideL = buildRibbon(F, [{ lat: -hw, up: -0.35 }, { lat: -hw, up: 0 }], { uvScale: 0.5 });
    const sideR = buildRibbon(F, [{ lat: hw, up: 0 }, { lat: hw, up: -0.35 }], { uvScale: 0.5 });
    const kicker = this._kickerMesh();
    const extras = [under, sideL, sideR];
    return { deck, extras, kicker, physics: mergeMeshes([deck, ...extras, kicker]) };
  }
}

/* ------------------------------------------------------------------ the track */
export class TrackSpline {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.width = def.width ?? 18;
    this.open = !!def.open;
    this.grooveHalf = this.open ? (def.grooveHalf ?? 9) : this.width / 2; // half-width of the fast groomed lane
    this.curbHeight = 0.6;
    this.points = generateCenterline(def);
    this.path = new CurvePath(this.points);
    this.length = this.path.length;
    this.finishD = this.length - 90; // 90 m of flat run-out to brake after the line
    // Kickers belong on straights: search outward from the authored distance for the nearest low-curvature spot that keeps
    // >= 110 m from the previous kicker and stays out of the shortcut hairpins.
    const pre = PathFrames.fromPath(this.path, 2000, { bank: false }), placed = [];   // ramp-free frames: real geometric curvature
    const kap = (d) => Math.max(Math.abs(pre.curvature(d - 10)), Math.abs(pre.curvature(d)), Math.abs(pre.curvature(d + 10)));
    const inShortcut = (d) => (def.shortcuts ?? []).some((sc) => d > sc.dEntry - 45 && d < sc.dExit + 45);
    const nudge = (want) => {
      for (let off = 0; off <= 480; off += 12) for (const sgn of off ? [1, -1] : [1]) {
        const d = want + sgn * off;
        if (d < 130 || d > def.length - 260 || inShortcut(d) || kap(d) > 0.0034 || kap(d - 14) > 0.004 || kap(d + 14) > 0.004 || placed.some((p) => Math.abs(p - d) < 110)) continue;
        placed.push(d); return d;
      }
      placed.push(want); return want;
    };
    this.jumpRamps = [...def.jumps].sort((x, y) => x - y).map(nudge).sort((x, y) => x - y).map((lipD, i) => ({ id: i, lipD, startD: lipD - RAMP_LEN, zoneD: lipD - TRICK_ZONE, minLat: -Infinity, maxLat: Infinity, pathId: 'main' }));
    const rampH = (d) => {
      for (const r of this.jumpRamps) if (d >= r.startD && d < r.lipD) return (d - r.startD) * RAMP_SLOPE;
      return 0;
    };
    this.rampH = rampH;
    this.frames = PathFrames.fromPath(this.path, 2000, { rampH });
    this.shortcuts = def.shortcuts.map((s) => new ShortcutBranch(this, s));
    // each shortcut's entry kicker is also a trick zone (right-hand side of the road only)
    for (const sc of this.shortcuts) {
      this.jumpRamps.push({ id: `sc_${sc.id}`, lipD: sc.entryLipD, startD: sc.dEntry, zoneD: sc.entryLipD - TRICK_ZONE, minLat: sc.lat - 2.6, maxLat: sc.lat + 2.6, pathId: sc.id });
    }
  }
  /** Interpolated frame at normalised s in [0,1]. */
  at(s, out) { return this.frames.sample(s * this.length, out); }
  atDist(d, out) { return this.frames.sample(d, out); }
  surface(d, lat, out) { return this.frames.surface(d, lat, out); }
  locate(pos, hint, win, out) { return this.frames.locate(pos, hint, win, out); }
  curvature(d) { return this.frames.curvature(d); }

  /** Ramp whose trick zone currently contains (d, lat), else null. */
  rampAt(d, lat) {
    for (const r of this.jumpRamps) if (d >= r.zoneD && d <= r.lipD + 3 && lat >= r.minLat && lat <= r.maxLat) return r;
    return null;
  }
  /** Which shortcut (if any) a main-path distance falls within (for AI / penalty logic). */
  shortcutAt(d) { return this.shortcuts.find((s) => d >= s.dEntry && d <= s.dExit) ?? null; }

  /** Starting-grid pose for slot i (0 = pole). */
  gridSlot(i) {
    const row = i >> 1, col = i & 1;
    const d = 52 - row * 7 + col * 2.5; // 30+ m of road behind the last row; the start line is at d = 58
    const lat = col ? 3.2 : -3.2;
    const s = this.atDist(d);
    const pos = s.P.clone().addScaledVector(s.B, lat).addScaledVector(s.N, 0.9);
    return { pos, T: s.T.clone(), N: s.N.clone(), d, lat };
  }

  /** Road + curb meshes, terrain ribbon (visual) and merged physics trimesh arrays. */
  buildMeshes() {
    const rows = Math.ceil(this.length / 1.25);
    const mf = PathFrames.fromPath(this.path, rows, { rampH: this.rampH });
    const W = this.width, h = this.curbHeight, hw = W / 2;
    if (this.open) return this._buildOpenMeshes(mf);
    const road = buildRibbon(mf, [{ lat: -hw, up: 0 }, { lat: hw, up: 0 }], { uvScale: 0.25 });
    const A = new THREE.Color(this.def.theme.curbA), Bc = new THREE.Color(this.def.theme.curbB);
    const calmA = new THREE.Color(0xdfe6ee), calmB = new THREE.Color(0xb9c3cf);
    // bold red/white rumble strips only where the road is turning, calm stripes on straights
    const colorFn = (r, j, d, c) => { const on = Math.floor(d / 3.5) % 2, curve = Math.abs(mf.kappa[Math.min(r, mf.M)]) > 0.0022; c.copy(curve ? (on ? A : Bc) : (on ? calmA : calmB)); };
    const curbL = buildRibbon(mf, [{ lat: -hw - 0.5, up: h }, { lat: -hw, up: h }, { lat: -hw, up: 0 }], { colorFn });
    const curbR = buildRibbon(mf, [{ lat: hw, up: 0 }, { lat: hw, up: h }, { lat: hw + 0.5, up: h }], { colorFn });
    const terrain = buildRibbon(mf, [
      { lat: -hw - 140, up: -0.5 - 0.16 * 140 }, { lat: -hw - 0.4, up: -0.5 }, { lat: hw + 0.4, up: -0.5 }, { lat: hw + 140, up: -0.5 - 0.16 * 140 },
    ], { uvScale: 0.02 });
    return { road, curbL, curbR, terrain, physics: mergeMeshes([road, curbL, curbR]), frames: mf };
  }

  /** Open slope: groomed groove (fast) + moguly powder (slow) + snowbanks + wide terrain. */
  _buildOpenMeshes(mf) {
    const W = this.width, hw = W / 2, g = this.grooveHalf, BANK = 5.5, TOP = 3.1;
    const yFn = (d, l) => moguls(d, l, g, hw);
    const cols = (a, b) => { const n = Math.max(2, Math.round(Math.abs(b - a) / 2.2)); return Array.from({ length: n + 1 }, (_, i) => ({ lat: a + ((b - a) * i) / n, up: 0 })); };
    const road = buildRibbon(mf, [{ lat: -g, up: 0 }, { lat: g, up: 0 }], { uvScale: 0.25 });
    const powderL = buildRibbon(mf, cols(-hw, -g), { uvScale: 0.07, yFn });
    const powderR = buildRibbon(mf, cols(g, hw), { uvScale: 0.07, yFn });
    const white = (r, j, d, c) => c.setRGB(0.93 + 0.05 * (j / 2), 0.96 + 0.03 * (j / 2), 1);
    const bankL = buildRibbon(mf, [{ lat: -hw, up: 0 }, { lat: -hw - 3, up: 1.6 }, { lat: -hw - BANK, up: TOP }], { colorFn: white });
    const bankR = buildRibbon(mf, [{ lat: hw, up: 0 }, { lat: hw + 3, up: 1.6 }, { lat: hw + BANK, up: TOP }], { colorFn: white });
    const far = 220, slope = 0.16;
    const terrain = buildRibbon(mf, [
      { lat: -hw - BANK - far, up: TOP - slope * far }, { lat: -hw - BANK, up: TOP - 0.1 }, { lat: -hw - BANK + 0.2, up: -0.8 },
      { lat: hw + BANK - 0.2, up: -0.8 }, { lat: hw + BANK, up: TOP - 0.1 }, { lat: hw + BANK + far, up: TOP - slope * far },
    ], { uvScale: 0.02 });
    // out-of-bounds terrain is solid too, so you can leave the piste (and meet the yeti) instead of falling into the void
    // coarse collider (3 m rows, 10 m columns, 100 m wide): long skinny triangles would wreck the physics broadphase
    const mfc = PathFrames.fromPath(this.path, Math.ceil(this.length / 3), { rampH: this.rampH, bank: true });
    const COLS = 10, REACH = 100;
    const outer = (sgn) => buildRibbon(mfc, Array.from({ length: COLS + 1 }, (_, i) => { const o = (REACH * (sgn > 0 ? i : COLS - i)) / COLS; return { lat: sgn * (hw + BANK + o), up: TOP - 0.1 - slope * o }; }), { uvScale: 0.02 });
    const outerL = outer(-1), outerR = outer(1);
    this.oobLimit = hw + BANK + 8; // beyond this lateral offset the yeti comes
    return { road, powder: [powderL, powderR], curbL: bankL, curbR: bankR, terrain, physics: mergeMeshes([road]), physicsPowder: mergeMeshes([powderL, powderR, bankL, bankR, outerL, outerR]), frames: mf, open: true };
  }
}
