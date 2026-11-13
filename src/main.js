import * as THREE from 'three';
import { initRapier, PhysicsWorld } from './physics/PhysicsWorld.js';
import { AssetManager } from './core/AssetManager.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';
import { GameLoop } from './core/GameLoop.js';
import { SplitScreenRenderer } from './core/SplitScreenRenderer.js';
import { CircuitManager } from './core/CircuitManager.js';
import { RaceSession } from './core/RaceSession.js';
import { UI } from './core/UI.js';
import { DraftScene } from './core/DraftScene.js';
import { PLAYABLE_KARTS } from './registries/KartRegistry.js';
import { CHARACTER_IDS, CHARACTERS } from './registries/CharacterRegistry.js';
import { PERSONAS } from './registries/CircuitDraftRegistry.js';
import { mulberry32 } from './track/TrackSpline.js';
import { TRACK_ORDER } from './registries/TrackRegistry.js';
import { VRManager } from './vr/VRManager.js';
import { VRHud } from './vr/VRHud.js';
import { VRPanel, VRRoom } from './vr/VRPanel.js';
import { Net, newCode } from './net/Net.js';
import { NetRace } from './net/NetRace.js';
import { bakeSkybox } from './core/SkyBake.js';

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // attract / test mode: human karts drive themselves and drafts auto-pick

const canvas = document.getElementById('game');
const renderer = new SplitScreenRenderer(canvas, document.getElementById('hud'));
const input = new InputManager();
const audio = new AudioManager();
const assets = new AssetManager();
const gl = renderer.renderer;
const vr = new VRManager(gl);
input.vr = vr; renderer.vr = vr; renderer.vrHud = new VRHud();
const ui = new UI(document.getElementById('ui'), input, vr);
const room = new VRRoom(new VRPanel(document.getElementById('ui')));
const TRANSPORT = params.get('transport') ?? 'peer';
renderer.resize();

// One frame driver for everything (required for WebXR: inside a headset session only the XR frame loop runs).
// A race installs its GameLoop here; otherwise the idle frame draws the VR menu room or the 2D draft backdrop.
const driver = { fn: null, set(fn) { this.fn = fn; } };
let idleLast = performance.now(), backdrop = null;
gl.setAnimationLoop((now) => {
  if (driver.fn) { driver.fn(now); idleLast = now; return; }
  const dt = Math.max(0, Math.min(0.1, (now - idleLast) / 1000)); idleLast = now;
  if (vr.active) room.render(vr, dt); else backdrop?.(dt);
});

// 🥽 button: enter / leave the headset session at any time (lobby, draft or mid-race)
const vrBtn = document.getElementById('vrbtn');
const vrLabel = () => { vrBtn.textContent = vr.active ? '✕ Exit VR' : vr.supported || navigator.xr ? '🥽 Enter VR' : '📱 Stereo view'; };
vr.ready.then(() => { vrBtn.classList.toggle('hidden', !(vr.supported || !!navigator.xr || params.has('vr') || matchMedia('(pointer: coarse)').matches)); vrLabel(); }); // some headset browsers report "not supported" until asked: always offer the button when WebXR exists
vr.onChange(vrLabel);
vrBtn.onclick = () => { (vr.active ? vr.exit() : vr.enter(vr.supported || navigator.xr ? 'xr' : 'sim')).catch((e) => input.flash('VR unavailable: ' + (e.message ?? e))); };
if (params.get('vr') === 'sim') vr.enter('sim');
const pauseEl = document.getElementById('pause');
const game = window.__game = { renderer, audio, vr, room, session: null, circuit: null, errors: [] };
addEventListener('error', (e) => game.errors.push(String(e.message)));
const goFullscreen = () => { try { if (document.fullscreenElement == null) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* optional */ } };
if (matchMedia('(pointer: coarse)').matches) addEventListener('pointerdown', goFullscreen, { once: true });
let audioLoaded = false;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { audio.ensure(); if (!audioLoaded && audio.ctx) { audioLoaded = true; audio.loadFiles(assets); } }, { once: false });

