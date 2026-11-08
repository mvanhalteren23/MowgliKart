import * as THREE from 'three';

const hasDOM = typeof document !== 'undefined';

/** Procedural sky dome: gradient, sun disc + glow, and slowly drifting fbm clouds. */
export function makeSky(theme, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      top: { value: new THREE.Color(theme.sky[0]) }, bot: { value: new THREE.Color(theme.sky[1]) },
      sunDir: { value: sunDir.clone().normalize() }, time: { value: 0 }, cloud: { value: theme.weather === 'snow' ? 0.9 : 0.7 },
    },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 p; uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform float time; uniform float cloud;
      float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 q){ vec2 i = floor(q), f = fract(q); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
      float fbm(vec2 q){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a*noise(q); q *= 2.03; a *= .5; } return s; }
      void main(){
        vec3 d = normalize(p);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(bot, top, pow(h, 0.5));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.82, 0.55) * pow(sd, 6.0) * 0.35 + vec3(1.0, 0.95, 0.8) * pow(sd, 64.0) * 0.6;
        col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9993, 0.9998, sd));
        if (d.y > 0.01) {
          vec2 uv = d.xz / (d.y + 0.28) * 1.6 + vec2(time * 0.012, time * 0.004);
          float c = smoothstep(0.48, 0.82, fbm(uv * 1.3));
          float lit = 0.82 + 0.18 * smoothstep(-0.2, 0.6, dot(normalize(vec3(d.x, 0.3, d.z)), normalize(sunDir)));
          col = mix(col, vec3(lit), c * cloud * smoothstep(0.01, 0.22, d.y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), mat);
  m.renderOrder = -10; m.userData.noShadow = true; m.frustumCulled = false;
  return m;
}

/** Soft round sprite used for snow flakes. */
export function softDot() {
  if (!hasDOM) return null;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, '#fff'); r.addColorStop(0.5, '#ffffffcc'); r.addColorStop(1, '#fff0');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Falling snow in a box that follows the camera target; flakes wrap around, wind blows them sideways. */
export class Snowfall {
  constructor(scene, n = 2600) {
    this.n = n; this.box = new THREE.Vector3(90, 45, 90);
    this.pos = new Float32Array(n * 3); this.sp = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.pos[i * 3] = Math.random(); this.pos[i * 3 + 1] = Math.random(); this.pos[i * 3 + 2] = Math.random(); this.sp[i] = 2.2 + Math.random() * 3; }
    this.geo = new THREE.BufferGeometry(); this.attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr);
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.2, map: softDot(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.points.userData.noShadow = true;
    scene.add(this.points); this.t = 0;
  }
  update(dt, center) {
    this.t += dt;
    const { pos, attr, box } = this, a = attr.array;
    const wx = 1.6 + Math.sin(this.t * 0.3) * 0.8;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      pos[o + 1] -= (this.sp[i] * dt) / box.y; pos[o] += (wx * dt) / box.x; pos[o + 2] += (0.4 * dt) / box.z;
      for (let k = 0; k < 3; k++) { if (pos[o + k] < 0) pos[o + k] += 1; else if (pos[o + k] > 1) pos[o + k] -= 1; }
      a[o] = center.x + (pos[o] - 0.5) * box.x; a[o + 1] = center.y + (pos[o + 1] - 0.35) * box.y; a[o + 2] = center.z + (pos[o + 2] - 0.5) * box.z;
    }
    attr.needsUpdate = true;
  }
}
