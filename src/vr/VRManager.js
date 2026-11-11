import * as THREE from 'three';

const V = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const UP = new V(0, 1, 0);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export const STEER_MODES = ['tilt', 'pad', 'head'];
export const STEER_LABEL = { tilt: 'Tilt the remote', pad: 'Touchpad left/right', head: 'Tilt your head' };
export const SHARPNESS = { low: 0.5, medium: 0.65, high: 0.85 };

/** Standalone headset / headset browser (Pico, Quest, Firefox Reality, Wolvic...): these get the light 'vr' graphics tier by default. */
export const IS_HEADSET = typeof navigator !== 'undefined' && /Pico|OculusBrowser|Quest|Wolvic|Mobile VR|Firefox Reality|VR\b/i.test(navigator.userAgent ?? '');
const TILT_FULL = (34 * Math.PI) / 180, HEAD_FULL = (20 * Math.PI) / 180;

/**
 * First-person VR for 3DoF standalone headsets (built for the Pico G2 4K and its one-hand remote), via WebXR.
 *
 *  - mode 'xr'  : real immersive-vr session (reference space "local": works with rotation-only tracking)
 *  - mode 'sim' : side-by-side stereo on the normal canvas with device-orientation / mouse head look
 *                 (Cardboard-style phones, and the way the automated tests exercise the whole VR pipeline)
 *
 * The camera hangs off a `rig` that rides in the driver's seat: yaw follows the kart tightly, pitch follows the road
 * smoothly, roll is locked to the horizon and the heading is frozen while the kart is spun/thrown (comfort).
 *
 * Pico G2 4K remote -> game:
 *   tilt remote (roll)  steer            (or touchpad X / head tilt, see STEER_MODES)
 *   trigger             hold = hop + drift, release = mini-turbo; tap before a ramp lip = trick; countdown: hold = throttle
 *   touchpad click      use item, else fire weapon (click the lower third = shield); countdown: rhythm pump
 *   touchpad lower edge touch = brake / reverse. Gas is automatic.
 *   App/Back and Home belong to the browser / system (Back leaves VR).
 */
