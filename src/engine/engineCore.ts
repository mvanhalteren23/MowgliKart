/**
 * The engine's imperative heart: owns the ECS world, the render layers and the
 * per-frame systems. `Scene` calls `update()` once per frame from its
 * render-priority `useFrame`, then renders through the HD-2D pipeline.
 *
 * System order: requests (field actions, traversal, aim) → presence → input →
 * movement / traversal → followers → wildlife → drake-sight → proximity/context
 * → regions → tickWorld (~4 Hz) → combat staging → streaming → camera →
 * atmosphere → render batches.
 */
import * as THREE from 'three';
import { runtime } from '@/app/runtime';
import { getServices, useGame } from '@/app/store';
import { biomeAt, isWalkable, sampleHeight, WATER_LEVEL } from '@/engine/bootstrapAssets';
import { emitRipple, updateSharedUniforms } from '@/engine/shaders';
import type { AnimalState, BiomeChunkDef, ContextAction, FieldActionId, GameStore, HeroId, NpcId, TraversalGateDef, Vec2 } from '@/types/contracts';
import { AssetRegistryLoader } from './assets/AssetRegistryLoader';
import { assetRegistry } from './assets/registry';
import { SeamlessFastTravelController, type TravelFrame } from './fastTravel';
import { HazardLayer } from './hazardLayer';
import { shakeOffset } from './hitStop';
import { locomotion } from './travel';
import { atmosphereAt, BIOME_ATMOSPHERE, dampAtmosphere, scatterDressing, type Atmosphere } from './biomes';
import { blendPose, CAMERA_YAW, cameraPose, COMBAT_FRAMING, dampFactor, easeInOut, stepBlend } from './cameraRig';
import { CombatDirector } from './combatDirector';
import { fitDistance } from './combatStaging';
import { createEngineWorld, setAnim, type EngineEntity, type EngineWorld } from './ecs';
import { ArrowFx, MoteLayer } from './fx';
import { GateLayer } from './gateLayer';
import { Breadcrumbs, FOLLOW_GAP, stepFollower } from './followers';
import { followerLandings, gateAction, gateCleared, gateCollider, gateDistance, GATE_REQUEST_SLACK, shotRay, traversalEnds, traversalSample, TRAVERSAL_DURATION, whoCanClear } from './gates';
import { ColliderGrid, resolveMove, SHALLOW_SPEED_FACTOR, stickToWorld, WALK_SPEED } from './movement';
import { DressingLayer, DynamicPropLayer, PropMaterials, SailsLayer, StaticPropLayer, type DynamicProp } from './propLayer';
import { PROP_CLEARANCE, propFromDef, walkAreaDeck, type PropInstance, type WalkArea } from './props';
import type { Exclusion } from './scatter';
import { AuraLayer, FxLayer, shadowSize, ShadowBatch, SpriteBatcher } from './spriteLayer';
import { facingFromHeading, headingFromVector } from './spriteMath';
import { clampToContinent, continentAllows, continentBounds, distanceToChunks, insideBounds, SOFT_WALL, type Bounds, type ChunkCoord } from './streaming';
import { TerrainLayer } from './terrainLayer';

const FACE_CAMERA = Math.PI / 2;
const TALK_REACH = 2.6;
const FISH_REACH = 3.4;
const PLOT_REACH = 4;
const COMBAT_CLEAR_RADIUS = 16;
const DASH_DISTANCE = 8;
const DASH_TIME = 0.28;
/** Sprites farther than this from the camera target are not drawn (keeps per-sheet draws local). */
const SPRITE_CULL = 95;
/** Approach speed (m/s) from where the leader stands to the gate's near side. */
const APPROACH_SPEED = 7;
const FOLLOWER_DELAY = 0.3;
/** Foliage within this distance of the combat stage line is hidden during battle. */
export const COMBAT_FOLIAGE_CLEAR = 12;
const NO_TRAVEL: TravelFrame = { handled: false, heading: null, drainPerSec: 0, lift: 0, flying: false, hideLeader: false, hideFollowers: false, landed: false, moving: false };

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
    case 'traverse':
      return `trav:${c.gateId}:${c.action}:${c.label}`;
  }
  return '';
}

interface Traversal {
  readonly gate: TraversalGateDef;
  readonly start: Vec2;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly approach: number;
  readonly duration: number;
  readonly permanent: boolean;
  /** Followers: own start positions and landing points. */
  readonly followers: readonly { start: Vec2; land: Vec2 }[];
  t: number;
  lastLift: number;
}

