import * as THREE from 'three';
import { Course, COURSES } from './course.js';
import { Race, TUNE } from './sim.js';
import { View } from './view.js';
import { PlaneHud } from './hud.js';
import { PlaneInput } from './input.js';
import { PlaneNet } from './netrace.js';
import { basicSkin } from './skin/basic.js';
import { VRManager, IS_HEADSET, SHARPNESS } from '../vr/VRManager.js';
import { VRPanel, VRRoom } from '../vr/VRPanel.js';
import { GameLoop } from '../core/GameLoop.js';
import { AudioManager } from '../core/AudioManager.js';
import { Net, newCode } from '../net/Net.js';

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');                 // test mode: the local pilot flies on autopilot, menus are skipped
const TRANSPORT = params.get('transport') ?? 'peer';
const SKIN = basicSkin;                          // swap this for a richer skin later; nothing else needs to change
const COLORS = [0xd92b2b, 0x2f8de0, 0xffc928, 0x2dc26b, 0xff7ad1, 0x8a5cf6, 0xff8a2a, 0x20c9c0];
const NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Pink', 'Violet', 'Orange', 'Teal'];
const MAX_HUMANS = 4, GRID = 8;
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

const canvas = document.getElementById('game'), uiRoot = document.getElementById('ui');
const smooth = store.get('pl_aa', IS_HEADSET ? '0' : '1') === '1';
const gl = new THREE.WebGLRenderer({ canvas, antialias: smooth, powerPreference: 'high-performance' });
gl.setPixelRatio(IS_HEADSET ? 1 : Math.min(devicePixelRatio || 1, 2));
gl.autoClear = false;
const resize = () => { gl.setSize(innerWidth, innerHeight, false); canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; };
addEventListener('resize', resize); resize();

const vr = new VRManager(gl), input = new PlaneInput(vr), hud = new PlaneHud(), audio = new AudioManager();
const room = new VRRoom(new VRPanel(uiRoot));
const course = new Course(COURSES.red_rock);
const game = window.__planes = { vr, gl, course, race: null, view: null, errors: [], frames: 0 };
addEventListener('error', (e) => game.errors.push(String(e.message)));
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => audio.ensure());

const beep = (...a) => { if (audio.ctx) audio.tone(...a); }; // no sound until the first tap / key press (browser rule)
const driver = { fn: null, set(fn) { this.fn = fn; } };
let idleLast = performance.now();
gl.setAnimationLoop((now) => {
  if (driver.fn) { driver.fn(now); idleLast = now; return; }
  const dt = Math.max(0, Math.min(0.1, (now - idleLast) / 1000)); idleLast = now;
  if (vr.active) room.render(vr, dt); else { gl.setClearColor(0x0e1220, 1); gl.clear(); }
});

const vrBtn = document.getElementById('vrbtn');
const vrLabel = () => { vrBtn.textContent = vr.active ? '✕ Exit VR' : vr.supported || navigator.xr ? '🥽 Enter VR' : '📱 Stereo view'; };
vr.ready.then(() => { vrBtn.classList.remove('hidden'); vrLabel(); }); vr.onChange(vrLabel);
vrBtn.onclick = () => { (vr.active ? vr.exit() : vr.enter(vr.supported || navigator.xr ? 'xr' : 'sim')).catch((e) => flash('VR unavailable: ' + (e.message ?? e))); };
if (params.get('vr') === 'sim') vr.enter('sim');
function flash(text) { let el = document.getElementById('flash'); if (!el) { el = document.createElement('div'); el.id = 'flash'; document.body.appendChild(el); } el.textContent = text; el.classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove('on'), 2400); }

/* ------------------------------------------------------------------ menus (plain DOM; mirrored into the headset by VRPanel) */
const show = (html, cls = 'screen') => { uiRoot.className = cls; uiRoot.innerHTML = html; return uiRoot; };
const hide = () => { uiRoot.className = 'hidden'; uiRoot.innerHTML = ''; };
const loading = (text) => show(`<div class="loading"><div class="spin"></div><p>${text}</p></div>`);

