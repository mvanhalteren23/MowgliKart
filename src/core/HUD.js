import { WEAPONS, SHIELDS, STAT_BOOSTS, weaponCooldown, shieldCooldown } from '../registries/CircuitDraftRegistry.js';
import { ITEMS } from '../registries/ItemRegistry.js';
import { DRIFT_TIERS, FSM } from '../controllers/KartController.js';
import { COUNTDOWN, GREEN, gaugePos } from './StartSequence.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);
const PCOL = ['#44ff88', '#44aaff', '#ffcc33', '#ff66cc'];

/** Per-viewport DOM HUD (rank, stage, progress, speedo, draft meter, 3 slots, badges, drift gauge, push-start). */
export class HUD {
  constructor(root) {
    this.root = root;
    this.panels = [];
    this.mini = null;
  }

  build(players) {
    this.root.innerHTML = '';
    this.panels = [];
    for (let i = 0; i < players; i++) {
      const el = document.createElement('div');
      el.className = 'vp'; el.style.setProperty('--pc', PCOL[i]);
      el.innerHTML = `
        <div class="hud-tl"><div class="rank"><b>1</b><sup>st</sup><span> / 8</span></div><div class="stage"></div><div class="timer"></div><div class="pname"></div></div>
        <div class="hud-tr"><div class="pbadge">P${i + 1}</div><div class="progress"><i></i></div><div class="pct">0%</div><canvas class="mm" width="200" height="200"></canvas></div>
        <div class="hud-c">
          <div class="count"></div>
          <div class="rhythm"><div class="zone"></div><div class="needle"></div></div>
          <div class="score"></div>
          <div class="hint"></div>
        </div>
        <div class="toasts"></div>
        <div class="hud-bl">
          <div class="meter draft"><i></i><em>SLIPSTREAM</em></div>
          <div class="meter drift"><i></i><u class="t1"></u><u class="t2"></u><u class="t3"></u></div></div>
        <div class="dial"><svg viewBox="0 0 100 62"><defs><linearGradient id="rb${i}" x1="0" x2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset=".3" stop-color="#22c55e"/><stop offset=".62" stop-color="#facc15"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>
          <path class="bgp" d="M10 56 A40 40 0 0 1 90 56" pathLength="100"/><path class="fgp" d="M10 56 A40 40 0 0 1 90 56" pathLength="100" stroke="url(#rb${i})" stroke-dasharray="0 100"/></svg>
          <div class="num"><b>0</b><span>KM/H</span></div></div>
        <div class="hud-bc">
          <div class="slot pickup"><div class="ic"></div><div class="lb">ITEM</div></div>
          <div class="slot weapon"><div class="ic"></div><div class="cd"></div><div class="lb"></div></div>
          <div class="slot shield"><div class="ic"></div><div class="cd"></div><div class="lb"></div></div>
        </div>
        <div class="hud-br"><div class="badges"></div></div>
        <div class="ov feathers"></div><div class="ov stink"></div><div class="ov finish"></div>`;
      this.root.appendChild(el);
      const q = (s) => el.querySelector(s);
      this.panels.push({
        el, rank: q('.rank'), stage: q('.stage'), pname: q('.pname'), prog: q('.progress i'), pct: q('.pct'), count: q('.count'),
        rhythm: q('.rhythm'), needle: q('.needle'), zone: q('.zone'), score: q('.score'), hint: q('.hint'), toasts: q('.toasts'),
        speed: q('.dial .num b'), arc: q('.fgp'), timer: q('.timer'), mm: q('.mm'), badge: q('.pbadge'), draft: q('.draft i'), drift: q('.drift i'), t1: q('.drift .t1'), t2: q('.drift .t2'), t3: q('.drift .t3'),
        driftWrap: q('.drift'), slotP: q('.slot.pickup'), slotW: q('.slot.weapon'), slotS: q('.slot.shield'), badges: q('.badges'),
        feathers: q('.feathers'), stink: q('.stink'), finish: q('.finish'), cache: {},
      });
      const z = q('.zone');
      z.style.left = GREEN[0] * 100 + '%'; z.style.width = (GREEN[1] - GREEN[0]) * 100 + '%';
      q('.drift .t1').style.left = (DRIFT_TIERS[0].t / 4) * 100 + '%'; q('.drift .t2').style.left = (DRIFT_TIERS[1].t / 4) * 100 + '%'; q('.drift .t3').style.left = '100%';
    }
    this.panels.forEach((p) => { p.mm.style.display = players > 2 ? 'none' : 'block'; p.badge.style.display = players > 1 ? 'block' : 'none'; });
    // 3-player mode: 4th quadrant = live minimap + circuit standings
    this.mini = null;
    if (players === 3) {
      const el = document.createElement('div'); el.className = 'vp mini';
      el.innerHTML = '<canvas width="480" height="480"></canvas><div class="stand"></div>';
      this.root.appendChild(el);
      this.mini = { el, canvas: el.querySelector('canvas'), stand: el.querySelector('.stand'), pts: null };
    }
  }

