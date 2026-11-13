/**
 * The engine's imperative heart: owns the ECS world, the render layers and the
 * per-frame systems. `Scene` calls `update()` once per frame from its
 * render-priority `useFrame`, then renders through the HD-2D pipeline.
 *
 * System order: input → movement → followers → wildlife → drake-sight →
 * proximity/context → regions → tickWorld (~4 Hz) → combat staging → camera →
 * render batches.
 */
import * as THREE from 'three';
import { runtime } from '@/app/runtime';
import { getServices, useGame } from '@/app/store';
import { isWalkable, sampleHeight, WATER_LEVEL } from '@/engine/bootstrapAssets';
import { emitRipple, updateSharedUniforms } from '@/engine/shaders';
import type { AnimalState, ContextAction, GameStore, HeroId, NpcId, Vec2 } from '@/types/contracts';
import { blendPose, CAMERA_YAW, cameraPose, COMBAT_FRAMING, dampFactor, easeInOut, OVERWORLD_FRAMING, stepBlend } from './cameraRig';
import { CombatDirector } from './combatDirector';
import { createEngineWorld, setAnim, type EngineEntity, type EngineWorld } from './ecs';
import { Breadcrumbs, FOLLOW_GAP, stepFollower } from './followers';
import { blockedByColliders, resolveMove, SHALLOW_SPEED_FACTOR, stickToWorld, WALK_SPEED } from './movement';
import { PropLayer } from './propLayer';
import { PROP_CLEARANCE, propFromDef, walkAreaDeck, type PropInstance } from './props';
import type { Exclusion } from './scatter';
import { AuraLayer, FxLayer, shadowSize, ShadowBatch, SpriteBatcher } from './spriteLayer';
import { facingFromHeading, headingFromVector } from './spriteMath';
import { clampToPlayable, PLAYABLE_MAX, PLAYABLE_MIN } from './streaming';
import { TerrainLayer } from './terrainLayer';

const FACE_CAMERA = Math.PI / 2;
const TALK_REACH = 2.6;
const FISH_REACH = 3.4;
const PLOT_REACH = 4;
const COMBAT_CLEAR_RADIUS = 16;
const DASH_DISTANCE = 8;
const DASH_TIME = 0.28;

function contextKey(c: ContextAction | null): string {
  if (!c) return '';
  switch (c.kind) {
    case 'talk':
      return `talk:${c.npcId}:${c.label}`;
    case 'fish':
      return `fish:${c.spotId}:${c.label}`;
    case 'encounter':
      return `enc:${c.zoneId}:${c.label}`;
    case 'build':
      return `build:${c.plotId}:${c.label}`;
  }
}

export class EngineCore {
  readonly root = new THREE.Group();
  readonly ecs: EngineWorld = createEngineWorld();
  readonly terrain: TerrainLayer;
  readonly props: PropLayer;
  readonly sprites = new SpriteBatcher();
  readonly shadows = new ShadowBatch();
  readonly auras = new AuraLayer();
  readonly fx = new FxLayer();
  readonly combat: CombatDirector;
  /** View-space distance to the subject (tilt-shift focus). */
  focusDistance = 40;
  combatBlend = 0;

  private readonly svc = getServices();
  private readonly player: EngineEntity;
  private followers: EngineEntity[] = [];
  private readonly npcs = new Map<NpcId, EngineEntity>();
  private readonly zones = new Map<string, EngineEntity>();
  private readonly spots = new Map<string, EngineEntity>();
  private readonly animalEntities = new Map<string, EngineEntity>();
  private animals: readonly AnimalState[];
  private huntRng: number;
  private readonly trail = new Breadcrumbs();
  private readonly regionsInside = new Set<string>();
  private readonly revealedOnce = new Set<string>();
  private tickAcc = 0;
  private presenceDirty = true;
  private readonly unsubscribe: () => void;
  private dash: { t: number; dirX: number; dirZ: number } | null = null;
  private actionTimer = 0;
  private lastRipple = -10;
  private heading = FACE_CAMERA;
  private readonly camTarget = new THREE.Vector3();
  private readonly lookTmp = new THREE.Vector3();
  private readonly spriteQuery;
  private readonly followTmp = { x: 0, z: 0 };