/** Run one race until it finishes. Resolves with the finishing order (racer ids). */
function playRace(session, humans) {
  return new Promise((resolve) => {
    renderer.setPlayers(Math.max(1, humans));
    room.panel.mesh.removeFromParent();
    // skybox trick (headset + low tiers): bake the whole distant landscape into one 360 picture instead of drawing it every frame
    if (session.lite && !params.has('nosky')) { try { bakeSkybox(gl, session, session.quality === 'vr' ? 1024 : 2048); } catch (e) { console.warn('skybox bake failed, using the live sky', e); } }
    document.body.classList.add('racing'); input.showTouch(true);
    session.audio = audio;
    const HAPTIC = { hit: [0.9, 0.6, 220], impact: [0.8, 0.5, 160], miniTurbo: [0.35, 0.8, 220], boost: [0.2, 0.4, 140], slingshot: [0.3, 0.6, 260], trickLanded: [0.5, 0.5, 180], grabbed: [1, 1, 500], yetiSlam: [1, 0.8, 420], oob: [0.3, 0.9, 320], blocked: [0.3, 0.3, 90], pickup: [0.1, 0.3, 80], bump: [0.5, 0.4, 90], lasso: [0.4, 0.7, 160], lassoed: [0.8, 0.6, 260], righted: [0.4, 0.4, 120] };
    session.haptic = (i, type) => { const h = HAPTIC[type]; if (h) input.rumble(i, ...h); };
    audio.setFocus(session.humans[0] ?? null);
    let finishedAt = null;
    const loop = new GameLoop({
      driver,
      poll: () => { input.poll(); if (vr.active) { vr.poll(); vr.takeSelect(); vr.laser.visible = false; session.autoShield = true; } if (input.menuEdges.some((e) => e.name === 'r3')) renderer.toggleCockpit(0); },
      step: (dt) => session.step(dt),
      render: (alpha, dt) => {
        session.updateVisuals(dt || 1 / 60, alpha);
        renderer.render(session, dt || 1 / 60);
        audio.updateEngine(session.humans[0], session.state === 'RACING');
        if (session.done) {
          input.showTouch(false); document.body.classList.remove('racing');
          finishedAt ??= performance.now();
          if (performance.now() - finishedAt > (AUTO ? 300 : 1800)) { loop.stop(); audio.updateEngine(null, false); resolve(session.results); }
        }
      },
    });
    input.camToggle = () => renderer.toggleCockpit(0);
    const offKey = input.onKey((c) => {
      if (c === 'KeyV') renderer.toggleCockpit(0);
      if (c === 'KeyP') { loop.paused = !loop.paused; pauseEl.classList.toggle('hidden', !loop.paused); }
      if (c === 'KeyM') audio.toggleMute();
    });
    game.loop = loop;
    loop.start();
    session.__off = offKey;
  });
}

const plain = (r) => JSON.parse(JSON.stringify(r));
/** Racer list as one device sees it: karts it owns stay live, everyone else's become network puppets. */
const localView = (grid, me) => grid.map((r) => (r.owner === me ? { ...r, remote: false, humanIndex: r.isHuman ? (r.humanIndex ?? 0) : undefined, autopilot: r.isHuman && AUTO }
  : { ...r, isHuman: false, humanIndex: undefined, puppet: true, remoteHuman: !!r.isHuman }));