  layout(rects, miniRect) {
    rects.forEach((r, i) => Object.assign(this.panels[i].el.style, { left: r.x + 'px', top: r.top + 'px', width: r.w + 'px', height: r.h + 'px' }));
    if (this.mini && miniRect) Object.assign(this.mini.el.style, { left: miniRect.x + 'px', top: miniRect.top + 'px', width: miniRect.w + 'px', height: miniRect.h + 'px' });
  }

  set(p, key, val, fn) { if (p.cache[key] !== val) { p.cache[key] = val; fn(val); } }

  update(i, session, t) {
    const p = this.panels[i];
    const kart = session.humans[i];
    if (!p || !kart) return;
    const total = session.karts.length;
    this.set(p, 'rank', kart.rank + '/' + total, () => { p.rank.innerHTML = `<b>${kart.rank}</b><sup>${ord(kart.rank).replace(/^\d+/, '')}</sup><span> / ${total}</span>`; });
    this.set(p, 'stage', session.cup.race, () => { p.stage.textContent = `Race ${session.cup.race} of ${session.cup.of} · ${session.def.name}`; });
    this.set(p, 'pname', kart.name, () => { p.pname.textContent = kart.name; });
    const pr = Math.max(0, Math.min(1, kart.maxD / session.track.finishD));
    this.set(p, 'pr', Math.round(pr * 200), () => { p.prog.style.width = pr * 100 + '%'; p.pct.textContent = Math.round(pr * 100) + '%'; });
    this.set(p, 'spd', Math.round(kart.speed * 3.6), (v) => { p.speed.textContent = v; });
    const frac = Math.round(Math.min(100, (kart.speed / (kart.vtop * 1.6)) * 100));
    this.set(p, 'arc', frac, () => p.arc.setAttribute('stroke-dasharray', `${frac} 100`));
    const T = session.raceTime;
    this.set(p, 'tm', Math.floor(T * 10), () => { const m = Math.floor(T / 60), sec = (T % 60).toFixed(1).padStart(4, '0'); p.timer.textContent = `Time ${String(m).padStart(2, '0')}:${sec}`; });
    if ((p.mmT = (p.mmT ?? 0) + 1) % 6 === 1) this.drawMini(p, session, kart);
    const dm = Math.round((kart.slip.draftTimer / 1.5) * 50);
    this.set(p, 'dm', dm + (kart.slip.inCone ? 'c' : ''), () => { p.draft.style.width = Math.min(100, (kart.slip.draftTimer / 1.5) * 100) + '%'; p.draft.parentElement.classList.toggle('hot', kart.slip.inCone); });
    // drift gauge
    const drifting = kart.fsm === FSM.DRIFTING;
    const dg = drifting ? Math.min(1, kart.drift.charge / 4) : 0;
    this.set(p, 'dg', Math.round(dg * 100) + (drifting ? 'd' : '') + kart.drift.tier, () => {
      p.drift.style.width = dg * 100 + '%';
      p.drift.style.background = kart.drift.tier ? DRIFT_TIERS[kart.drift.tier - 1].color : '#ffe9a0';
      p.driftWrap.classList.toggle('on', drifting);
    });
    // slots
    const lo = kart.loadout;
    const pk = lo.pickup ? ITEMS[lo.pickup] : null;
    this.set(p, 'pk', lo.pickup ?? '', () => { p.slotP.querySelector('.ic').textContent = pk ? pk.icon : '·'; p.slotP.classList.toggle('full', !!pk); p.slotP.querySelector('.lb').textContent = pk ? pk.name : 'ITEM'; });
    if (lo.weapon) {
      const W = WEAPONS[lo.weapon.id], tot = weaponCooldown(W, lo.weapon.level), f = Math.min(1, lo.weaponCd / tot);
      this.set(p, 'w', lo.weapon.id + lo.weapon.level, () => { p.slotW.querySelector('.ic').textContent = W.icon; p.slotW.querySelector('.lb').textContent = `${W.name.split(' ').slice(0, 2).join(' ')} Lv${lo.weapon.level}`; });
      this.set(p, 'wcd', Math.round(f * 40), () => { p.slotW.querySelector('.cd').style.height = f * 100 + '%'; p.slotW.classList.toggle('ready', f === 0); });
    } else this.set(p, 'w', 'none', () => { p.slotW.querySelector('.ic').textContent = '—'; p.slotW.querySelector('.lb').textContent = 'no weapon'; });
    if (lo.shield) {
      const S = SHIELDS[lo.shield.id], tot = shieldCooldown(S, lo.shield.level), f = Math.min(1, lo.shieldCd / tot);
      this.set(p, 's', lo.shield.id + lo.shield.level, () => { p.slotS.querySelector('.ic').textContent = S.icon; p.slotS.querySelector('.lb').textContent = `${S.name.split(' ').slice(0, 2).join(' ')} Lv${lo.shield.level}`; });
      this.set(p, 'scd', Math.round(f * 40) + (lo.shieldActive > 0 ? 'a' : ''), () => { p.slotS.querySelector('.cd').style.height = f * 100 + '%'; p.slotS.classList.toggle('ready', f === 0); p.slotS.classList.toggle('active', lo.shieldActive > 0); });
    } else this.set(p, 's', 'none', () => { p.slotS.querySelector('.ic').textContent = '—'; p.slotS.querySelector('.lb').textContent = 'no shield'; });
    // stat badges
    const ids = kart.statIds ?? [];
    this.set(p, 'bd', ids.join(','), () => { p.badges.innerHTML = ids.map((id) => `<span title="${STAT_BOOSTS[id].name}">${STAT_BOOSTS[id].icon}</span>`).join(''); });
    // overlays
    this.set(p, 'fe', kart.t.blind > 0, (v) => p.feathers.classList.toggle('on', v));
    this.set(p, 'st', kart.t.stink > 0, (v) => p.stink.classList.toggle('on', v));
    this.set(p, 'fin', kart.finished ? kart.rank : 0, (v) => { p.finish.classList.toggle('on', !!v); p.finish.innerHTML = v ? `<b>${ord(v)}</b><span>${session.humans.every((h) => h.finished) ? '' : 'waiting for the rest of the field…'}</span>` : ''; });
    // push-start
    const seq = session.starts.get(kart.id);
    const inCount = session.state === 'COUNTDOWN' && seq;
    p.rhythm.style.display = inCount ? 'block' : 'none';
    this.set(p, 'cnt', inCount ? seq.label() : session.raceTime < 1.4 ? 'DROP!' : '', (v) => { p.count.textContent = v; p.count.classList.toggle('drop', v === 'DROP!'); });
    if (inCount) {
      p.needle.style.left = gaugePos(seq.t) * 100 + '%';
      p.rhythm.classList.toggle('good', seq.flash === 'good'); p.rhythm.classList.toggle('bad', seq.flash === 'bad');
      this.set(p, 'sc', seq.score.toFixed(1), (v) => { p.score.innerHTML = `Judges' Scorecard <b>${v}</b> / 10`; });
      this.set(p, 'hint', 1, () => { p.hint.textContent = 'Tap TRICK/DRIFT in the green zone · hold THROTTLE only in the last 0.35 s!'; });
    } else { p.score.textContent = ''; p.hint.textContent = ''; p.cache.sc = p.cache.hint = null; }
    // toasts
    for (const m of session.messages) {
      if (m.human !== i) continue;
      const d = document.createElement('div');
      d.className = 'toast' + (m.big ? ' big' : ''); d.textContent = m.text; d.style.color = m.color;
      p.toasts.appendChild(d);
      while (p.toasts.children.length > 4) p.toasts.firstChild.remove();
      setTimeout(() => d.remove(), 2200);
    }
  }

