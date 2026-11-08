/** Tiny WebAudio synth so the game has feedback before any ElevenLabs/Suno assets exist (see ASSET_PIPELINE.md). */
export class AudioManager {
  constructor() { this.buffers = new Map(); this.ctx = null; this.master = null; this.muted = false; this.engine = null; this.focus = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
    // engine: two detuned saws through a lowpass
    const g = this.ctx.createGain(); g.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.engine = { g, lp, o1, o2 };
  }
  /** Optional audio files override the synth: public/assets/audio/<name>.mp3|ogg, listed in manifest.json by validate-assets. */
  async loadFiles(assets) {
    if (!this.ctx) return;
    const base = import.meta.env?.BASE_URL ?? './';
    for (const file of assets.audioNames ?? []) {
      try {
        const buf = await (await fetch(`${base}assets/audio/${file}`)).arrayBuffer();
        this.buffers.set(file.replace(/\.[^.]+$/, ''), await this.ctx.decodeAudioData(buf));
      } catch { /* keep the synth fallback */ }
    }
  }
  playBuffer(name, vol) {
    const b = this.buffers.get(name); if (!b) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = b; g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(); return true;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.35; return this.muted; }
  setFocus(kart) { this.focus = kart; }
  updateEngine(kart, active) {
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    if (!active || !kart) { e.g.gain.setTargetAtTime(0, t, 0.1); return; }
    const f = Math.min(1.4, kart.speed / 24);
    e.o1.frequency.setTargetAtTime(55 + f * 110 + (kart.isBoosting ? 40 : 0), t, 0.05);
    e.o2.frequency.setTargetAtTime(27 + f * 55, t, 0.05);
    e.lp.frequency.setTargetAtTime(350 + f * 900, t, 0.05);
    e.g.gain.setTargetAtTime(0.05 + 0.07 * f, t, 0.1);
  }
  _vol(kart) {
    if (!this.focus || !kart || kart === this.focus) return 1;
    const d = kart.pos.distanceTo(this.focus.pos);
    return d > 60 ? 0 : 1 - d / 60;
  }
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, freq = 1500) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  play(name, kart) {
    if (!this.ctx || this.muted) return;
    const v = this._vol(kart);
    if (v <= 0.02) return;
    const L = (x) => x * v;
    if (this.playBuffer(name, v)) return;
    switch (name) {
      case 'airhorn': this.tone(440, 0.7, 'sawtooth', L(0.3)); this.tone(554, 0.7, 'sawtooth', L(0.25)); break;
      case 'boost': this.tone(300, 0.35, 'sawtooth', L(0.2), 500); break;
      case 'spark': this.tone(1200, 0.08, 'square', L(0.08)); break;
      case 'whoosh': this.noise(0.5, L(0.25), 800); break;
      case 'crash': this.noise(0.25, L(0.35), 500); break;
      case 'tape': this.noise(0.18, L(0.25), 3500); break;
      case 'pickup': this.tone(660, 0.12, 'triangle', L(0.25)); this.tone(990, 0.15, 'triangle', L(0.2)); break;
      case 'chicken': this.tone(900, 0.2, 'sawtooth', L(0.2), -500); this.tone(700, 0.15, 'square', L(0.1), 200); break;
      case 'boom': this.noise(0.4, L(0.4), 300); break;
      case 'bonk': this.tone(160, 0.2, 'square', L(0.3), -80); break;
      case 'shield': this.tone(500, 0.3, 'sine', L(0.25), 400); break;
      case 'block': this.tone(1500, 0.1, 'square', L(0.2), -800); break;
      case 'squirt': this.noise(0.3, L(0.2), 2200); break;
      case 'nitro': this.tone(200, 0.6, 'sawtooth', L(0.3), 700); break;
      case 'whistle': this.tone(1400, 0.5, 'sine', L(0.15), -900); break;
      case 'roar': this.tone(95, 0.9, 'sawtooth', L(0.42), -45); this.tone(140, 0.7, 'square', L(0.2), -70); this.noise(0.8, L(0.28), 260); break;
      case 'cheer': this.noise(0.8, L(0.15), 1800); break;
      case 'thunk': this.tone(120, 0.15, 'sine', L(0.35), -50); break;
      case 'geyser': this.noise(0.6, L(0.3), 1000); break;
      default: break;
    }
  }
}
