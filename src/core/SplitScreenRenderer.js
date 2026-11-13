import * as THREE from 'three';
import { GROUPS } from '../physics/PhysicsWorld.js';
import { HUD } from './HUD.js';
import { DRIFT_TIERS, FSM } from '../controllers/KartController.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/** Colour grade + vignette + radial speed blur (strength driven by boosts). Runs in linear space before OutputPass tone-mapping. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, boost: { value: 0 }, vig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float boost; uniform float vig;
    void main(){
      vec2 c = vUv - 0.5; float r = length(c);
      vec4 col = texture2D(tDiffuse, vUv);
      if (boost > 0.01) {
        vec3 acc = col.rgb; float n = 1.0;
        for (int i = 1; i <= 8; i++) { float s = float(i) / 8.0; acc += texture2D(tDiffuse, vUv - c * s * boost * 0.14 * smoothstep(0.08, 0.6, r)).rgb; n += 1.0; }
        col.rgb = acc / n;
      }
      float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(vec3(l), col.rgb, 1.14);
      col.rgb = (col.rgb - 0.5) * 1.12 + 0.5;
      col.rgb *= 1.0 - smoothstep(0.42, 0.95, r) * vig;
      gl_FragColor = col;
    }`,
};

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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2)); // phones: cap for performance
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.quality = 'high'; this.fx = null; this.boostBlur = 0;
    this.hud = new HUD(hudRoot);
    this.cams = [];
    this.players = 0;
    this.vr = null; this.vrHud = null;   // set by main: first-person headset rendering
    this.firstPerson = true;              // default view on every device is from the driver's seat (V / R3 / 👁 toggles the chase cam)
    addEventListener('resize', () => this.resize());
  }

  setPlayers(n) {
    this.players = n;
    this.hud.build(n);
    this.disposeFx();
    this.cams = Array.from({ length: n }, () => ({
      camera: new THREE.PerspectiveCamera(FOV_BASE, 16 / 9, 0.3, 3000), fov: FOV_BASE,
      fwd: new V(0, 0, -1), pos: new V(), init: false, look: new V(), cockpit: this.firstPerson,
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
    if (this.hud.panels.length) this.hud.layout(this.lay.views, this.lay.mini);
    this.lay.views.forEach((v, i) => { const c = this.cams[i]; if (c) { c.camera.aspect = v.w / v.h; c.camera.updateProjectionMatrix(); } });
    if (this.fx) { this.fx.composer.setPixelRatio(this.renderer.getPixelRatio()); this.fx.composer.setSize(W, H); }
  }

  _vFov(fov, aspect) {
    // keep the horizontal FOV of the 16:9 reference, so wide 2-player strips don't fisheye
    const tanH = Math.tan((fov * Math.PI) / 360) * REF_ASPECT;
    return Math.min(112, (2 * Math.atan(tanH / aspect) * 180) / Math.PI);
  }

  toggleCockpit(i = 0) { const c = this.cams[i]; if (c) c.cockpit = !c.cockpit; }

  _updateCam(c, kart, vis, dt, session) {
    if (c.cockpit) { // first-person: eyes at the driver's head, dashboard + turning wheel in view, FOV widens on boosts
      vis.setCockpit(true);
      const seat = vis.model.getObjectByName('Driver_Seat'), eye = new V(0, 0.95, -0.08);
      seat?.localToWorld(eye) ?? eye.copy(vis.root.position).add(new V(0, 1.2, 0));
      const fwd = new V(0, 0, -1).applyQuaternion(vis.root.quaternion);
      c.camera.position.copy(eye); c.camera.lookAt(eye.clone().addScaledVector(fwd, 20));
      c.fov += ((kart.isBoosting ? 112 : 98) - c.fov) * Math.min(1, 8 * dt);
      c.camera.fov = this._vFov(c.fov, c.camera.aspect); c.camera.updateProjectionMatrix(); c.init = false;
      return;
    }
    if (vis.isCockpit) vis.setCockpit(false);
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
    // cinematic summit flyover during the countdown: orbit + pull back, settling behind the kart by DROP!
    const seq = session?.state === 'COUNTDOWN' ? session.starts.get(kart.id) : null;
    if (seq) {
      const e = Math.max(0, 1 - seq.t / 2.9), ease = e * e * (3 - 2 * e), ang = ease * 2.3;
      const dx = want.x - pos.x, dz = want.z - pos.z, ca = Math.cos(ang), sa = Math.sin(ang), grow = 1 + ease * 1.4;
      want.x = pos.x + (dx * ca - dz * sa) * grow; want.z = pos.z + (dx * sa + dz * ca) * grow; want.y += ease * 9;
    }
    c.pos.lerp(want, 1 - Math.exp(-(seq ? 4 : 10) * dt));
    if (session) { // never clip through a tree trunk: shorten the arm to just in front of the first hit
      const o = pos.clone().add(new V(0, 1.6, 0)), dir = c.pos.clone().sub(o), len = dir.length();
      dir.normalize();
      const hit = session.physics.castRay(o.x, o.y, o.z, dir.x, dir.y, dir.z, len + 0.8, GROUPS.OBSTACLE, kart.body);
      let L = hit && hit.owner?.kind === 'tree' ? Math.max(1.4, hit.toi - 0.9) : len;
      // canopies are much wider than trunks: walk the arm in until the camera is outside every nearby crown
      const near = (session.trees ?? []).filter((t) => (t.p.x - o.x) ** 2 + (t.p.z - o.z) ** 2 < 28 * 28);
      const p = new V();
      for (; L > 1.4; L -= 0.5) {
        p.copy(o).addScaledVector(dir, L);
        if (!near.some((t) => { const r = 2.7 * t.scale + 0.6; return (t.p.x - p.x) ** 2 + (t.p.z - p.z) ** 2 < r * r && p.y > t.p.y - 0.5 && p.y < t.p.y + 8.6 * t.scale; })) break;
      }
      c.pos.copy(o).addScaledVector(dir, L);
    }
    c.camera.position.copy(c.pos);
    c.look.copy(pos).addScaledVector(c.fwd, CAM_LOOK).add(new V(0, 1.2, 0));
    const yt = session?.yeti?.yetis.find((y) => y.kart === kart);
    if (yt) c.look.lerp(yt.pos.clone().add(new V(0, 3, 0)), 0.45); // watch the yeti coming
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

  _ensureFx(session) {
    if (this.fx?.session === session && this.fx.quality === this.quality) return this.fx;
    this.disposeFx();
    const r = this.renderer, size = new THREE.Vector2(); r.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, rt);
    const pass = new RenderPass(session.scene, this.cams[0].camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.16, 0.55, 1.02);
    const grade = new ShaderPass(GradeShader);
    composer.addPass(pass);
    let gtao = null;
    if (this.quality === 'ultra') { // ground-truth ambient occlusion: contact shadows under trees, karts and ramps
      gtao = new GTAOPass(session.scene, this.cams[0].camera, innerWidth, innerHeight);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.6, thickness: 1.4, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
    }
    composer.addPass(bloom); composer.addPass(grade); composer.addPass(new OutputPass());
    composer.setPixelRatio(r.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
    this.fx = { session, composer, pass, grade, gtao, quality: this.quality };
    return this.fx;
  }
  disposeFx() { if (this.fx) { this.fx.composer.dispose(); this.fx = null; } }

  /** Player i's kart, or (spectating host / nobody local) the current race leader. */
  subject(session, i) { return session.humans[i] ?? (i === 0 ? session.spectateKart() : null); }

  /** Headset: one rig in the driver's seat, HUD on the dash, no post-processing, no shadow pass. */
  _renderVR(session, dt) {
    const kart = this.subject(session, 0), vis = session.visuals[session.karts.indexOf(kart)];
    if (session.sun?.castShadow) session.sun.castShadow = false;
    if (this._vrVis && this._vrVis !== vis) this._vrVis.setCockpit(false);
    this._vrVis = vis; vis.setCockpit(true);
    this.vr.follow(kart, vis, dt); session.viewPos.copy(this.vr.rig.position);
    // drifting: the edge of the view glows in the mini-turbo colour (pulsing as it charges); a bump is a quick white flash
    const drifting = kart.fsm === FSM.DRIFTING, tier = kart.drift.tier;
    this.vr.setFx(drifting ? (tier ? DRIFT_TIERS[tier - 1].color : '#ffc21a') : null, drifting ? 0.62 + 0.1 * tier + 0.14 * Math.sin(session.time * (8 + tier * 5)) : 0, kart.t.bump > 0 ? (kart.t.bump / 0.2) * Math.min(1, kart.bumpHard ?? 0.6) : 0);
    // lasso: the remote is the aim; a ring marks the rival it points at
    if (this.vr.mode === 'xr' && session.humans[0] === kart) { this.vr.ray((this._ro ??= new V()), (this._rd ??= new V())); session.lasso.aim(kart, this._ro, this._rd); }
    if (session.input) session.input.lassoLocked = this.vr.mode === 'xr' && !!kart.lassoAim && kart.lassoCd <= 0;
    session.lasso.showReticle(kart, this.vr.rig.position);
    this.vrHud.attach(this.vr.rig); this.vrHud.update(session, kart, dt, this.vr);
    this.vr.render(session.scene);
    session.messages.length = 0;
  }

  /** Light tiers render at 1 CSS pixel per pixel (a 2x screen would otherwise shade 4x the pixels). */
  _pixelRatio() {
    const want = this.quality === 'vr' || this.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    if (this.renderer.getPixelRatio() !== want) { this.renderer.setPixelRatio(want); this.resize(); }
  }

  render(session, dt) {
    const r = this.renderer;
    this._pixelRatio();
    if (this.vr?.active) return this._renderVR(session, dt);
    this.vrHud?.hide();
    if (this.quality !== 'low' && this.quality !== 'vr' && this.players === 1 && session.humans[0]) return this._renderPost(session, dt);
    r.setScissorTest(false); r.setClearColor(0x000000, 1); r.clear();
    r.setScissorTest(true);
    this.lay.views.forEach((v, i) => {
      const kart = this.subject(session, i), vis = session.visuals[session.karts.indexOf(kart)];
      if (!kart) return;
      const c = this.cams[i];
      if (!session.humans[i]) { c.cockpit = false; if (c.subject !== kart) { c.subject = kart; c.init = false; } } // spectator: chase cam on the leader
      this._updateCam(c, kart, vis, dt, session);
      r.setViewport(v.x, v.y, v.w, v.h); r.setScissor(v.x, v.y, v.w, v.h);
      if (i === 0) session.lasso.showReticle(this.players === 1 ? kart : null, c.camera.position);
      r.render(session.scene, c.camera);
      this.hud.update(i, session, kart);
    });
    if (this.lay.mini) {
      const m = this.lay.mini;
      r.setViewport(m.x, m.y, m.w, m.h); r.setScissor(m.x, m.y, m.w, m.h); r.setClearColor(0x10131c, 1); r.clear();
      this.hud.updateMini(session);
    }
    session.messages.length = 0;
  }

  /** Single-player pipeline: scene -> bloom -> grade/speed-blur/vignette -> tone-mapped output. */
  _renderPost(session, dt) {
    const r = this.renderer, kart = session.humans[0], vis = session.visuals[session.karts.indexOf(kart)];
    const c = this.cams[0], fx = this._ensureFx(session);
    this._updateCam(c, kart, vis, dt, session);
    r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight);
    fx.pass.camera = c.camera; if (fx.gtao) fx.gtao.camera = c.camera;
    const want = kart.isBoosting ? 1 : Math.min(0.25, kart.speed / 120);
    this.boostBlur += (want - this.boostBlur) * Math.min(1, 6 * dt);
    fx.grade.uniforms.boost.value = this.boostBlur;
    session.lasso.showReticle(kart, c.camera.position);
    fx.composer.render(dt);
    this.hud.update(0, session);
    session.messages.length = 0;
  }
}