function lobby(st) {
  return new Promise((resolve) => {
    const render = () => {
      const el = show(`<div class="panel">
        <h1>SKY<span>CANYON</span></h1>
        <p class="tag">Plane racing · ${COURSES.red_rock.name} · 3 laps · 8 planes</p>
        ${st.error ? `<p class="vrline err">${st.error}</p>` : ''}
        <div class="row"><b>Mode</b> ${[['solo', 'This device'], ['host', 'Host a room'], ['join', 'Join a room']].map(([k, l]) => `<button class="pill ${st.net === k ? 'sel' : ''}" data-net="${k}">${l}</button>`).join('')}<em>rooms: up to 4 headsets, AI fills the rest</em></div>
        ${st.net === 'join' ? `<div class="row vrrow"><b>Room code</b> <span class="codebox">${(st.code + '____').slice(0, 4).split('').join(' ')}</span> ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button class="pill key" data-key="${n}">${n}</button>`).join('')}<button class="pill key" data-key="del">⌫</button></div>` : ''}
        <div class="row"><b>Your plane</b> ${COLORS.map((c, i) => `<button class="pill sw ${st.color === i ? 'sel' : ''}" data-col="${i}" data-vr="${NAMES[i]}" style="--sw:#${c.toString(16).padStart(6, '0')}">${NAMES[i]}</button>`).join('')}</div>
        <div class="row"><b>Up / down</b> <button class="pill ${!st.invert ? 'sel' : ''}" data-inv="0">Tip up = climb</button><button class="pill ${st.invert ? 'sel' : ''}" data-inv="1">Tip up = dive</button></div>
        <div class="row"><b>VR detail</b> ${Object.keys(SHARPNESS).map((k) => `<button class="pill ${vr.sharpness === k ? 'sel' : ''}" data-sharp="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}<button class="pill ${smooth ? 'sel' : ''}" data-aa>Smooth edges ${smooth ? 'on' : 'off'}</button><em>lower = faster</em></div>
        <button class="go" data-go>${st.net === 'host' ? 'CREATE ROOM ▶' : st.net === 'join' ? 'JOIN ROOM ▶' : 'START RACE ▶'}</button>
        <details><summary>Controls</summary><table class="ctl">
          <tr><th></th><th>🥽 Pico remote</th><th>Keyboard</th><th>Gamepad</th></tr>
          <tr><td>Turn</td><td>Roll the remote left / right</td><td>← → / A D</td><td>Left stick</td></tr>
          <tr><td>Climb / dive</td><td>Tip the remote up / down</td><td>↑ ↓ / W S</td><td>Left stick</td></tr>
          <tr><td>Sharp turn (hold) → mini-boost</td><td>Trigger</td><td>Space</td><td>RT / A</td></tr>
          <tr><td>Use item</td><td>Touchpad click</td><td>Shift / E</td><td>X / LB</td></tr></table>
          <p class="note">Gas is automatic. Fly through gold rings for a boost, pop balloons for items, tuck in behind a rival for a slipstream. Squeeze the trigger just before GO for a rocket start.</p></details>
        <p class="note"><a href="../">← Mowgli Kart</a></p></div>`, 'screen lobby');
      const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => (b.onclick = () => { fn(b); render(); }));
      on('[data-net]', (b) => { st.net = b.dataset.net; st.error = ''; });
      on('[data-key]', (b) => { st.code = b.dataset.key === 'del' ? st.code.slice(0, -1) : (st.code + b.dataset.key).slice(0, 4); });
      on('[data-col]', (b) => { st.color = +b.dataset.col; store.set('pl_col', st.color); });
      on('[data-inv]', (b) => { st.invert = b.dataset.inv === '1'; store.set('pl_inv', st.invert ? '1' : '0'); });
      on('[data-sharp]', (b) => vr.setSharpness(b.dataset.sharp));
      el.querySelector('[data-aa]').onclick = () => { store.set('pl_aa', smooth ? '0' : '1'); location.reload(); };
      el.querySelector('[data-go]').onclick = () => { if (st.net === 'join' && st.code.length < 4) { st.error = 'Enter the 4-digit code shown on the host\'s screen'; render(); return; } off(); hide(); resolve(st); };
    };
    const key = (e) => { if (st.net !== 'join') return; const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if (m) { st.code = (st.code + m[1]).slice(0, 4); render(); } else if (e.code === 'Backspace') { st.code = st.code.slice(0, -1); render(); } };
    addEventListener('keydown', key); const offVr = vr.onChange(() => render()); const off = () => { removeEventListener('keydown', key); offVr(); };
    render();
  });
}