export class VRManager {
  constructor(gl) {
    this.gl = gl;
    this.mode = 'off';
    this.steerMode = STEER_MODES.includes(store.get('mk_vr_steer')) ? store.get('mk_vr_steer') : 'tilt';
    this.sharpness = SHARPNESS[store.get('mk_vr_sharp2')] ? store.get('mk_vr_sharp2') : 'low'; // G2 4K: 0.5 x 3840x2160 is still ~1k per eye
    this.supported = false;
    this.ready = (navigator.xr?.isSessionSupported?.('immersive-vr') ?? Promise.resolve(false)).then((ok) => (this.supported = !!ok)).catch(() => false);
    this.listeners = new Set();

    this.rig = new THREE.Group(); this.rig.name = 'VRRig';
    this.camera = new THREE.PerspectiveCamera(96, 1, 0.06, 1100);
    this.head = new THREE.Group(); // sim mode: head look. xr mode: identity (the XR pose is applied to the camera itself)
    this.rig.add(this.head); this.head.add(this.camera);
    this.eyes = [new THREE.PerspectiveCamera(96, 1, 0.06, 1100), new THREE.PerspectiveCamera(96, 1, 0.06, 1100)];
    this.eyes[0].position.x = -0.032; this.eyes[1].position.x = 0.032; this.head.add(...this.eyes);

    // controller (three keeps this group posed from the XR target-ray space, in rig-local coordinates)
    this.ctrl = gl.xr.getController(0); this.rig.add(this.ctrl);
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new V(0, 0, 0), new V(0, 0, -1)]);
    this.laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0x8be9fd, transparent: true, opacity: 0.8 }));
    this.laser.scale.z = 3; this.laser.visible = false; this.laser.frustumCulled = false; this.ctrl.add(this.laser);
    const wand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.14), new THREE.MeshBasicMaterial({ color: 0x2b3350 })); wand.position.z = 0.05; this.ctrl.add(wand); this.wand = wand;
    this.ctrl.visible = false;
    this.in = { trigger: false, triggerEdge: false, click: false, clickEdge: false, clickY: 0, padX: 0, padY: 0, touching: false, steer: 0, has: false };
    this._prevBtn = [];
    this.ctrl.addEventListener('selectstart', () => { this._selectEvents = true; this.in.trigger = true; this.in.triggerEdge = true; this._select = true; });
    this.ctrl.addEventListener('selectend', () => { this.in.trigger = false; });
    this.ctrl.addEventListener('squeezestart', () => { this.in.clickEdge = true; this.in.clickY = 0; });
    this.ctrl.addEventListener('connected', (e) => { this.source = e.data; this.ctrl.visible = true; });
    this.ctrl.addEventListener('disconnected', () => { this.source = null; this.ctrl.visible = false; });

    // comfort vignette: darkens the periphery while turning hard / boosting (reduces vection on a 3DoF headset)
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, uniforms: { k: { value: 0 } },
      vertexShader: 'varying vec2 v; void main(){ v = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 v; uniform float k; void main(){ float r = length(v) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.02, smoothstep(1.0 - 0.62 * k, 1.15 - 0.3 * k, r) * min(1.0, k * 1.6)); }',
    }));
    this.vig.position.z = -0.35; this.vig.scale.setScalar(0.62); this.vig.renderOrder = 999; this.vig.frustumCulled = false; this.vig.userData.noOutline = true;
    this.camera.add(this.vig);
    this.vigK = 0; this.yaw = 0; this.pitch = 0; this.init = false; this._eyeLocal = new WeakMap();
    this.simLook = { yaw: 0, pitch: 0, roll: 0 };
    this._q = new Q(); this._v = new V(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._bindSim();
  }

  get active() { return this.mode !== 'off'; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { document.body.classList.toggle('vr', this.active); document.body.classList.toggle('vr-xr', this.mode === 'xr'); for (const f of this.listeners) f(this.mode); }
  setSteer(m) { this.steerMode = m; store.set('mk_vr_steer', m); }
  setSharpness(s) { this.sharpness = s; store.set('mk_vr_sharp2', s); }

  /** Must be called from a user gesture (click / controller select) for kind 'xr'. */
  async enter(kind = 'xr') {
    if (this.active) return true;
    if (kind === 'xr') {
      if (!navigator.xr) return false;
      const gl = this.gl;
      gl.xr.enabled = true;
      gl.xr.setReferenceSpaceType('local');
      gl.xr.setFramebufferScaleFactor(SHARPNESS[this.sharpness] ?? 0.65); // Pico G2 4K: 3840x2160 panel on an Adreno 540 - render below native
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      await gl.xr.setSession(session);
      try { gl.xr.setFoveation?.(1); } catch { /* optional */ }
      this.session = session;
      session.addEventListener('end', () => { this.session = null; this.mode = 'off'; this.laser.visible = false; gl.xr.enabled = false; this._emit(); dispatchEvent(new Event('resize')); });
      this.mode = 'xr';
    } else { this.mode = 'sim'; try { await DeviceOrientationEvent?.requestPermission?.(); } catch { /* not iOS */ } }
    this.head.quaternion.identity(); this.init = false;
    this._emit();
    return true;
  }
  async exit() {
    if (this.mode === 'xr') await this.session?.end().catch(() => {});
    else if (this.mode === 'sim') { this.mode = 'off'; this._emit(); dispatchEvent(new Event('resize')); }
  }

  /* ------------------------------------------------------------------ sim-mode head look */
  _bindSim() {
    addEventListener('deviceorientation', (e) => {
      if (this.mode !== 'sim' || e.alpha == null) return;
      const d = Math.PI / 180, o = (screen.orientation?.angle ?? 0) * d;
      // standard device-orientation -> camera quaternion (same maths as three's DeviceOrientationControls)
      this._e.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
      const q = this._q.setFromEuler(this._e).multiply(new Q(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)).multiply(new Q().setFromAxisAngle(new V(0, 0, 1), -o));
      if (this._simYaw0 == null) { const f = new V(0, 0, -1).applyQuaternion(q); this._simYaw0 = Math.atan2(-f.x, -f.z); }
      this.head.quaternion.copy(new Q().setFromAxisAngle(UP, -this._simYaw0)).multiply(q);
      this._gyro = true;
    });
    let drag = null;
    addEventListener('pointerdown', (e) => { if (this.mode === 'sim' && !this._gyro && e.pointerType === 'mouse') drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', () => { drag = null; });
    addEventListener('pointermove', (e) => {
      if (!drag || this.mode !== 'sim') return;
      this.simLook.yaw -= (e.clientX - drag.x) * 0.004; this.simLook.pitch = clamp(this.simLook.pitch - (e.clientY - drag.y) * 0.004, -1.2, 1.2);
      drag = { x: e.clientX, y: e.clientY };
      this.head.quaternion.setFromEuler(this._e.set(this.simLook.pitch, this.simLook.yaw, this.simLook.roll, 'YXZ'));
    });
  }

  /* ------------------------------------------------------------------ controller */
  /** Once per rendered frame. Reads the remote (buttons, touchpad, tilt) and the head roll. */
  poll() {
    const i = this.in;
    i.has = false;
    if (this.mode !== 'xr') { i.steer = this.steerMode === 'head' && this.mode === 'sim' ? this._headSteer() : 0; return; }
    const src = this.source ?? [...(this.session?.inputSources ?? [])].find((s) => s.gamepad || s.targetRayMode === 'tracked-pointer');
    const gp = src?.gamepad;
    i.has = !!src;
    if (gp) {
      // xr-standard: buttons[0] trigger (also delivered as select events), [1] squeeze, [2] touchpad, [3] thumbstick; axes 0/1 touchpad, 2/3 stick.
      // Older Pico browser builds number them differently, so every non-trigger button counts as "touchpad click".
      const ax = gp.axes ?? [];
      const px = Math.abs(ax[0] ?? 0) > 0.02 || Math.abs(ax[1] ?? 0) > 0.02 ? [ax[0], ax[1]] : [ax[2] ?? 0, ax[3] ?? 0];
      i.padX = px[0] ?? 0; i.padY = px[1] ?? 0;
      i.touching = gp.buttons.some((b, n) => n > 0 && b.touched) || Math.abs(i.padX) > 0.02 || Math.abs(i.padY) > 0.02;
      let click = false;
      for (let n = 1; n < gp.buttons.length; n++) click = click || !!gp.buttons[n]?.pressed;
      if (click && !i.click) { i.clickEdge = true; i.clickY = i.padY; }
      i.click = click;
      if (!this._selectEvents) { // browsers that do not raise select events for the trigger
        const t = !!gp.buttons[0]?.pressed;
        if (t && !this._prevBtn[0]) { i.triggerEdge = true; this._select = true; }
        if (t !== this._prevBtn[0]) i.trigger = t;
        this._prevBtn[0] = t;
      }
    }
    // steering source
    if (this.steerMode === 'pad') i.steer = Math.abs(i.padX) < 0.12 ? 0 : clamp((i.padX - Math.sign(i.padX) * 0.12) / 0.7, -1, 1);
    else if (this.steerMode === 'head') i.steer = this._headSteer();
    else { // roll of the remote about its pointing axis, like a motorbike grip / steering wheel
      const r = this._v.set(1, 0, 0).applyQuaternion(this.ctrl.quaternion);
      const roll = Math.asin(clamp(-r.y, -1, 1));
      const dz = 0.05, a = Math.abs(roll) < dz ? 0 : (roll - Math.sign(roll) * dz) / (TILT_FULL - dz);
      i.steer = this.source || this.ctrl.visible ? clamp(a, -1, 1) : 0;
    }
  }
  _headSteer() {
    const cam = this.mode === 'xr' ? this.camera : this.head;
    const r = this._v.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const roll = Math.asin(clamp(-r.y, -1, 1)), dz = 0.035;
    return Math.abs(roll) < dz ? 0 : clamp((roll - Math.sign(roll) * dz) / (HEAD_FULL - dz), -1, 1);
  }
  /** Consume the menu "select" edge (trigger pull). */
  takeSelect() { const s = !!this._select; this._select = false; return s; }
  /** Consume per-physics-step edges. */
  takeEdges() { const i = this.in, e = { trigger: i.triggerEdge, click: i.clickEdge, clickY: i.clickY }; i.triggerEdge = false; i.clickEdge = false; return e; }
  rumble(strength = 0.6, ms = 120) { try { this.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(strength, 0, 1), ms); } catch { /* best effort */ } }

  /** World-space pointer ray for menus: the remote if tracked, else the gaze. */
  ray(origin, dir) {
    const from = this.mode === 'xr' && this.ctrl.visible ? this.ctrl : this.mode === 'xr' ? this.camera : this.head;
    from.updateWorldMatrix(true, false);
    origin.setFromMatrixPosition(from.matrixWorld);
    dir.set(0, 0, -1).transformDirection(from.matrixWorld);
  }

  /* ------------------------------------------------------------------ rig */
  attach(scene) { if (this.rig.parent !== scene) scene.add(this.rig); }
  /** Static pose for menu rooms. */
  place(pos, yaw = 0) { this.rig.position.copy(pos); this.rig.quaternion.setFromAxisAngle(UP, yaw); this.init = false; this.vigK = 0; this.vig.material.uniforms.k.value = 0; }

  /** Seat the rig in `kart` (driver's eye point) for this frame. */
  follow(kart, vis, dt) {
    let eye = this._eyeLocal.get(vis);
    if (!eye) { // eye point in kart space, captured once while the model is at rest
      const seat = vis.model.getObjectByName('Driver_Seat');
      eye = new V(0, 1.02, 0.05);
      if (seat) { vis.root.updateWorldMatrix(true, true); seat.localToWorld(eye.set(0, 0.98, -0.04)); vis.root.worldToLocal(eye); }
      this._eyeLocal.set(vis, eye);
    }
    const rq = vis.root.quaternion;
    this.rig.position.copy(eye).applyQuaternion(rq).add(vis.root.position);
    // heading: chassis forward, but hold a steady heading while spinning / thrown / tumbling through the air
    const f = this._v.set(0, 0, -1).applyQuaternion(rq);
    const loose = kart.controlLocked || kart.grab || kart.yetiPenalty || (!kart.grounded && kart.airTime > 0.3);
    let yaw = Math.atan2(-f.x, -f.z), pitch = Math.asin(clamp(f.y, -1, 1));
    if (loose) {
      if (kart.speed > 6 && !kart.grab) { yaw = Math.atan2(-kart.vel.x, -kart.vel.z); pitch = clamp(Math.asin(clamp(kart.vel.y / kart.speed, -1, 1)), -0.5, 0.3) * 0.5; } else { yaw = this.yaw; pitch = this.pitch * 0.9; }
    }
    if (!this.init) { this.yaw = yaw; this.pitch = pitch; this.init = true; }
    let dy = yaw - this.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const ky = 1 - Math.exp(-(loose ? 2.2 : 16) * dt), kp = 1 - Math.exp(-5 * dt);
    const yawStep = dy * ky;
    this.yaw += yawStep; this.pitch += (clamp(pitch, -0.6, 0.6) - this.pitch) * kp;
    this.rig.quaternion.setFromEuler(this._e.set(this.pitch, this.yaw, 0, 'YXZ'));
    // vignette from yaw rate + boost
    const rate = dt > 0 ? Math.abs(yawStep) / dt : 0;
    const want = clamp((rate - 0.5) / 1.6, 0, 0.75) + (kart.isBoosting ? 0.25 : 0) + (loose ? 0.35 : 0);
    this.vigK += (Math.min(1, want) - this.vigK) * Math.min(1, 6 * dt);
    this.vig.material.uniforms.k.value = this.comfort === false ? 0 : this.vigK;
  }

  /** Draw `scene` from the rig: the XR compositor in 'xr', two half-screen eye views in 'sim'. */
  render(scene) {
    const gl = this.gl;
    this.attach(scene);
    if (this.mode === 'xr') { gl.setScissorTest(false); gl.autoClear = true; gl.render(scene, this.camera); gl.autoClear = false; return; }
    const W = innerWidth, H = innerHeight, w = Math.floor(W / 2);
    gl.setScissorTest(true); gl.setClearColor(0x000000, 1);
    for (let e = 0; e < 2; e++) {
      const c = this.eyes[e];
      c.aspect = w / H; c.fov = 96; c.updateProjectionMatrix();
      gl.setViewport(e * w, 0, w, H); gl.setScissor(e * w, 0, w, H); gl.clear();
      gl.render(scene, c);
    }
    gl.setScissorTest(false);
  }
}