  constructor() {
    const { db, systems } = this.svc;
    const world = db.world;
    this.root.name = 'emberwake';

    const start = clampToPlayable(runtime.player.x, runtime.player.z);
    runtime.player.x = start.x;
    runtime.player.z = start.z;
    runtime.player.facing = FACE_CAMERA;
    runtime.camera.yaw = CAMERA_YAW;
    runtime.camera.combatBlend = 0;

    this.props = new PropLayer(world, world.props.map(propFromDef));
    this.terrain = new TerrainLayer(world, () => this.foliageExclusions());
    this.combat = new CombatDirector(this.ecs, db, world);
    this.root.add(this.terrain.root, this.props.root, this.sprites.root, this.shadows.mesh, this.auras.root, this.fx.root);

    const st = useGame.getState();
    this.player = this.ecs.add({
      id: 'player',
      position: { x: start.x, y: this.groundY(start.x, start.z), z: start.z },
      sprite: { sheet: db.heroes[st.leader].sprite, facing: 0, anim: 'idle', frameTime: 0 },
      player: { heroId: st.leader },
      heading: FACE_CAMERA,
    });
    this.trail.reset(start.x, start.z);
    this.camTarget.set(start.x, this.player.position?.y ?? 0, start.z);

    for (const spot of world.fishingSpots) {
      const e = this.ecs.add({
        id: `spot:${spot.id}`,
        position: { x: spot.position.x, y: WATER_LEVEL, z: spot.position.z },
        fishingSpot: { spotId: spot.id },
        ...(spot.hiddenUntilDrakeSight ? { hiddenUntilDrakeSight: true as const } : {}),
      });
      this.spots.set(spot.id, e);
    }

    this.animals = systems.hunting.spawn(world.seed);
    this.huntRng = (world.seed ^ 0x5bd1e995) >>> 0;

    // The store dispatches the starting region at boot; only later changes are ours.
    for (const r of world.regions) if (Math.hypot(start.x - r.center.x, start.z - r.center.z) < r.radius) this.regionsInside.add(r.id);

    this.spriteQuery = this.ecs.with('sprite', 'position');
    this.unsubscribe = useGame.subscribe((s, p) => {
      if (s.flags !== p.flags || s.questLog !== p.questLog || s.township !== p.township || s.clearedZones !== p.clearedZones || s.merchantSurfaced !== p.merchantSurfaced || s.party !== p.party || s.leader !== p.leader || s.roster !== p.roster) this.presenceDirty = true;
    });
    this.syncPresence(st);
    // Build the home chunk right away so the first frame has ground under the party.
    this.terrain.update(start, 1);
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  groundY(x: number, z: number): number {
    const deck = walkAreaDeck(this.props.walkAreas, x, z);
    if (deck !== null) return deck;
    return Math.max(sampleHeight(this.svc.db.world, x, z), WATER_LEVEL - 0.3);
  }

  private readonly canStand = (x: number, z: number): boolean => {
    if (x < PLAYABLE_MIN || x > PLAYABLE_MAX || z < PLAYABLE_MIN || z > PLAYABLE_MAX) return false;
    if (walkAreaDeck(this.props.walkAreas, x, z) !== null) return true;
    return isWalkable(this.svc.db.world, x, z) && !blockedByColliders(this.props.colliders, x, z);
  };

  private foliageExclusions(): Exclusion[] {
    const { db } = this.svc;
    const out: Exclusion[] = [];
    for (const p of db.world.props) out.push({ x: p.position.x, z: p.position.z, r: PROP_CLEARANCE[p.kind] * (p.scale ?? 1) });
    for (const p of db.township.plots) out.push({ x: p.position.x, z: p.position.z, r: PROP_CLEARANCE.plot });
    for (const n of db.world.npcs) out.push({ x: n.position.x, z: n.position.z, r: 1.5 });
    for (const s of db.world.fishingSpots) out.push({ x: s.position.x, z: s.position.z, r: 2.5 });
    for (const z of db.world.encounterZones) out.push({ x: z.position.x, z: z.position.z, r: 2 });
    out.push({ x: db.world.playerStart.x, z: db.world.playerStart.z, r: 4 });
    return out;
  }

  private heroSprite(heroId: HeroId): string {
    return this.svc.db.heroes[heroId].sprite;
  }

  private auraFor(st: GameStore, heroId: HeroId): EngineEntity['aura'] {
    const fusion = st.roster[heroId]?.fusion ?? [];
    if (fusion.length === 0) return undefined;
    return { colors: fusion.map((s) => this.svc.db.spirits[s]?.auraColor ?? '#ffffff'), intensity: 0.7, broken: false };
  }

  /* ── Presence (party, NPCs, zones, township, barge) ──────────────────── */

  private syncPresence(st: GameStore): void {
    this.presenceDirty = false;
    const { db, core, systems } = this.svc;
    const holds = (c: Parameters<typeof core.quests.evaluate>[0] | undefined): boolean => !c || core.quests.evaluate(c, st.flags, st.questLog);

    // Party: leader swap changes the lead sprite instantly; followers re-slot.
    const p = this.player;
    if (p.player) p.player.heroId = st.leader;
    if (p.sprite) p.sprite.sheet = this.heroSprite(st.leader);
    const pa = this.auraFor(st, st.leader);
    if (pa) p.aura = pa;
    else delete p.aura;
    const followerIds = st.party.filter((h) => h !== st.leader);
    while (this.followers.length > followerIds.length) {
      const f = this.followers.pop();
      if (f) this.ecs.remove(f);
    }
    followerIds.forEach((heroId, slot) => {
      let f = this.followers[slot];
      if (!f) {
        const behind = this.trail.sampleBehind(FOLLOW_GAP * (slot + 1), runtime.player.x, runtime.player.z);
        f = this.ecs.add({
          id: `follower:${slot}`,
          position: { x: behind.x, y: this.groundY(behind.x, behind.z), z: behind.z },
          sprite: { sheet: this.heroSprite(heroId), facing: 0, anim: 'idle', frameTime: slot * 0.37 },
          follower: { heroId, slot },
          heading: FACE_CAMERA,
        });
        this.followers[slot] = f;
      }
      if (f.follower) f.follower.heroId = heroId;
      if (f.sprite) f.sprite.sheet = this.heroSprite(heroId);
      const fa = this.auraFor(st, heroId);
      if (fa) f.aura = fa;
      else delete f.aura;
    });

    // NPCs: presence from `presentWhen`, position from township residency.
    for (const npc of db.world.npcs) {
      const present = holds(npc.presentWhen);
      let e = this.npcs.get(npc.id);
      if (!present) {
        if (e) {
          this.ecs.remove(e);
          this.npcs.delete(npc.id);
        }
        continue;
      }
      const pos: Vec2 = systems.township.npcPosition(npc, st.township);
      if (!e) {
        e = this.ecs.add({
          id: `npc:${npc.id}`,
          position: { x: pos.x, y: this.groundY(pos.x, pos.z), z: pos.z },
          sprite: { sheet: npc.sprite, facing: 0, anim: 'idle', frameTime: (npc.position.x * 0.13) % 1 },
          npc: { npcId: npc.id },
          heading: FACE_CAMERA,
          ...(npc.hiddenUntilDrakeSight ? { hiddenUntilDrakeSight: true as const } : {}),
        });
        this.npcs.set(npc.id, e);
      } else if (e.position) {
        e.position.x = pos.x;
        e.position.z = pos.z;
        e.position.y = this.groundY(pos.x, pos.z);
      }
    }

    // Encounter zones: gone once cleared, gated by presentWhen.
    for (const zone of db.world.encounterZones) {
      const present = !(zone.once && st.clearedZones.includes(zone.id)) && holds(zone.presentWhen);
      const e = this.zones.get(zone.id);
      if (present && !e) {
        this.zones.set(
          zone.id,
          this.ecs.add({
            id: `zone:${zone.id}`,
            position: { x: zone.position.x, y: this.groundY(zone.position.x, zone.position.z), z: zone.position.z },
            sprite: { sheet: zone.sprite, facing: 0, anim: 'idle', frameTime: 0 },
            encounterZone: { zoneId: zone.id, encounterId: zone.encounterId },
            heading: FACE_CAMERA,
          }),
        );
      } else if (!present && e) {
        this.ecs.remove(e);
        this.zones.delete(zone.id);
      }
    }

    // Township buildings on their plots, stakes on empty plots, the merchant barge.
    const dynamic: PropInstance[] = [];
    for (const plot of db.township.plots) {
      const buildingId = st.township.built[plot.id];
      const def = buildingId ? db.township.buildings.find((b) => b.id === buildingId) : undefined;
      dynamic.push({ kind: def ? def.prop : 'plot', x: plot.position.x, z: plot.position.z, rotation: 0, scale: def ? 0.9 : 1 });
    }
    if (st.merchantSurfaced) {
      const b = this.bargePlacement();
      if (b) dynamic.push(b);
    }
    this.props.setDynamic(dynamic);
  }

  private bargePlacement(): PropInstance | null {
    const { db } = this.svc;
    const spot = db.world.fishingSpots.find((s) => s.merchantFish) ?? db.world.fishingSpots[0];
    if (!spot) return null;
    let best = { h: Infinity, dx: 0, dz: 1 };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const h = sampleHeight(db.world, spot.position.x + dx * 10, spot.position.z + dz * 10);
      if (h < best.h) best = { h, dx, dz };
    }
    return { kind: 'barge', x: spot.position.x + best.dx * 10, z: spot.position.z + best.dz * 10, rotation: Math.atan2(best.dz, -best.dx), scale: 1 };
  }

