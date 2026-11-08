// Headless balance / sanity simulation: node scripts/sim.mjs [trackId] [races]
// Runs full 8-AI races through the same RaceSession the browser uses (no WebGL needed).
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { AssetManager } from '../src/core/AssetManager.js';
import { RaceSession } from '../src/core/RaceSession.js';
import { CircuitManager } from '../src/core/CircuitManager.js';
import { TRACK_ORDER } from '../src/registries/TrackRegistry.js';
import { PLAYABLE_KARTS } from '../src/registries/KartRegistry.js';
import { CHARACTER_IDS } from '../src/registries/CharacterRegistry.js';
import { PERSONAS } from '../src/registries/CircuitDraftRegistry.js';

const trackArg = process.argv[2] ?? 'whistler_run';
const cupMode = trackArg === 'cup';
const assets = new AssetManager();
const personas = Object.keys(PERSONAS);
const racers = Array.from({ length: 8 }, (_, i) => ({
  id: i, name: `Bot ${i + 1}`, isHuman: false, persona: personas[i % personas.length],
  kartId: PLAYABLE_KARTS[i % 2].id, charId: CHARACTER_IDS[i],
}));
const circuit = new CircuitManager(racers, (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })());

async function runRace(trackId, seed) {
  circuit.dealAll(); circuit.aiPickAll();
  const physics = await PhysicsWorld.create();
  const grid = circuit.standings();
  const entries = grid.map((r) => ({ ...r, build: r.build, weapon: r.weapon, shield: r.shield }));
  const session = new RaceSession({ physics, assets, trackId, racers: entries, seed });
  const dt = 1 / 60;
  const t0 = Date.now();
  const stats = { miniTurbo: 0 }, ev = {}, resp = {};
  const orig = session._events.bind(session);
  session._events = function () {
    for (const k of this.karts) for (const e of k.events) {
      ev[e.type] = (ev[e.type] ?? 0) + 1;
      if (e.type === 'respawn') { const key = `${e.data.reason}@${Math.round(k.d / 100) * 100}`; resp[key] = (resp[key] ?? 0) + 1; }
    }
    orig();
  };
  while (!session.done && session.time < 500) { session.step(dt); session.messages.length = 0; }
  stats.miniTurbo = ev.miniTurbo ?? 0;
  if (process.env.VERBOSE) console.log('  events', JSON.stringify(ev), '\n  respawns', JSON.stringify(resp));
  const fin = session.karts.filter((k) => k.finished).map((k) => k.finishTime - 3.5);
  const respN = session.karts.reduce((a, k) => a + k.respawns, 0);
  console.log(`${trackId}: sim ${session.time.toFixed(0)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s wall | finished ${fin.length}/8 | winner ${Math.min(...fin).toFixed(1)}s median ${fin.sort((a, b) => a - b)[Math.floor(fin.length / 2)]?.toFixed(1)}s | respawns ${respN} | miniTurbos ${stats.miniTurbo}`);
  if (process.env.VERBOSE) console.log('  karts', session.karts.map((k) => `${k.id}:${k.finished ? 'F' + (k.finishTime - 3.5).toFixed(0) : 'd' + k.d.toFixed(0)}/r${k.respawns}`).join(' '));
  for (const k of session.karts.filter((x) => !x.finished)) console.log('  STUCK', k.id, 'd', k.d.toFixed(0), 'lat', k.lat.toFixed(1), 'v', k.speed.toFixed(1), 'fsm', k.fsm, 'grounded', k.grounded, k.lastGround, 'timers', JSON.stringify(Object.fromEntries(Object.entries(k.t).map(([a, b]) => [a, +b.toFixed(1)]).filter(([, b]) => b))), 'up.y', k.up.y.toFixed(2), 'in', JSON.stringify({ s: +k.input.steer.toFixed(2), t: k.input.throttle, b: k.input.brake }), 'ai.sc', session.ais.get(k.id)?.activeShortcut?.id, 'weapon', k.loadout.weapon?.id, 'shield', k.loadout.shield?.id);
  const order = session.results;
  circuit.recordResults(order);
  console.log('  order:', order.join(','), ' persona of winner:', circuit.byId.get(order[0]).persona, 'kart', circuit.byId.get(order[0]).kartId);
  session.dispose();
}

const tracks = cupMode ? TRACK_ORDER : [trackArg];
for (const [i, t] of tracks.entries()) { await runRace(t, i + 1); if (cupMode) { circuit.advance(); } }
if (cupMode) console.log('Cup standings:', circuit.standings().map((r) => `${r.name}(${r.persona}) ${r.points}`).join(' | '));