async function runCup(cfg, net = null, remotes = []) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const taken = new Set(cfg.kids);
  const freeKids = CHARACTER_IDS.filter((c) => !taken.has(c));
  const personas = Object.keys(PERSONAS);
  const racers = [];
  for (let i = 0; i < cfg.players; i++) racers.push({ id: i, owner: 'host', name: `P${i + 1} ${CHARACTERS[cfg.kids[i]].name.split(' ')[0]}`, isHuman: true, humanIndex: i, kartId: cfg.karts[i], charId: cfg.kids[i], autopilot: AUTO });
  for (const rm of remotes.slice(0, 8 - cfg.players)) { const id = racers.length; racers.push({ id, owner: rm.peer, remote: true, name: `P${id + 1} ${CHARACTERS[rm.kid].name.split(' ')[0]}`, isHuman: true, kartId: rm.kart, charId: rm.kid }); taken.add(rm.kid); }
  const nh = racers.length;
  for (let j = 0; nh + j < 8; j++) {
    const id = nh + j;
    const ch = freeKids[j % freeKids.length];
    racers.push({ id, owner: 'host', name: CHARACTERS[ch].name.split(' ')[0], isHuman: false, persona: personas[j % personas.length], kartId: PLAYABLE_KARTS[(j + 1) % PLAYABLE_KARTS.length].id, charId: ch });
  }
  const circuit = game.circuit = new CircuitManager(racers, rng);
  // a network player dropped out: their racer becomes an AI for the rest of the cup
  const drop = (peer) => { for (const r of circuit.racers) if (r.owner === peer) { r.owner = 'host'; r.remote = false; r.isHuman = false; r.persona = 'balanced_hybrid'; if (circuit.hands.has(r.id)) circuit.aiPick(r.id); } };
  if (net) net.onPeerLeave = drop;
  const remoteRacers = () => circuit.racers.filter((r) => r.remote);

  for (;;) {
    circuit.dealAll();
    if (net) { // every remote player drafts on their own screen; picks come back as { t: 'pick', k }
      net.on('pick', (m) => { const r = circuit.racers.find((x) => x.owner === m.from && x.remote); const hand = r && circuit.hands.get(r.id); if (hand?.[m.k]) circuit.apply(r.id, hand[m.k]); });
      for (const r of remoteRacers()) net.send({ t: 'draft', you: r.id, stage: circuit.stage, racers: plain(circuit.racers), hand: circuit.hands.get(r.id) }, r.owner);
    }
    const localPending = () => circuit.humansPending().filter((r) => !r.remote);
    if (AUTO || !localPending().length) { for (const h of localPending()) circuit.aiPick(h.id); } else {
      // 3D garage backdrop behind the draft cards
      renderer.hud.build(0); renderer.resize();
      await assets.preload(circuit.racers.filter((r) => r.isHuman).flatMap((r) => [r.kartId, r.charId]));
      const gs = new DraftScene(assets, circuit.racers);
      backdrop = (dt) => { gs.update(dt, innerWidth / innerHeight); gl.setScissorTest(false); gl.setViewport(0, 0, innerWidth, innerHeight); gl.clear(); gl.render(gs.scene, gs.camera); };
      await ui.showDraft(circuit);
      backdrop = null; gs.dispose();
    }
    if (net) { // wait (max 40 s) for the remote drafts, then auto-pick for anyone who is still thinking
      const t0 = performance.now();
      if (remoteRacers().some((r) => circuit.hands.has(r.id))) ui.loading('Waiting for the other players to draft…');
      while (remoteRacers().some((r) => circuit.hands.has(r.id)) && performance.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 150));
      for (const r of remoteRacers()) if (circuit.hands.has(r.id)) circuit.aiPick(r.id);
      net.off('pick');
    }
    circuit.aiPickAll();

    ui.loading(`Building ${circuit.trackId.replace(/_/g, ' ')}…`);
    await new Promise((r) => setTimeout(r, 30));
    const standings = circuit.standings();
    // race 1: random grid; afterwards the Cup leader takes pole
    const grid = circuit.stage === 0 ? shuffle(circuit.racers, rng) : standings;
    renderer.quality = vr.active ? 'vr' : cfg.quality ?? 'high';
    const physics = await PhysicsWorld.create();
    await assets.preload([...new Set(grid.flatMap((r) => [r.kartId, r.charId]))]);
    const trackId = params.get('track') ?? circuit.trackId, seed = (rng() * 1e6) | 0;
    let ready = 0;
    if (net) { net.on('ready', () => { ready++; }); net.send({ t: 'race', trackId, seed, raceNumber: circuit.raceNumber, grid: plain(grid) }); }
    const session = game.session = new RaceSession({
      physics, assets, trackId, seed, input, autoShield: cfg.autoShield, quality: renderer.quality, net,
      cup: { race: circuit.raceNumber, of: 4 },
      racers: localView(grid.map((r) => ({ ...r, build: r.build, weapon: r.weapon, shield: r.shield, stats: r.stats })), 'host'),
    });
    const hook = net ? new NetRace(session, net) : null;
    let order;
    ui.clear();
    if (net) { // everyone sits on the grid until all devices have built the track (max 25 s), then the host drops the flag
      const racing = playRace(session, cfg.players);
      const t0 = performance.now();
      while (ready < net.clientIds.length && performance.now() - t0 < 25000) await new Promise((r) => setTimeout(r, 100));
      net.off('ready'); hook.go();
      order = await racing;
      hook.results(order); hook.dispose();
    } else order = await playRace(session, cfg.players);
    session.__off?.();
    circuit.recordResults(order);
    net?.send({ t: 'standings', stage: circuit.stage, racers: plain(circuit.racers), order, final: circuit.isFinal });
    session.dispose();
    game.session = null;
    renderer.hud.build(0);
    const final = circuit.isFinal;
    if (AUTO && !params.has('stay')) { if (final) { net?.send({ t: 'end' }); return; } circuit.advance(); continue; }
    await ui.showStandings(circuit, order, final);
    if (!circuit.advance()) { net?.send({ t: 'end' }); return; }
  }
}

