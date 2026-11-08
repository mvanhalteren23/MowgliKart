import * as THREE from 'three';

let grad = null;
/** 4-band cel-shading ramp shared by every MeshToonMaterial (the reference art has crisp light/shadow steps). */
export function toonGradient() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([90, 150, 215, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
  }
  return grad;
}
/** Give every toon material under `root` the shared gradient (idempotent, cheap to call periodically). */
export function applyToon(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      if (x.isMeshToonMaterial && !x.gradientMap) { x.gradientMap = toonGradient(); x.needsUpdate = true; }
    }
  });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1b1424, side: THREE.BackSide });
/** Inverted-hull cartoon outline: a slightly enlarged black back-face copy of each opaque mesh. */
export function addOutlines(root, scale = 1.08) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.outline && !o.material.wireframe && !o.material.transparent) meshes.push(o); });
  for (const m of meshes) {
    const ol = new THREE.Mesh(m.geometry, outlineMat);
    ol.userData.outline = true; ol.scale.setScalar(scale);
    m.add(ol);
  }
}

/** Soft radial blob used for ground shadows. */
let blob = null;
export function blobTexture() {
  if (blob || typeof document === 'undefined') return blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(10,20,50,0.75)'); r.addColorStop(0.6, 'rgba(10,20,50,0.35)'); r.addColorStop(1, 'rgba(10,20,50,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
