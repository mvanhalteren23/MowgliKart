import * as THREE from 'three';
import { GROUPS } from '../physics/PhysicsWorld.js';
import { addOutlines, applyToon } from '../core/Toon.js';

const V = THREE.Vector3;
const T = (c) => new THREE.MeshToonMaterial({ color: c });

/** Procedural yeti: shaggy white body, dark glaring face, blue eyes, swinging limbs. Faces -Z. */
export function buildYeti() {
  const g = new THREE.Group(), fur = T(0xf1f6ff), shade = T(0xc7d4e6), dark = T(0x232a3a);
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const body = new THREE.Group(); body.position.y = 2.1; g.add(body);
  const torso = part(new THREE.SphereGeometry(1.2, 14, 10), fur, 0, 0.4, 0); torso.scale.set(1.15, 1.35, 0.98); body.add(torso);
  body.add(part(new THREE.SphereGeometry(0.85, 12, 8), shade, 0, -0.25, -0.25));
  for (let i = 0; i < 14; i++) { // shaggy fur tufts
    const a = (i / 14) * 6.28, tuft = part(new THREE.ConeGeometry(0.28, 0.8, 5), fur, Math.cos(a) * 1.25, 0.2 + (i % 3) * 0.55, Math.sin(a) * 1.0);
    tuft.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0); body.add(tuft);
  }
  const head = new THREE.Group(); head.position.set(0, 2.15, -0.35); body.add(head);
  head.add(part(new THREE.SphereGeometry(0.72, 14, 10), fur, 0, 0, 0));
  const face = part(new THREE.SphereGeometry(0.5, 12, 8), dark, 0, -0.04, -0.42); face.scale.set(1.15, 0.95, 0.5); head.add(face);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x7fe3ff });
  head.add(part(new THREE.SphereGeometry(0.1, 8, 6), eyeM, -0.22, 0.1, -0.6), part(new THREE.SphereGeometry(0.1, 8, 6), eyeM, 0.22, 0.1, -0.6));
  const mouth = part(new THREE.BoxGeometry(0.5, 0.2, 0.1), T(0x6a1020), 0, -0.25, -0.62); head.add(mouth);
  for (const x of [-0.18, -0.06, 0.06, 0.18]) head.add(part(new THREE.ConeGeometry(0.05, 0.16, 4), T(0xffffff), x, -0.18, -0.64));
  head.add(part(new THREE.ConeGeometry(0.2, 0.55, 5), fur, -0.5, 0.62, 0.0), part(new THREE.ConeGeometry(0.2, 0.55, 5), fur, 0.5, 0.62, 0.0)); // brow tufts
  const limb = (x, y, len, r, mat) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = part(new THREE.CylinderGeometry(r, r * 0.85, len, 8), mat, 0, -len / 2, 0); p.add(m); return p; };
  const armL = limb(-1.45, 0.95, 1.9, 0.38, fur), armR = limb(1.45, 0.95, 1.9, 0.38, fur);
  for (const a of [armL, armR]) { a.add(part(new THREE.SphereGeometry(0.5, 10, 8), shade, 0, -1.95, 0)); for (let i = -1; i <= 1; i++) a.add(part(new THREE.ConeGeometry(0.1, 0.35, 4), T(0xe8e2d0), i * 0.22, -2.4, -0.1)); body.add(a); }
  const legL = limb(-0.6, 2.1, 2.0, 0.42, fur), legR = limb(0.6, 2.1, 2.0, 0.42, fur);
  for (const l of [legL, legR]) { l.add(part(new THREE.BoxGeometry(0.85, 0.45, 1.3), shade, 0, -2.05, -0.25)); g.add(l); }
  g.scale.setScalar(1.15);
  addOutlines(g, 1.04); applyToon(g);
  g.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  g.userData = { body, head, armL, armR, legL, legR, mouth };
  return g;
}

/**
 * Out-of-bounds yeti: when a kart strays too far from the slope, a yeti spawns in the trees, chases at up to 26 m/s,
 * grabs it, hurls it back to the piste and the kart takes an obstacle-style hit (KartController.yetiPenalty).
 * Leave the forest in time and it gives up and wanders off.
 */
export class YetiManager {
  constructor(session) { this.s = session; this.yetis = []; this.group = new THREE.Group(); session.scene.add(this.group); }

  ground(x, y, z) {
    const h = this.s.physics.castRay(x, y + 40, z, 0, -1, 0, 90, GROUPS.TRACK);
    return h ? y + 40 - h.toi : y;
  }

  spawn(kart) {
    const { track } = this.s, fr = track.atDist(kart.d);
    const out = fr.B.clone().multiplyScalar(kart.oobSide).setY(0).normalize();
    const fwd = fr.T.clone().setY(0).normalize();
    const p = kart.pos.clone().addScaledVector(out, 30).addScaledVector(fwd, 24); // ahead-and-outward: it bursts out of the trees where you can see it
    const mesh = buildYeti(); this.group.add(mesh);
    p.y = this.ground(p.x, kart.pos.y, p.z);
    mesh.position.copy(p);
    this.yetis.push({ kart, mesh, pos: p, state: 'chase', age: 0, t: 0, speed: 0, phase: 0, gone: 0 });
    this.s.sfx('roar', kart);
    this.s.fx.soft?.emit && this.s.fx.burst(p.clone().setY(p.y + 1), 10, 5, '#ffffff', 0.8, 1);
  }

