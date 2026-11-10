/**
 * Room-code multiplayer transport (star topology: every player talks to the host; the host relays).
 *
 *  - 'peer' : WebRTC data channels brokered by the public PeerJS cloud. No game server: works from a static site,
 *             across the internet or on one Wi-Fi. The 4-digit room code maps to the host's peer id.
 *  - 'bc'   : BroadcastChannel between tabs of one browser - used by the automated tests and for trying it locally.
 *
 * Messages are small JSON objects with a `t` (type) field.
 */
const PREFIX = 'mowglikart-v2-';
export const newCode = () => String(1000 + Math.floor(Math.random() * 9000));

export class Net {
  constructor(isHost, code, kind) {
    this.isHost = isHost; this.code = code; this.kind = kind;
    this.id = isHost ? 'host' : 'c' + Math.random().toString(36).slice(2, 8);
    this.peers = new Map();   // host: clientId -> link
    this.link = null;         // client: link to host
    this.handlers = new Map(); this.waiters = []; this.queue = [];
    this.closed = false; this.raceHook = null;
    this.onPeerLeave = null; this.onPeerJoin = null; this.onClosed = null;
  }

  static async host(code, kind = 'peer') { const n = new Net(true, code, kind); await n._open(); return n; }
  static async join(code, kind = 'peer') { const n = new Net(false, code, kind); await n._open(); return n; }

  on(type, fn) { this.handlers.set(type, fn); return this; }
  off(type) { this.handlers.delete(type); }
  /** Resolve with the next message whose type is in `types` (queued ones first). Rejects if the connection drops. */
  next(types, timeoutMs = 0) {
    types = [].concat(types);
    const i = this.queue.findIndex((m) => types.includes(m.t));
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { types, resolve, reject };
      if (timeoutMs) w.timer = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); resolve(null); }, timeoutMs);
      this.waiters.push(w);
    });
  }
  _deliver(msg, from) {
    if (from) msg.from = from;
    const h = this.handlers.get(msg.t);
    if (h) { h(msg); return; }
    const i = this.waiters.findIndex((w) => w.types.includes(msg.t));
    if (i >= 0) { const w = this.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve(msg); return; }
    if (msg.t !== 's') { this.queue.push(msg); if (this.queue.length > 64) this.queue.shift(); }
  }
  _fail(reason) {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters) { clearTimeout(w.timer); w.reject(new Error(reason)); }
    this.waiters = []; this.onClosed?.(reason);
  }

  /** Host: to one client id or (to = null) everyone except `except`. Client: always to the host. */
  send(msg, to = null, except = null) {
    if (this.closed) return;
    if (!this.isHost) { this.link?.send(msg); return; }
    if (to) { this.peers.get(to)?.send(msg); return; }
    for (const [id, l] of this.peers) if (id !== except) l.send(msg);
  }
  get clientIds() { return [...this.peers.keys()]; }

  close() {
    this.closed = true;
    try { this._bc?.postMessage({ from: this.id, to: this.isHost ? '*' : 'host', bye: true }); this._bc?.close(); } catch { /* closing */ }
    try { this._peer?.destroy(); } catch { /* closing */ }
  }

  /* ------------------------------------------------------------------ transports */
  async _open() { return this.kind === 'bc' ? this._openBC() : this._openPeer(); }

  _hostAdd(id, send) {
    this.peers.set(id, { send });
    this.onPeerJoin?.(id);
  }
  _hostDrop(id) {
    if (!this.peers.delete(id)) return;
    this.onPeerLeave?.(id);
    this._deliver({ t: 'left' }, id);
  }

  _openBC() {
    const bc = this._bc = new BroadcastChannel(PREFIX + this.code);
    const post = (to, data) => bc.postMessage({ from: this.id, to, data });
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.to !== this.id && m.to !== '*') return;
      if (this.isHost) {
        if (m.hello) { this._hostAdd(m.from, (d) => post(m.from, d)); post(m.from, { t: '_welcome' }); return; }
        if (m.bye) { this._hostDrop(m.from); return; }
        if (this.peers.has(m.from)) this._deliver(m.data, m.from);
      } else if (m.from === 'host') {
        if (m.bye) { this._fail('The host left the room'); return; }
        this._deliver(m.data);
      }
    };
    if (this.isHost) return Promise.resolve();
    this.link = { send: (d) => post('host', d) };
    return new Promise((resolve, reject) => {
      let tries = 0;
      const hello = () => bc.postMessage({ from: this.id, to: 'host', hello: true });
      const iv = setInterval(() => { if (++tries > 20) { clearInterval(iv); reject(new Error('Room not found')); } else hello(); }, 250);
      this.next('_welcome').then(() => { clearInterval(iv); resolve(); });
      hello();
    });
  }

  async _openPeer() {
    const { Peer } = await import('peerjs');
    const peer = this._peer = this.isHost ? new Peer(PREFIX + this.code) : new Peer();
    await new Promise((resolve, reject) => {
      peer.on('open', resolve);
      peer.on('error', (e) => reject(new Error(e.type === 'unavailable-id' ? 'That room code is already in use - try again' : e.type === 'peer-unavailable' ? 'Room not found - check the code' : 'Connection problem: ' + e.type)));
    });
    peer.on('error', (e) => { if (!this.isHost && (e.type === 'peer-unavailable' || e.type === 'network')) this._fail(e.type === 'peer-unavailable' ? 'Room not found - check the code' : 'Connection lost'); });
    if (this.isHost) {
      peer.on('connection', (conn) => {
        conn.on('open', () => this._hostAdd(conn.peer, (d) => { try { conn.send(d); } catch { /* dropped */ } }));
        conn.on('data', (d) => this._deliver(d, conn.peer));
        conn.on('close', () => this._hostDrop(conn.peer));
        conn.on('error', () => this._hostDrop(conn.peer));
      });
      return;
    }
    const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.link = { send: (d) => { try { conn.send(d); } catch { /* dropped */ } } };
    conn.on('data', (d) => this._deliver(d));
    conn.on('close', () => this._fail('The host left the room'));
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Room not found - check the code')), 12000);
      conn.on('open', () => { clearTimeout(to); resolve(); });
      conn.on('error', (e) => { clearTimeout(to); reject(e); });
      this.onClosed = (r) => { clearTimeout(to); reject(new Error(r)); };
    });
    this.onClosed = null;
  }
}
