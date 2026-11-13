import * as THREE from 'three';
import { RaycastSuspension, COM_Y } from '../physics/RaycastSuspension.js';
import { GRAVITY } from '../physics/PhysicsWorld.js';
import { newBuildState } from '../registries/CircuitDraftRegistry.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _f = new V(), _u = new V(), _r = new V(), _v = new V(), _w = new V(), _g = new V(), _t = new V(), _t2 = new V();
const _q = new Q(), _m = new THREE.Matrix4();
const FWD = new V(0, 0, -1), RIGHT = new V(1, 0, 0), UPV = new V(0, 1, 0);

// SPEC 3.3.4 drift tiers
export const DRIFT_TIERS = [
  { t: 1.2, color: '#00d4ff', mult: 1.22, dur: 0.9 },
  { t: 2.5, color: '#ff7700', mult: 1.35, dur: 1.6 },
  { t: 4.0, color: '#ff00ea', mult: 1.50, dur: 2.4 },
];
// omega_yaw = s_drift * omega_base + u_steer * omega_modulate  (rad/s)
export const DRIFT_BASE = 0.5, DRIFT_MOD = 0.65;
export const FSM = { NORMAL: 'NORMAL', HOPPING: 'HOPPING', DRIFTING: 'DRIFTING', BOOST_RELEASE: 'BOOST_RELEASE' };

/** Aerodynamic drafting (SPEC 3.3.3). */
export class SlipstreamTracker {
  constructor() { this.draftTimer = 0; this.boostT = 0; this.target = null; this.inCone = false; }
  update(dt, kart, rivals) {
    this.target = null;
    const speed = kart.speed;
    let inCone = false;
    if (speed >= 12) {
      _f.copy(kart.fwd);
      let best = Infinity;
      for (const r of rivals) {
        if (r === kart) continue;
        _t.subVectors(r.pos, kart.pos);
        const d = _t.length();
        if (d < 2.5 || d > 12) continue;
        if (_t.dot(_f) / d >= Math.cos((18 * Math.PI) / 180) && d < best) { best = d; this.target = r; inCone = true; }
      }
    }
    this.inCone = inCone;
    this.draftTimer = inCone ? this.draftTimer + dt : Math.max(0, this.draftTimer - 0.75 * dt);
    if (this.draftTimer >= 1.5) {
      this.draftTimer = 0;
      kart.addBoost(1.2, 1.8, 'slip');
      kart.emit('slingshot');
    }
  }
}

/**
 * Kart simulation: engine, slope assist, drift/hop FSM, jump-trick, slipstream, status effects.
 * Pure physics/logic - visuals live in KartVisual/DamageModel.
 */
export class KartController {
  constructor({ id, name, physics, def, character, isHuman, spawn, index, build = newBuildState() }) {
    this.id = id; this.name = name; this.def = def; this.character = character;
    this.isHuman = isHuman; this.index = index; this.build = build;
    this.mass = def.mass * character.mods.weight;
    this.vtopBase = def.topSpeed * character.mods.speed;
    this.Fmax = this.mass * 6.2 * def.accel;

    const I = this.mass / 12;
    const inertia = { x: I * (0.5 ** 2 + 2.1 ** 2) * 2.2, y: I * (1.1 ** 2 + 2.1 ** 2) * 2.2, z: I * (1.1 ** 2 + 0.5 ** 2) * 2.2 };
    _m.makeBasis(spawn.T.clone().cross(UPV).normalize(), spawn.N, spawn.T.clone().negate());
    const rot = new Q().setFromRotationMatrix(_m);
    const { body, collider } = physics.addKart({ position: spawn.pos, rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }, mass: this.mass, comY: COM_Y, inertia, ref: this });
    this.body = body; this.collider = collider; this.physics = physics;
    this.suspension = new RaycastSuspension(physics, body, this.mass);
    this.slip = new SlipstreamTracker();