/** Host lobby: open the room, collect players until the host presses start, then run the cup as referee. */
async function hostRoom(cfg) {
  const code = params.get('code') ?? newCode();
  ui.loading('Opening room…');
  const net = game.net = await Net.host(code, TRANSPORT);
  const remotes = [];
  let started = false, view = null;
  const roster = () => [...cfg.kids.map((k, i) => ({ name: `P${i + 1} ${CHARACTERS[k].name}`, where: 'this device' })), ...remotes.map((r, i) => ({ name: `P${cfg.players + i + 1} ${CHARACTERS[r.kid].name}`, where: 'joined' }))];
  net.on('hello', (m) => { if (started || cfg.players + remotes.length >= 8) { net.send({ t: 'end', reason: 'The cup already started' }, m.from); return; } if (!remotes.some((r) => r.peer === m.from)) remotes.push({ peer: m.from, kid: CHARACTERS[m.kid] ? m.kid : 'barnaby', kart: PLAYABLE_KARTS.some((k) => k.id === m.kart) ? m.kart : PLAYABLE_KARTS[0].id }); view?.refresh(); });
  net.onPeerLeave = (id) => { const i = remotes.findIndex((r) => r.peer === id); if (i >= 0) remotes.splice(i, 1); view?.refresh(); };
  try {
    if (AUTO) { const want = +(params.get('expect') ?? 1); ui.loading(`Room ${code}: waiting for ${want} player(s)…`); while (remotes.length < want) await new Promise((r) => setTimeout(r, 100)); }
    else { view = ui.showRoom(code, roster); await view.done; }
    started = true;
    await runCup(cfg, net, remotes);
  } finally { net.close(); game.net = null; }
}