  /* ── Frame ───────────────────────────────────────────────────────────── */

  update(rawDt: number, time: number, camera: THREE.PerspectiveCamera): void {
    const dt = Math.min(0.1, Math.max(0, rawDt));
    const st = useGame.getState();
    if (this.presenceDirty) this.syncPresence(st);
    const { db } = this.svc;
    const mode = st.mode;
    const overworld = mode === 'overworld';
    const yaw = CAMERA_YAW;

    // 1. One-shot field action requests (store → engine).
    const req = runtime.requests.fieldAction;
    if (req) {
      runtime.requests.fieldAction = null;
      if (overworld || req === 'drakeSight') this.handleFieldAction(req, time);
    }

    // 2. Movement.
    const p = this.player;
    const pos = p.position;
    let mag = 0;
    let moved = 0;
    if (pos) {
      const fromX = pos.x;
      const fromZ = pos.z;
      if (this.dash) {
        this.stepDash(dt);
      } else if (overworld) {
        const v = stickToWorld(runtime.input.moveX, runtime.input.moveY, yaw);
        mag = v.mag;
        if (mag > 0) {
          const shallow = sampleHeight(db.world, pos.x, pos.z) < WATER_LEVEL + 0.05 && walkAreaDeck(this.props.walkAreas, pos.x, pos.z) === null;
          const speed = WALK_SPEED * mag * (shallow ? SHALLOW_SPEED_FACTOR : 1);
          const r = resolveMove(pos.x, pos.z, v.x * speed * dt, v.z * speed * dt, this.canStand);
          pos.x = r.x;
          pos.z = r.z;
          this.heading = headingFromVector(v.x, v.z);
          if (shallow && time - this.lastRipple > 0.75) {
            emitRipple(pos.x, pos.z);
            this.lastRipple = time;
          }
        }
      } else if (mode === 'fishing' && st.fishing) {
        const spot = db.world.fishingSpots.find((s) => s.id === st.fishing?.spotId);
        if (spot) {
          this.heading = headingFromVector(spot.position.x - pos.x, spot.position.z - pos.z);
          const period = st.fishing.phase === 'bite' || st.fishing.phase === 'reeling' ? 0.6 : 2.4;
          if (time - this.lastRipple > period) {
            emitRipple(spot.position.x, spot.position.z);
            this.lastRipple = time;
          }
        }
      } else if (mode === 'dialogue' && st.dialogue?.npcId) {
        const npc = this.npcs.get(st.dialogue.npcId);
        if (npc?.position) {
          this.heading = headingFromVector(npc.position.x - pos.x, npc.position.z - pos.z);
          npc.heading = headingFromVector(pos.x - npc.position.x, pos.z - npc.position.z);
        }
      }
      pos.y = this.groundY(pos.x, pos.z);
      moved = Math.hypot(pos.x - fromX, pos.z - fromZ);
      p.heading = this.heading;
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      setAnim(p, this.actionTimer > 0 || this.dash || mode === 'fishing' ? 'action' : moved > 1e-4 ? 'walk' : 'idle');
      runtime.player.x = pos.x;
      runtime.player.z = pos.z;
      runtime.player.facing = this.heading;
      runtime.player.moving = moved > 1e-4;
      runtime.player.speed = dt > 0 ? moved / dt : 0;

      // 3. Followers on the breadcrumb trail.
      this.trail.push(pos.x, pos.z);
      this.followers.forEach((f, slot) => {
        const fp = f.position;
        if (!fp) return;
        const target = this.trail.sampleBehind(FOLLOW_GAP * (slot + 1), pos.x, pos.z, this.followTmp);
        const before = { x: fp.x, z: fp.z };
        stepFollower(fp, target, dt, WALK_SPEED);
        fp.y = this.groundY(fp.x, fp.z);
        const fm = Math.hypot(fp.x - before.x, fp.z - before.z);
        if (fm > 1e-3) f.heading = headingFromVector(fp.x - before.x, fp.z - before.z);
        setAnim(f, fm > dt * 0.4 ? 'walk' : 'idle');
      });
    }

    // 4. Wildlife.
    if (mode !== 'combat' && pos) this.updateWildlife(dt, st, { x: pos.x, z: pos.z }, mag);

    // 5. Drake-Sight reveals.
    this.updateDrakeSight(st, time);

    // 6. Proximity → context action.
    if (overworld && pos) this.updateContext(st, pos.x, pos.z);

    // 7. Region enter events.
    if (overworld && pos) {
      for (const r of db.world.regions) {
        const d = Math.hypot(pos.x - r.center.x, pos.z - r.center.z);
        if (d < r.radius && !this.regionsInside.has(r.id)) {
          this.regionsInside.add(r.id);
          st.dispatchWorldEvent({ type: 'enterRegion', regionId: r.id });
        } else if (d > r.radius + 3) this.regionsInside.delete(r.id);
      }
    }

    // 8. World clock at ~4 Hz.
    this.tickAcc += dt;
    if (this.tickAcc >= 0.25) {
      useGame.getState().tickWorld(this.tickAcc);
      this.tickAcc = 0;
    }

    // 9. Combat staging + visibility.
    const latest = useGame.getState();
    this.combat.update(dt, time, latest.combat, latest.mode === 'combat', { x: runtime.player.x, z: runtime.player.z });
    this.applyCombatVisibility();

    // 10. Streaming, camera, shared uniforms, batches.
    this.terrain.update({ x: runtime.player.x, z: runtime.player.z });
    this.updateCamera(dt, camera, latest.mode === 'combat' && latest.combat !== null);
    updateSharedUniforms(time, latest.wind, pos ?? { x: 0, y: 0, z: 0 });
    this.renderBatches(dt, time, yaw);
  }