    this.input = blankInput();
    this.fsm = FSM.NORMAL;
    this.drift = { dir: 0, charge: 0, tier: 0, hopT: 0, releaseT: 0 };
    this.boosts = [];
    this.t = { stall: 0, stun: 0, spin: 0, oil: 0, mud: 0, foam: 0, blind: 0, stink: 0, surge: 0, gripLoss: 0, lasso: 0, bump: 0 };
    this.lassoCd = 3; this.lassoAim = null;
    this.spinDir = 1; this.spinTorque = 0;
    this.trick = { armedAt: -9, leftLipAt: -9, active: false, pending: false, flipT: 0, ramp: null };
    this.grounded = false; this.airTime = 0; this.prevVel = new V(); this.lastNormalVel = 0;
    this.hold = false;
    this.shieldImmuneOil = false;
    this.oob = false; this.oobT = 0; this.oobSide = 1; this.grab = null; this.yetiPenalty = false; this.yetiDist = 0;
    this.vtopScale = 1;
    this.pos = new V(); this.quat = new Q(); this.vel = new V(); this.fwd = new V(0, 0, -1); this.up = new V(0, 1, 0); this.right = new V(1, 0, 0);
    this.prevPos = new V(); this.prevQuat = new Q();
    this.speed = 0; this.fwdSpeed = 0;
    this.d = 0; this.lat = 0; this.hint = -1; this.maxD = 0; this.onShortcut = null; this.lastGround = 'road';
    this.finished = false; this.finishTime = 0; this.rank = 0;
    this.loadout = { pickup: null, weapon: null, shield: null, shieldActive: 0, shieldCd: 0, weaponCd: 0 };
    this.lastSafeD = 0;
    this.events = [];
    this.respawns = 0;
    this.damageHits = 0;
    this.time = 0;
    this._readState(true);
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
  }

  emit(type, data) { this.events.push({ type, data }); }
  get knockRes() { return this.def.knockbackRes * this.build.knockbackRes; }
  get isBoosting() { return this.boosts.length > 0; }
  get boostMult() { let m = 1; for (const b of this.boosts) m = Math.max(m, b.mult); return m; }
  get controlLocked() { return this.t.stun > 0 || this.t.spin > 0 || this.t.oil > 0 || this.t.foam > 0; }
  get hasNitro() { return this.boosts.some((b) => b.src === 'nitro'); }
  get vtop() { return this.vtopBase * this.build.topSpeed; }

  addBoost(mult, dur, src, snap = false) {
    if (this.puppet) return;
    const ex = this.boosts.find((b) => b.src === src);
    if (ex) { ex.mult = Math.max(ex.mult, mult); ex.t = Math.max(ex.t, dur); ex.dur = Math.max(ex.dur, dur); }
    else this.boosts.push({ mult, t: dur, dur, src });
    if (snap) this.emit('snap');
    this.emit('boost', { src, mult });
  }

  /* ---------------------------------------------------------------- status effects (called by ItemManager / ObstacleManager) */
  knockUp(jy, stun) {
    if (this.puppet) return;
    const r = this.knockRes;
    this.body.applyImpulse({ x: 0, y: (this.mass * jy) / r, z: 0 }, true);
    this.t.stun = Math.max(this.t.stun, stun / r);
    this.cancelDrift();
    this.emit('hit', { kind: 'knockup' });
  }
  stunFor(dur, slow = 0.5) {
    if (this.puppet) return;
    this.t.stun = Math.max(this.t.stun, dur / this.knockRes);
    this.scaleSpeed(slow);
    this.cancelDrift();
  }
  spinOut(dur, torque = 700, slow = 0.7) {
    if (this.puppet) return;
    this.t.spin = Math.max(this.t.spin, dur / this.knockRes);
    this.spinDir = Math.random() < 0.5 ? -1 : 1; this.spinTorque = torque;
    this.scaleSpeed(slow);
    this.cancelDrift();
  }
  oilSlick(dur = 1.8) {
    if (this.puppet) return;
    if (this.t.oil <= 0.3) this.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.t.oil = Math.max(this.t.oil, dur);
    this.cancelDrift();
  }
  shove(vec) {
    if (this.puppet) return;
    const k = 1 / this.knockRes;
    this.body.applyImpulse({ x: vec.x * this.mass * k, y: vec.y * this.mass * k, z: vec.z * this.mass * k }, true);
  }
  scaleSpeed(f) {
    if (this.puppet) return;
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x * f, y: v.y, z: v.z * f }, true);
  }
  cancelDrift() { if (this.fsm === FSM.DRIFTING || this.fsm === FSM.HOPPING) { this.fsm = FSM.NORMAL; this.drift.charge = 0; this.drift.tier = 0; } }

  /* ---------------------------------------------------------------- state sync */
  _readState(first = false) {
    if (!first) { this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat); }
    const b = this.body, t = b.translation(), r = b.rotation(), v = b.linvel();
    this.pos.set(t.x, t.y, t.z); this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.fwd.copy(FWD).applyQuaternion(this.quat);
    this.up.copy(UPV).applyQuaternion(this.quat);
    this.right.copy(RIGHT).applyQuaternion(this.quat);
    this.speed = this.vel.length();
  }

  /** Teleport onto the track at distance d / lateral lat (used for respawn & grid). */
  placeAt(track, d, lat, speed = 0) {
    const s = track.atDist(d);
    const P = s.P.clone().addScaledVector(s.B, lat).addScaledVector(s.N, 1.1);
    _m.makeBasis(s.B, s.N, s.T.clone().negate());
    _q.setFromRotationMatrix(_m);
    this.body.setTranslation(P, true); this.body.setRotation(_q, true);
    this.body.setLinvel({ x: s.T.x * speed, y: s.T.y * speed, z: s.T.z * speed }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._readState(true); this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
  }

  /* ---------------------------------------------------------------- main step */
  update(dt, ctx) {
    this.time = ctx.time;
    const { track } = ctx;
    if (this.puppet) return this._puppetUpdate(dt, ctx);
    this._readState();
    const b = this.body, inp = this.input, M = this.build;
    const av = b.angvel();
    _w.set(av.x, av.y, av.z);
    const comW = b.worldCom();
    const com = _g.set(comW.x, comW.y, comW.z);

    // ---- suspension + tyre friction
    const slick = this.t.oil > 0 && !this.shieldImmuneOil;
    const gripMul = M.gripMul * (this.t.gripLoss > 0 ? 0.8 : 1) * (this.onPowder ? 0.9 : 1);
    this.suspension.update(dt, { pos: this.pos, quat: this.quat, vel: this.vel, ang: _w, com, up: this.up, right: this.right },
      { grip: gripMul, driftRear: this.fsm === FSM.DRIFTING, oil: slick });
    const sus = this.suspension;
    const wasGrounded = this.grounded;
    this.grounded = sus.count >= 2;
    const anyGround = sus.count > 0;
    const n = sus.avgNormal;
    this.groundNormal = n;
    const prevTag = this.lastGround;
    if (sus.tag) this.lastGround = sus.tag;

    // ---- timers
    for (const k of Object.keys(this.t)) if (this.t[k] > 0) this.t[k] = Math.max(0, this.t[k] - dt);
    for (const bs of this.boosts) bs.t -= dt;
    this.boosts = this.boosts.filter((x) => x.t > 0);
    if (this.hold) { this._hold(); this._postProgress(ctx, dt); return; }
    if (this.grab) { // held aloft by the yeti: pinned to its fist, spinning, no physics
      const gp = this.grab.pos;
      b.setTranslation({ x: gp.x, y: gp.y, z: gp.z }, true); this._hold();
      b.setAngvel({ x: 0, y: 6, z: 0 }, true);
      this._readState(); this._postProgress(ctx, dt); return;
    }

    // ---- air/ground transitions
    if (this.grounded) this.airTime = 0; else this.airTime += dt;
    if (wasGrounded && !this.grounded) this._onTakeoff(ctx, track);
    if (!wasGrounded && this.grounded) this._onLanding(ctx, n, prevTag, track);
    this.lastNormalVel = this.vel.dot(n);

    const locked = this.controlLocked;
    const throttle = locked ? 0 : inp.throttle;
    const brake = locked ? 0 : inp.brake;
    const steer = locked ? 0 : inp.steer;

    // ---- effective top speed
    const nitro = this.hasNitro;
    let vEff = this.vtop * this.boostMult;
    if (this.t.mud > 0 && !nitro) vEff *= 0.65;
    this.onPowder = sus.tag === 'powder';
    if (this.onPowder && !nitro) vEff *= 0.8; // deep powder is slower than the groomed groove
    if (this.t.foam > 0) vEff *= 0.4;
    if (this.t.lasso > 0) vEff *= 0.7; // roped by a rival's lasso
    if (this.finished) vEff *= 0.5;
    if (this.t.stall > 0) vEff *= 0.45; // blown-gasket start
    if (this.vtopScale) vEff *= this.vtopScale; // AI rubber-banding / skill

    // ---- ground-plane forward + engine + slope assist
    _t.copy(this.fwd).addScaledVector(n, -this.fwd.dot(n)).normalize(); // fg
    const fg = _t;
    const vf = this.vel.dot(fg);
    this.fwdSpeed = vf;
    if (this.grounded) {
      const boostF = this.isBoosting ? 2.4 : 1;
      // slope assist (alpha_slope = 0.18): downhill raises the usable top speed by up to +3.5 m/s
      const slopeSin = clamp(-fg.y, 0, 1);
      const slopeBonus = 3.5 * clamp(slopeSin / 0.14, 0, 1);
      const vTarget = vEff + slopeBonus;
      let F = throttle * this.Fmax * M.accel * boostF * (1 - (vf / vTarget) ** 2);
      if (vf > vTarget && F < 0) F = Math.max(F, -this.Fmax * 0.9);
      let acc = F / this.mass - 0.02 * vf; // engine minus rolling resistance
      if (brake > 0) acc -= vf > 1 ? 22 * brake : 5 * brake;
      if (this.finished && vf > 0.5) acc -= 24;
      if (vf < -6 && acc < 0) acc = 0;
      // slope: cancel (1 - alpha_slope) of the tangential gravity so only 18% remains
      _g.set(0, -GRAVITY, 0);
      _t2.copy(_g).addScaledVector(n, -_g.dot(n)); // tangential gravity
      const cancel = 0.82;
      b.applyImpulse({
        x: fg.x * acc * this.mass * dt - _t2.x * cancel * this.mass * dt,
        y: fg.y * acc * this.mass * dt - _t2.y * cancel * this.mass * dt,
        z: fg.z * acc * this.mass * dt - _t2.z * cancel * this.mass * dt,
      }, true);
      // soft cap: Δv_top,slope <= +3.5 m/s
      const cap = vEff + 3.5 * clamp(slopeSin / 0.14, 0, 1);
      if (vf > cap) b.applyImpulse({ x: -fg.x * (vf - cap) * 4 * this.mass * dt, y: -fg.y * (vf - cap) * 4 * this.mass * dt, z: -fg.z * (vf - cap) * 4 * this.mass * dt }, true);
    }

    // ---- steering / yaw
    if (this.grounded && !locked) {
      const sp = Math.max(throttle > 0.3 ? 0.4 : 0, clamp(vf / 6, 0, 1)); // keep some turning authority when pinned
      let rate;
      if (this.fsm === FSM.DRIFTING) {
        rate = this.drift.dir * DRIFT_BASE * this.def.driftTurn + steer * DRIFT_MOD;
      } else {
        rate = steer * (1.9 - 0.55 * clamp(this.speed / this.vtop, 0, 1.2)) * sp * (vf < 0 ? -1 : 1);
      }
      const target = -rate; // right turn = negative angular velocity about +up
      const cur = _w.dot(this.up);
      const nxt = cur + (target - cur) * Math.min(1, 12 * dt);
      b.setAngvel({ x: _w.x + this.up.x * (nxt - cur), y: _w.y + this.up.y * (nxt - cur), z: _w.z + this.up.z * (nxt - cur) }, true);
    } else if (!this.grounded && !locked) {
      // air: level the chassis toward the last ground normal, soften roll/pitch
      _t2.crossVectors(this.up, this.roadN ?? this.groundNormalPrev ?? UPV); // level toward the ROAD normal (not the kicker's)
      const k = this.trick.active ? 0 : 11;
      // keep heading in flight: strongly damp yaw about the chassis-up axis, soften pitch/roll
      const yawW = _w.dot(this.up), yawKeep = yawW * Math.max(0, 1 - 9 * dt) - yawW;
      b.setAngvel({
        x: _w.x * (1 - 3 * dt) + _t2.x * k * dt + this.up.x * yawKeep,
        y: _w.y * (1 - 3 * dt) + _t2.y * k * dt + this.up.y * yawKeep,
        z: _w.z * (1 - 3 * dt) + _t2.z * k * dt + this.up.z * yawKeep,
      }, true);
    }
    if (anyGround) this.groundNormalPrev = (this.groundNormalPrev ?? new V()).copy(n);

    // ---- stay upright: on the ground the chassis is pulled level with the road and roll/pitch wobble is damped hard,
    //      so bumps and landings rock the kart instead of rolling it over
    if (anyGround && !this.trick.active) {
      const a2 = b.angvel(); _v.set(a2.x, a2.y, a2.z);
      const yawW = _v.dot(this.up);
      _t2.crossVectors(this.up, n);
      const keep = Math.max(0, 1 - 7 * dt);
      b.setAngvel({
        x: this.up.x * yawW + (_v.x - this.up.x * yawW) * keep + _t2.x * 9 * dt,
        y: this.up.y * yawW + (_v.y - this.up.y * yawW) * keep + _t2.y * 9 * dt,
        z: this.up.z * yawW + (_v.z - this.up.z * yawW) * keep + _t2.z * 9 * dt,
      }, true);
    }

    // ---- spin torque (oil slick, banana, poo)
    if (this.t.oil > 0 && !this.shieldImmuneOil) {
      b.applyTorqueImpulse({ x: 0, y: 950 * clamp(this.t.oil / 1.8, 0, 1) * this.spinDir * dt, z: 0 }, true);
    }
    if (this.t.spin > 0) {
      b.applyTorqueImpulse({ x: 0, y: this.spinTorque * clamp(this.t.spin / 0.6, 0, 1) * this.spinDir * dt, z: 0 }, true);
    }

    // ---- hop / drift / trick FSM
    this._fsm(dt, ctx, track, steer, locked);

    // ---- items (human or AI inputs)
    if (!locked || inp.shieldPressed) {
      if (inp.itemPressed) ctx.items.usePickup(this);
      if (inp.usePressed && !ctx.items.usePickup(this)) ctx.items.fireWeapon(this); // one-button "smart use" (VR remote / touch)
      if (inp.lassoPressed) ctx.lasso?.fire(this);
      if (inp.weaponPressed) ctx.items.fireWeapon(this);
      if (inp.shieldPressed) ctx.items.activateShield(this);
    }

    // ---- slipstream
    this.slip.update(dt, this, ctx.karts);

    // ---- impact detection (Δv excluding gravity), for cosmetic shedding
    _v.copy(this.vel).sub(this.prevVel);
    _v.y += GRAVITY * dt;
    if (_v.length() > 8.5 && ctx.time > 2) this.emit('impact', { dv: _v.length() });
    this.prevVel.copy(this.vel);

    this._postProgress(ctx, dt);
  }

  /** Network puppet: the transform is driven by the owner's snapshots (NetRace); only progress + timers run locally. */
  _puppetUpdate(dt, ctx) {
    this._readState();
    for (const k of Object.keys(this.t)) if (this.t[k] > 0) this.t[k] = Math.max(0, this.t[k] - dt);
    this.suspension.update(dt, { pos: this.pos, quat: this.quat, vel: this.vel, ang: _w.set(0, 0, 0), com: _g.copy(this.pos), up: this.up, right: this.right }, { grip: 1, driftRear: false, oil: false, passive: true });
    this.grounded = this.suspension.count >= 2;
    this.fwdSpeed = this.vel.dot(this.fwd);
    const loc = ctx.track.locate(this.pos, this.hint, this.hint >= 0 ? 60 : 0, this._loc ??= {});
    this.hint = loc.idx; this.d = loc.d; this.lat = loc.lat;
    if (this.d > this.maxD && this.d - this.maxD < 200) this.maxD = this.d;
    this.prevVel.copy(this.vel);
  }

  _hold() {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
  }

  _postProgress(ctx, dt) {
    const { track } = ctx;
    const loc = track.locate(this.pos, this.hint, this.hint >= 0 ? 60 : 0, this._loc ??= {});
    this.hint = loc.idx; this.d = loc.d; this.lat = loc.lat;
    // out of bounds on the open slope: the yeti (YetiManager) takes it from here
    if (track.open && !this.finished && !this.grab && !this.yetiPenalty) {
      const lim = track.oobLimit ?? track.width;
      if (Math.abs(loc.lat) > lim && this.lastGround !== 'deck') {
        this.oobT += dt; this.oobSide = Math.sign(loc.lat) || 1;
        if (!this.oob) { this.oob = true; this.emit('oob'); }
      } else if (Math.abs(loc.lat) < lim - 3 && this.oob) { this.oob = false; this.oobT = 0; this.emit('oobClear'); }
    }
    this.roadN = track.atDist(loc.d, (this._fr ??= {})).N;
    if (this.d > this.maxD) this.maxD = this.d;
    if (this.grounded && this.lastGround === 'road' && Math.abs(loc.lat) < track.width / 2 - 1) this.lastSafeD = this.d;
    // fall detection (off the deck / off the world)
    if (this.airTime > 2.3 && this.vel.y < -24) {
      // only a real fall if there is nothing to land on: long hill-top jumps still have road/terrain below
      const below = this.physics.castRay(this.pos.x, this.pos.y, this.pos.z, 0, -1, 0, 70, 1, this.body);
      if (!below || this.airTime > 7) this._respawn(ctx, this.lastGround === 'deck', 'fell');
    }
    if (this.pos.y < -2000) this._respawn(ctx, false, 'void');
    // stuck (pinned against a wall / wedged): auto-respawn after ~4 s of full throttle going nowhere
    if (!this.finished && !this.controlLocked && this.input.throttle > 0.5 && this.speed < 1.2 && ctx.time > 6) this.stuckT = (this.stuckT ?? 0) + dt; else this.stuckT = 0;
    if (this.stuckT > 4) { this.stuckT = 0; this._respawn(ctx, false, 'stuck'); }
    // flipped for too long
    // tipped over: pop back onto the wheels right where it is (no trip back to the last checkpoint)
    if (this.up.y < 0.35 && this.airTime < 1.2) {
      this.flipT = (this.flipT ?? 0) + dt;
      if (this.flipT > 0.6) {
        this.flipT = 0;
        const f = _t.copy(this.fwd).setY(0); if (f.lengthSq() < 0.01) f.copy(track.atDist(this.d).T).setY(0); f.normalize();
        _m.makeBasis(_r.crossVectors(f, UPV).normalize(), UPV, _t2.copy(f).negate()); _q.setFromRotationMatrix(_m);
        this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
        const p = this.body.translation(); this.body.setTranslation({ x: p.x, y: p.y + 0.6, z: p.z }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.emit('righted');
      }
    } else this.flipT = 0;
    if (!this.finished && this.d >= track.finishD) { this.finished = true; this.finishTime = ctx.time; this.emit('finish'); }
  }

  _respawn(ctx, penalty, reason = '') {
    this.respawns++;
    const d = Math.max(0, this.lastSafeD - 6);
    this.placeAt(ctx.track, d, 0, Math.min(this.speed, 14));
    this.hint = -1; this.airTime = 0;
    this.fsm = FSM.NORMAL; this.drift.charge = 0; this.oob = false; this.oobT = 0; this.grab = null; this.yetiPenalty = false;
    for (const k of Object.keys(this.t)) this.t[k] = 0;
    if (penalty) { this.t.mud = 2.0; this.emit('mud'); }
    this.emit('respawn', { reason });
  }

  _onTakeoff(ctx, track) {
    this.trick.leftLipAt = ctx.time;
    const r = track.rampAt(this.d, this.lat);
    this.trick.ramp = r;
    if (r && ctx.time - this.trick.armedAt <= 0.2 + this.build.trickWindow) this._doTrick();
  }
  _onLanding(ctx, n, prevTag, track) {
    // Missed the plank: dropped from the shortcut kicker/deck back onto the road below -> deep-snow/mud drag (2.0 s)
    if (prevTag === 'deck' && this.lastGround !== 'deck' && !this.hasNitro) {
      const sc = track.shortcutAt(this.d);
      if (sc && this.d < sc.dExit - 8) { this.t.mud = 2.0; this.emit('mud'); }
    }
    const vn = -this.lastNormalVel; // approach speed into the surface
    if (vn > 8.5) this.emit('impact', { dv: vn, landing: true });
    if (this.trick.active || this.trick.pending) {
      this.trick.active = false;
      if (this.trick.pending) {
        this.trick.pending = false;
        this.addBoost(1.30 * this.build.jumpBoost, 1.2, 'trick');
        this.emit('trickLanded');
      }
    }
    this.trick.ramp = null;
    if (this.yetiPenalty) { // back on the slope after the throw: treated exactly like an obstacle hit
      this.yetiPenalty = false;
      this.shove(new V(-this.vel.x * 0.25, 5.5, -this.vel.z * 0.25));
      this.stunFor(0.55 * 1.6, 0.35);
      this.emit('hit', { kind: 'obstacle', name: 'Yeti slam' }); this.emit('shed'); this.emit('yetiSlam');
    }
  }
  _doTrick() {
    if (this.trick.active) return;
    this.trick.active = true; this.trick.pending = true; this.trick.flipT = 0;
    this.emit('trick');
  }

  _fsm(dt, ctx, track, steer, locked) {
    const inp = this.input, d = this.drift, M = this.build;
    // Trick/hop button: in a jump zone it means "trick", otherwise "hop"
    if (inp.hopPressed && !locked) {
      const ramp = track.rampAt(this.d, this.lat);
      if (ramp && this.grounded && this.d <= ramp.lipD + 0.5) { this.trick.armedAt = ctx.time; }
      else if (!this.grounded && this.trick.ramp && ctx.time - this.trick.leftLipAt <= 0.12 + M.trickWindow) this._doTrick();
      else if (this.grounded && this.fsm === FSM.NORMAL && this.speed > 3) {
        this.body.applyImpulse({ x: this.up.x * this.mass * 4.2, y: this.up.y * this.mass * 4.2, z: this.up.z * this.mass * 4.2 }, true);
        this.fsm = FSM.HOPPING; d.hopT = 0; d.dir = 0;
        this.emit('hop');
      }
    }
    switch (this.fsm) {
      case FSM.HOPPING:
        d.hopT += dt;
        if (Math.abs(steer) > 0.25 && d.dir === 0) d.dir = Math.sign(steer);
        if (!inp.hop && d.hopT > 0.08) { this.fsm = FSM.NORMAL; break; }
        if (this.grounded && d.hopT > 0.12) {
          if (d.dir !== 0 || Math.abs(steer) > 0.25) {
            if (d.dir === 0) d.dir = Math.sign(steer);
            this.fsm = FSM.DRIFTING; d.charge = 0; d.tier = 0;
            this.emit('driftStart');
          } else this.fsm = FSM.NORMAL;
        }
        break;
      case FSM.DRIFTING: {
        // dC/dt = M_driftCharge (1 + 0.65 max(0, s_drift u_steer))
        const rate = M.driftCharge * this.character.mods.driftCharge * (1 + 0.65 * Math.max(0, d.dir * steer));
        if (this.grounded) d.charge += rate * dt;
        let tier = 0;
        for (let i = 0; i < DRIFT_TIERS.length; i++) if (d.charge >= DRIFT_TIERS[i].t) tier = i + 1;
        if (tier !== d.tier) { d.tier = tier; if (tier) this.emit('driftTier', { tier }); }
        if (!inp.hop || this.speed < 7) {
          if (d.tier > 0 && this.speed >= 7) {
            const T = DRIFT_TIERS[d.tier - 1];
            this.addBoost(T.mult, T.dur, 'drift', true);
            this.emit('miniTurbo', { tier: d.tier });
          }
          d.charge = 0; d.tier = 0; this.fsm = FSM.BOOST_RELEASE; d.releaseT = 0.2;
        }
        break;
      }
      case FSM.BOOST_RELEASE:
        d.releaseT -= dt; if (d.releaseT <= 0) this.fsm = FSM.NORMAL; break;
      default: break;
    }
    if (this.trick.active) this.trick.flipT += dt;
  }

  /** Interpolated transform for rendering. */
  renderPose(alpha, outPos, outQuat) {
    outPos.lerpVectors(this.prevPos, this.pos, alpha);
    outQuat.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }
}

export function blankInput() {
  return { steer: 0, throttle: 0, brake: 0, hop: false, hopPressed: false, item: false, itemPressed: false, use: false, usePressed: false, lasso: false, lassoPressed: false, weapon: false, weaponPressed: false, shield: false, shieldPressed: false };
}
