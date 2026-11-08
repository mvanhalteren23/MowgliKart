/** Fixed-timestep physics accumulator (60 Hz) + variable-rate render with interpolation alpha. */
export const STEP = 1 / 60;
export class GameLoop {
  constructor({ step, render, poll }) {
    this.step = step; this.render = render; this.poll = poll;
    this.acc = 0; this.last = 0; this.running = false; this.paused = false; this.raf = 0;
    this._frame = this._frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now(); this.acc = 0;
    this.raf = requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  _frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.poll?.();
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 5) this.acc = 0;
    }
    this.render(this.paused ? 1 : this.acc / STEP, this.paused ? 0 : dt);
    this.raf = requestAnimationFrame(this._frame);
  }
}