  /** Circular per-player minimap (shown for 1-2 players). */
  drawMini(p, session, kart) {
    const c = p.mm; if (!c.offsetParent && c.style.display === 'none') return;
    const g = c.getContext('2d'), tr = session.track;
    if (!session._mm) {
      const pts = []; let a = 1e9, b = -1e9, d = 1e9, e = -1e9;
      for (let k = 0; k <= 2000; k += 8) { const P = tr.frames.P[k]; pts.push(P); a = Math.min(a, P.x); b = Math.max(b, P.x); d = Math.min(d, P.z); e = Math.max(e, P.z); }
      session._mm = { pts, a, b, d, e, s: 150 / Math.max(b - a, e - d), cx: (a + b) / 2, cz: (d + e) / 2 };
    }
    const m = session._mm, X = (x) => 100 + (x - m.cx) * m.s, Z = (z) => 100 + (z - m.cz) * m.s;
    g.clearRect(0, 0, 200, 200);
    g.fillStyle = '#2f7d4acc'; g.beginPath(); g.arc(100, 100, 98, 0, 7); g.fill();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = '#1b2a40'; g.lineWidth = 11; g.beginPath(); m.pts.forEach((P, k) => (k ? g.lineTo(X(P.x), Z(P.z)) : g.moveTo(X(P.x), Z(P.z)))); g.stroke();
    g.strokeStyle = '#f4f8ff'; g.lineWidth = 7; g.stroke();
    for (const sc of tr.shortcuts) { g.strokeStyle = '#ffcf4a'; g.lineWidth = 3; g.beginPath(); sc.frames.P.forEach((P, k) => { if (k % 6) return; const f = k ? g.lineTo : g.moveTo; f.call(g, X(P.x), Z(P.z)); }); g.stroke(); }
    session.karts.forEach((k) => { if (k === kart) return; g.fillStyle = k.isHuman ? PCOL[k.index % 4] : '#ffffff'; g.strokeStyle = '#000a'; g.lineWidth = 2; g.beginPath(); g.arc(X(k.pos.x), Z(k.pos.z), 5, 0, 7); g.fill(); g.stroke(); });
    g.fillStyle = '#ff2a2a'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(X(kart.pos.x), Z(kart.pos.z), 8, 0, 7); g.fill(); g.stroke();
  }

