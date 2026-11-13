import { describe, expect, it } from 'vitest';
import { getSpriteMeta } from '@/engine/bootstrapAssets';
import type { Combatant, CombatEvent, Stats, WorldMapDef } from '@/types/contracts';
import { blendPose, cameraPose, easeInOut, OVERWORLD_FRAMING, stepBlend } from './cameraRig';
import { cuesFromEvents, lungeCurve, stageLayout } from './combatStaging';
import { Breadcrumbs, stepFollower } from './followers';
import { blockedByColliders, hitsCollider, resolveMove, stickToWorld } from './movement';
import { buildProps, walkAreaDeck } from './props';
import { scatterFoliage } from './scatter';
import { cameraToWorld, facingFromHeading, parseHexColor, spriteFrameRect, worldToCamera } from './spriteMath';
import { chunkDistance, chunkLod, chunkOf, chunksInRadius, clampToPlayable, diffChunks, parseChunkKey } from './streaming';

const WORLD: WorldMapDef = {
  seed: 42,
  playerStart: { x: 120, z: 130 },
  regions: [{ id: 'town', name: 'Town', biome: 'frontier', center: { x: 120, z: 120 }, radius: 40, occupied: false, blurb: '' }],
  props: [],
  npcs: [],
  encounterZones: [],
  fishingSpots: [],
  paths: [{ points: [{ x: 0, z: 125 }, { x: 250, z: 125 }], width: 4 }],
  water: [{ center: { x: 220, z: 40 }, radius: 25, kind: 'lake' }],
};

describe('chunk streaming', () => {
  it('maps positions to chunks', () => {
    expect(chunkOf(10, 10).key).toBe('0,0');
    expect(chunkOf(-1, 251).key).toBe('-1,1');
    expect(parseChunkKey('-2,3')).toEqual({ cx: -2, cz: 3, key: '-2,3' });
    expect(parseChunkKey('nope')).toBeNull();
  });

  it('measures distance to a chunk footprint', () => {
    expect(chunkDistance(0, 0, { x: 125, z: 125 })).toBe(0);
    expect(chunkDistance(1, 0, { x: 125, z: 125 })).toBe(125);
    expect(chunkDistance(1, 1, { x: 125, z: 125 })).toBeCloseTo(Math.hypot(125, 125));
  });

  it('collects 9–21 chunks within 500 m, nearest first', () => {
    const list = chunksInRadius({ x: 125, z: 125 });
    expect(list.length).toBe(21);
    expect(list[0]?.key).toBe('0,0');
    expect(list.some((c) => c.key === '2,2')).toBe(false);
    expect(list.some((c) => c.key === '-2,0')).toBe(true);
    const ds = list.map((c) => chunkDistance(c.cx, c.cz, { x: 125, z: 125 }));
    for (let i = 1; i < ds.length; i++) expect(ds[i] ?? 0).toBeGreaterThanOrEqual(ds[i - 1] ?? 0);
  });

  it('diffs load/unload with hysteresis', () => {
    const first = diffChunks([], { x: 125, z: 125 });
    expect(first.load.length).toBe(21);
    const loaded = first.load.map((c) => c.key);
    // small move: nothing changes
    const same = diffChunks(loaded, { x: 140, z: 125 });
    expect(same.load).toHaveLength(0);
    expect(same.unload).toHaveLength(0);
    // −2,0 is 375 m away at x=125; at x=150 it is 400 m (< 500) – still kept.
    // Move east so that chunk −2,0 is 520 m away: within hysteresis, kept.
    const edge = diffChunks(loaded, { x: 270, z: 125 });
    expect(edge.unload).not.toContain('-2,0');
    expect(edge.load.some((c) => c.key === '3,0')).toBe(true);
    // far enough: dropped
    const far = diffChunks(loaded, { x: 320, z: 125 });
    expect(far.unload).toContain('-2,0');
  });

  it('picks LOD by ring and clamps the player', () => {
    expect(chunkLod(0, 0).tier).toBe(0);
    expect(chunkLod(1, -1)).toMatchObject({ tier: 1, water: true, foliage: 'sparse' });
    expect(chunkLod(-2, 0)).toMatchObject({ tier: 2, water: false, foliage: 'none' });
    expect(chunkLod(2, 0).resolution).toBeLessThanOrEqual(49);
    expect(clampToPlayable(-100, 400)).toEqual({ x: -60, z: 310 });
  });
});

