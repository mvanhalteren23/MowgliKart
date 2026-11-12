import * as THREE from 'three';

const V = THREE.Vector3;
const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const EYE = new V(0, 0.7, 0.2); // pilot's head in plane space

/** Turns a Race into a THREE scene using a skin. Holds no game rules: delete this file and the race still runs. */
export class View {
  constructor(race, skin, myId = -1) {
    this.race = race; this.skin = skin; this.myId = myId;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(skin.clear);
    s.fog = new THREE.Fog(skin.fog.color, skin.fog.near, skin.fog.far);
    this.sky = skin.sky(); s.add(this.sky);
    s.add(skin.world(race.course));
    this.rings = skin.rings(race.course); s.add(this.rings.object);
    this.balloons = skin.balloons(race); s.add(this.balloons.object);
    this.planes = race.planes.map((p) => {
      const v = skin.plane(p); v.plane = p; v.object.rotation.order = 'YXZ'; v.shield = null; v.spin = 0; s.add(v.object); return v;
    });
    const mine = race.byId.get(myId);
    this.cockpit = null;
    if (mine) { this.cockpit = skin.cockpit(mine); this.cockpit.object.rotation.order = 'YXZ'; s.add(this.cockpit.object); this.planes.find((v) => v.plane === mine).object.visible = false; }
    this.rockets = Array.from({ length: 8 }, () => { const m = skin.rocket(); m.visible = false; s.add(m); return m; });
    this.mines = Array.from({ length: 10 }, () => { const m = skin.mine(); m.visible = false; s.add(m); return m; });
    // one small particle pool for sparks / boost puffs / explosions
    this.np = 260; this.pp = new Float32Array(this.np * 3); this.pv = new Float32Array(this.np * 3); this.pl = new Float32Array(this.np); this.pc = new Float32Array(this.np * 3); this.pi = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true })); this.points.frustumCulled = false; s.add(this.points);
    for (let i = 0; i < this.np; i++) this.pp[i * 3 + 1] = -9999;
    this.eye = new V(); this.yaw = 0; this.pitch = 0; this.turnRate = 0; this._c = new THREE.Color(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._t = new V();
  }

  get subject() { return this.race.byId.get(this.myId) ?? this.race.rank()[0]; }

  puff(pos, color, n = 10, speed = 6, life = 0.6) {
    this._c.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.pi = (this.pi + 1) % this.np, o = i * 3;
      this.pp[o] = pos.x; this.pp[o + 1] = pos.y; this.pp[o + 2] = pos.z;
      this.pv[o] = (Math.random() - 0.5) * speed; this.pv[o + 1] = (Math.random() - 0.5) * speed; this.pv[o + 2] = (Math.random() - 0.5) * speed;
      this.pl[i] = life * (0.6 + Math.random() * 0.6); this.pc[o] = this._c.r; this.pc[o + 1] = this._c.g; this.pc[o + 2] = this._c.b;
    }
  }

  /** Per rendered frame. alpha = interpolation between the last two physics steps. */
  sync(alpha, dt, time) {
    const race = this.race, me = this.subject;
    for (const v of this.planes) {
      const p = v.plane, o = v.object;
      o.position.lerpVectors(p.prev, p.pos, alpha);
      if (p.spin > 0) { v.spin += dt * 14; if (p.stun <= 0) { p.spin = 0; v.spin = 0; } } // hit: barrel roll (the camera rig never rolls)
      o.rotation.set(p.prevPitch + (p.pitch - p.prevPitch) * alpha, lerpAng(p.prevYaw, p.yaw, alpha), -(p.prevBank + (p.bank - p.prevBank) * alpha) + v.spin);
      v.prop.rotation.z += dt * (18 + p.speed * 0.5);
      if (p.shield > 0 && !v.shield) { v.shield = this.skin.shield(); o.add(v.shield); }
      if (v.shield) v.shield.visible = p.shield > 0 && p !== me; // from inside, a bubble would block the view (the HUD shows it)
      if (p.boosting && Math.random() < 0.5) this.puff(this._t.copy(o.position).addScaledVector(p.forward(new V()), -2.6), p.tier ? 0xff8a2a : 0xffe08a, 1, 2, 0.35);
    }
    this.rockets.forEach((m, i) => { const r = race.rockets[i]; m.visible = !!r; if (r) { race.course.point(r.d, r.lat, r.h, m.position); const f = race.course.frame(r.d, (this._rf ??= {})); m.rotation.set(0, Math.atan2(-f.T.x, -f.T.z), time * 9); if (Math.random() < 0.6) this.puff(m.position, 0xdddddd, 1, 1.5, 0.4); } });
    this.mines.forEach((m, i) => { const r = race.mines[i]; m.visible = !!r; if (r) { race.course.point(r.d, r.lat, r.h, m.position); m.rotation.y = time * 1.5; m.scale.setScalar(1 + 0.08 * Math.sin(time * 6 + i)); } });
    this.balloons.update(race, time); this.rings.update(race, time);
    // particles
    let live = false;
    for (let i = 0; i < this.np; i++) { if (this.pl[i] <= 0) continue; live = true; const o = i * 3; this.pl[i] -= dt; this.pp[o] += this.pv[o] * dt; this.pp[o + 1] += this.pv[o + 1] * dt; this.pp[o + 2] += this.pv[o + 2] * dt; if (this.pl[i] <= 0) this.pp[o + 1] = -9999; }
    if (live || this._wasLive) { this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true; }
    this._wasLive = live;
    // pilot's eye: follows heading tightly and pitch partly, never rolls (comfort); the plane model banks around you
    if (me) {
      const v = this.planes.find((x) => x.plane === me), yaw = v.object.rotation.y, pitch = v.object.rotation.x * 0.7;
      const prevYaw = this.yaw; this.yaw = yaw; this.pitch += (pitch - this.pitch) * Math.min(1, 8 * dt);
      let dy = yaw - prevYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      this.turnRate += ((dt > 0 ? Math.abs(dy) / dt : 0) - this.turnRate) * Math.min(1, 6 * dt);
      this.eye.copy(EYE).applyEuler(this._e.set(this.pitch, this.yaw, 0)).add(v.object.position);
      this.sky.position.copy(this.eye);
      if (this.cockpit && me.id === this.myId) { // own plane: only the cockpit parts, banking (and barrel-rolling) around the level camera
        const c = this.cockpit.object; c.position.copy(this.eye); c.rotation.set(this.pitch, this.yaw, v.object.rotation.z);
        this.cockpit.prop.rotation.z += dt * (18 + me.speed * 0.5);
      }
    }
  }

  /** React to race events with particles. */
  onEvent(e) {
    const p = this.race.byId.get(e.id), pos = p?.pos;
    if (e.type === 'scrape' && pos) this.puff(pos, 0xffc04a, 14, 9, 0.5);
    else if (e.type === 'hit' && pos) this.puff(pos, 0xff5a3a, 30, 14, 0.8);
    else if (e.type === 'blocked' && pos) this.puff(pos, 0x7fe8ff, 24, 12, 0.7);
    else if (e.type === 'ring' && pos) this.puff(pos, 0xffd23a, 16, 10, 0.5);
    else if (e.type === 'pickup' && pos) this.puff(pos, 0xffffff, 14, 9, 0.5);
    else if (e.type === 'miniBoost' && pos) this.puff(pos, 0xff8a2a, 16, 8, 0.5);
    else if (e.type === 'boom') this.puff(this.race.course.point(e.d, e.lat, e.h, this._t), 0xffb03a, 30, 16, 0.8);
  }

  dispose() { this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m && m.dispose && !m.vertexColors) m.dispose(); }); }
}