export class EngineCore {
  readonly root = new THREE.Group();
  readonly ecs: EngineWorld = createEngineWorld();
  readonly terrain: TerrainLayer;
  readonly mats = new PropMaterials();
  readonly staticProps: StaticPropLayer;
  readonly dressing: DressingLayer;
  readonly sails: SailsLayer;
  readonly dynamic: DynamicPropLayer;
  readonly gates: GateLayer;
  readonly motes = new MoteLayer();
  readonly arrow = new ArrowFx();
  readonly sprites = new SpriteBatcher();
  readonly shadows = new ShadowBatch();
  readonly auras = new AuraLayer();
  readonly fx = new FxLayer();
  readonly combat: CombatDirector;
  readonly grid = new ColliderGrid();
  /** Delivered pipeline art → textures (hot-swapped). */
  readonly assets: AssetRegistryLoader;
  readonly hazards: HazardLayer;
  readonly travel: SeamlessFastTravelController;
  private travelFrame: TravelFrame = NO_TRAVEL;
  /** View-space distance to the subject (tilt-shift focus). */
  focusDistance = 40;
  combatBlend = 0;
  /** Current blended fog / sky palette (GameCanvas copies it into the post pass). */
  atmosphere: Atmosphere = BIOME_ATMOSPHERE.frontier;

  private readonly svc = getServices();
  private readonly chunks: readonly BiomeChunkDef[];
  private readonly bounds: Bounds;
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
  private readonly dressCache = new Map<string, PropInstance[]>();
  private presentGates: readonly TraversalGateDef[] = [];
  private walkAreas: readonly WalkArea[] = [];
  private traversal: Traversal | null = null;
  private tickAcc = 0;
  private presenceDirty = true;
  private sailsDirty = true;
  private sailsAt = { x: Infinity, z: Infinity };
  private readonly unsubscribe: () => void;
  private dash: { t: number; dirX: number; dirZ: number } | null = null;
  private actionTimer = 0;
  private lastRipple = -10;
  private heading = FACE_CAMERA;
  private readonly lastWritten = { x: 0, z: 0 };
  private readonly camTarget = new THREE.Vector3();
  private readonly lookTmp = new THREE.Vector3();
  private readonly ropeA = new THREE.Vector3();
  private readonly ropeB = new THREE.Vector3();
  private readonly spriteQuery;
  private readonly followTmp = { x: 0, z: 0 };
  private moveFrom = { x: 0, z: 0 };

