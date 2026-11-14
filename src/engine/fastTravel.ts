/**
 * SeamlessFastTravelController — mounts and flight without a scene change.
 *
 * Owns the mount proxy (rider + mount replace the leader sprite), the hover altitude,
 * the camera spring-arm blend toward `MountDef.camera`, and the `requests.flyTo`
 * autopilot. Flight ignores colliders, gates and the soft wall but stays inside the
 * continent clamp; beasts move with normal collision at mount speed. The engine keeps
 * streaming chunks and firing region events from the rider's position.
 */
import * as THREE from 'three';
import { runtime } from '@/app/runtime';
import { createBillboardGeometry, createSpriteMaterial } from '@/engine/shaders';
import type { GameStore, MountDef, StaminaState, StaminaTuning } from '@/types/contracts';
import type { AssetRegistryLoader } from './assets/AssetRegistryLoader';
import { assetRegistry } from './assets/registry';
import { frameAspect, manifestFrameRect } from './assets/manifestSprite';
import { easeInOut, OVERWORLD_FRAMING, stepBlend, type Framing } from './cameraRig';
import { resolveMove } from './movement';
import { facingFromHeading, headingFromVector } from './spriteMath';
import { clampToBounds, type Bounds } from './streaming';
import { approach, findLanding, flightTuning, isRiderSheet, lerpFraming, locomotion, mountFraming, mountSheetCandidates, startAutopilot, stepAutopilot, type AutopilotState } from './travel';

export const MOUNT_DEBUG_COLOR = 0x39ff88;
/** Seconds for the camera to settle onto / off the mount framing. */
export const MOUNT_CAMERA_BLEND = 1.1;

export const proxyWidth = (m: MountDef): number => (m.kind === 'flight' ? 6 : 3);

/* ── Proxy mesh ───────────────────────────────────────────────────────────── */

export class MountProxy {
  readonly root = new THREE.Group();
  private readonly wireGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly wireMat = new THREE.MeshBasicMaterial({ color: MOUNT_DEBUG_COLOR, wireframe: true });
  private readonly wire = new THREE.Mesh(this.wireGeo, this.wireMat);
  private readonly sheetGeo = createBillboardGeometry();
  private readonly blank = new THREE.Texture();
  private readonly sheetMat = createSpriteMaterial(this.blank);
  private readonly sheet = new THREE.Mesh(this.sheetGeo, this.sheetMat);
  private readonly unbinds = new Map<string, () => void>();
  private readonly textures = new Map<string, THREE.Texture>();

  constructor(private readonly loader: AssetRegistryLoader) {
    this.root.name = 'mount-proxy';
    this.wire.frustumCulled = false;
    this.sheet.frustumCulled = false;
    this.wire.visible = this.sheet.visible = false;
    this.root.add(this.wire, this.sheet);
  }

  private watch(id: string): THREE.Texture | null {
    if (!this.unbinds.has(id)) {
      this.unbinds.set(
        id,
        this.loader.bind(id, (tex) => {
          this.textures.set(id, tex);
          // Swap in place when the visible sheet gets a newer version.
          if (this.sheet.userData.asset === id) this.sheetMat.uniforms.uMap.value = tex;
        }),
      );
    }
    return this.textures.get(id) ?? null;
  }

  /** The best delivered sheet: the leader's rider composite, then the mount's own sheet. */
  pickSheet(m: MountDef, leader: string): { id: string; texture: THREE.Texture } | null {
    const candidates = mountSheetCandidates(m.assetId, leader);
    for (const id of candidates) {
      if (id !== m.assetId && !assetRegistry.get(id).entry) continue;
      const t = this.watch(id);
      if (t) return { id, texture: t };
    }
    return null;
  }

  /** Hide everything. */
  hide(): void {
    this.wire.visible = this.sheet.visible = false;
  }

  /**
   * Place the proxy with its feet at (x, y, z). Returns true when the drawn sheet already
   * includes the rider (the leader sprite should then be hidden).
   */
  update(m: MountDef, leader: string, x: number, y: number, z: number, heading: number, anim: string, animTime: number, yaw: number): { riderInSheet: boolean; height: number } {
    const picked = this.pickSheet(m, leader);
    const id = picked?.id ?? m.assetId;
    const entry = this.loader.entryFor(id) ?? this.loader.entryFor(m.assetId);
    const w = proxyWidth(m);
    const h = w * frameAspect(entry);
    if (!picked || !entry) {
      this.sheet.visible = false;
      this.wire.visible = true;
      this.wire.position.set(x, y, z);
      this.wire.scale.set(w, h, w * 0.5);
      this.wire.rotation.y = -heading;
      return { riderInSheet: false, height: h };
    }
    this.wire.visible = false;
    this.sheet.visible = true;
    if (this.sheet.userData.asset !== picked.id || this.sheetMat.uniforms.uMap.value !== picked.texture) {
      this.sheet.userData.asset = picked.id;
      this.sheetMat.uniforms.uMap.value = picked.texture;
    }
    const facing = facingFromHeading(heading, yaw);
    const r = manifestFrameRect(entry, anim, facing, animTime, anim === 'takeoff' || anim === 'land' ? false : (entry.loop ?? true));
    this.sheetMat.uniforms.uUvRect.value.set(r[0], r[1], r[2], r[3]);
    this.sheet.position.set(x, y, z);
    this.sheet.scale.set(w, h, 1);
    return { riderInSheet: isRiderSheet(picked.id), height: h };
  }

