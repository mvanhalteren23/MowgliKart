import { describe, expect, it } from 'vitest';
import { biomeAt } from '@/engine/bootstrapAssets';
import type { BiomeChunkDef, BiomeId, Combatant, HeroDef, HeroId, Stats, TraversalGateDef, WorldMapDef } from '@/types/contracts';
import { atmosphereAt, BIOME_ATMOSPHERE, dampAtmosphere, FOLIAGE_PROFILES, pickBigFoliage, pickSmallFoliage, scatterDressing } from './biomes';
import { fitDistance, stageExtent, stageLayout, STAGE_GAP } from './combatStaging';
import { buildGateGeometry } from './gateKit';
import { followerLandings, gateCleared, gateCollider, gateDistance, gateFlagKey, leapHops, MIN_DRAW, nearerSide, shotRay, traversalEnds, traversalSample, whoCanClear } from './gates';
import { ColliderGrid, hitsCollider } from './movement';
import { buildKindTemplate, popScale, propColliders, PROP_CLEARANCE } from './props';
import { scatterFoliage } from './scatter';
import { chunkTier, clampToContinent, continentAllows, continentBounds, distanceToChunks, softWallAllows, SOFT_WALL } from './streaming';

const COORDS: readonly (readonly [number, number, BiomeId])[] = [
  [0, -2, 'tundra'], [-1, -2, 'highland'], [0, -1, 'forest'], [-1, -1, 'marsh'], [0, 0, 'frontier'],
  [-1, 0, 'coast'], [-2, 0, 'desert'], [-2, 1, 'volcanic'], [-1, 1, 'ruin'], [0, 1, 'skyreach'],
];

const SCATTER: Readonly<Partial<Record<BiomeId, BiomeChunkDef['scatterProps']>>> = {
  tundra: ['iceSpire', 'tent'],
  desert: ['cactus', 'obelisk'],
  marsh: ['mangrove', 'stiltHouse'],
  volcanic: ['basalt', 'crystal'],
  highland: ['windmill', 'tower'],
};

const CHUNKS: readonly BiomeChunkDef[] = COORDS.map(([cx, cz, biome]) => ({
  cx, cz, name: `${biome} reach`, biome, act: 1, scatterProps: SCATTER[biome] ?? [], foliageDensity: biome === 'desert' || biome === 'volcanic' ? 0.15 : 1,
}));

const GATE: TraversalGateDef = {
  id: 'gate.rockfall', kind: 'boulder', label: 'Rockfall', position: { x: 125, z: -10 }, width: 8, depth: 3, rotation: 0,
  sides: [{ x: 125, z: -15 }, { x: 125, z: -5 }], clearsPermanently: true,
};

const WORLD: WorldMapDef = {
  seed: 7,
  playerStart: { x: 120, z: 130 },
  regions: [{ id: 'town', name: 'Town', biome: 'frontier', center: { x: 120, z: 120 }, radius: 40, occupied: false, blurb: '' }],
  props: [],
  npcs: [],
  encounterZones: [],
  fishingSpots: [],
  paths: [{ points: [{ x: -400, z: 125 }, { x: 250, z: 125 }], width: 4 }],
  water: [{ center: { x: -125, z: -125 }, radius: 40, kind: 'lake' }],
  chunks: CHUNKS,
  traversalGates: [GATE],
};