function results(race, { canRestart = true, waiting = false } = {}) {
  return new Promise((resolve) => {
    const rows = race.results.map((id, i) => { const p = race.byId.get(id); return `<p class="vrline ${p.human ? 'me' : ''}">${ord(i + 1)}  ${p.name}${p.human ? ' ★' : ''} <small>${p.finished ? p.finishTime.toFixed(1) + ' s' : 'did not finish'}</small></p>`; }).join('');
    const el = show(`<div class="panel"><h2>🏁 RESULTS</h2><p class="tag">${COURSES.red_rock.name}</p>${rows}
      ${waiting ? '<p class="tag">Waiting for the host…</p>' : ''}
      <div class="row vrrow">${canRestart ? '<button class="go" data-again>RACE AGAIN ▶</button>' : ''}<button class="pill" data-quit>Back to lobby</button></div></div>`, 'screen standings2');
    el.querySelector('[data-again]')?.addEventListener('click', () => { hide(); resolve('again'); });
    el.querySelector('[data-quit]').onclick = () => { hide(); resolve('quit'); };
    results.cancel = () => { hide(); resolve('next'); };
  });
}

/* ------------------------------------------------------------------ one race */
const SFX = { go: [880, 0.5, 'square'], ring: [990, 0.18, 'triangle'], pickup: [1320, 0.12, 'sine'], miniBoost: [520, 0.3, 'sawtooth'], startBoost: [620, 0.4, 'sawtooth'], hit: [110, 0.5, 'sawtooth'], scrape: [160, 0.15, 'square'], blocked: [700, 0.25, 'triangle'], lap: [760, 0.3, 'square'], finish: [1040, 0.8, 'triangle'], draft: [440, 0.3, 'sine'], use: [300, 0.15, 'square'] };
const BUZZ = { hit: [1, 300], scrape: [0.7, 120], ring: [0.3, 60], miniBoost: [0.5, 120], startBoost: [0.6, 200], pickup: [0.2, 40], blocked: [0.5, 150], bump: [0.4, 80] };

