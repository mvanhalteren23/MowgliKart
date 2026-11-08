import * as THREE from 'three';
import { OBSTACLES } from '../registries/TrackRegistry.js';
import { GROUPS } from '../physics/PhysicsWorld.js';
import { mulberry32 } from './TrackSpline.js';
import { SHIELDS } from '../registries/CircuitDraftRegistry.js';

const V = THREE.Vector3;

/** Dynamic regional hazards: kinematic sensor colliders on the OBSTACLE group + patrol behaviours. */
export class ObstacleManager {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.group = new THREE.Group();
    session.scene.add(this.group);
  }

  spawn(def) {
    const { track, physics, assets } = this.s;
    const rnd = mulberry32(def.seed * 7919 + 13);
    const half = Math.min(track.width / 2 - 1.8, track.grooveHalf + 5);
    for (const [typeId, count] of def.obstacles) {
      const T = OBSTACLES[typeId];
      for (let i = 0; i < count; i++) {
        // spread evenly down the run, avoiding the starting grid and the finish
        const d = 220 + ((track.length - 600) * (i + rnd() * 0.8)) / count;
        const mesh = assets.getObstacle(T);
        this.group.add(mesh);
        const o = {
          T, d0: d, d, lat: (rnd() * 2 - 1) * half, half, phase: rnd() * 6.283, mesh,
          dir: rnd() < 0.5 ? -1 : 1, hit: 0, away: 0, rnd, reachCd: 0, pos: new V(), sensor: null, cooldown: 0,
        };
        this._place(o, 0);
        o.sensor = physics.addSensor({ position: o.pos.clone().setY(o.pos.y + T.radius * 0.7), radius: T.radius, group: GROUPS.OBSTACLE, kinematic: true, ref: o, kind: 'obstacle' });
        this.list.push(o);
      }
    }
  }

  _place(o, t) {
    const { track } = this.s;
    const T = o.T;
    switch (T.behavior) {
      case 'cross': o.lat = Math.sin(t * (T.speed / (o.half * 1.4)) + o.phase) * o.half; break;
      case 'zigzag': o.d = o.d0 + 30 * Math.sin(t * ((T.speed * 0.5) / 30) + o.phase); o.lat = Math.sin(t * 0.9 + o.phase) * Math.min(T.amp, o.half); break;
      case 'slide': o.d = o.d0 + 70 * Math.sin(t * (T.speed / 70) + o.phase); o.lat = Math.sin(t * 0.5 + o.phase) * 2.5; break;
      case 'hop': o.lat = Math.sin(t * (T.speed / (o.half * 1.2)) + o.phase) * o.half; break;
      default: break; // static
    }
    o.d = Math.max(10, Math.min(track.length - 40, o.d));
    const fr = track.atDist(o.d);
    o.pos.copy(fr.P).addScaledVector(fr.B, o.lat);
    let bob = 0;
    if (T.behavior === 'hop') bob = Math.abs(Math.sin(t * 5 + o.phase)) * 1.6;
    else if (T.behavior === 'static') bob = Math.abs(Math.sin(t * 6 + o.phase)) * 0.25;
    else if (T.behavior === 'zigzag') bob = Math.abs(Math.sin(t * 4 + o.phase)) * 0.1;
    o.mesh.position.copy(o.pos); o.mesh.position.y += bob;
    o.mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), fr.N);
    const yaw = T.behavior === 'cross' || T.behavior === 'hop' ? (Math.cos(t * (T.speed / (o.half * 1.4)) + o.phase) > 0 ? -Math.PI / 2 : Math.PI / 2) : Math.PI + Math.sin(t * 3 + o.phase) * 0.4;
    o.mesh.rotateY(yaw);
  }

  update(dt, time) {
    for (const o of this.list) {
      o.cooldown = Math.max(0, o.cooldown - dt);
      if (o.away > 0) { // batted aside by a shield / nitro: fly off then pop back
        o.away -= dt; o.mesh.position.y += 14 * dt; o.mesh.rotation.z += 9 * dt;
        o.sensor.body.setNextKinematicTranslation({ x: 0, y: -9999, z: 0 });
        if (o.away <= 0) { o.cooldown = 0.5; }
        continue;
      }
      this._place(o, time);
      o.sensor.body.setNextKinematicTranslation({ x: o.pos.x, y: o.pos.y + o.T.radius * 0.7, z: o.pos.z });
      // Tai-chi energy palm: bigger reach when a kart is close
      if (o.T.reach) {
        o.reachCd -= dt;
        for (const k of this.s.karts) {
          if (o.reachCd <= 0 && Math.abs(k.d - o.d) < o.T.reach && k.pos.distanceTo(o.pos) < o.T.reach) {
            o.reachCd = 3; this._hit(o, k, true);
            this.s.fx.burst(o.pos.clone().setY(o.pos.y + 1.3), 16, 6, '#fff7b0', 0.5, 0);
          }
        }
      }
    }
  }

  /** Sensor callback: obstacle owner vs kart */
  onContact(o, kart, started) {
    if (!started || o.away > 0 || o.cooldown > 0) return;
    this._hit(o, kart, false);
  }

  _hit(o, kart, palm) {
    const lo = kart.loadout;
    const S = lo.shieldActive > 0 && lo.shield ? SHIELDS[lo.shield.id] : null;
    const nitro = kart.hasNitro;
    if ((S && S.knocksObstacles) || nitro) {
      // the kart barrels through: bat the obstacle aside, clean surge
      o.away = 1.6;
      if (S?.knocksObstacles) kart.addBoost(1.28, 1.1, 'shield-surge');
      this.s.fx.burst(o.pos, 16, 8, '#ffffff', 0.6, 6);
      kart.emit('blocked', { id: nitro ? 'nitro' : S.id });
      return;
    }
    if (S) { // other shields: absorb the hit
      o.cooldown = 1.2; kart.emit('blocked', { id: S.id });
      this.s.fx.burst(o.pos, 12, 6, '#cfe9ff', 0.5, 2);
      return;
    }
    o.cooldown = 1.2;
    const away = new V().subVectors(kart.pos, o.pos); away.y = 0; away.normalize();
    const power = o.T.power * (palm ? 1.2 : 1);
    kart.shove(away.multiplyScalar(9 * power).setY(3.5 * power));
    kart.stunFor(0.55 * power, 0.55);
    kart.emit('hit', { kind: 'obstacle', name: o.T.name });
    kart.emit('shed');
    this.s.fx.burst(kart.pos, 18, 6, '#ffffff', 0.7, 6);
    this.s.sfx('bonk', kart);
  }

  /** AI 3-ray whisker support: obstacles/hazards are real Rapier colliders on their own groups. */
  dispose() {
    this.s.scene.remove(this.group);
    for (const o of this.list) this.s.physics.removeSensor(o.sensor);
  }
}