describe('continental clamp + soft wall', () => {
  it('derives the bounding box of the authored chunks plus a margin', () => {
    expect(continentBounds(CHUNKS, 40)).toEqual({ minX: -540, maxX: 290, minZ: -540, maxZ: 540 });
    expect(continentBounds([], 40)).toEqual({ minX: -40, maxX: 290, minZ: -40, maxZ: 290 });
  });

  it('measures distance to the nearest authored chunk', () => {
    expect(distanceToChunks(CHUNKS, 100, 100)).toBe(0);
    expect(distanceToChunks(CHUNKS, 270, 100)).toBe(20);
    // (-2,-1) is a notch in the continent: unauthored
    expect(distanceToChunks(CHUNKS, -375, -125)).toBe(125);
  });

  it('lets the player wander ~40 m into wilderness then walls them softly', () => {
    expect(softWallAllows(CHUNKS, 260, 100, 285, 100)).toBe(true); // 35 m out
    expect(softWallAllows(CHUNKS, 285, 100, 295, 100)).toBe(false); // 45 m out, going deeper
    expect(softWallAllows(CHUNKS, 300, 100, 295, 100)).toBe(true); // stranded outside: may walk back
    // Notch: inside the bounding box but far from authored land.
    const b = continentBounds(CHUNKS);
    expect(continentAllows(CHUNKS, b, -260, -125, -270, -125)).toBe(true); // 20 m into the notch
    expect(continentAllows(CHUNKS, b, -280, -125, -300, -125)).toBe(false); // 50 m in
    expect(continentAllows(CHUNKS, b, 285, 100, 291, 100)).toBe(false); // outside the box
  });

  it('clamps teleports back onto the playable continent', () => {
    const far = clampToContinent(CHUNKS, 2000, 100);
    expect(far.x).toBe(290);
    const notch = clampToContinent(CHUNKS, -375, -125);
    expect(distanceToChunks(CHUNKS, notch.x, notch.z)).toBeLessThanOrEqual(SOFT_WALL);
    expect(clampToContinent(CHUNKS, 100, 100)).toEqual({ x: 100, z: 100 });
  });

  it('assigns detail rings from player distance with hysteresis', () => {
    const p = { x: 125, z: 125 };
    expect(chunkTier(0, 0, p)).toBe(0);
    expect(chunkTier(1, 0, p)).toBe(1); // 125 m away
    expect(chunkTier(2, 0, p)).toBe(2);
    const edge = { x: 125, z: 125 };
    // a chunk at 80 m: new → mid ring, already near → stays near (hysteresis)
    const q = { x: 250 + 80, z: edge.z };
    expect(chunkTier(0, 0, q)).toBe(1);
    expect(chunkTier(0, 0, q, 0)).toBe(0);
    expect(chunkTier(0, 0, { x: 250 + 110, z: 125 }, 0)).toBe(1);
  });
});

