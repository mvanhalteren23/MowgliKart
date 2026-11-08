import * as THREE from 'three';

const V = THREE.Vector3;

/**
 * Animated gondola lift running alongside the slope (Whistler): pylons, two cables, red cabins that ride up one
 * cable and down the other and swing gently. Visual only.
 */
export function buildGondola(session) {
  const { track, scene } = session, hw = track.width / 2;
  const lat = hw + 5.5 + 30, g = new THREE.Group(); scene.add(g);
  const pts = [], gap = 80;
  for (let d = 220; d < track.length - 220; d += gap) {
    const p = track.surface(d, lat); p.y += 3.1 - 0.16 * (lat - hw - 5.5);
    pts.push(p);
  }
  const H = 15, top = pts.map((p) => p.clone().add(new V(0, H, 0)));
  // pylons + cross-arms
  const pylon = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.42, H, 8), new THREE.MeshToonMaterial({ color: 0x7c8794 }), pts.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.35, 0.5), new THREE.MeshToonMaterial({ color: 0x5f6a77 }), pts.length);
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => {
    const t = i + 1 < pts.length ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1]);
    const yaw = Math.atan2(t.x, t.z);
    m.compose(new V(p.x, p.y + H / 2, p.z), new THREE.Quaternion(), new V(1, 1, 1)); pylon.setMatrixAt(i, m);
    m.compose(new V(p.x, p.y + H - 0.2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, 0)), new V(1, 1, 1)); arm.setMatrixAt(i, m);
  });
  pylon.castShadow = arm.castShadow = true; g.add(pylon, arm);
  // two cables (offset sideways); polyline with a little sag
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x20252d });
  const lines = [-1.6, 1.6].map((off) => {
    const poly = top.map((p, i) => {
      const t = i + 1 < top.length ? top[i + 1].clone().sub(p) : p.clone().sub(top[i - 1]);
      const side = new V(t.z, 0, -t.x).normalize();
      return p.clone().addScaledVector(side, off).add(new V(0, -0.3, 0));
    });
    const seg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), cableMat, poly.length - 1);
    const cum = [0];
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i], b = poly[i + 1], len = a.distanceTo(b); cum.push(cum[i] + len);
      const mid = a.clone().lerp(b, 0.5).add(new V(0, -0.5, 0));
      const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), b.clone().sub(a).normalize());
      m.compose(mid, q, new V(1, 1, len)); seg.setMatrixAt(i, m);
    }
    g.add(seg);
    return { poly, cum, total: cum[cum.length - 1] };
  });
  // cabins
  const per = 18, count = per * 2;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 1.5, 1.5), new THREE.MeshToonMaterial({ color: 0xd9342b }), count);
  const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.22, 1.7), new THREE.MeshToonMaterial({ color: 0xf2f6ff }), count);
  const hang = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), new THREE.MeshToonMaterial({ color: 0x20252d }), count);
  const win = new THREE.InstancedMesh(new THREE.BoxGeometry(2.05, 0.6, 1.55), new THREE.MeshToonMaterial({ color: 0x9fd6ff }), count);
  for (const x of [body, roof, hang, win]) { x.frustumCulled = false; x.castShadow = x === body || x === roof; g.add(x); }
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new V(), tmp = new V(), s1 = new V(1, 1, 1);
  const sample = (line, s, out, dirOut) => {
    const { cum, poly } = line; s = ((s % line.total) + line.total) % line.total;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const u = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    out.lerpVectors(poly[lo], poly[hi], u); out.y -= Math.sin(u * Math.PI) * 0.5;
    dirOut.subVectors(poly[hi], poly[lo]).normalize();
  };
  return {
    update(t) {
      for (let c = 0; c < count; c++) {
        const line = lines[c < per ? 0 : 1], dir = c < per ? 1 : -1; // down one cable, up the other
        const s = (c % per) * (line.total / per) + dir * t * 6.5;
        sample(line, s, pos, tmp);
        const yaw = Math.atan2(tmp.x, tmp.z) + (dir < 0 ? 0 : 0), sway = Math.sin(t * 1.3 + c) * 0.05;
        q.setFromEuler(e.set(sway, yaw, sway * 0.6));
        const cab = new V(pos.x, pos.y - 2.4, pos.z);
        m.compose(cab, q, s1); body.setMatrixAt(c, m);
        m.compose(new V(cab.x, cab.y + 0.85, cab.z), q, s1); roof.setMatrixAt(c, m);
        m.compose(new V(cab.x, cab.y + 0.15, cab.z), q, s1); win.setMatrixAt(c, m);
        m.compose(new V(pos.x, pos.y - 0.85, pos.z), q, s1); hang.setMatrixAt(c, m);
      }
      for (const x of [body, roof, hang, win]) x.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(g); },
  };
}
