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

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // attract / test mode: human karts drive themselves and drafts auto-pick

const canvas = document.getElementById('game');
const renderer = new SplitScreenRenderer(canvas, document.getElementById('hud'));
const input = new InputManager();
const audio = new AudioManager();
const assets = new AssetManager();
const ui = new UI(document.getElementById('ui'), input);
const pauseEl = document.getElementById('pause');
const game = window.__game = { renderer, audio, session: null, circuit: null, errors: [] };
addEventListener('error', (e) => game.errors.push(String(e.message)));
const goFullscreen = () => { try { if (document.fullscreenElement == null) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* optional */ } };
if (matchMedia('(pointer: coarse)').matches) addEventListener('pointerdown', goFullscreen, { once: true });
let audioLoaded = false;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { audio.ensure(); if (!audioLoaded && audio.ctx) { audioLoaded = true; audio.loadFiles(assets); } }, { once: false });

/** Run one race until it finishes. Resolves with the finishing order (racer ids). */
function playRace(session, humans) {
  return new Promise((resolve) => {
    renderer.setPlayers(Math.max(1, humans));
    document.body.classList.add('racing'); input.showTouch(true);
    session.audio = audio;
    const HAPTIC = { hit: [0.9, 0.6, 220], impact: [0.8, 0.5, 160], miniTurbo: [0.35, 0.8, 220], boost: [0.2, 0.4, 140], slingshot: [0.3, 0.6, 260], trickLanded: [0.5, 0.5, 180], grabbed: [1, 1, 500], yetiSlam: [1, 0.8, 420], oob: [0.3, 0.9, 320], blocked: [0.3, 0.3, 90], pickup: [0.1, 0.3, 80] };
    session.haptic = (i, type) => { const h = HAPTIC[type]; if (h) input.rumble(i, ...h); };
    audio.setFocus(session.humans[0] ?? null);
    let finishedAt = null;
    const loop = new GameLoop({
      poll: () => input.poll(),
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
    const offKey = input.onKey((c) => {
      if (c === 'KeyP') { loop.paused = !loop.paused; pauseEl.classList.toggle('hidden', !loop.paused); }
      if (c === 'KeyM') audio.toggleMute();
    });
    game.loop = loop;
    loop.start();
    session.__off = offKey;
  });
}

async function runCup(cfg) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const taken = new Set(cfg.kids);
  const freeKids = CHARACTER_IDS.filter((c) => !taken.has(c));
  const personas = Object.keys(PERSONAS);
  const racers = [];
  for (let i = 0; i < cfg.players; i++) racers.push({ id: i, name: `P${i + 1} ${CHARACTERS[cfg.kids[i]].name.split(' ')[0]}`, isHuman: true, humanIndex: i, kartId: cfg.karts[i], charId: cfg.kids[i], autopilot: AUTO });
  for (let j = 0; cfg.players + j < 8; j++) {
    const id = cfg.players + j;
    const ch = freeKids[j % freeKids.length];
    racers.push({ id, name: CHARACTERS[ch].name.split(' ')[0], isHuman: false, persona: personas[j % personas.length], kartId: PLAYABLE_KARTS[(j + 1) % PLAYABLE_KARTS.length].id, charId: ch });
  }
  const circuit = game.circuit = new CircuitManager(racers, rng);

  for (;;) {
    circuit.dealAll();
    if (AUTO) { for (const h of circuit.humansPending()) circuit.aiPick(h.id); } else {
      // 3D garage backdrop behind the draft cards
      renderer.hud.build(0); renderer.resize();
      await assets.preload(circuit.racers.filter((r) => r.isHuman).flatMap((r) => [r.kartId, r.charId]));
      const gs = new DraftScene(assets, circuit.racers);
      let raf = 0, last = performance.now();
      const gl = renderer.renderer;
      const frame = (now) => { gs.update(Math.min(0.1, (now - last) / 1000), innerWidth / innerHeight); last = now; gl.setScissorTest(false); gl.setViewport(0, 0, innerWidth, innerHeight); gl.clear(); gl.render(gs.scene, gs.camera); raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);
      await ui.showDraft(circuit);
      cancelAnimationFrame(raf); gs.dispose();
    }
    circuit.aiPickAll();

    ui.loading(`Building ${circuit.trackId.replace(/_/g, ' ')}…`);
    await new Promise((r) => setTimeout(r, 30));
    const standings = circuit.standings();
    // race 1: random grid; afterwards the Cup leader takes pole
    const grid = circuit.stage === 0 ? shuffle(circuit.racers, rng) : standings;
    renderer.quality = cfg.quality ?? 'high';
    const physics = await PhysicsWorld.create();
    await assets.preload([...new Set(grid.flatMap((r) => [r.kartId, r.charId]))]);
    const session = game.session = new RaceSession({
      physics, assets, trackId: params.get('track') ?? circuit.trackId, seed: (rng() * 1e6) | 0, input, autoShield: cfg.autoShield, quality: renderer.quality,
      cup: { race: circuit.raceNumber, of: 4 },
      racers: grid.map((r) => ({ ...r, build: r.build, weapon: r.weapon, shield: r.shield, stats: r.stats })),
    });
    ui.clear();
    const order = await playRace(session, cfg.players);
    session.__off?.();
    circuit.recordResults(order);
    session.dispose();
    game.session = null;
    renderer.hud.build(0);
    const final = circuit.isFinal;
    if (AUTO && !params.has('stay')) { if (final) return; circuit.advance(); continue; }
    await ui.showStandings(circuit, order, final);
    if (!circuit.advance()) return;
  }
}

function shuffle(a, rnd) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

(async () => {
  ui.loading('Warming up the physics engine…');
  await initRapier();
  await assets.init();
  for (;;) {
    const cfg = AUTO ? { players: +(params.get('players') ?? 1), autoShield: false, quality: params.get('q') ?? 'ultra', karts: ['rocket_grocery_kart', 'chicken_coop', 'rocket_grocery_kart', 'chicken_coop'], kids: ['barnaby', 'chloe', 'max', 'zoe'] } : await ui.showLobby();
    if (AUTO) { cfg.karts = cfg.karts.slice(0, cfg.players); cfg.kids = cfg.kids.slice(0, cfg.players); }
    await runCup(cfg);
    if (AUTO) { game.autoDone = true; ui.show('<div class="loading"><p>Auto cup complete</p></div>', 'screen'); return; }
  }
})().catch((e) => { console.error(e); game.errors.push(String(e.stack ?? e)); });