/** Build the race from `entries` and run it to the end. Resolves with the Race (results in race.results). */
function runRace(entries, { seed = 1, net = null, myId = -1 } = {}) {
  return new Promise((resolve) => {
    const race = game.race = new Race(course, entries, { seed, hold: !!net });
    const view = game.view = new View(race, SKIN, myId);
    const link = net ? new PlaneNet(race, net) : null;
    const me = race.byId.get(myId) ?? null;
    const cam = new THREE.PerspectiveCamera(84, 1, 0.1, 1400); cam.rotation.order = 'YXZ';
    let countHint = '', lastCount = 4, doneAt = null, vrMounted = null;
    input.invert = store.get('pl_inv', '0') === '1'; input.neutralPitch = null;
    document.body.classList.add('racing'); input.showTouch(true);
    room.panel.mesh.removeFromParent();
    const loop = game.loop = new GameLoop({
      driver,
      poll: () => { if (vr.active) { vr.poll(); vr.takeSelect(); vr.laser.visible = false; } },
      step: (dt) => {
        if (me && !me.finished) { if (AUTO) race._ai(me, dt); else input.read(me.input); } else if (vr.mode === 'xr') vr.takeEdges();
        if (race.state !== 'RACE') input.calibrate(dt);
        race.step(dt);
        link?.step(dt);
        for (const e of race.events) {
          view.onEvent(e); hud.onEvent(e, view.subject, race);
          const mine = e.id === view.subject?.id || e.type === 'go';
          if (mine && SFX[e.type]) beep(...SFX[e.type], 0.25);
          if (mine && BUZZ[e.type] && vr.mode === 'xr') vr.rumble(...BUZZ[e.type]);
        }
        race.events.length = 0;
        if (race.state === 'COUNT' && Math.ceil(race.count) < lastCount) { lastCount = Math.ceil(race.count); beep(440, 0.15, 'square', 0.2); }
      },
      render: (alpha, dt) => {
        game.frames++;
        view.sync(alpha, dt, race.time);
        const subject = view.subject, inVr = vr.active;
        if (vrMounted !== inVr) { hud.mount(inVr ? vr.rig : null); vrMounted = inVr; input.showTouch(!inVr); }
        countHint = vr.mode === 'xr' ? 'Hold the remote level like a toy plane · trigger just before GO = rocket start' : '';
        hud.update(race, subject, dt, countHint);
        if (inVr) {
          vr.attach(view.scene);
          vr.rig.position.copy(view.eye); vr.rig.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
          const k = Math.min(1, Math.max(0, (view.turnRate - 0.55) / 1.3) + (subject?.boosting ? 0.22 : 0) + (subject?.stun > 0 ? 0.3 : 0));
          vr.vigK += (k - vr.vigK) * Math.min(1, 6 * dt); vr.vig.material.uniforms.k.value = vr.vigK; // comfort: darken the edges in hard turns
          vr.render(view.scene);
        } else {
          cam.position.copy(view.eye); cam.rotation.set(view.pitch, view.yaw, 0);
          cam.fov += ((subject?.boosting ? 96 : 84) - cam.fov) * Math.min(1, 6 * dt);
          cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
          gl.setViewport(0, 0, innerWidth, innerHeight); gl.setScissorTest(false); gl.setClearColor(SKIN.clear, 1); gl.clear();
          gl.render(view.scene, cam);
        }
        if (race.done) { doneAt ??= performance.now(); if (performance.now() - doneAt > (AUTO ? 200 : 1500)) end(); }
      },
    });
    const end = () => {
      loop.stop(); link?.dispose(); hud.unmount(); input.showTouch(false); document.body.classList.remove('racing');
      vr.rig.removeFromParent(); view.dispose(); game.view = null;
      resolve(race);
    };
    game.link = link;
    loop.start();
  });
}

const aiEntries = (taken, from) => { const out = []; let c = 0; for (let id = from; id < GRID; id++) { while (taken.has(c)) c++; taken.add(c); out.push({ id, name: NAMES[c], color: COLORS[c], human: false, owner: 'host', skill: 0.94 + 0.012 * (id % 6) }); } return out; };
const localize = (entries, meOwner) => entries.map((e) => ({ ...e, local: e.owner === meOwner }));

async function solo(st) {
  for (;;) {
    const taken = new Set([st.color]);
    const entries = [{ id: 0, name: 'You', color: COLORS[st.color], human: true, owner: 'host' }, ...aiEntries(taken, 1)];
    // the player starts mid-grid so there is someone to chase and someone chasing
    const grid = [...entries.slice(1, 4), entries[0], ...entries.slice(4)];
    const race = await runRace(localize(grid, 'host'), { seed: (Math.random() * 1e9) | 0, myId: 0 });
    game.lastResults = race.results;
    if (AUTO) { game.autoDone = true; show('<div class="loading"><p>Auto race complete</p></div>'); return 'stop'; }
    if ((await results(race)) === 'quit') return;
  }
}

