// Red Bull-style summit Push-Start + Judges' Style Score (SPEC 3.3.1)
export const COUNTDOWN = 3.5;       // 3... 2... 1... DROP!
export const RHYTHM_PERIOD = 0.7;   // seconds per gauge sweep
export const GREEN = [0.38, 0.62];  // green zone of the 0..1 gauge

/** Gauge position at time t: triangle wave 0..1. */
export const gaugePos = (t) => { const p = (t / RHYTHM_PERIOD) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };

/**
 * One per racer. Feed it presses/throttle state through the countdown, then it yields a launch result.
 *   Score: 6.0 -> 10.0 (green presses +1.0, misses -0.4)
 *   Launch: >=9.0 Perfect 10 (1.40x/1.6s) | 7.5-9.0 Clean Push (1.20x/1.0s) | blown gasket (0.45x/0.9s)
 */
export class StartSequence {
  constructor(isHuman = true) {
    this.isHuman = isHuman;
    this.t = 0;
    this.score = 6.0;
    this.lastPress = -1;
    this.throttleSince = null;
    this.hits = 0; this.misses = 0;
    this.flash = null;
    this.result = null;
  }
  press() {
    if (this.t - this.lastPress < 0.22 || this.t >= COUNTDOWN) return;
    this.lastPress = this.t;
    const g = gaugePos(this.t);
    if (g >= GREEN[0] && g <= GREEN[1]) { this.score = Math.min(10, this.score + 1.0); this.hits++; this.flash = 'good'; }
    else { this.score = Math.max(6, this.score - 0.4); this.misses++; this.flash = 'bad'; }
  }
  setThrottle(down) {
    if (down && this.throttleSince === null) this.throttleSince = this.t;
    if (!down) this.throttleSince = null;
  }
  update(dt, throttleDown) {
    if (this.t >= COUNTDOWN) return;
    this.t = Math.min(COUNTDOWN, this.t + dt);
    this.setThrottle(throttleDown);
    this.flash = this.flash && this.t - this.lastPress > 0.35 ? null : this.flash;
    if (this.t >= COUNTDOWN) this._finish();
  }
  _finish() {
    const held = this.throttleSince !== null;
    let kind = 'none';
    if (held && this.throttleSince < 3.0) kind = 'stall';
    else if (held && this.throttleSince >= 3.5 - 0.35) {
      if (this.score >= 9.0) kind = 'perfect';
      else if (this.score >= 7.5) kind = 'clean';
    }
    this.result = { kind, score: this.score, ...({
      perfect: { mult: 1.40, dur: 1.6, label: 'PERFECT 10! Gold sparks', color: '#ffd700' },
      clean: { mult: 1.20, dur: 1.0, label: 'Clean Push', color: '#8be9fd' },
      stall: { mult: 0.45, dur: 0.9, label: 'BLOWN GASKET!', color: '#9aa0a6' },
      none: { mult: 1, dur: 0, label: 'Rolling start', color: '#ffffff' },
    }[kind]) };
  }
  /** Countdown label: "3", "2", "1", "DROP!" */
  label() {
    if (this.t >= COUNTDOWN) return 'DROP!';
    return String(Math.max(1, 3 - Math.floor(this.t)));
  }
  /** AI performs the push with a randomized Judges' Score between 7.0 and 9.5 and a well-timed throttle. */
  static ai(rnd) {
    const s = new StartSequence(false);
    s.score = 7.0 + rnd() * 2.5;
    s.aiThrottleAt = 3.2 + rnd() * 0.12;
    return s;
  }
}
