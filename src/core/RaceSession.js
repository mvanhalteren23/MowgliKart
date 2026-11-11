import * as THREE from 'three';
import { TrackSpline, toBufferGeometry, mulberry32 } from '../track/TrackSpline.js';
import { TRACKS } from '../registries/TrackRegistry.js';
import { KARTS } from '../registries/KartRegistry.js';
import { CHARACTERS } from '../registries/CharacterRegistry.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { KartController } from '../controllers/KartController.js';
import { KartVisual } from '../controllers/KartVisual.js';
import { AIController } from '../controllers/AIController.js';
import { ItemManager } from '../items/ItemManager.js';
import { ObstacleManager } from '../track/ObstacleManager.js';
import { YetiManager } from '../track/YetiManager.js';
import { buildGondola } from '../track/Gondola.js';
import { StartSequence, COUNTDOWN } from './StartSequence.js';
import { ParticleSystem } from './FX.js';
import { DRIFT_TIERS } from '../controllers/KartController.js';
import { buildScenery, buildRoadside, buildMountains, buildRampOverlays, terrainMaterial, powderMaterial, wind, sceneryCfg } from '../track/Scenery.js';
import { makeSky, Snowfall } from './Atmosphere.js';
import { applyToon, toonCfg } from './Toon.js';
import { chunkStatic, mergeSmallStatic, detail } from './Lod.js';
import { TextureFactory } from './TextureFactory.js';

const V = THREE.Vector3;
const hasDOM = typeof document !== 'undefined';

function canvasTex(w, h, draw, repeat = null) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/**
 * One downhill race: scene, track + physics, karts (human + AI), items, obstacles, push-start, ranking.
 * Fully headless-capable (the Node simulation in scripts/sim.mjs runs the same class).
 */
export class RaceSession {
  /**
   * @param racers [{ id, name, isHuman, humanIndex, kartId, charId, persona, build, weapon, shield, skill }]
   *               in grid order (pole first)
   */
  constructor({ physics, assets, trackId, racers, seed = 1, input = null, laps = 1, cup = { race: 1, of: 4 }, autoShield = false, quality = 'high', net = null }) {
    this.quality = quality; this.lite = quality === 'low' || quality === 'vr'; // 'vr' = standalone-headset budget (Pico G2 4K)
    this.net = net; this.netClient = !!net && !net.isHost; this.netHold = !!net;
    this.physics = physics; this.assets = assets; this.input = input;
    this.def = TRACKS[trackId];
    this.track = new TrackSpline(this.def);
    this.rng = mulberry32(seed * 2654435761); this.kartRng = mulberry32(seed * 40503 + 7);
    this.cup = cup;
    this.autoShield = autoShield;
    this.scene = new THREE.Scene();
    this.fx = new ParticleSystem(this.scene, quality === 'vr' ? 900 : 2500);
    this.fxSoft = new ParticleSystem(this.scene, quality === 'vr' ? 700 : 3500, 0.9, true); // soft snow spray (normal-blended, alpha fade)
    this.fx.soft = this.fxSoft;
    this.fx.dust = '#f4f9ff';
    this.time = 0; this.raceTime = 0;
    toonCfg.outlines = quality !== 'vr'; toonCfg.coarse = quality === 'vr'; detail.set(quality === 'vr');
    this.viewPos = new V(); this.lod = [];
    this.state = 'COUNTDOWN';
    this.messages = []; this.sfxQueue = [];
    this.audio = null;
    this.done = false; this.results = null; this.endTimer = null;
    this.humanLeaderD = 0;
    this._buildTrack();
    const trackRoots = this.scene.children.filter((o) => o.isMesh && o !== this.sky);
    this.items = new ItemManager(this);
    this.obstacles = new ObstacleManager(this);
    this.yeti = this.track.open ? new YetiManager(this) : null;
    this.items.buildBoxes();
    this.obstacles.spawn(this.def);
    this.karts = []; this.visuals = []; this.ais = new Map(); this.starts = new Map();
    racers.forEach((r, i) => this._addKart(r, i));
    this.humans = this.karts.filter((k) => k.isHuman).sort((a, b) => a.index - b.index); // viewport order = player order (local players only)
    this.allHumans = this.karts.filter((k) => k.isHuman || k.remoteHuman); // + network players (for the end-of-race rule)
    const nBefore = this.scene.children.length;
    sceneryCfg.merge = quality === 'vr';
    buildScenery(this); buildRoadside(this);
    if (quality === 'vr') { // headset: merge small props per material, then chunk everything for frustum + distance culling
      const scenery = this.scene.children.slice(nBefore), loose = this.scene.children.filter((o) => o.isMesh && !trackRoots.includes(o) && !o.userData.decal && o !== this.sky);
      mergeSmallStatic([...trackRoots, ...loose, ...scenery]);
      const roots = this.scene.children.filter((o) => (o.isMesh && o !== this.sky && !o.userData.decal) || scenery.includes(o));
      this.lod = chunkStatic(roots, 260);
    }
    this._buildJudges();
    assets.loadSkybox?.(trackId).then((tex) => { if (tex) { this.scene.background = tex; this.sky.visible = false; this.mountains.visible = false; } }); // a supplied 360 image wins over the baked one
    physics.addTrees([ // trunk + low boughs, merged into one static mesh collider
      ...(this.trees ?? []).map((t) => ({ x: t.p.x, y: t.p.y, z: t.p.z, r: 1.25 * t.scale, halfH: 3.5 })),
      ...(this.forestTrees ?? []).map((t) => ({ x: t.p.x, y: t.p.y, z: t.p.z, r: 0.9 * t.scale, halfH: 3.5 })),
    ]);
    applyToon(this.scene);
    this.markShadows();
    this.rank();
  }

