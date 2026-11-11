/** Fixed-timestep physics accumulator (60 Hz) + variable-rate render with interpolation alpha. */
export const STEP = 1 / 60;
export class GameLoop {
  constructor({ step, render, poll, driver = null }) {
    this.step = step; this.render = render; this.poll = poll; this.driver = driver; // driver: { set(fn) } e.g. renderer.setAnimationLoop (needed for WebXR)
    this.acc = 0; this.last = 0; this.running = false; this.paused = false; this.raf = 0;
    this._frame = this._frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now(); this.acc = 0;
    if (this.driver) this.driver.set(this._frame); else this.raf = requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; if (this.driver) this.driver.set(null); else cancelAnimationFrame(this.raf); }
  _frame(now) {
    if (!this.running) return;
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); // frame timestamps can predate start() after a long build
    this.last = now;
    this.poll?.();
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 3) { this.step(STEP); this.acc -= STEP; n++; } // max 3 catch-up steps: a slow frame slows the game a little instead of snowballing
      if (n === 3) this.acc = Math.min(this.acc, STEP);
    }
    this.render(this.paused ? 1 : this.acc / STEP, this.paused ? 0 : dt);
    if (!this.driver) this.raf = requestAnimationFrame(this._frame);
  }
}