  /** 3P quadrant: minimap + standings */
  updateMini(session) {
    if (!this.mini) return;
    const m = this.mini, c = m.canvas, g = c.getContext('2d'), tr = session.track;
    if (!m.pts) {
      const pts = []; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let k = 0; k <= 2000; k += 10) { const P = tr.frames.P[k]; pts.push(P); minX = Math.min(minX, P.x); maxX = Math.max(maxX, P.x); minZ = Math.min(minZ, P.z); maxZ = Math.max(maxZ, P.z); }
      m.pts = pts; m.box = { minX, maxX, minZ, maxZ, s: 440 / Math.max(maxX - minX, maxZ - minZ) };
    }
    const b = m.box, X = (x) => 20 + (x - b.minX) * b.s, Z = (z) => 20 + (z - b.minZ) * b.s;
    g.clearRect(0, 0, c.width, c.height);
    g.lineWidth = 5; g.strokeStyle = '#ffffff55'; g.beginPath();
    m.pts.forEach((P, k) => (k ? g.lineTo(X(P.x), Z(P.z)) : g.moveTo(X(P.x), Z(P.z)))); g.stroke();
    session.karts.forEach((k) => { g.fillStyle = k.isHuman ? PCOL[k.index % 4] : '#ffffffaa'; g.beginPath(); g.arc(X(k.pos.x), Z(k.pos.z), k.isHuman ? 8 : 5, 0, 7); g.fill(); });
    const top = [...session.karts].sort((a, b2) => a.rank - b2.rank).slice(0, 8);
    const html = top.map((k) => `<div class="${k.isHuman ? 'h' : ''}"><b>${k.rank}</b> ${k.name}</div>`).join('');
    if (m.html !== html) { m.html = html; m.stand.innerHTML = html; }
  }
}