describe('traversal gates', () => {
  const heroes = {
    kael: { fieldActions: ['fish', 'drakeSight'] },
    tobin: { fieldActions: ['huntShot', 'grapple'] },
    vesna: { fieldActions: ['huntDash', 'roll'] },
  } as unknown as Readonly<Record<HeroId, HeroDef>>;

  it('clears permanently from the canonical event flag only', () => {
    expect(gateFlagKey(GATE)).toBe('evt:field:roll:gate.rockfall');
    expect(gateCleared(GATE, {})).toBe(false);
    expect(gateCleared(GATE, { 'evt:field:roll:gate.rockfall': 1 })).toBe(true);
    expect(gateCleared({ ...GATE, clearsPermanently: false }, { 'evt:field:roll:gate.rockfall': 3 })).toBe(false);
  });

  it('measures proximity to the rotated footprint and blocks movement', () => {
    expect(gateDistance(GATE, { x: 125, z: -10 })).toBe(0);
    expect(gateDistance(GATE, { x: 125, z: -4.5 })).toBeCloseTo(4);
    const rotated = { ...GATE, rotation: Math.PI / 2 };
    expect(gateDistance(rotated, { x: 125, z: -4.5 })).toBeCloseTo(1.5); // width now runs along z
    const c = gateCollider(GATE);
    expect(hitsCollider(c, 125, -10)).toBe(true);
    expect(hitsCollider(c, 125, -4)).toBe(false);
  });

  it('picks the nearer side and the hero who can clear it', () => {
    expect(nearerSide(GATE, { x: 124, z: -16 })).toBe(0);
    expect(nearerSide(GATE, { x: 126, z: -2 })).toBe(1);
    expect(traversalEnds(GATE, { x: 126, z: -2 })).toEqual({ from: { x: 125, z: -5 }, to: { x: 125, z: -15 } });
    expect(whoCanClear(GATE, 'kael', ['kael', 'tobin', 'vesna'], heroes)).toBe('vesna');
    expect(whoCanClear({ ...GATE, kind: 'cliff' }, 'vesna', ['kael', 'tobin', 'vesna'], heroes)).toBe('tobin');
    expect(whoCanClear({ ...GATE, kind: 'ward' }, 'kael', ['kael', 'tobin', 'vesna'], heroes)).toBeNull();
  });

  it('interpolates every traversal kind from the near side to the far side', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 0, z: 10 };
    for (const kind of ['boulder', 'chasm', 'cliff', 'river', 'grove', 'ward'] as const) {
      const a = traversalSample(kind, from, to, 0);
      const b = traversalSample(kind, from, to, 1);
      expect(a.z).toBeCloseTo(0);
      expect(b.z).toBeCloseTo(10);
      expect(b.lift).toBeCloseTo(0, 5);
      expect(b.gateFx).toBe(1);
      for (let t = 0; t <= 1; t += 0.05) {
        const s = traversalSample(kind, from, to, t);
        expect(s.z).toBeGreaterThanOrEqual(-1e-9);
        expect(s.z).toBeLessThanOrEqual(10 + 1e-9);
        expect(s.lift).toBeGreaterThanOrEqual(-1e-9);
      }
    }
    // glide arcs high mid-way; grapple rises before moving over the lip
    expect(traversalSample('chasm', from, to, 0.55).lift).toBeGreaterThan(2);
    const grapple = traversalSample('cliff', from, to, 0.7);
    expect(grapple.lift).toBeGreaterThan(3);
    expect(grapple.z).toBeLessThan(6);
    // grove / ward: the leader waits while the gate opens
    expect(traversalSample('grove', from, to, 0.3).z).toBe(0);
    expect(traversalSample('ward', from, to, 0.4).gateFx).toBe(1);
    // leap: lands between hops
    const hops = leapHops(10);
    expect(hops).toBe(3);
    expect(traversalSample('river', from, to, 1 / hops).lift).toBeCloseTo(0, 5);
    expect(traversalSample('river', from, to, 0.5 / hops).lift).toBeGreaterThan(1);
  });

  it('lands followers abreast on the far side', () => {
    const l = followerLandings({ x: 0, z: 0 }, { x: 0, z: 10 }, 3, 1.3);
    expect(l).toHaveLength(3);
    for (const p of l) expect(p.z).toBeGreaterThan(10);
    expect(Math.sign(l[0]?.x ?? 0)).toBe(-Math.sign(l[1]?.x ?? 0));
  });

  it('builds a gate visual for every kind', () => {
    for (const kind of ['boulder', 'chasm', 'cliff', 'river', 'grove', 'ward'] as const) {
      const b = buildGateGeometry({ ...GATE, kind });
      expect(b.indices.length).toBeGreaterThan(0);
      expect(Math.max(...b.indices)).toBeLessThan(b.vertexCount);
    }
  });
});

describe('hunting aim', () => {
  it('turns an aim angle + draw into a shot ray', () => {
    const r = shotRay({ x: 10, z: 10 }, Math.PI / 2, 1, 30);
    expect(r.range).toBe(30);
    expect(r.end.x).toBeCloseTo(10);
    expect(r.end.z).toBeCloseTo(40);
    const weak = shotRay({ x: 0, z: 0 }, 0, 0.05, 30);
    expect(weak.range).toBeCloseTo(30 * MIN_DRAW);
    expect(weak.end.x).toBeCloseTo(7.5);
    expect(shotRay({ x: 0, z: 0 }, Math.PI, 0.5, 20).end.x).toBeCloseTo(-10);
  });
});