  private handleFieldAction(action: NonNullable<typeof runtime.requests.fieldAction>, time: number): void {
    const { db, systems } = this.svc;
    const pos = this.player.position;
    if (!pos) return;
    switch (action) {
      case 'huntShot': {
        const def = db.fieldActions.huntShot;
        const result = systems.hunting.shoot(this.animals, { x: pos.x, z: pos.z }, this.heading, def?.range ?? 30, this.huntRng);
        this.animals = result.animals;
        this.huntRng = result.rng;
        this.actionTimer = 0.5;
        useGame.getState().reportHunt(result);
        break;
      }
      case 'huntDash':
        this.dash = { t: 0, dirX: Math.cos(this.heading), dirZ: Math.sin(this.heading) };
        break;
      case 'drakeSight':
        this.fx.startPulse(time, db.fieldActions.drakeSight?.range || 30);
        this.actionTimer = 0.6;
        break;
      default:
        break;
    }
  }

  private stepDash(dt: number): void {
    const d = this.dash;
    const pos = this.player.position;
    if (!d || !pos) return;
    const step = Math.min(dt, DASH_TIME - d.t);
    const r = resolveMove(pos.x, pos.z, d.dirX * (DASH_DISTANCE / DASH_TIME) * step, d.dirZ * (DASH_DISTANCE / DASH_TIME) * step, this.canStand);
    pos.x = r.x;
    pos.z = r.z;
    d.t += step;
    if (d.t >= DASH_TIME - 1e-6) {
      this.dash = null;
      const { db, systems } = this.svc;
      const range = db.fieldActions.huntDash?.range ?? 3;
      const result = systems.hunting.dashStrike(this.animals, { x: pos.x, z: pos.z }, Math.min(3, Math.max(1.5, range)), this.huntRng);
      this.animals = result.animals;
      this.huntRng = result.rng;
      this.actionTimer = 0.4;
      useGame.getState().reportHunt(result);
    }
  }