  /** Everything solid casts and receives real-time shadows (sky, mountains, particles and outline hulls excluded). */
  markShadows() {
    const skip = new Set();
    for (const g of [this.mountains, this.sky]) g?.traverse((o) => skip.add(o));
    this.scene.traverse((o) => {
      if (!o.isMesh || skip.has(o) || o.userData.outline || o.userData.noShadow) return;
      const m = o.material;
      if (m?.transparent || m?.isMeshBasicMaterial || m?.isShaderMaterial) return;
      o.castShadow = o.receiveShadow = true;
    });
  }

  rand() { return this.rng(); }
  sfx(name, kart) { this.audio?.play(name, kart); }
  say(kart, text, color = '#fff', big = false) { if (kart?.isHuman) this.messages.push({ human: kart.index, text, color, big, t: this.time }); }

  /* ------------------------------------------------------------------ build */
  _buildTrack() {
    const { track, def, scene, physics } = this;
    const th = def.theme;
    const m = track.buildMeshes();
    this.meshes = m;
    physics.addTrimesh(m.physics.positions, m.physics.indices, 'road');
    // road
    const roadTex = TextureFactory.road(th);
    const road = new THREE.Mesh(toBufferGeometry(m.road), new THREE.MeshToonMaterial({ color: roadTex ? 0xffffff : th.road, map: roadTex, side: THREE.DoubleSide }));
    scene.add(road);
    const curbMat = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(toBufferGeometry(m.curbL), curbMat), new THREE.Mesh(toBufferGeometry(m.curbR), curbMat));
    scene.add(new THREE.Mesh(toBufferGeometry(m.terrain), terrainMaterial(th)));
    if (m.powder) { // open slope: powder fields (slow) either side of the groomed groove
      const pm = powderMaterial(th);
      for (const p of m.powder) scene.add(new THREE.Mesh(toBufferGeometry(p), pm));
      physics.addTrimesh(m.physicsPowder.positions, m.physicsPowder.indices, 'powder');
    }
    // shortcut decks
    const deckTex = TextureFactory.planks(th.deck, 4);
    const deckMat = new THREE.MeshToonMaterial({ color: deckTex ? 0xffffff : th.deck, map: deckTex, side: THREE.DoubleSide });
    // ramps & shortcut kickers: wood planks with painted, glowing neon chevron boost arrows (emissive mask also feeds the bloom pass)
    const boostTex = TextureFactory.boostRamp(th.deck), neon = TextureFactory.neonMask();
    const rampMat = new THREE.MeshToonMaterial({ color: boostTex ? 0xffffff : th.deck, map: boostTex, emissiveMap: neon, emissive: neon ? 0xffffff : 0x000000, emissiveIntensity: 1.6, side: THREE.DoubleSide });
    for (const sc of track.shortcuts) {
      const sm = sc.buildMesh();
      physics.addTrimesh(sm.physics.positions, sm.physics.indices, 'deck');
      scene.add(new THREE.Mesh(toBufferGeometry(sm.deck), deckMat));
      for (const e of sm.extras) scene.add(new THREE.Mesh(toBufferGeometry(e), new THREE.MeshToonMaterial({ color: 0x5a3a1a, side: THREE.DoubleSide })));
      scene.add(new THREE.Mesh(toBufferGeometry(sm.kicker), rampMat));
      // signpost at the entry so players can read the shortcut
      const fr = track.atDist(sc.dEntry - 12);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), new THREE.MeshToonMaterial({ color: 0x6b4a2a }));
      post.position.copy(fr.P).addScaledVector(fr.B, sc.lat + Math.sign(sc.lat) * 3.4).add(new V(0, 1.8, 0));
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.2), new THREE.MeshToonMaterial({ color: 0xffd400 }));
      sign.position.copy(post.position).add(new V(0, 1.6, 0)); sign.quaternion.setFromUnitVectors(new V(0, 0, 1), fr.B.clone().negate().setY(0).normalize());
      scene.add(post, sign);
    }
    // wooden kicker overlays + trick-zone chevrons
    buildRampOverlays(this, m.frames, rampMat);
    for (const r of track.jumpRamps.filter((x) => x.pathId === 'main')) {
      const fr = track.atDist(r.zoneD - 9);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(track.width * 0.6, 1.4), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false }));
      pad.position.copy(fr.P).addScaledVector(fr.N, 0.1);
      pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.B, fr.T.clone().negate(), fr.N));
      scene.add(pad);
    }
    // lights, sky, fog, weather
    scene.add(new THREE.HemisphereLight(th.sky[0], th.ground, 1.35));
    this.sunDir = new V(300, 600, 200).normalize();
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.8); sun.position.copy(this.sunDir).multiplyScalar(250);
    sun.castShadow = !this.lite;
    const sm = this.quality === 'ultra' ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 600 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.45;
    scene.add(sun, sun.target); this.sun = sun;
    scene.fog = this.quality === 'vr' ? new THREE.Fog(th.fog, 110, 460) : new THREE.Fog(th.fog, 320, 1500);
    this.mountains = buildMountains(th); this.mountains.userData.noShadow = true; scene.add(this.mountains);
    scene.background = new THREE.Color(th.sky[1]);
    this.sky = makeSky(th, this.sunDir);
    scene.add(this.sky);
    this.snow = th.weather === 'snow' ? new Snowfall(scene, this.quality === 'vr' ? 700 : 2600) : null;
    this.gondola = th.weather === 'snow' && !this.lite ? buildGondola(this) : null;
    this.fx.dust = th.weather === 'snow' ? '#f4f9ff' : '#d8c6a0';
    // start line + finish arch
    const sf = track.atDist(58);
    const startTex = TextureFactory.checker(Math.round(track.width / 0.8), 2);
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, map: startTex }));
    startLine.position.copy(sf.P).addScaledVector(sf.N, 0.06);
    startLine.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sf.B, sf.T.clone().negate(), sf.N));
    scene.add(startLine);
    const ff = track.atDist(track.finishD);
    const banner = TextureFactory.checker(16, 4, true);
    const arch = new THREE.Group();
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 8), new THREE.MeshToonMaterial({ color: 0xdd2222 }));
      p.position.copy(ff.P).addScaledVector(ff.B, side * (track.width / 2 + 0.6)).add(new V(0, 4, 0)); arch.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(track.width + 1.6, 2.2, 0.4), new THREE.MeshToonMaterial({ color: banner ? 0xffffff : 0x222222, map: banner }));
    bar.position.copy(ff.P).add(new V(0, 8, 0)); bar.quaternion.setFromUnitVectors(new V(0, 0, 1), ff.T.clone().negate().setY(0).normalize());
    bar.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ff.B, new V(0, 1, 0), ff.T.clone().negate()));
    arch.add(bar); scene.add(arch);
  }

  _buildJudges() {
    const { track, scene } = this;
    this.judges = [];
    const fr = track.atDist(42);
    const base = fr.P.clone().addScaledVector(fr.B, track.grooveHalf + 4.5);
    const table = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.9, 1.4), new THREE.MeshToonMaterial({ color: 0x7a1f1f }));
    table.position.copy(base).add(new V(0, 0.45, 0)); table.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.B, new V(0, 1, 0), fr.T.clone().negate()));
    scene.add(table);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const col = [0xffc107, 0x9c27b0, 0x03a9f4][i];
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 4, 8), new THREE.MeshToonMaterial({ color: col }));
      body.position.y = 1.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshToonMaterial({ color: 0xffd9a0 }));
      head.position.y = 2.35;
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.1), new THREE.MeshToonMaterial({ color: 0x111111 }));
      shades.position.set(0, 2.4, -0.3);
      g.add(body, head, shades);
      const card = this._scoreCard('?');
      card.mesh.position.set(0, 1.3, -0.9); g.add(card.mesh);
      g.position.copy(base).addScaledVector(fr.B, (i - 1) * 2.4).add(new V(0, 0.9, 0));
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.B, new V(0, 1, 0), fr.T.clone().negate()));
      g.rotateY(Math.PI / 2 * 0 - 0.35 * (fr.B.x > 0 ? 1 : 1)); // slight turn toward the ramp
      scene.add(g);
      this.judges.push({ g, card });
    }
  }
  _scoreCard(text) {
    const cvs = hasDOM ? document.createElement('canvas') : null;
    let tex = null;
    if (cvs) { cvs.width = cvs.height = 128; tex = new THREE.CanvasTexture(cvs); }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: tex ? 0xffffff : 0xffffff, map: tex, side: THREE.DoubleSide }));
    const draw = (t, color = '#222') => {
      if (!cvs) return;
      const g = cvs.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
      g.fillStyle = color; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, 64, 68); tex.needsUpdate = true;
    };
    draw(text);
    return { mesh, draw };
  }

  _addKart(r, i) {
    const def = KARTS[r.kartId], ch = CHARACTERS[r.charId];
    const spawn = this.track.gridSlot(i);
    const snowy = this.def.theme.weather === 'snow';
    const kart = new KartController({ id: r.id, name: r.name, physics: this.physics, def, character: ch, isHuman: r.isHuman, spawn, index: r.humanIndex ?? i, build: r.build });
    kart.hold = true; kart.trailsOn = snowy && !this.lite; kart.lodProxy = this.quality === 'vr';
    kart.ownerId = r.owner ?? null;
    if (r.puppet) { kart.puppet = true; kart.remoteHuman = !!r.remoteHuman; kart.body.setGravityScale(0, true); }
    kart.lastSafeD = spawn.d;
    this.items.initLoadout(kart, { weapon: r.weapon, shield: r.shield });
    kart.persona = r.persona;
    this.karts.push(kart);
    this.visuals.push(new KartVisual(this.scene, kart, this.assets));
    kart.statIds = r.stats ?? [];
    if (r.puppet) this.starts.set(kart.id, StartSequence.ai(this.kartRng));
    else if (!r.isHuman || r.autopilot) {
      this.ais.set(kart.id, new AIController(kart, this, { skill: r.skill ?? (0.97 + this.kartRng() * 0.04), rnd: this.kartRng }));
      this.starts.set(kart.id, StartSequence.ai(this.kartRng));
    } else this.starts.set(kart.id, new StartSequence(true));
  }

  /* ------------------------------------------------------------------ simulation */
  rank() {
    const ks = [...this.karts].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.maxD - a.maxD);
    ks.forEach((k, i) => { k.rank = i + 1; });
    this.humanLeaderD = this.humans.length ? Math.max(...this.humans.map((k) => k.d)) : 0;
  }

  /** Camera subject for spectators / finished players: the best-placed kart still racing (sticky for 3 s). */
  spectateKart() {
    const live = this.karts.filter((k) => !k.finished).sort((a, b) => a.rank - b.rank);
    const want = live[0] ?? this.karts.find((k) => k.rank === 1) ?? this.karts[0];
    if (!this._spec || this._spec.finished || (this._spec !== want && this.time - (this._specT ?? 0) > 3)) { this._spec = want; this._specT = this.time; }
    return this._spec;
  }

  /** A network player left mid-race: hand their kart to the AI so the race can finish. */
  takeOver(kart) {
    if (!kart.puppet) return;
    kart.puppet = false; kart.remoteHuman = false; kart.hold = false; kart.body.setGravityScale(1, true);
    this.allHumans = this.allHumans.filter((k) => k !== kart);
    this.ais.set(kart.id, new AIController(kart, this, { skill: 0.98, rnd: this.kartRng }));
  }

  step(dt) {
    if (this.netHold) { this.net?.raceHook?.step(dt); return; } // multiplayer: everyone waits on the grid for the host's "go"
    this.time += dt;
    const ctx = { time: this.time, track: this.track, karts: this.karts, items: this.items };
    if (this.state === 'COUNTDOWN') this._stepCountdown(dt);
    else this.raceTime += dt;
    if (this.state === 'RACING' || this.state === 'COUNTDOWN') {
      for (const k of this.karts) {
        const ai = this.ais.get(k.id);
        if (ai) ai.update(dt, ctx);
        else if (k.isHuman && this.input) {
          if (k.finished) { Object.assign(k.input, { steer: 0, throttle: 0, brake: 1, hop: false, hopPressed: false, itemPressed: false, weaponPressed: false, shieldPressed: false }); this.input.read(k.index); }
          else this.input.read(k.index, k.input);
          // optional Auto-Shield assist for humans (reactive counter-measure when holding a charged shield cell)
          if (this.autoShield && k.loadout.shield && k.loadout.shieldCd <= 0 && k.loadout.shieldActive <= 0 && this.items.threatTo(k, 14)) k.input.shieldPressed = true;
        }
      }
    }
    if (this.input) this.input.autoGas = this.state === 'RACING';
    this.rank();
    this.net?.raceHook?.step(dt);
    for (const k of this.karts) k.update(dt, ctx);
    this.items.update(dt);
    this.obstacles.update(dt, this.time);
    this.yeti?.update(dt);
    this.physics.step((a, b, started) => this._sensor(a, b, started));
    this._events();
    this._checkEnd(dt);
  }

  _stepCountdown(dt) {
    let released = false;
    for (const k of this.karts) {
      const seq = this.starts.get(k.id);
      if (k.isHuman && !this.ais.has(k.id)) {
        if (k.input.hopPressed) seq.press();
        seq.update(dt, k.input.throttle > 0.3);
      } else seq.update(dt, seq.t >= seq.aiThrottleAt);
      if (seq.t >= COUNTDOWN && !seq.applied) released = true;
    }
    if (released) {
      this.state = 'RACING'; this.raceTime = 0;
      this.sfx('airhorn');
      this.judges.forEach((j, i) => {
        const humanSeq = this.humans[0] ? this.starts.get(this.humans[0].id) : [...this.starts.values()][0];
        const s = Math.max(6, Math.min(10, humanSeq.score + (i - 1) * 0.5 * (i % 2 ? 1 : -1)));
        j.card.draw(s.toFixed(1), s >= 9 ? '#c62828' : '#222');
      });
      for (const k of this.karts) {
        const seq = this.starts.get(k.id); seq.applied = true;
        k.hold = false;
        const r = seq.result;
        k.startResult = r;
        if (r.kind === 'perfect' || r.kind === 'clean') { k.addBoost(r.mult, r.dur, 'launch'); this.say(k, `${r.label}  (${r.score.toFixed(1)})`, r.color, true); this.fx.burst(k.pos, 30, 8, r.kind === 'perfect' ? '#ffd700' : '#8be9fd', 1.0, 2); }
        else if (r.kind === 'stall') { k.t.stall = r.dur; this.say(k, `${r.label} sputtering stall!`, r.color, true); this.fx.burst(k.pos, 25, 4, '#777777', 1.4, -1); }
        else this.say(k, `Score ${r.score.toFixed(1)}`, '#fff', true);
      }
    }
  }

  _sensor(a, b, started) {
    const kartO = a.kind === 'kart' ? a : b.kind === 'kart' ? b : null;
    if (!kartO) return;
    const other = kartO === a ? b : a;
    if (other.kind === 'obstacle') this.obstacles.onContact(other.ref, kartO.ref, started);
    else if (other.kind === 'hazard') this.items.onHazardContact(other.ref, kartO.ref, started);
  }

  _events() {
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i], vis = this.visuals[i];
      for (const e of k.events) {
        if (k.isHuman && this.haptic) this.haptic(k.index, e.type);
        if (!k.puppet) this.net?.raceHook?.onKartEvent(k, e);
        switch (e.type) {
          case 'impact': case 'shed':
            if (vis.damage.detachNextPart(k.vel)) { this.sfx('crash', k); this.fx.burst(k.pos, 10, 6, '#ffcc66', 0.5, 8); }
            break;
          case 'snap': if (vis.damage.repairAll()) { this.sfx('tape', k); this.say(k, 'DUCT-TAPE SNAP!', '#cfd8dc'); } break;
          case 'trick': this.say(k, 'TRICK!', '#ffe14a'); break;
          case 'trickLanded': this.say(k, 'TRICK BOOST!', '#ffe14a'); this.sfx('boost', k); break;
          case 'driftTier': this.sfx('spark', k); break;
          case 'miniTurbo': this.say(k, `MINI-TURBO ${'★'.repeat(e.data.tier)}`, DRIFT_TIERS[e.data.tier - 1].color); this.sfx('boost', k); break;
          case 'slingshot': this.say(k, 'SLIPSTREAM SLINGSHOT!', '#9be7ff'); this.sfx('whoosh', k); break;
          case 'pickup': this.say(k, 'Item!', '#66ddff'); this.sfx('pickup', k); break;
          case 'hitConfirm': this.say(k, 'HIT! +18% adrenaline', '#ff9a3c'); break;
          case 'blocked': this.say(k, 'BLOCKED!', '#8be9fd'); break;
          case 'ricochet': this.say(k, 'RICOCHET!', '#ff6ad5'); break;
          case 'shield': this.say(k, 'SHIELD UP', '#8be9fd'); break;
          case 'mud': this.say(k, 'Fell off the shortcut! Mud drag', '#a1887f'); break;
          case 'respawn': this.say(k, 'Back on track', '#fff'); break;
          case 'oob': this.say(k, 'OUT OF BOUNDS! A YETI IS COMING - get back on the slope!', '#ff5a5a', true); break;
          case 'oobClear': this.say(k, 'Phew - the yeti lost you', '#9be7ff'); break;
          case 'grabbed': this.say(k, 'CAUGHT BY THE YETI!', '#ff5a5a', true); break;
          case 'yetiSlam': this.say(k, 'YETI SLAM! Obstacle penalty', '#ffb03a', true); this.sfx('bonk', k); break;
          case 'hit': if (e.data?.kind === 'knockup') this.say(k, 'FEATHERS!', '#fff6d8'); else if (e.data?.kind === 'oil') this.say(k, 'SLIPPERY!', '#ffd77a'); break;
          case 'finish': this.say(k, `FINISHED ${k.rank}${['st', 'nd', 'rd'][k.rank - 1] ?? 'th'}!`, '#ffd700', true); this.sfx('cheer', k); break;
          default: break;
        }
      }
      k.events.length = 0;
    }
  }

  _checkEnd(dt) {
    if (this.done || this.netClient) return; // network clients wait for the host's official results
    const humansDone = this.allHumans.length > 0 && this.allHumans.every((k) => k.finished);
    const allDone = this.karts.every((k) => k.finished);
    if (humansDone && this.endTimer === null) this.endTimer = 7;
    if (this.endTimer !== null) this.endTimer -= dt;
    if (allDone || (this.endTimer !== null && this.endTimer <= 0) || this.raceTime > 420) {
      this.done = true;
      const order = [...this.karts].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.maxD - a.maxD);
      this.results = order.map((k) => k.id);
      this.state = 'DONE';
    }
  }

  /** Per-frame visual update (interpolated). */
  updateVisuals(dt, alpha) {
    this.visuals.forEach((v) => v.update(dt, alpha, this.fx, this.time));
    this.fx.update(dt);
    // keep the sky centred on the first human
    const f = this.humans[0] ?? this.karts[0];
    wind.value = this.time;
    this.sky.material.uniforms.time.value = this.time;
    this.fxSoft.update(dt);
    this.gondola?.update(this.time);
    if (f) {
      this.sky.position.copy(f.pos); this.mountains.position.set(f.pos.x, f.pos.y, f.pos.z);
      this.snow?.update(dt, f.pos);
      this.sun.target.position.copy(f.pos); this.sun.position.copy(f.pos).addScaledVector(this.sunDir, 250); this.sun.target.updateMatrixWorld();
    }
    if ((this._tc = (this._tc ?? 0) + 1) % 25 === 1) applyToon(this.scene);
    if (this.quality === 'vr' && this._tc % 6 === 2) { // headset tier: nothing is drawn beyond the fog
      const vp = this.viewPos.lengthSq() ? this.viewPos : f?.pos ?? this.viewPos, far = 470; // = fog end: beyond it only the baked skybox shows
      for (const c of this.lod) c.obj.visible = c.center.distanceTo(vp) < far + c.radius;
      for (const o of this.obstacles.list) if (o.away <= 0) o.mesh.visible = o.pos.distanceToSquared(vp) < 260 * 260;
      for (const b of this.items.boxes) if (b.active) b.mesh.visible = b.pos.distanceToSquared(vp) < 220 * 220;
      for (const v of this.visuals) v.setFar(v.root.position.distanceToSquared(vp) > 32 * 32);
    }
  }

  dispose() {
    this.items.dispose(); this.obstacles.dispose(); this.yeti?.dispose();
    this.visuals.forEach((v) => v.dispose());
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    });
    this.skybox?.dispose();
    this.physics.dispose();
  }
}
const TRICK_VIS = 4.5;