  dispose(): void {
    for (const u of this.unbinds.values()) u();
    this.unbinds.clear();
    this.wireGeo.dispose();
    this.wireMat.dispose();
    this.sheetGeo.dispose();
    this.sheetMat.dispose();
    this.blank.dispose();
  }
}

/* ── Controller ───────────────────────────────────────────────────────────── */

export interface TravelContext {
  readonly dt: number;
  readonly time: number;
  readonly st: GameStore;
  readonly mounts: Readonly<Record<string, MountDef>>;
  readonly pos: { x: number; y: number; z: number };
  readonly stick: { readonly x: number; readonly z: number; readonly mag: number };
  readonly yaw: number;
  readonly bounds: Bounds;
  readonly stamina: StaminaState;
  readonly tuning: StaminaTuning;
  readonly canDrain: boolean;
  readonly baseSpeed: number;
  /** Ground walkability incl. colliders (beasts). */
  readonly canStand: (x: number, z: number) => boolean;
  /** Safe touchdown point check (walkable, uncovered, on the continent). */
  readonly canLand: (x: number, z: number) => boolean;
  readonly groundY: (x: number, z: number) => number;
}

export interface TravelFrame {
  /** False when the leader is on foot and the engine should run normal movement. */
  readonly handled: boolean;
  readonly heading: number | null;
  readonly drainPerSec: number;
  /** Rider feet above the ground (alt + saddle). */
  readonly lift: number;
  readonly flying: boolean;
  readonly hideLeader: boolean;
  readonly hideFollowers: boolean;
  /** Touched down from a flight this frame (followers regroup). */
  readonly landed: boolean;
  readonly moving: boolean;
}

const ON_FOOT: TravelFrame = { handled: false, heading: null, drainPerSec: 0, lift: 0, flying: false, hideLeader: false, hideFollowers: false, landed: false, moving: false };

export class SeamlessFastTravelController {
  readonly proxy: MountProxy;
  /** Mount feet above the ground (m). */
  alt = 0;
  autopilot: AutopilotState | null = null;
  private visual: MountDef | null = null;
  private lastMount: MountDef | null = null;
  private blend = 0;
  private forcedGlide = false;
  private anim = 'idle';
  private animStart = 0;
  private heading = Math.PI / 2;
  private arrivePending = false;

  constructor(loader: AssetRegistryLoader) {
    this.proxy = new MountProxy(loader);
  }

  get mount(): MountDef | null {
    return this.visual;
  }

  get airborne(): boolean {
    return this.alt > 0.05;
  }

  /** Spring-arm framing blended toward the (last) mount's camera. */
  framing(): Framing {
    const m = this.visual ?? this.lastMount;
    if (!m || this.blend <= 0) return OVERWORLD_FRAMING;
    return lerpFraming(OVERWORLD_FRAMING, mountFraming(m), easeInOut(this.blend));
  }

  private setAnim(name: string, time: number): void {
    if (this.anim === name) return;
    this.anim = name;
    this.animStart = time;
  }

  private touchDown(ctx: TravelContext): { x: number; z: number } {
    const spot = findLanding(ctx.pos.x, ctx.pos.z, ctx.canLand) ?? { x: ctx.pos.x, z: ctx.pos.z };
    this.alt = 0;
    this.forcedGlide = false;
    return spot;
  }

