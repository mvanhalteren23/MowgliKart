import * as THREE from 'three';

/** Pooled additive point-sprite particle system (sparks, feathers, foam, smoke...). */
export class ParticleSystem {
  constructor(scene, max = 2500, size = 0.2) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.head = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -99999;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    // soft round sprite (falls back to square points without a DOM, e.g. in the headless sim)
    let map = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#fffa'); gr.addColorStop(1, '#fff0');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      map = new THREE.CanvasTexture(c);
    }
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, map,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, color, life, gravity = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this._c.set(color);
    this.base[o] = this._c.r; this.base[o + 1] = this._c.g; this.base[o + 2] = this._c.b;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = gravity;
  }
  burst(p, n, speed, color, life, gravity = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 2 - 0.4, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, e * s, Math.sin(a) * s, color, life * (0.6 + Math.random() * 0.4), gravity);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) { this.pos[o + 1] = -99999; this.col[o] = this.col[o + 1] = this.col[o + 2] = 0; continue; }
      this.vel[o + 1] -= this.grav[i] * dt;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[o] = this.base[o] * f; this.col[o + 1] = this.base[o + 1] * f; this.col[o + 2] = this.base[o + 2] * f;
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
  }
}
