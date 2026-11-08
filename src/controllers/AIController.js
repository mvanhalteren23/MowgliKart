import * as THREE from 'three';
import { blankInput, FSM, DRIFT_TIERS, DRIFT_BASE, DRIFT_MOD } from './KartController.js';
import { WEAPONS } from '../registries/CircuitDraftRegistry.js';
import { GROUPS } from '../physics/PhysicsWorld.js';

const V = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Pure-pursuit spline follower with shortcut evaluation, slipstream seeking, 3-ray whisker hazard
 * avoidance (real Rapier raycasts vs OBSTACLE|HAZARD groups), drifting, and combat triggers.
 */
export class AIController {
  constructor(kart, session, { skill = 1, rnd }) {
    this.kart = kart; this.s = session; this.skill = skill; this.rnd = rnd;
    this.lane = (rnd() * 2 - 1) * 4;
    this.laneT = 0;
    this.shortcut = new Map(); // id -> decision (true/false) once per race
    this.activeShortcut = null;
    this.drifting = false;
    this.hopHeld = false;
    this.whisker = 0;
    this._tmp = new V();
    this.cooldownUse = 0;
    this.nextThink = 0;
    this.pickupDelay = 0;
  }

  update(dt, ctx) {
    const k = this.kart, track = ctx.track, inp = k.input;
    // reset edge flags each step
    inp.hopPressed = inp.itemPressed = inp.weaponPressed = inp.shieldPressed = false;
    const s = this.s;
    const speed = k.speed;

    /* ----- choose the path (main road or janky shortcut) */
    const sc = track.shortcuts.find((b) => k.d > b.dEntry - 0.03 * track.length && k.d < b.dEntry);
    if (sc && !this.shortcut.has(sc.id)) {
      const ok = speed >= 0.9 * k.vtop || k.hasNitro;
      this.shortcut.set(sc.id, ok && this.rnd() < 0.35 * (0.6 + 0.4 * this.skill));
    }
    if (!this.activeShortcut) {
      const near = track.shortcuts.find((b) => this.shortcut.get(b.id) && k.d > b.entryLipD + 2 && k.d < b.deckStartD + 40);
      if (near) { this.activeShortcut = near; this._scHint = undefined; }
    }
    let lookTarget, curvature;
    const look = 12 + 0.45 * speed;
    if (this.activeShortcut) {
      const b = this.activeShortcut;
      // missed the plank (back on the road below): forget it and carry on along the main line
      if (k.grounded && k.lastGround !== 'deck' && k.d > b.entryLipD + 3) { this.shortcut.set(b.id, false); this.activeShortcut = null; this._scHint = undefined; return this.update(dt, ctx); }
      const loc = b.frames.locate(k.pos, this._scHint ?? -1, 40, this._scLoc ??= {});
      this._scHint = loc.idx;
      if (loc.d > b.length - 4 || loc.dist2 > 1600 || k.d > b.dExit + 5) { this.activeShortcut = null; this._scHint = undefined; }
      // narrow plank: tight lookahead so the kart doesn't cut the corner off the deck
      const fr = b.frames.sample(Math.min(b.length - 1, loc.d + 5 + 0.2 * speed), {});
      lookTarget = fr.P.clone();
      // brake early for the tightest bend in the next 35 m of plank
      curvature = 0;
      for (let a = 0; a <= 35; a += 5) { const c = b.frames.curvature(Math.min(b.length, loc.d + a)); if (Math.abs(c) > Math.abs(curvature)) curvature = c; }
    }
    if (!this.activeShortcut) {
      // lane selection: slipstream seeking toward a rival 4-12 m ahead, else wander within +-6 m
      let lane = this.lane;
      const rival = s.items.nearestAhead(k, 12, 40, 4);
      if (rival && !this.hazardAhead && !k.slip.target) lane = clamp(rival.lat, -6, 6);
      else if (k.slip.target && k.slip.draftTimer > 1.2) lane = clamp(k.slip.target.lat + (k.slip.target.lat > 0 ? -4 : 4), -6, 6); // swerve out to overtake
      // stay off the shortcut kicker's side unless this racer decided to take it
      const gate = track.shortcuts.find((b) => k.d > b.dEntry - 50 && k.d < b.dEntry + 40 && !this.shortcut.get(b.id));
      if (gate) lane = gate.lat > 0 ? Math.min(lane, 2.2) : Math.max(lane, -2.2);
      // line up dead-centre on the kicker of a planned shortcut
      const plan = track.shortcuts.find((b) => this.shortcut.get(b.id) && k.d > b.dEntry - 110 && k.d < b.entryLipD + 2);
      if (plan) lane = plan.lat;
      this.laneNow = (this.laneNow ?? lane) + (lane - (this.laneNow ?? lane)) * Math.min(1, (plan ? 4 : 1.5) * dt);
      let tl = plan ? plan.lat : clamp(this.laneNow + this.whisker, -7, 7);
      if (gate) tl = gate.lat > 0 ? Math.min(tl, 3) : Math.max(tl, -3);
      lookTarget = track.surface(Math.min(track.length - 2, k.d + look), tl);
      curvature = track.curvature(Math.min(track.length, k.d + 18));
    }

    /* ----- 3-ray whisker hazard avoidance (-20, 0, +20 deg, 18 m) */
    this.hazardAhead = false;
    const p = k.pos;
    let push = 0;
    for (const a of [-20, 0, 20]) {
      const ang = (a * Math.PI) / 180;
      const dx = k.fwd.x * Math.cos(ang) + k.right.x * Math.sin(ang), dz = k.fwd.z * Math.cos(ang) + k.right.z * Math.sin(ang);
      const hit = s.physics.castRay(p.x, p.y + 0.4, p.z, dx, 0, dz, 18, GROUPS.OBSTACLE | GROUPS.HAZARD, k.body, true);
      if (hit) {
        if (hit.owner?.kind === 'hazard' && hit.owner.ref?.owner === k && hit.owner.ref.grace > 0) continue;
        this.hazardAhead = true;
        push += (a === 0 ? (this.rnd() < 0.5 ? 1 : -1) * 0.6 : -Math.sign(a)) * (1 - hit.toi / 18);
      }
    }
    this.whisker = clamp(this.whisker * (1 - 2 * dt) + push * 6 * dt * 3, -6, 6);

    /* ----- steering */
    this._tmp.subVectors(lookTarget, k.pos);
    const x = this._tmp.dot(k.right), z = this._tmp.dot(k.fwd);
    const ang = Math.atan2(x, Math.max(0.5, z));
    let steer = clamp(ang * 2.1, -1, 1);
    // slightly weak aim for imperfect AI
    steer *= 0.97;
    inp.steer = k.grounded ? steer : 0; // no steering in the air

    /* ----- throttle / brake */
    let thr = 1, brake = 0;
    const kappa = Math.abs(curvature);
    const vSafe = kappa > 1e-4 ? Math.sqrt((this.activeShortcut ? 14 : 26) / kappa) : 99;
    if (speed > vSafe * 1.1) { thr = 0.3; brake = clamp((speed - vSafe) / 12, 0, 0.7); }
    if (k.finished) { thr = 0; brake = 1; }
    inp.throttle = thr; inp.brake = brake;

    /* ----- drift: hop into sweepers, hold, release to cash in a mini-turbo */
    const wantDrift = !k.finished && kappa > 0.0042 && speed > 17 && !this.activeShortcut && !k.controlLocked;
    if (this.drifting) {
      const tier = k.drift.tier;
      const done = k.fsm === FSM.NORMAL || !wantDrift && tier >= 1 || tier >= 2 && kappa < 0.006;
      if (done || k.controlLocked) { this.drifting = false; inp.hop = false; }
      else {
        inp.hop = true;
        // map the pure-pursuit yaw demand through the drift remap: w = dir*base + u*mod
        const dir = k.drift.dir || Math.sign(this._signedKappa(track, k)) || 1;
        inp.steer = clamp((steer * 1.5 - dir * DRIFT_BASE * k.def.driftTurn) / DRIFT_MOD, -1, 1);
      }
    } else if (wantDrift && k.fsm === FSM.NORMAL && k.grounded && this.cooldownUse <= 0) {
      this.drifting = true; inp.hop = true; inp.hopPressed = true;
      const dirR = this._signedKappa(track, k) > 0 ? 1 : -1; // right turn positive
      inp.steer = dirR * 0.8; // locks the drift direction during the hop
      this.cooldownUse = 1.5;
    } else {
      inp.hop = false;
    }
    this.cooldownUse -= dt;
    if (k.fsm === FSM.HOPPING && this.drifting) inp.steer = (this._signedKappa(track, k) > 0 ? 1 : -1) * 0.8;

    /* ----- combat / items */
    const lo = k.loadout;
    this.nextThink -= dt;
    if (this.nextThink <= 0 && !k.finished && s.raceTime > 0.5) {
      this.nextThink = 0.12;
      const it = s.items;
      // reactive shield when targeted
      if (lo.shield && lo.shieldCd <= 0 && lo.shieldActive <= 0 && it.threatTo(k, 20)) inp.shieldPressed = true;
      if (lo.weapon && lo.weaponCd <= 0) {
        const W = WEAPONS[lo.weapon.id];
        switch (W.id) {
          case 'ballistic_chicken': if (it.nearestAhead(k, W.range, 15)) inp.weaponPressed = true; break;
          case 'baby_oil_puddle': if (this._rivalBehind(20)) inp.weaponPressed = true; break;
          case 'mentos_mortar': if (it.nearestAhead(k, W.range, 180, 20)) inp.weaponPressed = true; break;
          case 'boxing_glove': {
            for (const r of s.karts) if (r !== k && r.pos.distanceTo(k.pos) < 9 && Math.abs(r.d - k.d) < 8) inp.weaponPressed = true;
            break;
          }
          default: break;
        }
      }
      if (lo.pickup) {
        this.pickupDelay += 0.12;
        if (this.pickupDelay > 1.0) {
          if (lo.pickup === 'nitro_boost' && kappa < 0.002 && !k.isBoosting) inp.itemPressed = true;
          else if (lo.pickup === 'banana_rocket' && it.nearestAhead(k, 90)) inp.itemPressed = true;
          else if (lo.pickup === 'flaming_poo_bag' && (this._rivalBehind(15) || it.nearestAhead(k, 25))) inp.itemPressed = true;
          else if (this.pickupDelay > 12) inp.itemPressed = true;
          if (inp.itemPressed) this.pickupDelay = 0;
        }
      }
    }
    // rubber-banding + skill: gently scale top speed vs the human pack
    const ref = s.humans.length ? s.humanLeaderD : k.d; // no humans -> no rubber band
    k.vtopScale = this.skill * (1 + clamp((ref - k.d) / 1500, -0.035, 0.035));
  }

  _signedKappa(track, k) { return track.frames.curvature(Math.min(track.length, k.d + 20)); } // + = right turn

  _rivalBehind(dist) {
    const k = this.kart;
    for (const r of this.s.karts) if (r !== k && r.d < k.d && k.d - r.d < dist && Math.abs(r.lat - k.lat) < 6) return true;
    return false;
  }
}