  /** Request consumed + mount state machine. Call once per frame in the overworld. */
  update(ctx: TravelContext): TravelFrame {
    const { dt, time, st, pos } = ctx;
    const def = st.mountedOn ? (ctx.mounts[st.mountedOn] ?? null) : null;
    if (st.mountedOn === null) this.arrivePending = false;
    const req = runtime.requests.flyTo;
    if (req) {
      runtime.requests.flyTo = null;
      if (def?.kind === 'flight') {
        this.autopilot = startAutopilot({ x: pos.x, z: pos.z }, this.alt, req);
        this.forcedGlide = false;
      }
    }
    if (!def) this.autopilot = null;
    if (def) {
      this.visual = def;
      this.lastMount = def;
    }
    const m = this.visual;
    this.blend = stepBlend(this.blend, m ? 1 : 0, dt, MOUNT_CAMERA_BLEND);
    if (!m) {
      this.proxy.hide();
      return ON_FOOT;
    }

    const fromX = pos.x;
    const fromZ = pos.z;
    let drain = 0;
    let landed = false;
    const ft = flightTuning(m);
    const clamp = (x: number, z: number): { x: number; z: number } => clampToBounds(x, z, ctx.bounds);

    if (def && def.kind === 'flight') {
      if (this.autopilot && !this.arrivePending) {
        const ap = stepAutopilot(this.autopilot, dt, { tuning: ft, staminaEmpty: ctx.stamina.current <= 0, stickMag: ctx.stick.mag, clamp });
        this.autopilot = ap;
        pos.x = ap.x;
        pos.z = ap.z;
        this.alt = ap.alt;
        this.heading = ap.heading;
        drain = ap.phase === 'done' ? 0 : def.staminaDrainPerSec;
        this.setAnim(ap.phase === 'takeoff' ? 'takeoff' : ap.phase === 'landing' && ap.alt < m.altitude * 0.35 ? 'land' : 'move', time);
        if (ap.phase === 'done' && ap.result) {
          this.autopilot = null;
          if (ap.result !== 'cancelled') {
            const spot = this.touchDown(ctx);
            pos.x = spot.x;
            pos.z = spot.z;
            landed = true;
          }
          this.arrivePending = true;
          st.arrive(ap.result);
        }
      } else if (!this.arrivePending) {
        const loco = locomotion({ baseSpeed: ctx.baseSpeed, stickMag: ctx.stick.mag, sprint: false, boost: runtime.input.boost, canDrain: ctx.canDrain, tuning: ctx.tuning, mount: def, airborne: true });
        if (ctx.stamina.current <= 0) this.forcedGlide = true;
        const speed = this.forcedGlide ? def.speed * 0.5 * ctx.stick.mag : loco.speed;
        const c = clamp(pos.x + ctx.stick.x * speed * dt, pos.z + ctx.stick.z * speed * dt);
        pos.x = c.x;
        pos.z = c.z;
        drain = loco.drainPerSec;
        if (this.forcedGlide) {
          this.alt = approach(this.alt, 0, ft.sinkRate, dt);
          this.setAnim(this.alt < 2 ? 'land' : 'move', time);
          if (this.alt <= 0.02) {
            const spot = this.touchDown(ctx);
            pos.x = spot.x;
            pos.z = spot.z;
            landed = true;
            this.arrivePending = true;
            st.arrive('exhausted');
          }
        } else {
          const rising = this.alt < m.altitude - 0.05;
          this.alt = approach(this.alt, m.altitude, ft.climbRate, dt);
          this.setAnim(rising ? 'takeoff' : ctx.stick.mag > 0 ? 'move' : 'idle', time);
        }
      }
    } else if (def && def.kind === 'beast') {
      this.alt = 0;
      const loco = locomotion({ baseSpeed: ctx.baseSpeed, stickMag: ctx.stick.mag, sprint: false, boost: runtime.input.boost, canDrain: ctx.canDrain, tuning: ctx.tuning, mount: def });
      if (loco.speed > 0) {
        const r = resolveMove(pos.x, pos.z, ctx.stick.x * loco.speed * dt, ctx.stick.z * loco.speed * dt, ctx.canStand);
        pos.x = r.x;
        pos.z = r.z;
      }
      drain = loco.drainPerSec;
      this.setAnim(loco.boosting ? 'run' : loco.speed > 0 ? 'move' : 'idle', time);
    } else {
      // Dismounted (or cancelled) mid-air: drift down and land; the proxy stays until touchdown.
      if (this.alt > 0.02) {
        const c = clamp(pos.x + ctx.stick.x * m.speed * 0.4 * ctx.stick.mag * dt, pos.z + ctx.stick.z * m.speed * 0.4 * ctx.stick.mag * dt);
        pos.x = c.x;
        pos.z = c.z;
        this.alt = approach(this.alt, 0, ft.climbRate, dt);
        this.setAnim('land', time);
      }
      if (this.alt <= 0.02) {
        const wasFlight = m.kind === 'flight';
        const spot = this.touchDown(ctx);
        pos.x = spot.x;
        pos.z = spot.z;
        this.visual = null;
        this.proxy.hide();
        return { ...ON_FOOT, landed: wasFlight };
      }
    }

    const moved = Math.hypot(pos.x - fromX, pos.z - fromZ);
    if (moved > 1e-4 && !this.autopilot) this.heading = headingFromVector(pos.x - fromX, pos.z - fromZ);
    const ground = ctx.groundY(pos.x, pos.z);
    const view = this.proxy.update(m, st.leader, pos.x, ground + this.alt, pos.z, this.heading, this.anim, time - this.animStart, ctx.yaw);
    const seat = m.kind === 'beast' ? m.altitude : view.height * 0.4;
    const lift = this.alt + (view.riderInSheet ? 0 : seat);
    pos.y = ground + lift;
    return {
      handled: true,
      heading: this.heading,
      drainPerSec: drain,
      lift,
      flying: m.kind === 'flight',
      hideLeader: view.riderInSheet,
      hideFollowers: m.kind === 'flight',
      landed,
      moving: moved > 1e-4,
    };
  }

  /** Snap state (teleports / new game). */
  reset(): void {
    this.alt = 0;
    this.autopilot = null;
    this.visual = null;
    this.forcedGlide = false;
    this.arrivePending = false;
    this.proxy.hide();
  }

  dispose(): void {
    this.proxy.dispose();
  }
}

