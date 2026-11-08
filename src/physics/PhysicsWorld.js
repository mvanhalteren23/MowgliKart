import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };
// Collision groups (SPEC 3.6: OBSTACLE and HAZARD are ray-queryable by AI whiskers)
export const GROUPS = { TRACK: 1, KART: 2, OBSTACLE: 4, HAZARD: 8, RAY: 16 };
export const ig = (member, filter) => ((member << 16) | filter) >>> 0;
export const GRAVITY = 14; // arcade gravity (m/s^2); suspension constants are calibrated against it

let initPromise = null;
export const initRapier = () => (initPromise ??= RAPIER.init());

export class PhysicsWorld {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = 1 / 60;
    this.events = new RAPIER.EventQueue(true);
    this.owners = new Map(); // collider handle -> { kind, ref }
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.listeners = [];
  }

  static async create() {
    await initRapier();
    return new PhysicsWorld();
  }

  /** Static trimesh (road+curbs or a shortcut deck). */
  addTrimesh(positions, indices, tag) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(positions, indices)
      .setFriction(0.0).setRestitution(0.0)
      .setCollisionGroups(ig(GROUPS.TRACK, GROUPS.KART | GROUPS.RAY));
    const collider = this.world.createCollider(desc, body);
    this.owners.set(collider.handle, { kind: 'track', tag });
    return collider;
  }

  /** Solid tree trunk (fixed cylinder on the OBSTACLE group so AI whiskers can see it). */
  addTree(x, y, z, radius, halfH) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + halfH, z));
    const cd = RAPIER.ColliderDesc.cylinder(halfH, radius).setFriction(0).setRestitution(0.35)
      .setCollisionGroups(ig(GROUPS.OBSTACLE, GROUPS.KART | GROUPS.RAY));
    const c = this.world.createCollider(cd, body);
    this.owners.set(c.handle, { kind: 'tree' });
  }

  addKart({ position, rotation, mass, comY, inertia, ref }) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setAdditionalMassProperties(mass, { x: 0, y: comY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.02).setAngularDamping(1.6)
      .setCcdEnabled(true).setCanSleep(false);
    const body = this.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(0.58, 0.3, 1.05).setTranslation(0, -0.08, 0)
      .setDensity(0).setFriction(0.0).setRestitution(0.25)
      .setCollisionGroups(ig(GROUPS.KART, GROUPS.TRACK | GROUPS.KART | GROUPS.OBSTACLE | GROUPS.HAZARD));
    const collider = this.world.createCollider(cd, body);
    this.owners.set(collider.handle, { kind: 'kart', ref });
    return { body, collider };
  }

  /**
   * Sensor volume for obstacles / hazards. kinematic=true -> moved each tick via setPosition.
   * Raises COLLISION_EVENTS (intersection started/stopped) against karts.
   */
  addSensor({ position, radius, group, kinematic = false, ref, kind }) {
    const bd = (kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(position.x, position.y, position.z);
    const body = this.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.ball(radius).setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(ig(group, GROUPS.KART | GROUPS.RAY));
    const collider = this.world.createCollider(cd, body);
    this.owners.set(collider.handle, { kind, ref });
    return { body, collider };
  }
  removeSensor(s) {
    if (!s) return;
    this.owners.delete(s.collider.handle);
    this.world.removeRigidBody(s.body);
  }

  /** Ray against `mask` groups; returns { toi, normal, owner } or null. */
  castRay(ox, oy, oz, dx, dy, dz, maxToi, mask, excludeBody = null, solid = true) {
    const r = this.ray;
    r.origin.x = ox; r.origin.y = oy; r.origin.z = oz;
    r.dir.x = dx; r.dir.y = dy; r.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(r, maxToi, solid, undefined, ig(GROUPS.RAY, mask), undefined, excludeBody ?? undefined);
    if (!hit) return null;
    return { toi: hit.timeOfImpact ?? hit.toi, normal: hit.normal, owner: this.owners.get(hit.collider.handle) };
  }

  /** Step once; `onSensor(ownerA, ownerB, started)` is called for each sensor intersection event. */
  step(onSensor) {
    this.world.step(this.events);
    if (onSensor) {
      this.events.drainCollisionEvents((h1, h2, started) => {
        const a = this.owners.get(h1), b = this.owners.get(h2);
        if (a && b) onSensor(a, b, started);
      });
    } else {
      this.events.clear();
    }
  }

  dispose() {
    try { this.world.free(); this.events.free(); } catch { /* already freed */ }
  }
}