/** Joined player: the host deals the draft, names the track and referees; this device simulates only its own kart. */
async function joinRoom(cfg) {
  ui.loading(`Joining room ${cfg.code}…`);
  const net = game.net = await Net.join(cfg.code, TRANSPORT);
  try {
    net.send({ t: 'hello', kid: cfg.kids[0], kart: cfg.karts[0] });
    ui.loading(`Joined room ${cfg.code} — waiting for the host to start…`);
    const view = (m, me) => {
      const c = Object.create(CircuitManager.prototype);
      Object.assign(c, { racers: m.racers.map((r) => ({ ...r, remote: r.id !== me })), stage: m.stage, tracks: TRACK_ORDER.slice(0, 4), hands: new Map(), rnd: Math.random });
      c.byId = new Map(c.racers.map((r) => [r.id, r]));
      return c;
    };
    let me = null;
    for (;;) {
      const m = await net.next(['draft', 'race', 'standings', 'end']);
      if (m.t === 'end') { if (m.reason) throw new Error(m.reason); return; }
      if (m.t === 'draft') {
        me = m.you;
        const c = view(m, me); c.hands.set(me, m.hand);
        c.apply = (id, card) => { net.send({ t: 'pick', k: m.hand.indexOf(card) }); CircuitManager.prototype.apply.call(c, id, card); };
        if (AUTO) c.apply(me, m.hand[0]); else await ui.showDraft(c);
        ui.loading('Waiting for the other players…');
      } else if (m.t === 'race') {
        ui.loading(`Building ${m.trackId.replace(/_/g, ' ')}…`);
        await new Promise((r) => setTimeout(r, 30));
        renderer.quality = vr.active ? 'vr' : cfg.quality ?? 'high';
        const physics = await PhysicsWorld.create();
        await assets.preload([...new Set(m.grid.flatMap((r) => [r.kartId, r.charId]))]);
        const session = game.session = new RaceSession({ physics, assets, trackId: m.trackId, seed: m.seed, input, autoShield: cfg.autoShield, quality: renderer.quality, net, cup: { race: m.raceNumber, of: 4 }, racers: localView(m.grid, net.id) });
        const hook = new NetRace(session, net);
        ui.clear();
        const racing = playRace(session, 1);
        net.send({ t: 'ready' });
        await racing;
        hook.dispose(); session.__off?.(); session.dispose(); game.session = null; renderer.hud.build(0);
        ui.loading('Waiting for the results…');
      } else if (m.t === 'standings') {
        game.clientStandings = (game.clientStandings ?? 0) + 1;
        if (!AUTO) { await ui.showStandings(view(m, me), m.order, m.final, m.final ? 'BACK TO LOBBY' : 'READY ▶'); if (!m.final) ui.loading('Waiting for the host to start the next draft…'); }
        if (m.final) return;
      }
    }
  } finally { net.close(); game.net = null; }
}

function shuffle(a, rnd) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

(async () => {
  window.__booted = true; document.getElementById('bootlog')?.remove();
  ui.loading('Warming up the physics engine…');
  await initRapier();
  await assets.init();
  let lobbyDefaults = { net: params.has('join') ? 'join' : 'solo', code: params.get('join') ?? '' };
  for (;;) {
    const cfg = AUTO ? { net: params.get('net') ?? 'solo', code: params.get('code') ?? '', players: +(params.get('players') ?? 1), autoShield: false, quality: params.get('q') ?? 'ultra', karts: ['rocket_grocery_kart', 'chicken_coop', 'rocket_grocery_kart', 'chicken_coop'], kids: ['barnaby', 'chloe', 'max', 'zoe'] } : await ui.showLobby(lobbyDefaults);
    if (AUTO) { cfg.karts = cfg.karts.slice(0, cfg.players); cfg.kids = cfg.kids.slice(0, cfg.players); }
    try {
      if (cfg.net === 'host') await hostRoom(cfg); else if (cfg.net === 'join') await joinRoom(cfg); else await runCup(cfg);
      lobbyDefaults = { net: cfg.net, code: '' };
    } catch (e) { // connection problems return to the lobby with the reason
      console.error(e); game.errors.push(String(e.stack ?? e));
      driver.set(null); game.loop?.stop(); document.body.classList.remove('racing'); input.showTouch(false);
      try { game.session?.dispose(); } catch { /* half-built */ } game.session = null; renderer.hud.build(0);
      if (AUTO) throw e;
      lobbyDefaults = { net: cfg.net, code: cfg.code, error: e.message ?? String(e) };
    }
    if (AUTO) { game.autoDone = true; ui.show('<div class="loading"><p>Auto cup complete</p></div>', 'screen'); return; }
  }
})().catch((e) => { console.error(e); game.errors.push(String(e.stack ?? e)); });