  private updateWildlife(dt: number, st: GameStore, hunter: Vec2, stickMag: number): void {
    const { systems, db } = this.svc;
    const res = systems.hunting.update(this.animals, hunter, st.wind, 1 - stickMag, dt, this.huntRng);
    this.animals = res.animals;
    this.huntRng = res.rng;
    const seen = new Set<string>();
    for (const a of this.animals) {
      seen.add(a.id);
      let e = this.animalEntities.get(a.id);
      if (!e) {
        e = this.ecs.add({
          id: `animal:${a.id}`,
          position: { x: a.position.x, y: this.groundY(a.position.x, a.position.z), z: a.position.z },
          sprite: { sheet: db.species[a.speciesId]?.sprite ?? 'animal.deer', facing: 0, anim: 'idle', frameTime: (a.home.x * 0.07) % 1 },
          animal: { state: a },
          heading: a.heading,
        });
        this.animalEntities.set(a.id, e);
      }
      const ep = e.position;
      if (!ep) continue;
      const movedA = Math.hypot(a.position.x - ep.x, a.position.z - ep.z);
      ep.x = a.position.x;
      ep.z = a.position.z;
      ep.y = this.groundY(ep.x, ep.z);
      e.heading = a.heading;
      if (e.animal) e.animal.state = a;
      if (e.sprite) e.sprite.tint = a.mood === 'downed' ? '#8f8a96' : a.mood === 'alert' ? '#fff1d0' : undefined;
      setAnim(e, a.mood === 'downed' ? 'hurt' : movedA > dt * 0.3 ? 'walk' : 'idle');
    }
    for (const [id, e] of this.animalEntities) {
      if (seen.has(id)) continue;
      this.ecs.remove(e);
      this.animalEntities.delete(id);
    }
  }