describe('sprite math', () => {
  it('quantises camera-relative facing (0 = toward camera, clockwise)', () => {
    expect(facingFromHeading(Math.PI / 2)).toBe(0); // +z toward camera = S
    expect(facingFromHeading(Math.PI)).toBe(2); // −x = screen left = W
    expect(facingFromHeading(-Math.PI / 2)).toBe(4); // away = N
    expect(facingFromHeading(0)).toBe(6); // +x = E
    expect(facingFromHeading((3 * Math.PI) / 4)).toBe(1); // SW
    expect(facingFromHeading(0.3)).toBe(6); // snaps
  });

  it('rotates facing with camera yaw', () => {
    // camera swung a quarter turn: east now points toward the camera
    expect(facingFromHeading(0, Math.PI / 2)).toBe(0);
    const w = cameraToWorld(0.3, -0.7, 1.1);
    const l = worldToCamera(w.x, w.z, 1.1);
    expect(l.lx).toBeCloseTo(0.3);
    expect(l.lz).toBeCloseTo(-0.7);
  });

  it('computes 8-way UV frames from sheet meta', () => {
    const meta = getSpriteMeta('hero.kael');
    const [ox, oy, sx, sy] = spriteFrameRect(meta, 0, 'idle', 0);
    expect(ox).toBe(0);
    expect(sx).toBeCloseTo(1 / meta.cols);
    expect(sy).toBeCloseTo(1 / meta.rows);
    expect(oy).toBeCloseTo(1 - 1 / meta.rows); // row 0 at the top in GL space
    const walk = meta.anims.walk;
    expect(walk).toBeDefined();
    const [wx, wy] = spriteFrameRect(meta, 4, 'walk', 1 / (walk?.fps ?? 1) + 0.01);
    expect(wx).toBeCloseTo(((walk?.from ?? 0) + 1) / meta.cols);
    expect(wy).toBeCloseTo(1 - 5 / meta.rows);
  });

  it('parses colours', () => {
    expect(parseHexColor('#ff0000')).toEqual([1, 0, 0]);
    expect(parseHexColor('#fff')).toEqual([1, 1, 1]);
    expect(parseHexColor(undefined)).toEqual([1, 1, 1]);
  });
});

describe('followers', () => {
  it('samples points behind the leader along the trail', () => {
    const t = new Breadcrumbs(0.5);
    t.reset(0, 0);
    for (let x = 0.5; x <= 10; x += 0.5) t.push(x, 0);
    // turn the corner
    for (let z = 0.5; z <= 4; z += 0.5) t.push(10, z);
    const p = t.sampleBehind(1.5, 10, 4);
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(2.5);
    const q = t.sampleBehind(6, 10, 4); // around the corner
    expect(q.z).toBeCloseTo(0);
    expect(q.x).toBeCloseTo(8);
    const end = t.sampleBehind(999, 10, 4);
    expect(end).toEqual({ x: 0, z: 0 });
  });

  it('ignores sub-spacing jitter and caps memory', () => {
    const t = new Breadcrumbs(0.3, 10);
    t.reset(0, 0);
    expect(t.push(0.1, 0)).toBe(false);
    for (let i = 1; i < 50; i++) t.push(i, 0);
    expect(t.length).toBe(10);
  });

  it('steps followers toward targets and teleports when lost', () => {
    const p = { x: 0, z: 0 };
    stepFollower(p, { x: 10, z: 0 }, 0.1, 5);
    expect(p.x).toBeGreaterThan(0.5);
    expect(p.x).toBeLessThan(1);
    stepFollower(p, { x: 100, z: 0 }, 0.1, 5);
    expect(p.x).toBe(100);
  });
});

describe('movement', () => {
  it('maps the stick camera-relatively with a deadzone', () => {
    expect(stickToWorld(0.05, 0, 0).mag).toBe(0);
    const up = stickToWorld(0, -1, 0);
    expect(up.z).toBeCloseTo(-1);
    expect(up.mag).toBeCloseTo(1);
  });

  it('collides with circles and rotated boxes and slides', () => {
    expect(hitsCollider({ kind: 'circle', x: 0, z: 0, r: 1 }, 1.2, 0)).toBe(true);
    const box = { kind: 'box' as const, x: 0, z: 0, hx: 3, hz: 0.2, rot: Math.PI / 2 };
    expect(hitsCollider(box, 0, 2.5)).toBe(true); // rotated: long axis along z
    expect(hitsCollider(box, 2.5, 0)).toBe(false);
    const wall = [{ kind: 'box' as const, x: 5, z: 0, hx: 0.5, hz: 10, rot: 0 }];
    const r = resolveMove(4, 0, 0.5, 0.5, (x, z) => !blockedByColliders(wall, x, z));
    expect(r.blocked).toBe(true);
    expect(r.x).toBe(4);
    expect(r.z).toBe(0.5);
  });
});

