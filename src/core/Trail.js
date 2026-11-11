import * as THREE from 'three';

/** Fading ski/tyre track ribbon pressed into the snow behind a wheel (ring of `max` samples, newest first). */
export class Trail {
  constructor(scene, { max = 120, width = 0.15, color = [0.45, 0.58, 0.82], every = 0.05, additive = false, alpha = 0.5, fade = 0.985 } = {}) {
    this.alpha = alpha; this.fade = fade;
    this.max = max; this.w = width; this.every = every; this.t = 0; this.n = 0; this.color = color;
    this.pos = new Float32Array(max * 2 * 3); this.col = new Float32Array(max * 2 * 4);
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa); this.geo.setAttribute('color', this.ca); this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, fog: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false; this.mesh.userData.noShadow = true;
    scene.add(this.mesh); this.scene = scene;
  }
  push(p, right, active, dt, rgb = null) {
    this.t += dt;
    if (this.t < this.every) return;
    this.t = 0;
    // idle: once every sample has scrolled out, stop re-uploading the buffers and stop drawing it
    this.idle = active ? 0 : (this.idle ?? 0) + 1;
    if (this.idle > this.max) { if (this.mesh.visible) { this.mesh.visible = false; this.n = 0; this.geo.setDrawRange(0, 0); } return; }
    this.mesh.visible = true;
    const { pos, col, max, w } = this;
    pos.copyWithin(6, 0, (max - 1) * 6); col.copyWithin(8, 0, (max - 1) * 8);
    pos[0] = p.x - right.x * w; pos[1] = p.y + 0.05; pos[2] = p.z - right.z * w;
    pos[3] = p.x + right.x * w; pos[4] = p.y + 0.05; pos[5] = p.z + right.z * w;
    const a = active ? this.alpha : 0, c = rgb ?? this.color;
    for (let k = 0; k < 2; k++) { col[k * 4] = c[0]; col[k * 4 + 1] = c[1]; col[k * 4 + 2] = c[2]; col[k * 4 + 3] = a; }
    for (let i = 8; i < max * 8; i += 4) col[i + 3] *= this.fade; // fades out / filled in by drifting snow
    this.n = Math.min(this.n + 1, max);
    this.geo.setDrawRange(0, Math.max(0, (this.n - 1) * 6));
    this.pa.needsUpdate = true; this.ca.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mesh.material.dispose(); }
}
