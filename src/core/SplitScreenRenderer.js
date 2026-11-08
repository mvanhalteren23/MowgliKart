import * as THREE from 'three';
import { HUD } from './HUD.js';

const V = THREE.Vector3;
export const FOV_BASE = 91, FOV_BOOST = 108;           // SPEC 3.7.2 (+30% wide chase camera)
export const CAM_OFFSET = new V(0, 3.4, 7.8);          // pulled-back spring arm (chassis-local)
export const CAM_LOOK = 14.0;                          // look-at target 14 m down the slope
const REF_ASPECT = 16 / 9;

/** One WebGLRenderer + scissor test, 1-4 viewports, each with its own spring-arm chase camera and DOM HUD. */
export class SplitScreenRenderer {
  constructor(canvas, hudRoot) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.autoClear = false;
    this.hud = new HUD(hudRoot);
    this.cams = [];
    this.players = 0;
    addEventListener('resize', () => this.resize());
  }

  setPlayers(n) {
    this.players = n;
    this.hud.build(n);
    this.cams = Array.from({ length: n }, () => ({
      camera: new THREE.PerspectiveCamera(FOV_BASE, 16 / 9, 0.3, 3000), fov: FOV_BASE,
      fwd: new V(0, 0, -1), pos: new V(), init: false, look: new V(),
    }));
    this.resize();
  }

  /** Viewports in CSS px, y measured from the bottom (GL) plus `top` for CSS. */
  layout(W, H) {
    const n = this.players, r = (x, y, w, h) => ({ x, y, w, h, top: H - y - h });
    if (n <= 1) return { views: [r(0, 0, W, H)] };
    if (n === 2) return { views: [r(0, H / 2, W, H / 2), r(0, 0, W, H / 2)] };
    const w = W / 2, h = H / 2;
    const views = [r(0, h, w, h), r(w, h, w, h), r(0, 0, w, h), r(w, 0, w, h)].slice(0, n);
    return { views, mini: n === 3 ? r(w, 0, w, h) : null };
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.size = { W, H };
    this.lay = this.layout(W, H);
    this.hud.layout(this.lay.views, this.lay.mini);
    this.lay.views.forEach((v, i) => { this.cams[i].camera.aspect = v.w / v.h; this.cams[i].camera.updateProjectionMatrix(); });
  }

  _vFov(fov, aspect) {
    // keep the horizontal FOV of the 16:9 reference, so wide 2-player strips don't fisheye
    const tanH = Math.tan((fov * Math.PI) / 360) * REF_ASPECT;
    return Math.min(112, (2 * Math.atan(tanH / aspect) * 180) / Math.PI);
  }

  _updateCam(c, kart, vis, dt) {
    const pos = vis.root.position, k = 1 - Math.exp(-6 * dt);
    // desired heading: chassis forward blended with velocity direction (steady through spins / oil)
    const f = new V(0, 0, -1).applyQuaternion(vis.root.quaternion);
    if (kart.speed > 6) f.lerp(kart.vel.clone().normalize(), 0.35);
    f.y = THREE.MathUtils.clamp(f.y, -0.45, 0.35);
    f.normalize();
    if (!c.init) { c.fwd.copy(f); c.init = true; c.pos.copy(pos).addScaledVector(f, -CAM_OFFSET.z).add(new V(0, CAM_OFFSET.y, 0)); }
    c.fwd.lerp(f, k).normalize();
    // spring-arm: +30% pulled back offset (0, 3.4, 7.8) in the (smoothed) chassis frame
    const flat = new V(c.fwd.x, 0, c.fwd.z).normalize();
    const want = pos.clone().addScaledVector(flat, -CAM_OFFSET.z).addScaledVector(new V(0, 1, 0), CAM_OFFSET.y).addScaledVector(c.fwd, -0.0);
    if (c.fwd.y > 0) want.y -= c.fwd.y * 1.5; else want.y += -c.fwd.y * 2.0;
    c.pos.lerp(want, 1 - Math.exp(-10 * dt));
    c.camera.position.copy(c.pos);
    c.look.copy(pos).addScaledVector(c.fwd, CAM_LOOK).add(new V(0, 1.2, 0));
    c.camera.lookAt(c.look);
    // FOV 91 -> 108 on boosts (mini-turbo, trick, slipstream, nitro), lerp(fov, target, 8 dt)
    const target = kart.isBoosting ? FOV_BOOST : FOV_BASE;
    c.fov += (target - c.fov) * Math.min(1, 8 * dt);
    const asp = c.camera.aspect;
    c.camera.fov = this._vFov(c.fov, asp);
    c.camera.updateProjectionMatrix();
    // screen shake while boosting hard
    if (kart.isBoosting) c.camera.position.add(new V((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, 0));
  }

  render(session, dt) {
    const r = this.renderer;
    r.setScissorTest(false); r.setClearColor(0x000000, 1); r.clear();
    r.setScissorTest(true);
    this.lay.views.forEach((v, i) => {
      const kart = session.humans[i], vis = session.visuals[session.karts.indexOf(kart)];
      if (!kart) return;
      const c = this.cams[i];
      this._updateCam(c, kart, vis, dt);
      r.setViewport(v.x, v.y, v.w, v.h); r.setScissor(v.x, v.y, v.w, v.h);
      r.render(session.scene, c.camera);
      this.hud.update(i, session);
    });
    if (this.lay.mini) {
      const m = this.lay.mini;
      r.setViewport(m.x, m.y, m.w, m.h); r.setScissor(m.x, m.y, m.w, m.h); r.setClearColor(0x10131c, 1); r.clear();
      this.hud.updateMini(session);
    }
    session.messages.length = 0;
  }
}
