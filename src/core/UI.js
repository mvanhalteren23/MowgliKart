import { PLAYABLE_KARTS, KARTS } from '../registries/KartRegistry.js';
import { CHARACTERS, CHARACTER_IDS } from '../registries/CharacterRegistry.js';
import { TRACKS, TRACK_ORDER } from '../registries/TrackRegistry.js';
import { STAT_BOOSTS, WEAPONS, SHIELDS } from '../registries/CircuitDraftRegistry.js';
import { STEER_MODES, STEER_LABEL, SHARPNESS } from '../vr/VRManager.js';

const PCOL = ['#44ff88', '#44aaff', '#ffcc33', '#ff66cc'];
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);

/** Menu overlay screens (Lobby -> Draft -> Standings). Each show* returns a Promise. */
export class UI {
  constructor(root, input, vr = null) {
    this.root = root; this.input = input; this.vr = vr;
    this.cleanup = [];
  }
  clear() { this.cleanup.forEach((f) => f()); this.cleanup = []; this.root.className = 'hidden'; this.root.innerHTML = ''; }
  show(html, cls = '') { this.clear(); this.root.className = cls; this.root.innerHTML = html; return this.root; }
  loading(text = 'Loading…') { this.show(`<div class="loading"><div class="spin"></div><p>${text}</p></div>`, 'screen'); }

