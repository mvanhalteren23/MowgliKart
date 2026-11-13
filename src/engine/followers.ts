/**
 * Breadcrumb following for party members (pure, three-free).
 * The leader drops crumbs as it walks; follower N stands N × gap metres back
 * along that trail, so the party snakes around corners instead of cutting them.
 */

export const FOLLOW_GAP = 1.5;
export const CRUMB_SPACING = 0.3;

export interface Point {
  x: number;
  z: number;
}

export class Breadcrumbs {
  private readonly xs: number[] = [];
  private readonly zs: number[] = [];

  constructor(
    readonly spacing: number = CRUMB_SPACING,
    readonly maxPoints: number = 256,
  ) {}

  get length(): number {
    return this.xs.length;
  }

  /** Clear the trail and seed it with a single point. */
  reset(x: number, z: number): void {
    this.xs.length = 0;
    this.zs.length = 0;
    this.xs.push(x);
    this.zs.push(z);
  }

  /** Record the leader position; returns true when a crumb was dropped. */
  push(x: number, z: number): boolean {
    const n = this.xs.length;
    const lx = this.xs[n - 1];
    const lz = this.zs[n - 1];
    if (lx !== undefined && lz !== undefined && Math.hypot(x - lx, z - lz) < this.spacing) return false;
    this.xs.push(x);
    this.zs.push(z);
    if (this.xs.length > this.maxPoints) {
      this.xs.shift();
      this.zs.shift();
    }
    return true;
  }

  /**
   * Point `distance` metres behind the head (the leader's live position),
   * measured along the trail. Falls back to the oldest crumb.
   */
  sampleBehind(distance: number, headX: number, headZ: number, out: Point = { x: 0, z: 0 }): Point {
    let px = headX;
    let pz = headZ;
    let remaining = distance;
    for (let i = this.xs.length - 1; i >= 0; i--) {
      const qx = this.xs[i] ?? px;
      const qz = this.zs[i] ?? pz;
      const seg = Math.hypot(qx - px, qz - pz);
      if (seg >= remaining && seg > 0) {
        const t = remaining / seg;
        out.x = px + (qx - px) * t;
        out.z = pz + (qz - pz) * t;
        return out;
      }
      remaining -= seg;
      px = qx;
      pz = qz;
    }
    out.x = px;
    out.z = pz;
    return out;
  }
}

/**
 * Move a follower toward its trail target. Followers walk a touch faster than
 * the leader when lagging and snap into place if hopelessly far (teleports).
 * Returns the distance moved this step.
 */
export function stepFollower(pos: Point, target: Point, dt: number, baseSpeed: number): number {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 25) {
    pos.x = target.x;
    pos.z = target.z;
    return 0;
  }
  if (d < 0.08) return 0;
  const speed = baseSpeed * (d > 2 ? 1.35 : d > 0.6 ? 1.05 : 0.8);
  const step = Math.min(d, speed * dt);
  pos.x += (dx / d) * step;
  pos.z += (dz / d) * step;
  return step;
}