async function host(st) {
  const code = params.get('code') ?? newCode();
  loading('Opening room…');
  const net = game.net = await Net.host(code, TRANSPORT);
  const remotes = []; let started = false, refresh = () => {};
  net.on('hello', (m) => { if (started || remotes.length >= MAX_HUMANS - 1) { net.send({ t: 'end', reason: started ? 'That race already started' : 'The room is full (4 pilots)' }, m.from); return; } if (!remotes.some((r) => r.peer === m.from)) remotes.push({ peer: m.from, color: m.color | 0 }); refresh(); });
  net.onPeerLeave = (id) => { const i = remotes.findIndex((r) => r.peer === id); if (i >= 0) remotes.splice(i, 1); refresh(); };
  try {
    if (AUTO) { const want = +(params.get('expect') ?? 1); loading(`Room ${code}: waiting for ${want} pilot(s)…`); while (remotes.length < want) await new Promise((r) => setTimeout(r, 100)); } else {
      await new Promise((resolve) => {
        refresh = () => {
          const el = show(`<div class="panel"><h2>ROOM OPEN</h2><p class="tag">On each headset: open this page → Join a room → enter</p><p class="roomcode">${code.split('').join(' ')}</p>
            <p class="vrline">1. You (${NAMES[st.color]})</p>${remotes.map((r, i) => `<p class="vrline">${i + 2}. Pilot ${i + 2} (${NAMES[r.color % 8]})</p>`).join('')}
            <p class="tag">${1 + remotes.length} pilot${remotes.length ? 's' : ''} + ${GRID - 1 - remotes.length} AI · up to ${MAX_HUMANS} pilots</p><button class="go" data-go>START RACE ▶</button></div>`, 'screen room');
          el.querySelector('[data-go]').onclick = () => { hide(); resolve(); };
        };
        refresh();
      });
    }
    started = true; refresh = () => {};
    for (;;) {
      const taken = new Set([st.color]);
      const humans = [{ id: 0, name: NAMES[st.color], color: COLORS[st.color], human: true, owner: 'host' }];
      for (const r of remotes) { let c = r.color % 8; while (taken.has(c)) c = (c + 1) % 8; taken.add(c); humans.push({ id: humans.length, name: NAMES[c], color: COLORS[c], human: true, owner: r.peer }); }
      const ais = aiEntries(taken, humans.length);
      const grid = [...ais.slice(0, 2), ...humans, ...ais.slice(2)]; // humans share the middle rows
      const seed = (Math.random() * 1e9) | 0;
      let ready = 0; net.on('ready', () => { ready++; });
      for (const r of remotes) net.send({ t: 'race', seed, grid, you: humans.find((h) => h.owner === r.peer).id }, r.peer);
      const racing = runRace(localize(grid, 'host'), { seed, net, myId: 0 });
      const t0 = performance.now();
      while (ready < net.clientIds.length && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
      net.off('ready'); game.link.go();
      const race = await racing;
      net.send({ t: 'results', order: race.results }); // (also sent by the referee hook; harmless duplicate for late joiners)
      game.lastResults = race.results;
      if (AUTO) { net.send({ t: 'end' }); game.autoDone = true; return 'stop'; }
      if ((await results(race)) === 'quit') { net.send({ t: 'end' }); return; }
    }
  } finally { net.close(); game.net = null; }
}

async function join(st) {
  loading(`Joining room ${st.code}…`);
  const net = game.net = await Net.join(st.code, TRANSPORT);
  try {
    net.send({ t: 'hello', color: st.color });
    loading(`Joined room ${st.code} — waiting for the host to start…`);
    for (;;) {
      const m = await net.next(['race', 'end']);
      results.cancel?.();
      if (m.t === 'end') { if (m.reason) throw new Error(m.reason); return; }
      const racing = runRace(m.grid.map((e) => ({ ...e, local: e.id === m.you })), { seed: m.seed, net, myId: m.you });
      net.send({ t: 'ready' });
      const race = await racing;
      game.lastResults = race.results; game.clientRaces = (game.clientRaces ?? 0) + 1;
      if (AUTO) continue;
      results(race, { canRestart: false, waiting: true }).then((r) => { if (r === 'quit') net.close(); });
    }
  } finally { net.close(); game.net = null; }
}

(async () => {
  window.__booted = true; document.getElementById('bootlog')?.remove();
  let st = { net: params.get('net') ?? (params.has('join') ? 'join' : 'solo'), code: params.get('code') ?? params.get('join') ?? '', color: +store.get('pl_col', '0') % 8, invert: store.get('pl_inv', '0') === '1', error: '' };
  for (;;) {
    if (!AUTO) st = await lobby(st);
    try {
      const r = st.net === 'host' ? await host(st) : st.net === 'join' ? await join(st) : await solo(st);
      if (r === 'stop') return;
      st.error = '';
    } catch (e) {
      console.error(e); game.errors.push(String(e.stack ?? e));
      game.loop?.stop(); driver.set(null); hud.unmount(); document.body.classList.remove('racing'); hide();
      if (AUTO) throw e;
      st.error = e.message ?? String(e);
    }
  }
})().catch((e) => { console.error(e); game.errors.push(String(e.stack ?? e)); });