  /* ------------------------------------------------------------------ lobby */
  showLobby(defaults = {}) {
    return new Promise((resolve) => {
      const st = {
        players: defaults.players ?? 1, autoShield: false, net: defaults.net ?? 'solo', code: defaults.code ?? '', error: defaults.error ?? '', quality: (() => { try { return localStorage.getItem('mk_q') || (matchMedia('(pointer: coarse)').matches ? 'high' : 'ultra'); } catch { return 'high'; } })(),
        karts: [PLAYABLE_KARTS[0].id, PLAYABLE_KARTS[1].id, PLAYABLE_KARTS[0].id, PLAYABLE_KARTS[1].id],
        kids: ['barnaby', 'chloe', 'max', 'zoe'],
      };
      const el = this.show('', 'screen lobby');
      const vr = this.vr;
      this.cleanup.push(vr?.onChange(() => render()) ?? (() => {}));
      let pads = this.input.padCount();
      if (pads > st.players) st.players = Math.min(4, pads);
      const render = () => {
        if (st.net === 'join') st.players = 1; else if (st.net === 'solo' && st.players < 1) st.players = 1;
        const inVR = !!vr?.active, q = inVR ? 'vr' : st.quality;
        const rows = Array.from({ length: st.players }, (_, i) => `
          <div class="prow" style="--pc:${PCOL[i]}">
            <div class="ptag">P${i + 1}<small>${i < 2 ? (i ? 'Arrows' : 'WASD') : 'Gamepad'}</small></div>
            <div class="kartpick">${PLAYABLE_KARTS.map((k) => `<button data-p="${i}" data-kart="${k.id}" class="${st.karts[i] === k.id ? 'sel' : ''}" style="--kc:${k.color}"><i></i><b>${k.name}</b><small>${k.desc}</small></button>`).join('')}</div>
            <label class="kidpick"><span>Kid</span><select data-kid="${i}">${CHARACTER_IDS.map((id) => `<option value="${id}" ${st.kids[i] === id ? 'selected' : ''}>${CHARACTERS[id].name}</option>`).join('')}</select></label>
          </div>`).join('');
        el.innerHTML = `
          <div class="panel">
            <h1>MOWGLI<span>KART</span></h1>
            <p class="tag">Downhill Soapbox Circuit · 4-Race Roguelite Draft Cup</p>
            ${st.error ? `<p class="vrline err">${st.error}</p>` : ''}
            <div class="row"><b>Mode</b> ${[['solo', 'This device'], ['host', 'Host a room'], ['join', 'Join a room']].map(([k, l]) => `<button class="pill ${st.net === k ? 'sel' : ''}" data-net="${k}">${l}</button>`).join('')}<em>Rooms: every headset, phone or computer is one racer (or split-screen); AI fills the grid to 8</em></div>
            ${st.net === 'join' ? `<div class="row vrrow"><b>Room code</b> <span class="codebox">${(st.code + '____').slice(0, 4).split('').join(' ')}</span> ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button class="pill key" data-key="${n}">${n}</button>`).join('')}<button class="pill key" data-key="del">⌫</button></div>` : `
            <div class="row"><b>Players</b> ${(st.net === 'host' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4]).map((n) => `<button class="pill ${st.players === n ? 'sel' : ''}" data-n="${n}" data-vr="${n ? n + 'P' : 'Spectate'}">${n ? n + 'P' : '📺 Spectate'}</button>`).join('')}<em>${st.net === 'host' ? 'on this device · 0 = big-screen spectator view' : `+ ${8 - st.players} AI → 8 racers`}</em></div>`}
            <div class="row"><b>🥽 Headset</b> ${STEER_MODES.map((m) => `<button class="pill ${vr?.steerMode === m ? 'sel' : ''}" data-steer="${m}">${STEER_LABEL[m]}</button>`).join('')}<em>steering in VR</em></div>
            <div class="row"><b>VR detail</b> ${Object.keys(SHARPNESS).map((k) => `<button class="pill ${vr?.sharpness === k ? 'sel' : ''}" data-sharp="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}<em>${inVR ? 'applies the next time you enter VR' : vr?.supported ? 'press the 🥽 button (top right) to race in the headset' : 'open this page in the headset\'s WebXR browser to race in VR'}</em></div>
            <div class="row padrow" data-vr-hide><b>🎮 Controllers</b> ${pads ? `<span class="padok">${pads} connected</span> — P1${pads > 1 ? '–P' + pads : ''} use pad${pads > 1 ? 's' : ''} (keyboard still works)` : '<em>none yet — press any button on a controller (USB / Bluetooth) to wake it</em>'}${pads && st.players < pads ? `<button class="pill" data-usepads>Use ${pads} players</button>` : ''}</div>
            <div class="row" data-vr-hide><b>Graphics</b> ${['ultra', 'high', 'low', 'vr'].map((k) => `<button class="pill ${q === k ? 'sel' : ''}" data-q="${k}">${k === 'vr' ? 'Headset' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}<em>Ultra = +ambient occlusion · 4K shadows · High = shadows, bloom, speed blur (1P) · Low = none</em></div>
            ${rows}
            <label class="chk" data-vr-hide><input type="checkbox" ${st.autoShield ? 'checked' : ''} data-auto> Auto-Shield assist (reactive counter-measure when a charged shield cell is held)</label>
            <button class="go" data-go>${st.net === 'host' ? 'CREATE ROOM ▶' : st.net === 'join' ? 'JOIN ROOM ▶' : 'START THE CUP ▶'}</button>
            <details><summary>Controls</summary>
              <table class="ctl"><tr><th></th><th>P1</th><th>P2</th><th>Gamepad</th></tr>
              <tr><td>Steer / Throttle / Brake</td><td>A D / W / S</td><td>← → / ↑ / ↓</td><td>L-stick / R2·A / L2</td></tr>
              <tr><td colspan="4" class="note">Controllers: up to 4 pads (Xbox / PlayStation / Switch Pro / generic) on PC, Mac, Android and iPhone. Menus: ◀ ▶ change players, A start/select.</td></tr><tr><td>Hop · Drift · Trick · Push-start</td><td>Space</td><td>Enter</td><td>R1</td></tr>
              <tr><td>Use Mystery Item</td><td>Left Shift</td><td>Right Shift</td><td>L1</td></tr>
              <tr><td>Fire Circuit Weapon</td><td>E</td><td>/</td><td>X</td></tr>
              <tr><td>Activate Circuit Shield</td><td>Q</td><td>.</td><td>B / Y</td></tr></table>
              <table class="ctl"><tr><th colspan="2">🥽 Pico G2 4K remote (in VR)</th></tr>
              <tr><td>Steer</td><td>Tilt the remote like a handlebar (or touchpad / head tilt — Headset row above)</td></tr>
              <tr><td>Trigger</td><td>Hold = hop + drift, release = mini-turbo · tap at a ramp lip = trick · countdown: hold on DROP!</td></tr>
              <tr><td>Touchpad click</td><td>Use item, otherwise fire weapon · click the lower third = shield · countdown: pump in the green</td></tr>
              <tr><td>Touch lower edge of pad</td><td>Brake / reverse (gas is automatic)</td></tr>
              <tr><td>Menus</td><td>Point the remote, pull the trigger</td></tr></table>
              <p class="note">V / R3 / 👁 switches between the driver's seat and the chase camera. M mutes audio · P pauses · 10 more pre-registered karts unlock in Milestone 2.</p>
            </details>
          </div>`;
        el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { st.players = +b.dataset.n; render(); }));
        el.querySelectorAll('[data-net]').forEach((b) => (b.onclick = () => { st.net = b.dataset.net; st.error = ''; render(); }));
        el.querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => { st.code = b.dataset.key === 'del' ? st.code.slice(0, -1) : (st.code + b.dataset.key).slice(0, 4); render(); }));
        el.querySelectorAll('[data-steer]').forEach((b) => (b.onclick = () => { vr?.setSteer(b.dataset.steer); render(); }));
        el.querySelectorAll('[data-sharp]').forEach((b) => (b.onclick = () => { vr?.setSharpness(b.dataset.sharp); render(); }));
        el.querySelector('[data-usepads]')?.addEventListener('click', () => { st.players = Math.min(4, pads); render(); });
        el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { st.quality = b.dataset.q; try { localStorage.setItem('mk_q', st.quality); } catch { /* private mode */ } render(); }));
        el.querySelectorAll('[data-kart]').forEach((b) => (b.onclick = () => { st.karts[+b.dataset.p] = b.dataset.kart; render(); }));
        el.querySelectorAll('[data-kid]').forEach((s) => (s.onchange = () => { st.kids[+s.dataset.kid] = s.value; }));
        el.querySelector('[data-auto]').onchange = (e) => { st.autoShield = e.target.checked; };
        el.querySelector('[data-go]').onclick = () => {
          if (st.net === 'join' && st.code.length < 4) { st.error = 'Enter the 4-digit room code shown on the host\'s screen'; render(); return; }
          this.clear(); resolve({ ...st, quality: vr?.active ? 'vr' : st.quality, karts: st.karts.slice(0, st.players), kids: st.kids.slice(0, st.players) });
        };
      };
      render();
      // controllers can join/leave while in the lobby; A starts the cup, d-pad changes players
      this.cleanup.push(this.input.onPadChange((n) => { if (n > pads && n > st.players) st.players = Math.min(4, n); pads = n; render(); }));
      this.cleanup.push(this.input.onKey((c) => { const m = /^(?:Digit|Numpad)(\d)$/.exec(c); if (st.net !== 'join') return; if (m) { st.code = (st.code + m[1]).slice(0, 4); render(); } else if (c === 'Backspace') { st.code = st.code.slice(0, -1); render(); } }));
      const timer = setInterval(() => {
        this.input.poll();
        const n = this.input.padCount(); if (n !== pads) { pads = n; render(); }
        for (const e of this.input.menuEdges) {
          if (e.name === 'confirm' || e.name === 'start') { el.querySelector('[data-go]')?.click(); return; }
          if (e.name === 'right' && st.players < 4 && st.net !== 'join') { st.players++; render(); }
          if (e.name === 'left' && st.players > 1 && st.net !== 'join') { st.players--; render(); }
        }
      }, 120);
      this.cleanup.push(() => clearInterval(timer));
    });
  }

  /* ------------------------------------------------------------------ multiplayer room (host) */
  /** roster(): [{ name, where }]. Returns { done: Promise, refresh() }; done resolves when the host presses start. */
  showRoom(code, roster) {
    let refresh;
    const done = new Promise((resolve) => {
      const el = this.show('', 'screen room');
      refresh = () => {
        const list = roster();
        el.innerHTML = `<div class="panel"><h2>ROOM OPEN</h2>
          <p class="tag">On each headset, phone or computer: open this site → Join a room → enter</p>
          <p class="roomcode">${code.split('').join(' ')}</p>
          ${list.map((r, i) => `<p class="vrline">${i + 1}. ${r.name} <small>— ${r.where}</small></p>`).join('') || '<p class="vrline">Nobody yet…</p>'}
          <p class="tag">${list.length} player${list.length === 1 ? '' : 's'} + ${Math.max(0, 8 - list.length)} AI</p>
          <button class="go" data-go>START THE CUP ▶</button></div>`;
        el.querySelector('[data-go]').onclick = () => { this.clear(); resolve(); };
      };
      refresh();
    });
    return { done, refresh: () => refresh() };
  }

  /* ------------------------------------------------------------------ draft */
  /** circuit.hands holds each human's three dealt cards. Resolves once all humans have picked. */
  showDraft(circuit) {
    // 0-5 bar ratings shown on the cards (Top Speed / Knockback Res ... like the design reference)
    const BARS = {
      leaf_blower: [['Top Speed', 3], ['Knockback Res', 2]], shopping_casters: [['Top Speed', 2], ['Drift Charge', 3]], pogo_shocks: [['Top Speed', 2], ['Trick Boost', 3]], lead_ballast: [['Top Speed', 2], ['Knockback Res', 4]],
      ballistic_chicken: [['Impact', 4], ['Recharge', 3]], baby_oil_puddle: [['Area', 4], ['Recharge', 4]], mentos_mortar: [['Impact', 3], ['Recharge', 2]], boxing_glove: [['Impact', 4], ['Recharge', 4]],
      bubble_wrap_shield: [['Block', 5], ['Recharge', 3]], trash_lid_shield: [['Reflect', 5], ['Recharge', 3]], tinfoil_shield: [['Immunity', 5], ['Recharge', 3]],
    };
    const CAT = { stat: ['STAT BOOST', '⬆'], weapon: ['WEAPON', '⚔'], shield: ['SHIELD', '🛡'] };
    return new Promise((resolve) => {
      const humans = circuit.racers.filter((r) => r.isHuman && !r.remote); // players on this device
      const snap = new Map(circuit.hands);                // keep showing the cards after a pick (with SELECTED)
      const chosen = new Map();
      const sel = new Map(humans.map((h) => [h.id, 0]));
      const el = this.show('', 'screen draft');
      const bars = (id) => (BARS[id] ?? []).map(([n, v]) => `<div class="bar"><span>${n}</span><i>${Array.from({ length: 5 }, (_, k) => `<u class="${k < v ? 'on' : ''}"></u>`).join('')}</i></div>`).join('');
      const cardHtml = (c, k, h, i) => `<button class="card ${c.category} ${chosen.get(h.id) === k ? 'picked' : sel.get(h.id) === k && !chosen.has(h.id) ? 'focus' : ''} ${chosen.has(h.id) && chosen.get(h.id) !== k ? 'dim' : ''}" data-h="${h.id}" data-k="${k}">
          <div class="chip">${CAT[c.category][1]}</div><div class="cat">${CAT[c.category][0]}:</div><h3>${c.name}</h3>
          <div class="big">${c.icon}</div><p>${c.desc}</p><div class="bars">${bars(c.id)}</div>
          <div class="tagline">${c.tag}</div>${chosen.get(h.id) === k ? '<div class="selbadge">SELECTED</div>' : ''}
          <kbd>${i < 2 ? (i ? ['8', '9', '0'][k] : String(k + 1)) : '◀ ▶ + A'}</kbd></button>`;
      const build = (h) => `${h.stats.map((id) => STAT_BOOSTS[id].icon).join(' ') || '—'} &nbsp;|&nbsp; ${h.weapon ? WEAPONS[h.weapon.id].icon + ' Lv' + h.weapon.level : 'no weapon'} &nbsp;|&nbsp; ${h.shield ? SHIELDS[h.shield.id].icon + ' Lv' + h.shield.level : 'no shield'}`;
      const tracker = `<div class="tracker"><div class="tl">4-RACE CIRCUIT<br>PROGRESS TRACKER</div><div class="nodes">${TRACK_ORDER.map((id, k) => `<div class="node ${k < circuit.stage ? 'done' : k === circuit.stage ? 'cur' : 'lock'}"><i>${k < circuit.stage ? '✔' : k === circuit.stage ? k + 1 : '🔒'}</i><b>${TRACKS[id].name.toUpperCase()}</b>${k === circuit.stage ? `<small>STAGE ${k + 1}</small>` : ''}</div>`).join('<div class="link"></div>')}</div>
          <div class="btns"><span><i class="a">A</i> SELECT</span><span><i class="b">B</i> CANCEL</span></div></div>`;
      const render = () => {
        el.innerHTML = `<div class="panel wide"><h2>⭐ CIRCUIT STAGE ${circuit.raceNumber} OF 4 — PRE-RACE DRAFT</h2>
          <div class="draftgrid n${humans.length}">${humans.map((h, i) => `
            <div class="dpanel" style="--pc:${PCOL[i]}"><div class="dname">${h.name}<small>${build(h)}</small></div>
            <div class="cards">${snap.get(h.id).map((c, k) => cardHtml(c, k, h, i)).join('')}</div></div>`).join('')}</div>${tracker}</div>`;
        el.querySelectorAll('.card').forEach((b) => (b.onclick = () => pick(+b.dataset.h, +b.dataset.k)));
      };
      const pick = (id, k) => {
        const hand = circuit.hands.get(id);
        if (!hand || chosen.has(id)) return;
        circuit.apply(id, hand[k]);
        chosen.set(id, k);
        render();
        if (humans.every((h) => chosen.has(h.id))) { setTimeout(() => { this.clear(); resolve(); }, 650); }
      };
      render();
      const nav = (hi, d) => { const h = humans[hi]; if (!h || chosen.has(h.id)) return; sel.set(h.id, (sel.get(h.id) + d + 3) % 3); render(); };
      const keymap = { Digit1: [0, 0], Digit2: [0, 1], Digit3: [0, 2], Digit8: [1, 0], Digit9: [1, 1], Digit0: [1, 2], Numpad1: [0, 0], Numpad2: [0, 1], Numpad3: [0, 2] };
      this.cleanup.push(this.input.onKey((code) => {
        if (keymap[code] && humans[keymap[code][0]]) pick(humans[keymap[code][0]].id, keymap[code][1]);
        if (code === 'KeyA') nav(0, -1); if (code === 'KeyD') nav(0, 1);
        if (code === 'ArrowLeft') nav(1, -1); if (code === 'ArrowRight') nav(1, 1);
        if (code === 'Space' && humans[0]) pick(humans[0].id, sel.get(humans[0].id));
        if (code === 'Enter' && humans[1]) pick(humans[1].id, sel.get(humans[1].id));
      }));
      const timer = setInterval(() => {
        this.input.poll();
        for (const e of this.input.menuEdges) {
          if (e.name === 'left') nav(e.player, -1); if (e.name === 'right') nav(e.player, 1);
          if (e.name === 'confirm' && humans[e.player]) pick(humans[e.player].id, sel.get(humans[e.player].id));
        }
      }, 60);
      this.cleanup.push(() => clearInterval(timer));
    });
  }

  /* ------------------------------------------------------------------ standings */
  showStandings(circuit, raceOrder, final, nextLabel = null) {
    return new Promise((resolve) => {
      const st = circuit.standings();
      const lastIdx = Object.fromEntries(raceOrder.map((id, i) => [id, i + 1]));
      const champ = st[0];
      const el = this.show(`<div class="panel wide"><h2>${final ? '🏆 CUP COMPLETE' : `Race ${circuit.raceNumber} Results`}</h2>
        ${final ? `<p class="champ">${champ.name} wins the Mowgli Kart Cup with ${champ.points} points!</p>` : `<p class="tag">${TRACKS[circuit.trackId].name} · Circuit Standings</p>`}
        <table class="stand"><tr><th>#</th><th>Racer</th><th>Kart</th><th>Race</th>${circuit.racers[0].results.map((_, i) => `<th>R${i + 1}</th>`).join('')}<th>Points</th></tr>
        ${st.map((r, i) => `<tr class="${r.isHuman ? 'human' : ''}"><td>${i + 1}</td><td>${r.name}${r.isHuman ? ' ★' : ''}</td><td>${KARTS[r.kartId].name}</td><td>${ordinal(lastIdx[r.id])}</td>${r.results.map((x) => `<td>${x.pts}</td>`).join('')}<td><b>${r.points}</b></td></tr>`).join('')}</table>
        <button class="go" data-next>${nextLabel ?? (final ? 'BACK TO LOBBY' : `NEXT: Race ${circuit.raceNumber + 1} Draft ▶`)}</button></div>`, 'screen standings');
      const done = () => { this.clear(); resolve(); };
      el.querySelector('[data-next]').onclick = done;
      this.cleanup.push(this.input.onKey((c) => { if (c === 'Enter' || c === 'Space') done(); }));
      const timer = setInterval(() => { this.input.poll(); if (this.input.menuEdges.some((e) => e.name === 'confirm')) done(); }, 80);
      this.cleanup.push(() => clearInterval(timer));
    });
  }
}