  update(dt) {
    const { karts, track, fx } = this.s;
    for (const k of karts) {
      if (k.oob && !k.grab && !this.yetis.some((y) => y.kart === k && y.state !== 'leave')) this.spawn(k);
    }
    for (const y of this.yetis) {
      const k = y.kart, pos = y.pos;
      y.age += dt; y.t += dt;
      const to = new V().subVectors(k.pos, pos); to.y = 0;
      const dist = to.length(); to.normalize();
      k.yetiDist = dist;
      if (y.state === 'chase') {
        if (!k.oob && !k.grab) { y.state = 'leave'; y.t = 0; continue; }
        y.speed = Math.min(26, 12 + y.age * 2.8);            // ramps up: escapable early, inevitable later
        pos.addScaledVector(to, y.speed * dt);
        y.facing = Math.atan2(-to.x, -to.z);
        if (dist < 3.2 && !k.grab) { // grabbed!
          y.state = 'throw'; y.t = 0; y.speed = 0;
          k.grab = { yeti: y, pos: new V() };
          this.s.sfx('roar', k); k.emit('grabbed');
        }
      } else if (y.state === 'throw') {
        const hand = new V(0, 4.4, 0).add(pos).addScaledVector(new V(-Math.sin(y.facing), 0, -Math.cos(y.facing)), 1.5);
        if (k.grab) k.grab.pos.copy(hand);
        if (y.t > 1.0 && k.grab) this.release(y);
        if (y.t > 1.8) { y.state = 'leave'; y.t = 0; }
      } else { // leave
        y.speed = 11; pos.addScaledVector(new V(-to.x, 0, -to.z), 10 * dt); y.facing = Math.atan2(to.x, to.z);
        y.gone += dt; y.mesh.scale.setScalar(Math.max(0.0001, 1.0 - Math.max(0, y.gone - 2.2) * 0.9));
      }
      pos.y += (this.ground(pos.x, pos.y, pos.z) - pos.y) * Math.min(1, 14 * dt);
      y.mesh.position.copy(pos); y.mesh.rotation.y += (this.wrap((y.facing ?? 0) - y.mesh.rotation.y)) * Math.min(1, 9 * dt);
      this.animate(y, dt, dist);
    }
    this.yetis = this.yetis.filter((y) => {
      if (y.gone > 3.2) { this.group.remove(y.mesh); y.kart.yetiDist = 0; return false; }
      return true;
    });
  }

  wrap(a) { while (a > Math.PI) a -= 6.283; while (a < -Math.PI) a += 6.283; return a; }

  animate(y, dt, dist) {
    const u = y.mesh.userData, run = y.speed / 14, ph = (y.phase += dt * (3 + y.speed * 0.5));
    if (y.state === 'throw') {
      const raise = Math.min(1, y.t / 0.4);
      u.armR.rotation.x = -2.5 * raise + Math.sin(y.t * 30) * 0.1; u.armL.rotation.x = -1.2;
      u.legL.rotation.x = u.legR.rotation.x = 0; u.body.rotation.x = -0.2 * raise; u.head.rotation.x = -0.3;
      u.mouth.scale.y = 1.8 + Math.sin(y.t * 22) * 0.6;
      if (y.t > 0.7) u.armR.rotation.x = -2.5 + (y.t - 0.7) * 9; // hurl
    } else {
      u.legL.rotation.x = Math.sin(ph) * 0.95 * Math.min(1, run); u.legR.rotation.x = -Math.sin(ph) * 0.95 * Math.min(1, run);
      u.armL.rotation.x = -Math.sin(ph) * 1.0 * Math.min(1, run) - 0.5; u.armR.rotation.x = Math.sin(ph) * 1.0 * Math.min(1, run) - 0.5;
      u.body.rotation.x = -0.28 * Math.min(1, run); u.body.position.y = 2.1 + Math.abs(Math.sin(ph)) * 0.22 * Math.min(1, run);
      u.head.rotation.x = 0; u.mouth.scale.y = 1.2 + Math.sin(ph * 2) * 0.4;
      if (y.speed > 4) { // snow kicked up by the feet
        const fx = this.s.fx.soft;
        if (fx && Math.sin(ph) > 0.9) fx.emit(y.pos.x + (Math.random() - 0.5), y.pos.y + 0.2, y.pos.z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, '#f4f9ff', 0.7, 2);
      }
    }
  }

  release(y) {
    const k = y.kart, { track } = this.s, fr = track.atDist(k.d);
    const side = Math.sign(k.lat) || 1, VY = 15, T = (2 * VY) / 14, target = track.grooveHalf; // high lob: clears the tree line
    const vh = Math.max(9, (Math.abs(k.lat) - target) / T);
    const toC = fr.B.clone().multiplyScalar(-side).setY(0).normalize();
    const m = new THREE.Matrix4().makeBasis(fr.B, fr.N, fr.T.clone().negate()), q = new THREE.Quaternion().setFromRotationMatrix(m);
    k.grab = null; k.oob = false; k.oobT = 0; k.yetiPenalty = true;
    k.body.setRotation(q, true); k.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    k.body.setLinvel({ x: toC.x * vh + fr.T.x * 4, y: VY, z: toC.z * vh + fr.T.z * 4 }, true);
    k.t.stun = 0.4; k.emit('thrown');
    this.s.fx.burst(k.pos, 26, 8, '#ffffff', 0.9, 4);
  }

  dispose() { this.s.scene.remove(this.group); }
}