  constructor() {
    const { db, systems } = this.svc;
    const world = db.world;
    this.root.name = 'emberwake';
    this.chunks = world.chunks ?? [];
    this.bounds = continentBounds(this.chunks);

    const start = clampToContinent(this.chunks, runtime.player.x, runtime.player.z);
    this.writePlayer(start.x, start.z, FACE_CAMERA, false, 0);
    runtime.camera.yaw = CAMERA_YAW;
    runtime.camera.combatBlend = 0;

    this.staticProps = new StaticPropLayer(world, world.props.map(propFromDef), this.mats);
    for (const [key, cols] of this.staticProps.collidersByChunk) this.grid.setGroup(`props:${key}`, cols);
    this.dressing = new DressingLayer(world, this.mats);
    this.sails = new SailsLayer(world, this.mats);
    this.dynamic = new DynamicPropLayer(world, this.mats);
    this.gates = new GateLayer(world, this.mats);
    this.terrain = new TerrainLayer(world, (c) => this.foliageExclusions(c), {
      onBuilt: (coord, tier) => (tier === 0 ? this.dress(coord) : this.undress(coord.key)),
      onUnload: (key) => this.undress(key),
    });
    this.combat = new CombatDirector(this.ecs, db, world);
    assetRegistry.seed(db.assetRequests ?? []);
    this.assets = new AssetRegistryLoader(assetRegistry);
    this.hazards = new HazardLayer(db, this.assets);
    this.travel = new SeamlessFastTravelController(this.assets);
    this.root.add(
      this.terrain.root,
      this.staticProps.root,
      this.dressing.root,
      this.sails.mesh,
      this.dynamic.root,
      this.gates.root,
      this.sprites.root,
      this.shadows.mesh,
      this.auras.root,
      this.fx.root,
      this.motes.points,
      this.arrow.mesh,
      this.hazards.root,
      this.travel.proxy.root,
    );

    const st = useGame.getState();
    this.player = this.ecs.add({
      id: 'player',
      position: { x: start.x, y: 0, z: start.z },
      sprite: { sheet: db.heroes[st.leader].sprite, facing: 0, anim: 'idle', frameTime: 0 },
      player: { heroId: st.leader },
      heading: FACE_CAMERA,
    });
    this.trail.reset(start.x, start.z);

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
    if (this.player.position) this.player.position.y = this.groundY(start.x, start.z);
    this.camTarget.set(start.x, this.player.position?.y ?? 0, start.z);
    // Build the player's chunk right away so the first frame has ground under the party.
    this.terrain.update(start, 1);
    this.atmosphere = atmosphereAt((x, z) => biomeAt(world, x, z), start.x, start.z);
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  private writePlayer(x: number, z: number, facing: number, moving: boolean, speed: number): void {
    runtime.player.x = x;
    runtime.player.z = z;
    runtime.player.facing = facing;
    runtime.player.moving = moving;
    runtime.player.speed = speed;
    this.lastWritten.x = x;
    this.lastWritten.z = z;
  }

  groundY(x: number, z: number): number {
    const deck = walkAreaDeck(this.walkAreas, x, z);
    if (deck !== null) return deck;
    return Math.max(sampleHeight(this.svc.db.world, x, z), WATER_LEVEL - 0.3);
  }

  private readonly canStand = (x: number, z: number): boolean => {
    if (!continentAllows(this.chunks, this.bounds, this.moveFrom.x, this.moveFrom.z, x, z)) return false;
    if (walkAreaDeck(this.walkAreas, x, z) !== null) return true;
    return isWalkable(this.svc.db.world, x, z) && !this.grid.blocked(x, z);
  };

  /** Safe touchdown: on the continent (inside the soft wall), walkable and clear of props. */
  private readonly canLand = (x: number, z: number): boolean => {
    if (!insideBounds(x, z, this.bounds) || distanceToChunks(this.chunks, x, z) > SOFT_WALL) return false;
    if (walkAreaDeck(this.walkAreas, x, z) !== null) return true;
    return isWalkable(this.svc.db.world, x, z) && !this.grid.blocked(x, z);
  };

  private baseExclusions(): Exclusion[] {
    const { db } = this.svc;
    const out: Exclusion[] = [];
    for (const p of db.world.props) out.push({ x: p.position.x, z: p.position.z, r: PROP_CLEARANCE[p.kind] * (p.scale ?? 1) });
    for (const p of db.township.plots) out.push({ x: p.position.x, z: p.position.z, r: PROP_CLEARANCE.plot });
    for (const n of db.world.npcs) out.push({ x: n.position.x, z: n.position.z, r: 1.5 });
    for (const s of db.world.fishingSpots) out.push({ x: s.position.x, z: s.position.z, r: 2.5 });
    for (const z of db.world.encounterZones) out.push({ x: z.position.x, z: z.position.z, r: 2 });
    for (const g of db.world.traversalGates ?? []) {
      out.push({ x: g.position.x, z: g.position.z, r: Math.hypot(g.width, g.depth) / 2 + 2 });
      for (const s of g.sides) out.push({ x: s.x, z: s.z, r: 2 });
    }
    out.push({ x: db.world.playerStart.x, z: db.world.playerStart.z, r: 4 });
    return out;
  }

  private dressingFor(coord: ChunkCoord): PropInstance[] {
    const hit = this.dressCache.get(coord.key);
    if (hit) return hit;
    const def = this.chunks.find((c) => c.cx === coord.cx && c.cz === coord.cz);
    const list = def && def.scatterProps.length > 0 ? scatterDressing(this.svc.db.world, def, { exclusions: this.baseExclusions() }) : [];
    this.dressCache.set(coord.key, list);
    return list;
  }

  private foliageExclusions(coord: ChunkCoord): Exclusion[] {
    const out = this.baseExclusions();
    for (const p of this.dressingFor(coord)) out.push({ x: p.x, z: p.z, r: PROP_CLEARANCE[p.kind] * p.scale });
    return out;
  }

  private dress(coord: ChunkCoord): void {
    if (this.dressing.has(coord.key)) return;
    const list = this.dressingFor(coord);
    if (list.length === 0) return;
    this.grid.setGroup(`dress:${coord.key}`, this.dressing.set(coord.key, list));
    this.sailsDirty = true;
  }

  private undress(key: string): void {
    if (!this.dressing.has(key)) return;
    this.dressing.remove(key);
    this.grid.setGroup(`dress:${key}`, []);
    this.sailsDirty = true;
  }

  private heroSprite(heroId: HeroId): string {
    return this.svc.db.heroes[heroId].sprite;
  }

  private auraFor(st: GameStore, heroId: HeroId): EngineEntity['aura'] {
    const fusion = st.roster[heroId]?.fusion ?? [];
    if (fusion.length === 0) return undefined;
    return { colors: fusion.map((s) => this.svc.db.spirits[s]?.auraColor ?? '#ffffff'), intensity: 0.7, broken: false };
  }

  /* ── Presence (party, NPCs, zones, township, barge, gates) ───────────── */

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
          sprite: { sheet: npc.sprite, facing: 0, anim: 'idle', frameTime: Math.abs(npc.position.x * 0.13) % 1 },
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

    // Township buildings scale with their architectural level; stakes on empty plots; the merchant barge.
    const dynamic: DynamicProp[] = [];
    for (const plot of db.township.plots) {
      const buildingId = st.township.built[plot.id];
      const def = buildingId ? db.township.buildings.find((b) => b.id === buildingId) : undefined;
      const level = st.township.levels?.[plot.id] ?? 1;
      const grow = def && level > 1 ? (def.upgrades.find((u) => u.level === level)?.propScale ?? 1) : 1;
      dynamic.push({ id: `plot:${plot.id}`, prop: { kind: def ? def.prop : 'plot', x: plot.position.x, z: plot.position.z, rotation: 0, scale: def ? 0.9 * grow : 1 } });
    }
    if (st.merchantSurfaced) {
      const b = this.bargePlacement();
      if (b) dynamic.push({ id: 'barge', prop: b });
    }
    for (const id of this.dynamic.set(dynamic)) {
      const prop = this.dynamic.position(id);
      if (prop) this.motes.emit(prop.x, sampleHeight(db.world, prop.x, prop.z) + 0.6, prop.z, { color: [0.86, 0.8, 0.7], count: 60, speed: 3.2, up: 2.2, gravity: 1.5, life: 1.4, size: 0.55, jitter: 3 });
    }
    this.grid.setGroup('dynamic', this.dynamic.colliders);
    this.walkAreas = [...this.staticProps.walkAreas, ...this.dynamic.walkAreas];

    // Traversal gates: present until cleared for good.
    this.presentGates = (db.world.traversalGates ?? []).filter((g) => holds(g.presentWhen) && !gateCleared(g, st.flags));
    const active = this.traversal?.gate.id;
    this.gates.sync(this.presentGates);
    this.grid.setGroup('gates', this.presentGates.filter((g) => g.id !== active).map(gateCollider));
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
    const { db } = this.svc;
    const mode = st.mode;
    const overworld = mode === 'overworld';
    const yaw = CAMERA_YAW;
    const p = this.player;
    const pos = p.position;

    // 0. External teleport (dev tools / perf probes write runtime.player directly).
    if (pos && (Math.abs(runtime.player.x - this.lastWritten.x) > 0.01 || Math.abs(runtime.player.z - this.lastWritten.z) > 0.01)) this.teleport(runtime.player.x, runtime.player.z);

    // 1. One-shot requests (store → engine). Traversal first so the gate is still on screen.
    const req = runtime.requests.fieldAction;
    if (req) {
      runtime.requests.fieldAction = null;
      if ((overworld && !this.travelFrame.flying) || req === 'drakeSight') this.handleFieldAction(req, time);
    }
    runtime.requests.huntAim = null;
    runtime.requests.traverseGate = null;
    if (this.presenceDirty) this.syncPresence(useGame.getState());

    // 2. Movement.
    let mag = 0;
    let moved = 0;
    let drain = 0;
    const staminaSvc = this.svc.core.stamina;
    const tuning = db.stamina;
    const canDrain = staminaSvc ? staminaSvc.canDrain(runtime.stamina) : true;
    let tf: TravelFrame = NO_TRAVEL;
    if (pos) {
      const fromX = pos.x;
      const fromZ = pos.z;
      this.moveFrom = { x: fromX, z: fromZ };
      let lift = 0;
      if (this.traversal) {
        lift = this.stepTraversal(dt, time);
      } else if (this.dash) {
        this.stepDash(dt);
      } else if (overworld) {
        const v = stickToWorld(runtime.input.moveX, runtime.input.moveY, yaw);
        mag = v.mag;
        if (tuning) {
          tf = this.travel.update({
            dt,
            time,
            st,
            mounts: db.mounts ?? {},
            pos,
            stick: v,
            yaw,
            bounds: this.bounds,
            stamina: runtime.stamina,
            tuning,
            canDrain,
            baseSpeed: WALK_SPEED,
            canStand: this.canStand,
            canLand: this.canLand,
            groundY: (x, z) => this.groundY(x, z),
          });
        }
        if (tf.handled) {
          drain = tf.drainPerSec;
          if (tf.heading !== null) this.heading = tf.heading;
        } else if (mag > 0) {
          const shallow = sampleHeight(db.world, pos.x, pos.z) < WATER_LEVEL + 0.05 && walkAreaDeck(this.walkAreas, pos.x, pos.z) === null;
          const loco = tuning
            ? locomotion({ baseSpeed: WALK_SPEED, stickMag: mag, sprint: runtime.input.sprint, boost: false, canDrain, tuning, mount: null, terrainFactor: shallow ? SHALLOW_SPEED_FACTOR : 1 })
            : { speed: WALK_SPEED * mag * (shallow ? SHALLOW_SPEED_FACTOR : 1), drainPerSec: 0 };
          const speed = loco.speed;
          drain = loco.drainPerSec;
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
      if (!tf.handled) pos.y = this.groundY(pos.x, pos.z) + lift;
      p.shadowDrop = tf.handled ? tf.lift : lift;
      moved = Math.hypot(pos.x - fromX, pos.z - fromZ);
      p.heading = this.heading;
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      if (tf.handled) setAnim(p, 'idle');
      else if (!this.traversal) setAnim(p, this.actionTimer > 0 || this.dash || mode === 'fishing' ? 'action' : moved > 1e-4 ? 'walk' : 'idle');
      this.writePlayer(pos.x, pos.z, this.heading, moved > 1e-4, dt > 0 ? moved / dt : 0);

      // 3. Followers on the breadcrumb trail (scripted while crossing a gate; they ride along in flight).
      if (tf.landed) this.regroup(pos.x, pos.z);
      const followSpeed = Math.max(WALK_SPEED, (dt > 0 ? moved / dt : 0) * 1.15);
      if (!this.traversal) {
        this.trail.push(pos.x, pos.z);
        this.followers.forEach((f, slot) => {
          const fp = f.position;
          if (!fp) return;
          const target = this.trail.sampleBehind(FOLLOW_GAP * (slot + 1), pos.x, pos.z, this.followTmp);
          const bx = fp.x;
          const bz = fp.z;
          stepFollower(fp, target, dt, followSpeed);
          fp.y = this.groundY(fp.x, fp.z);
          const fm = Math.hypot(fp.x - bx, fp.z - bz);
          if (fm > 1e-3) f.heading = headingFromVector(fp.x - bx, fp.z - bz);
          setAnim(f, fm > dt * 0.4 ? 'walk' : 'idle');
        });
      }
    }

    this.travelFrame = tf;
    // Stamina: one tick per frame (0 drain = resting / regenerating).
    if (staminaSvc && tuning) runtime.stamina = staminaSvc.tick(runtime.stamina, drain, dt, tuning);

    // 4. Wildlife.
    if (mode !== 'combat' && pos) this.updateWildlife(dt, st, { x: pos.x, z: pos.z }, tf.flying ? 0 : mag);

    // 5. Drake-Sight reveals.
    this.updateDrakeSight(st, time);

    // 6. Proximity → context action.
    if (overworld && pos && !this.traversal && !tf.flying) this.updateContext(useGame.getState(), pos.x, pos.z);
    else if (tf.flying && useGame.getState().contextAction) useGame.getState().setContextAction(null);

    // 7. Region enter events.
    if (overworld && pos) {
      for (const r of db.world.regions) {
        const d = Math.hypot(pos.x - r.center.x, pos.z - r.center.z);
        if (d < r.radius && !this.regionsInside.has(r.id)) {
          this.regionsInside.add(r.id);
          useGame.getState().dispatchWorldEvent({ type: 'enterRegion', regionId: r.id });
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
    const staged = this.combat.isStaged;
    this.hazards.update(this.combat.hitStop.effectiveDt(time, dt), staged ? latest.combat : null, (side) => this.combat.sideSpan(side), (x, z) => this.groundY(x, z));
    const frame = staged ? this.combat.frame : null;
    this.terrain.setFoliageExclusion(frame ? { ax: frame.x - frame.width / 2, az: frame.z, bx: frame.x + frame.width / 2, bz: frame.z, radius: COMBAT_FOLIAGE_CLEAR } : null);

    // 10. Streaming (continuous while crossing chunks in flight), camera, atmosphere, shared uniforms, FX, batches.
    this.terrain.update({ x: runtime.player.x, z: runtime.player.z }, tf.flying ? 2 : 1);
    this.updateCamera(dt, time, camera, latest.mode === 'combat' && latest.combat !== null);
    const target = atmosphereAt((x, z) => biomeAt(db.world, x, z), this.camTarget.x, this.camTarget.z);
    this.atmosphere = dampAtmosphere(this.atmosphere, target, dt);
    updateSharedUniforms(time, latest.wind, pos ?? { x: 0, y: 0, z: 0 });
    const windV = { x: Math.cos(latest.wind.direction) * latest.wind.speed * 0.3, z: Math.sin(latest.wind.direction) * latest.wind.speed * 0.3 };
    this.gates.update(dt, { x: this.camTarget.x, z: this.camTarget.z }, this.motes, windV);
    if (this.sailsDirty || Math.hypot(this.camTarget.x - this.sailsAt.x, this.camTarget.z - this.sailsAt.z) > 40) {
      this.sails.setWindmills([...this.staticProps.windmills, ...this.dressing.windmills()], this.camTarget);
      this.sailsDirty = false;
      this.sailsAt = { x: this.camTarget.x, z: this.camTarget.z };
    }
    this.sails.update(time, latest.wind.speed);
    this.dynamic.update(dt);
    this.arrow.update(dt);
    this.motes.update(dt);
    this.renderBatches(dt, time, yaw);
  }

  /** Followers regroup behind the leader (after a flight touchdown). */
  private regroup(x: number, z: number): void {
    this.trail.reset(x, z);
    this.followers.forEach((f, i) => {
      if (!f.position) return;
      f.position.x = x - 0.6 * (i + 1);
      f.position.z = z + 0.9 * (i + 1);
      f.position.y = this.groundY(f.position.x, f.position.z);
    });
  }

  /** Jump the party (dev/perf teleports): clamps to the continent and snaps camera + followers. */
  private teleport(x: number, z: number): void {
    const pos = this.player.position;
    if (!pos) return;
    const c = clampToContinent(this.chunks, x, z);
    pos.x = c.x;
    pos.z = c.z;
    pos.y = this.groundY(c.x, c.z);
    this.traversal = null;
    this.dash = null;
    this.trail.reset(c.x, c.z);
    for (const f of this.followers) {
      if (!f.position) continue;
      f.position.x = c.x;
      f.position.z = c.z + 0.5;
      f.position.y = pos.y;
    }
    this.camTarget.set(c.x, pos.y, c.z);
    this.writePlayer(c.x, c.z, this.heading, false, 0);
    this.terrain.update({ x: c.x, z: c.z }, 1);
  }

  private handleFieldAction(action: FieldActionId, time: number): void {
    const { db, systems } = this.svc;
    const pos = this.player.position;
    if (!pos) return;
    switch (action) {
      case 'huntShot': {
        const def = db.fieldActions.huntShot;
        const base = def?.range ?? 30;
        const aim = runtime.requests.huntAim;
        const angle = aim ? aim.angle : this.heading;
        const ray = shotRay({ x: pos.x, z: pos.z }, angle, aim ? aim.power : 1, base);
        this.heading = angle;
        const result = systems.hunting.shoot(this.animals, { x: pos.x, z: pos.z }, angle, ray.range, this.huntRng);
        this.animals = result.animals;
        this.huntRng = result.rng;
        this.actionTimer = 0.5;
        const hit = result.hit ? result.animals.find((a) => a.id === result.animalId) : undefined;
        const end = hit ? hit.position : ray.end;
        this.arrow.fire(pos.x, pos.y + 1.1, pos.z, end.x, this.groundY(end.x, end.z) + (hit ? 0.7 : 0.1), end.z);
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
      case 'roll':
      case 'glide':
      case 'grapple':
      case 'leap':
      case 'commune':
      case 'unseal':
        this.startTraversal(action);
        break;
      default:
        break;
    }
  }

  /* ── Traversal ───────────────────────────────────────────────────────── */

  private startTraversal(action: FieldActionId): void {
    const { db } = this.svc;
    const pos = this.player.position;
    const gateId = runtime.requests.traverseGate;
    if (!pos || !gateId || this.traversal) return;
    const gate = (db.world.traversalGates ?? []).find((g) => g.id === gateId);
    if (!gate || gateAction(gate.kind) !== action || !this.gates.has(gate.id)) return;
    const range = db.fieldActions[action]?.range ?? 3;
    if (gateDistance(gate, pos) > range + GATE_REQUEST_SLACK) return;
    const { from, to } = traversalEnds(gate, pos);
    const approach = Math.min(0.6, Math.hypot(from.x - pos.x, from.z - pos.z) / APPROACH_SPEED);
    const landings = followerLandings(from, to, this.followers.length, 1.3);
    this.traversal = {
      gate,
      start: { x: pos.x, z: pos.z },
      from,
      to,
      approach,
      duration: TRAVERSAL_DURATION[gate.kind],
      permanent: gate.clearsPermanently,
      followers: this.followers.map((f, i) => ({ start: { x: f.position?.x ?? pos.x, z: f.position?.z ?? pos.z }, land: landings[i] ?? to })),
      t: 0,
      lastLift: 0,
    };
    if (gate.clearsPermanently) this.gates.beginClear(gate.id);
    this.grid.setGroup('gates', this.presentGates.filter((g) => g.id !== gate.id).map(gateCollider));
    this.heading = headingFromVector(to.x - from.x, to.z - from.z);
  }

  /** Position along a crossing for an actor whose clock is `t` seconds in. */
  private crossingAt(tr: Traversal, t: number, start: Vec2, to: Vec2): { x: number; z: number; lift: number; airborne: boolean; gateFx: number; u: number } {
    if (t < tr.approach) {
      const k = tr.approach > 0 ? t / tr.approach : 1;
      return { x: start.x + (tr.from.x - start.x) * k, z: start.z + (tr.from.z - start.z) * k, lift: 0, airborne: false, gateFx: 0, u: 0 };
    }
    const u = Math.min(1, (t - tr.approach) / tr.duration);
    const s = traversalSample(tr.gate.kind, tr.from, to, u);
    return { x: s.x, z: s.z, lift: s.lift, airborne: s.airborne, gateFx: s.gateFx, u };
  }

  /** Advance the active traversal; returns the leader's lift above the ground. */
  private stepTraversal(dt: number, time: number): number {
    const tr = this.traversal;
    const pos = this.player.position;
    if (!tr || !pos) return 0;
    tr.t += dt;
    const lead = this.crossingAt(tr, tr.t, tr.start, tr.to);
    pos.x = lead.x;
    pos.z = lead.z;
    setAnim(this.player, lead.airborne ? 'action' : 'walk');
    if (tr.permanent) this.gates.setClearProgress(tr.gate.id, lead.gateFx, this.motes);
    const groundHere = this.groundY(pos.x, pos.z);
    this.emitTraversalFx(tr, lead, groundHere, time);

    this.followers.forEach((f, i) => {
      const fp = f.position;
      const plan = tr.followers[i];
      if (!fp || !plan) return;
      const ft = Math.max(0, tr.t - FOLLOWER_DELAY * (i + 1));
      const s = this.crossingAt(tr, ft, plan.start, plan.land);
      const bx = fp.x;
      const bz = fp.z;
      fp.x = s.x;
      fp.z = s.z;
      fp.y = this.groundY(s.x, s.z) + s.lift;
      if (Math.hypot(fp.x - bx, fp.z - bz) > 1e-3) f.heading = headingFromVector(fp.x - bx, fp.z - bz);
      setAnim(f, s.airborne ? 'action' : ft > 0 && s.u < 1 ? 'walk' : 'idle');
    });

    const total = tr.approach + tr.duration + FOLLOWER_DELAY * this.followers.length;
    if (tr.t >= total) {
      this.traversal = null;
      this.gates.setRope(null);
      // Re-seed the trail so followers keep their landing spots until the leader walks on.
      const last = tr.followers[tr.followers.length - 1];
      this.trail.reset(last ? last.land.x : tr.to.x, last ? last.land.z : tr.to.z);
      for (let i = tr.followers.length - 2; i >= 0; i--) {
        const l = tr.followers[i];
        if (l) this.trail.push(l.land.x, l.land.z);
      }
      this.trail.push(tr.to.x, tr.to.z);
      this.presenceDirty = true;
      return 0;
    }
    tr.lastLift = lead.lift;
    return lead.lift;
  }

  private emitTraversalFx(tr: Traversal, s: { x: number; z: number; lift: number; airborne: boolean; u: number }, ground: number, time: number): void {
    const m = this.motes;
    const t = tr.t - tr.approach;
    if (t < 0) return;
    const pos = this.player.position;
    switch (tr.gate.kind) {
      case 'boulder':
        if (s.u < 0.8) m.emit(s.x, ground + 0.2, s.z, { color: [0.78, 0.7, 0.6], count: 1, speed: 1.2, up: 1, gravity: 3, life: 0.6, size: 0.35 });
        if (!tr.permanent && s.u > 0.25 && s.u < 0.3) m.emit(tr.gate.position.x, ground + 1, tr.gate.position.z, { color: [0.7, 0.65, 0.6], count: 12, speed: 4, up: 4, gravity: 9, life: 0.9, size: 0.4, jitter: 1 });
        break;
      case 'chasm':
        if (s.airborne) m.emit(s.x, ground + s.lift + 0.4, s.z, { color: [0.9, 0.96, 1], count: 1, speed: 0.6, up: 0.6, life: 0.8, size: 0.16, glow: true });
        break;
      case 'cliff':
        if (pos && s.u < 0.75) {
          this.ropeA.set(pos.x, pos.y + 1.2, pos.z);
          this.ropeB.set(tr.to.x, this.groundY(tr.to.x, tr.to.z) + 0.3, tr.to.z);
          this.gates.setRope(this.ropeA, this.ropeB);
        } else this.gates.setRope(null);
        break;
      case 'river':
        if (s.lift < 0.08 && s.u > 0.02 && s.u < 1 && tr.lastLift >= 0.08) {
          m.emit(s.x, Math.max(ground, WATER_LEVEL) + 0.1, s.z, { color: [0.88, 0.96, 1], count: 10, speed: 2, up: 2.2, gravity: 7, life: 0.6, size: 0.18 });
          emitRipple(s.x, s.z);
        }
        break;
      case 'grove':
        if (s.u < 0.5 && Math.floor(time * 20) % 2 === 0) m.emit(s.x, ground + 0.4, s.z, { color: [0.55, 0.85, 0.42], count: 1, speed: 1.6, up: 1.8, life: 1.2, size: 0.18, glow: true, jitter: 1.4 });
        break;
      case 'ward':
        if (s.u < 0.45) m.emit(tr.gate.position.x, ground + 2, tr.gate.position.z, { color: [0.7, 0.92, 1], count: 1, speed: 2, up: 0.5, life: 0.6, size: 0.16, glow: true, jitter: tr.gate.width * 0.4 });
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
      this.motes.emit(pos.x, pos.y + 0.3, pos.z, { color: [0.85, 0.78, 0.66], count: 14, speed: 2.5, up: 1.5, gravity: 4, life: 0.6, size: 0.35 });
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
          sprite: { sheet: db.species[a.speciesId]?.sprite ?? 'animal.deer', facing: 0, anim: 'idle', frameTime: Math.abs(a.home.x * 0.07) % 1 },
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
      // Height sampling is the costly part: only refresh animals near the camera.
      if (movedA > 0 && Math.hypot(ep.x - this.camTarget.x, ep.z - this.camTarget.z) < SPRITE_CULL) ep.y = this.groundY(ep.x, ep.z);
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
      const d = Math.hypot(e.position.x - x, e.position.z - z);
      if (d > TALK_REACH) continue;
      const npc = db.world.npcs.find((n) => n.id === npcId);
      consider(d, TALK_REACH, { kind: 'talk', npcId, label: `Talk to ${npc?.name ?? 'stranger'}` });
    }
    for (const spot of db.world.fishingSpots) {
      const e = this.spots.get(spot.id);
      if (!e || e.hidden) continue;
      consider(Math.hypot(spot.position.x - x, spot.position.z - z), FISH_REACH, { kind: 'fish', spotId: spot.id, label: `Fish · ${spot.name}` });
    }
    for (const [zoneId, e] of this.zones) {
      if (!e.position) continue;
      const zone = db.world.encounterZones.find((zz) => zz.id === zoneId);
      if (!zone) continue;
      const enc = db.encounters[zone.encounterId];
      consider(Math.hypot(e.position.x - x, e.position.z - z), zone.radius, { kind: 'encounter', zoneId, encounterId: zone.encounterId, label: `Fight · ${enc?.name ?? 'Foes'}` });
    }
    for (const plot of db.township.plots) {
      if (st.township.built[plot.id]) continue;
      consider(Math.hypot(plot.position.x - x, plot.position.z - z), PLOT_REACH, { kind: 'build', plotId: plot.id, label: `Build · ${plot.name}` });
    }
    for (const gate of this.presentGates) {
      const action = gateAction(gate.kind);
      const def = db.fieldActions[action];
      const reach = def?.range ?? 3;
      const d = gateDistance(gate, { x, z });
      if (d > reach || !whoCanClear(gate, st.leader, st.party, db.heroes)) continue;
      consider(d, reach, { kind: 'traverse', gateId: gate.id, action, label: `${def?.label ?? 'Cross'} · ${gate.label}` });
    }
    const chosen: ContextAction | null = best;
    if (contextKey(chosen) !== contextKey(st.contextAction)) st.setContextAction(chosen);
  }

  private applyCombatVisibility(): void {
    const anchor = this.combat.anchor;
    const staged = this.combat.isStaged;
    this.player.hidden = staged || this.travelFrame.hideLeader;
    for (const f of this.followers) f.hidden = staged || this.travelFrame.hideFollowers;
    const near = (e: EngineEntity): boolean => !!anchor && !!e.position && Math.hypot(e.position.x - anchor.x, e.position.z - anchor.z) < COMBAT_CLEAR_RADIUS;
    for (const e of this.zones.values()) e.hidden = staged && near(e);
    for (const e of this.animalEntities.values()) e.hidden = staged && near(e);
    for (const e of this.npcs.values()) if (!e.hiddenUntilDrakeSight) e.hidden = staged && near(e);
  }

  private updateCamera(dt: number, time: number, camera: THREE.PerspectiveCamera, inCombat: boolean): void {
    const pos = this.player.position;
    if (pos) {
      const k = dampFactor(7, dt);
      // Track the ground under the leader, not a crossing arc or a mount's altitude (the framing adds lookHeight).
      const y = pos.y - (this.player.shadowDrop ?? 0);
      this.camTarget.x += (pos.x - this.camTarget.x) * k;
      this.camTarget.y += (y - this.camTarget.y) * dampFactor(3, dt);
      this.camTarget.z += (pos.z - this.camTarget.z) * k;
    }
    this.combatBlend = stepBlend(this.combatBlend, inCombat ? 1 : 0, dt);
    const eased = easeInOut(this.combatBlend);
    const over = cameraPose(this.camTarget, this.travel.framing());
    let pose = over;
    if (eased > 0) {
      const frame = this.combat.frame;
      const a = frame ?? this.combat.anchor ?? { x: this.camTarget.x, z: this.camTarget.z };
      const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.max(0.5, camera.aspect));
      const distance = frame ? fitDistance(frame.width, hfov, COMBAT_FRAMING.distance) : COMBAT_FRAMING.distance;
      const battle = cameraPose({ x: a.x, y: this.groundY(a.x, a.z), z: a.z }, { ...COMBAT_FRAMING, distance });
      pose = blendPose(over, battle, eased);
      const shake = shakeOffset(time, this.combat.hitStop.shake(time) * eased);
      pose = { pos: { x: pose.pos.x + shake.x, y: pose.pos.y + shake.y, z: pose.pos.z }, look: { x: pose.look.x + shake.x, y: pose.look.y + shake.y, z: pose.look.z } };
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
    const cx = this.camTarget.x;
    const cz = this.camTarget.z;
    for (const e of this.spriteQuery) {
      if (!e.frozen) e.sprite.frameTime += dt;
      if (e.hidden || (e.opacity ?? 1) <= 0.01) continue;
      if (!e.combatActor && Math.abs(e.position.x - cx) + Math.abs(e.position.z - cz) > SPRITE_CULL * 1.4) continue;
      e.sprite.facing = facingFromHeading(e.heading ?? FACE_CAMERA, yaw);
      const s = shadowSize(e);
      this.shadows.add(e.position.x, e.position.y - (e.shadowDrop ?? 0), e.position.z, s.w, s.d);
      if (e.aura) this.auras.add(e);
      if (!e.combatActor) this.sprites.add(e);
    }
    this.sprites.end();
    this.shadows.end();
    this.auras.end();

    this.fx.beginSpots();
    for (const e of this.spots.values()) {
      if (e.hidden || !e.position) continue;
      if (Math.abs(e.position.x - cx) + Math.abs(e.position.z - cz) > SPRITE_CULL * 1.4) continue;
      this.fx.addSpot(e.position.x, e.position.z, time, !!e.hiddenUntilDrakeSight);
    }
    this.fx.endSpots();
  }

  dispose(): void {
    this.unsubscribe();
    this.combat.dispose();
    this.terrain.dispose();
    this.staticProps.dispose();
    this.dressing.dispose();
    this.sails.dispose();
    this.dynamic.dispose();
    this.gates.dispose();
    this.mats.dispose();
    this.motes.dispose();
    this.arrow.dispose();
    this.sprites.dispose();
    this.shadows.dispose();
    this.auras.dispose();
    this.fx.dispose();
    this.hazards.dispose();
    this.travel.dispose();
    this.assets.dispose();
    for (const e of [...this.ecs.entities]) this.ecs.remove(e);
  }
}
