import * as THREE from 'three';
import { GROUPS } from './PhysicsWorld.js';
import { WHEEL_MOUNTS, WHEEL_R } from '../registries/_mesh.js';

// SPEC 3.2 constants
export const L_REST = 0.45;
export const L_MAX = L_REST + WHEEL_R;
export const K_SPRING = 18000;
export const C_DAMP = 2400;
export const MU_LAT = 0.88;
export const MU_DRIFT = 0.32;
export const MU_OIL = 0.04;
export const COM_Y = -0.35;
// Rays reach slightly past L_MAX so 'grounded' (steering, traction) doesn't flicker at the spring's rest height;
// the spring itself only acts inside the spec range.
export const GROUND_REACH = 0.18;

const V = THREE.Vector3;
const _n = new V(), _r = new V(), _vk = new V(), _p = new V(), _arm = new V(), _imp = new V(), _pc = new V();

/** 4-wheel raycast spring-damper + lateral tyre friction (one RigidBody per kart). */
export class RaycastSuspension {
  constructor(physics, body, mass) {
    this.physics = physics;
    this.body = body;
    this.mass = mass;
    this.wheels = Object.entries(WHEEL_MOUNTS).map(([name, m]) => ({
      name, local: new V(...m), x: 0, prevX: 0, dist: L_MAX, grounded: false, front: name[0] === 'F',
      normal: new V(0, 1, 0), tag: null,
    }));
    this.avgNormal = new V(0, 1, 0);
    this.count = 0;
    this.tag = null;
  }

  /**
   * @param s {{pos,quat,vel,ang,com,up,right}}  kinematic state (THREE types)
   * @param o {{grip:number, driftRear:boolean, oil:boolean}}
   */
  update(dt, s, o) {
    const b = this.body;
    this.count = 0; this.avgNormal.set(0, 0, 0); this.tag = null;
    for (const w of this.wheels) {
      _p.copy(w.local).applyQuaternion(s.quat).add(s.pos);
      const hit = this.physics.castRay(_p.x, _p.y, _p.z, -s.up.x, -s.up.y, -s.up.z, L_MAX + GROUND_REACH, GROUPS.TRACK, b);
      w.prevX = w.x;
      if (!hit) { w.grounded = false; w.x = 0; w.dist = L_MAX; continue; }
      w.grounded = true;
      this.count++;
      w.dist = Math.min(hit.toi, L_MAX);
      w.tag = hit.owner?.tag ?? 'road';
      this.tag = this.tag === 'deck' || w.tag === 'deck' ? 'deck' : w.tag;
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (_n.dot(s.up) < 0) _n.negate();
      w.normal.copy(_n);
      this.avgNormal.add(_n);

      // Contact-point velocity (reused for the damper and lateral friction)
      _arm.subVectors(_p, s.com);
      _vk.crossVectors(s.ang, _arm).add(s.vel);

      // Hooke spring + velocity damper (upward only). Compression velocity is the projected chassis point velocity
      // -v_k . n (SPEC 3.2.2 alternative form); the damper impulse is capped so one 60 Hz step can never reverse the
      // approach velocity (explicit damping would otherwise turn a hard landing into a rebound).
      w.x = Math.max(0, L_REST - (hit.toi - WHEEL_R));
      const vComp = -_vk.dot(_n); // signed: negative while the spring extends (rebound damping)
      const damp = vComp > 0 ? Math.min(C_DAMP * vComp, (0.3 * this.mass * vComp) / dt) : C_DAMP * vComp;
      if (w.x > 0) {
        const F = Math.max(0, K_SPRING * w.x + damp);
        _imp.copy(_n).multiplyScalar(F * dt);
        b.applyImpulseAtPoint(_imp, _p, true);
      }

      // Lateral cornering traction at the contact patch velocity
      _r.copy(s.right).addScaledVector(_n, -s.right.dot(_n)).normalize();
      const vLat = _vk.dot(_r);
      let mu = MU_LAT * o.grip;
      if (o.driftRear && !w.front) mu = MU_DRIFT;
      if (o.oil) mu = MU_OIL;
      const mEff = 0.25 * this.mass;
      _imp.copy(_r).multiplyScalar(-mEff * vLat * mu);
      // apply at COM height: lateral tyre force at the road would otherwise roll the chassis
      _pc.copy(_p).addScaledVector(s.up, COM_Y - w.local.y);
      b.applyImpulseAtPoint(_imp, _pc, true);
    }
    if (this.count) this.avgNormal.multiplyScalar(1 / this.count).normalize();
    else this.avgNormal.copy(s.up);
    return this;
  }
}