describe('foliage scatter', () => {
  it('is deterministic per chunk and avoids paths, water and exclusions', () => {
    const a = scatterFoliage(WORLD, 0, 0, { density: 'dense', exclusions: [{ x: 60, z: 60, r: 10 }] });
    const b = scatterFoliage(WORLD, 0, 0, { density: 'dense', exclusions: [{ x: 60, z: 60, r: 10 }] });
    expect(a.length).toBeGreaterThan(500);
    expect(a).toEqual(b);
    for (const f of a) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(250);
      expect(Math.hypot(f.x - 60, f.z - 60)).toBeGreaterThan(10);
      if (f.kind === 'tree' || f.kind === 'pine') expect(Math.abs(f.z - 125)).toBeGreaterThan(5);
      if (f.kind !== 'reed') expect(Math.hypot(f.x - 220, f.z - 40)).toBeGreaterThan(18);
    }
    const other = scatterFoliage(WORLD, 1, 0, { density: 'dense' });
    expect(other).not.toEqual(a);
    expect(scatterFoliage(WORLD, 3, 3, { density: 'none' })).toHaveLength(0);
    const sparse = scatterFoliage(WORLD, 1, 0, { density: 'sparse' });
    expect(sparse.length).toBeLessThan(other.length);
  });
});

describe('props', () => {
  it('builds merged geometry, colliders and dock walk areas', () => {
    const b = buildProps(WORLD, [
      { kind: 'house', x: 100, z: 100, rotation: 0, scale: 1 },
      { kind: 'dock', x: 220, z: 40, rotation: Math.PI / 2, scale: 1 },
    ]);
    expect(b.positions.length / 3).toBe(b.normals.length / 3);
    expect(b.uvs.length / 2).toBe(b.positions.length / 3);
    expect(Math.max(...b.indices)).toBeLessThan(b.positions.length / 3);
    expect(blockedByColliders(b.colliders, 100, 100)).toBe(true);
    expect(blockedByColliders(b.colliders, 110, 100)).toBe(false);
    // dock rotated 90°: long axis along x
    expect(walkAreaDeck(b.walkAreas, 226, 40)).not.toBeNull();
    expect(walkAreaDeck(b.walkAreas, 220, 46)).toBeNull();
  });
});

describe('combat staging + camera', () => {
  const stats: Stats = { maxHp: 1, maxAp: 1, atk: 1, def: 1, mag: 1, res: 1, spd: 1, luck: 0 };
  const mk = (id: string, side: 'party' | 'enemy'): Combatant => ({
    id, side, name: id, sprite: 'x', level: 1, baseStats: stats, baseAffinities: {}, baseSkills: [], hp: 1, ap: 1, sync: 0, alive: true, guarding: false, statuses: [], fusion: null, dragon: null, hooks: [],
  });

  it('lines the party up left of the anchor facing enemies on the right', () => {
    const layout = stageLayout([mk('hero:kael', 'party'), mk('hero:tobin', 'party'), mk('enemy:0:a', 'enemy')], { x: 50, z: 50 });
    const k = layout.get('hero:kael');
    const e = layout.get('enemy:0:a');
    expect(k && e).toBeTruthy();
    expect(k?.x ?? 99).toBeLessThan(50);
    expect(e?.x ?? 0).toBeGreaterThan(50);
    expect(k?.heading).toBe(0);
    expect(e?.heading).toBe(Math.PI);
    expect(layout.get('hero:tobin')?.z).not.toBe(k?.z);
  });

  it('turns log events into staggered cues', () => {
    const events: CombatEvent[] = [
      { type: 'attack', actorId: 'hero:kael', targetId: 'enemy:0:a', element: 'physical' },
      { type: 'damage', targetId: 'enemy:0:a', amount: 9, element: 'physical', crit: false, affinity: 'neutral', absorbedByArmor: 0 },
      { type: 'ko', targetId: 'enemy:0:a' },
    ];
    const cues = cuesFromEvents(events);
    expect(cues.map((c) => c.kind)).toEqual(['lunge', 'hit', 'ko']);
    expect(cues[1]?.delay ?? 0).toBeGreaterThan(cues[0]?.delay ?? 0);
    expect(lungeCurve(0.15)).toBeCloseTo(1);
    expect(lungeCurve(1)).toBe(0);
  });

  it('frames and blends camera poses', () => {
    const pose = cameraPose({ x: 0, y: 0, z: 0 }, OVERWORLD_FRAMING);
    expect(pose.pos.z).toBeGreaterThan(0);
    expect(pose.pos.y).toBeGreaterThan(pose.look.y);
    const mid = blendPose(pose, { pos: { x: 10, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } }, 0.5);
    expect(mid.pos.x).toBeCloseTo(5);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(stepBlend(0, 1, 0.4, 0.8)).toBeCloseTo(0.5);
    expect(stepBlend(0.1, 0, 1)).toBe(0);
  });
});