describe('biome scatter', () => {
  const desert = CHUNKS.find((c) => c.biome === 'desert');
  const marsh = CHUNKS.find((c) => c.biome === 'marsh');
  const ex = [{ x: -400, z: 60, r: 25 }];

  it('dresses chunks deterministically with exclusions, paths and spacing respected', () => {
    if (!desert || !marsh) throw new Error('fixture');
    const a = scatterDressing(WORLD, desert, { exclusions: ex });
    const b = scatterDressing(WORLD, desert, { exclusions: ex });
    expect(a).toEqual(b);
    expect(a.some((p) => p.kind === 'cactus')).toBe(true);
    expect(a.some((p) => p.kind === 'obelisk')).toBe(true);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(-500);
      expect(p.x).toBeLessThanOrEqual(-250);
      expect(Math.hypot(p.x + 400, p.z - 60)).toBeGreaterThan(25);
      expect(Math.abs(p.z - 125)).toBeGreaterThan(2 + PROP_CLEARANCE[p.kind] * 0.8 - 0.01);
    }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const p = a[i];
      const q = a[j];
      if (!p || !q) continue;
      expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan((PROP_CLEARANCE[p.kind] * p.scale + PROP_CLEARANCE[q.kind] * q.scale) * 0.7 - 1e-6);
    }
    expect(scatterDressing(WORLD, marsh)).not.toEqual(a);
    expect(scatterDressing(WORLD, { ...desert, scatterProps: [] })).toHaveLength(0);
  });

  it('varies foliage by biome', () => {
    const forest = scatterFoliage(WORLD, 0, -1, { density: 'dense' });
    const sand = scatterFoliage(WORLD, -2, 0, { density: 'dense' });
    const tundra = scatterFoliage(WORLD, 0, -2, { density: 'dense' });
    expect(forest).toEqual(scatterFoliage(WORLD, 0, -1, { density: 'dense' }));
    expect(sand.length).toBeLessThan(forest.length / 3);
    const trees = tundra.filter((f) => f.kind === 'tree' || f.kind === 'pine');
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.every((f) => f.kind === 'pine')).toBe(true);
    // marsh grows dry-land reeds, the desert none
    expect(pickSmallFoliage(FOLIAGE_PROFILES.marsh, 0.1, 0, 1)).toBe('reed');
    expect(pickSmallFoliage(FOLIAGE_PROFILES.desert, 0.1, 0, 1)).not.toBe('reed');
    expect(pickBigFoliage(FOLIAGE_PROFILES.volcanic, 0.2, 0.5, 0.9, 0, 0.15, false)).not.toBe('tree');
  });

  it('gives every new prop kind geometry and colliders', () => {
    for (const kind of ['tent', 'windmill', 'sails', 'tower', 'fortWall', 'gateArch', 'bridge', 'cactus', 'iceSpire', 'mangrove', 'basalt', 'crystal', 'obelisk', 'cathedral', 'stiltHouse', 'skyPlatform', 'statue'] as const) {
      const b = buildKindTemplate(kind);
      expect(b.indices.length, kind).toBeGreaterThan(0);
      expect(Math.max(...b.indices)).toBeLessThan(b.vertexCount);
      if (kind !== 'sails' && kind !== 'bridge') expect(b.colliders.length, kind).toBeGreaterThan(0);
    }
    expect(buildKindTemplate('crystal').emissive.some((g) => g > 0.4)).toBe(true);
    const placed = propColliders(WORLD, { kind: 'fortWall', x: 50, z: 50, rotation: Math.PI / 2, scale: 1 });
    const wall = placed.colliders[0];
    expect(wall && hitsCollider(wall, 50, 55)).toBe(true); // rotated: long axis along z
    expect(wall && hitsCollider(wall, 55, 50)).toBe(false);
  });

  it('indexes colliders in a spatial grid by group', () => {
    const g = new ColliderGrid(20);
    g.setGroup('a', [{ kind: 'circle', x: 19, z: 19, r: 2 }]);
    expect(g.blocked(21, 19)).toBe(true); // across a cell border
    expect(g.blocked(30, 30)).toBe(false);
    g.setGroup('a', []);
    expect(g.blocked(19, 19)).toBe(false);
    expect(g.size).toBe(0);
  });
});