  private updateDrakeSight(st: GameStore, time: number): void {
    const { db } = this.svc;
    const active = st.drakeSightUntil > st.worldTime;
    const range = db.fieldActions.drakeSight?.range || 30;
    const pos = this.player.position;
    const check = (id: string, e: EngineEntity): void => {
      if (!e.hiddenUntilDrakeSight || !e.position || !pos) return;
      const inRange = active && Math.hypot(e.position.x - pos.x, e.position.z - pos.z) <= range;
      e.hidden = !inRange;
      if (e.sprite) {
        e.sprite.tint = inRange ? '#ffd9a0' : undefined;
        e.sprite.flash = inRange ? 0.18 + Math.sin(time * 5) * 0.12 : 0;
      }
      if (inRange && !this.revealedOnce.has(id)) {
        this.revealedOnce.add(id);
        useGame.getState().dispatchWorldEvent({ type: 'fieldAction', action: 'drakeSight', targetId: id });
      }
    };
    for (const [id, e] of this.npcs) check(id, e);
    for (const [id, e] of this.spots) check(id, e);
    if (pos) this.fx.updatePulse(time, pos.x, pos.y, pos.z);
  }

  private updateContext(st: GameStore, x: number, z: number): void {
    const { db } = this.svc;
    let best: ContextAction | null = null;
    let bestScore = Infinity;
    const consider = (d: number, reach: number, action: ContextAction): void => {
      if (d > reach) return;
      const score = d - reach * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = action;
      }
    };
    for (const [npcId, e] of this.npcs) {
      if (e.hidden || !e.position) continue;
      const npc = db.world.npcs.find((n) => n.id === npcId);
      consider(Math.hypot(e.position.x - x, e.position.z - z), TALK_REACH, { kind: 'talk', npcId, label: `Talk to ${npc?.name ?? 'stranger'}` });
    }
    for (const spot of db.world.fishingSpots) {
      const e = this.spots.get(spot.id);
      if (!e || e.hidden) continue;
      consider(Math.hypot(spot.position.x - x, spot.position.z - z), FISH_REACH, { kind: 'fish', spotId: spot.id, label: `Fish · ${spot.name}` });
    }
    for (const [zoneId, e] of this.zones) {
      const zone = db.world.encounterZones.find((zz) => zz.id === zoneId);
      if (!zone || !e.position) continue;
      const enc = db.encounters[zone.encounterId];
      consider(Math.hypot(e.position.x - x, e.position.z - z), zone.radius, { kind: 'encounter', zoneId, encounterId: zone.encounterId, label: `Fight · ${enc?.name ?? 'Foes'}` });
    }
    for (const plot of db.township.plots) {
      if (st.township.built[plot.id]) continue;
      consider(Math.hypot(plot.position.x - x, plot.position.z - z), PLOT_REACH, { kind: 'build', plotId: plot.id, label: `Build · ${plot.name}` });
    }
    const chosen: ContextAction | null = best;
    if (contextKey(chosen) !== contextKey(st.contextAction)) st.setContextAction(chosen);
  }

  private applyCombatVisibility(): void {
    const anchor = this.combat.anchor;
    const staged = this.combat.isStaged;
    this.player.hidden = staged;
    for (const f of this.followers) f.hidden = staged;
    const near = (e: EngineEntity): boolean => !!anchor && !!e.position && Math.hypot(e.position.x - anchor.x, e.position.z - anchor.z) < COMBAT_CLEAR_RADIUS;
    for (const e of this.zones.values()) e.hidden = staged && near(e);
    for (const e of this.animalEntities.values()) e.hidden = staged && near(e);
    for (const e of this.npcs.values()) if (!e.hiddenUntilDrakeSight) e.hidden = staged && near(e);
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera, inCombat: boolean): void {
    const pos = this.player.position;
    if (pos) {
      const k = dampFactor(7, dt);
      this.camTarget.x += (pos.x - this.camTarget.x) * k;
      this.camTarget.y += (pos.y - this.camTarget.y) * dampFactor(3, dt);
      this.camTarget.z += (pos.z - this.camTarget.z) * k;
    }
    this.combatBlend = stepBlend(this.combatBlend, inCombat ? 1 : 0, dt);
    const eased = easeInOut(this.combatBlend);
    const over = cameraPose(this.camTarget, OVERWORLD_FRAMING);
    let pose = over;
    if (eased > 0) {
      const a = this.combat.anchor ?? { x: this.camTarget.x, z: this.camTarget.z };
      const battle = cameraPose({ x: a.x, y: this.groundY(a.x, a.z), z: a.z }, COMBAT_FRAMING);
      pose = blendPose(over, battle, eased);
    }
    camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    camera.lookAt(this.lookTmp.set(pose.look.x, pose.look.y, pose.look.z));
    this.focusDistance = Math.hypot(pose.pos.x - pose.look.x, pose.pos.y - pose.look.y, pose.pos.z - pose.look.z);
    runtime.camera.combatBlend = eased;
    runtime.camera.yaw = CAMERA_YAW;
  }

  private renderBatches(dt: number, time: number, yaw: number): void {
    this.sprites.begin();
    this.shadows.begin();
    this.auras.begin();
    for (const e of this.spriteQuery) {
      e.sprite.frameTime += dt;
      e.sprite.facing = facingFromHeading(e.heading ?? FACE_CAMERA, yaw);
      if (e.hidden || (e.opacity ?? 1) <= 0.01) continue;
      const s = shadowSize(e);
      this.shadows.add(e.position.x, e.position.y, e.position.z, s.w, s.d);
      if (e.aura) this.auras.add(e);
      if (!e.combatActor) this.sprites.add(e);
    }
    this.sprites.end();
    this.shadows.end();
    this.auras.end();

    this.fx.beginSpots();
    for (const e of this.spots.values()) if (!e.hidden && e.position) this.fx.addSpot(e.position.x, e.position.z, time, !!e.hiddenUntilDrakeSight);
    this.fx.endSpots();
  }

  dispose(): void {
    this.unsubscribe();
    this.combat.dispose();
    this.terrain.dispose();
    this.props.dispose();
    this.sprites.dispose();
    this.shadows.dispose();
    this.auras.dispose();
    this.fx.dispose();
    for (const e of [...this.ecs.entities]) this.ecs.remove(e);
  }
}