describe('atmosphere', () => {
  const biomeOf = (x: number, z: number): BiomeId => biomeAt(WORLD, x, z);

  it('is the biome palette deep inside a chunk and blends across borders', () => {
    const inside = atmosphereAt(biomeOf, 125, -375);
    BIOME_ATMOSPHERE.tundra.fog.forEach((v, i) => expect(inside.fog[i]).toBeCloseTo(v, 9));
    const border = atmosphereAt(biomeOf, 0, 125); // frontier | coast
    const f = BIOME_ATMOSPHERE.frontier.fog[0];
    const c = BIOME_ATMOSPHERE.coast.fog[0];
    expect(border.fog[0]).toBeGreaterThan(Math.min(f, c) - 1e-9);
    expect(border.fog[0]).toBeLessThan(Math.max(f, c) + 1e-9);
    expect(border.fog[0]).not.toBeCloseTo(f, 4);
  });

  it('damps toward the target frame-rate independently', () => {
    const a = BIOME_ATMOSPHERE.frontier;
    const b = BIOME_ATMOSPHERE.volcanic;
    const one = dampAtmosphere(a, b, 0.2);
    const two = dampAtmosphere(dampAtmosphere(a, b, 0.1), b, 0.1);
    expect(one.skyTop[0]).toBeCloseTo(two.skyTop[0], 6);
    expect(dampAtmosphere(a, b, 100).fog[1]).toBeCloseTo(b.fog[1], 5);
    expect(dampAtmosphere(a, b, 0)).toEqual(a);
  });
});

describe('combat staging with large sprites', () => {
  const stats: Stats = { maxHp: 1, maxAp: 1, atk: 1, def: 1, mag: 1, res: 1, spd: 1, luck: 0 };
  const mk = (id: string, side: 'party' | 'enemy'): Combatant => ({
    id, side, name: id, sprite: id, level: 1, baseStats: stats, baseAffinities: {}, baseSkills: [], hp: 1, ap: 1, sync: 0, alive: true, guarding: false, statuses: [], fusion: null, dragon: null, hooks: [],
  });

  it('stages four heroes edge-to-edge so an apex dragon never overlaps', () => {
    const list = [mk('hero:kael', 'party'), mk('hero:tobin', 'party'), mk('hero:vesna', 'party'), mk('hero:orla', 'party'), mk('enemy:0:x', 'enemy')];
    const widths = new Map([['hero:kael', 4.4], ['hero:tobin', 1.33], ['hero:vesna', 1.33], ['hero:orla', 1.33], ['enemy:0:x', 2]]);
    const layout = stageLayout(list, { x: 0, z: 0 }, (c) => widths.get(c.id) ?? 1);
    const party = ['hero:kael', 'hero:tobin', 'hero:vesna', 'hero:orla'].map((id) => ({ id, p: layout.get(id), w: widths.get(id) ?? 0 }));
    for (let i = 1; i < party.length; i++) {
      const a = party[i - 1];
      const b = party[i];
      if (!a?.p || !b?.p) throw new Error('missing');
      const gap = Math.abs(a.p.x - b.p.x) - (a.w + b.w) / 2;
      expect(gap).toBeCloseTo(STAGE_GAP);
    }
    const ext = stageExtent(layout, widths);
    expect(ext.maxX - ext.minX).toBeGreaterThan(10);
    expect(fitDistance(ext.maxX - ext.minX, 0.6, 19)).toBeGreaterThan(19); // narrow portrait-ish FOV backs off
    expect(fitDistance(2, 1, 19)).toBe(19);
  });
});

describe('construction pop', () => {
  it('overshoots and settles back to 1', () => {
    expect(popScale(0)).toBe(1);
    expect(popScale(1)).toBe(1);
    expect(popScale(0.5)).toBeGreaterThan(1);
  });
});
