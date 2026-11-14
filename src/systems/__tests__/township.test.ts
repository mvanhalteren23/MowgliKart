import { describe, expect, it } from 'vitest';
import type { Condition, QuestLog, WorldFlags } from '@/types/contracts';
import { gameData as db } from '@/data';
import { NPC } from '@/data/ids';
import { createWorldSystems } from '@/systems';

const { township } = createWorldSystems(db);
const yes = (_c: Condition, _f: WorldFlags, _l: QuestLog) => true;
const no = (_c: Condition, _f: WorldFlags, _l: QuestLog) => false;
const rich = { 'item.softHide': 5, 'item.wolfPelt': 2, 'item.covenantIron': 3, 'item.boarTusk': 2 };

describe('township system', () => {
  it('starts empty', () => {
    expect(township.initial()).toEqual({ recruited: [], built: {}, levels: {} });
  });

  it('canRecruit checks the recruit table, duplicates and requirements', () => {
    const s0 = township.initial();
    expect(township.canRecruit(NPC.bram, s0, {}, yes, {}).ok).toBe(true);
    const blocked = township.canRecruit(NPC.bram, s0, {}, no, {});
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/Hearthstead/);
    expect(township.canRecruit(NPC.caul, s0, {}, yes, {}).ok).toBe(false);
    const r = township.recruit(NPC.bram, s0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(township.canRecruit(NPC.bram, r.state, {}, yes, {}).ok).toBe(false);
  });

  it('recruit returns new state + a recruit event without mutating', () => {
    const s0 = township.initial();
    const r = township.recruit(NPC.bram, s0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.recruited).toEqual([NPC.bram]);
    expect(s0.recruited).toEqual([]);
    expect(r.events).toEqual([{ type: 'recruit', npcId: NPC.bram }]);
    expect(r.spend).toEqual({ coin: 0, items: [] });
    expect(township.recruit(NPC.bram, r.state).ok).toBe(false);
    expect(township.recruit('npc.nobody', s0).ok).toBe(false);
  });

  it('build validates tenant, plot, cost and uniqueness; returns events + spend', () => {
    const s0 = township.initial();
    expect(township.canBuild('plot.hearthNorth', 'building.carpentry', s0, 999, rich).reason).toMatch(/Recruit Bram/);
    const r1 = township.recruit(NPC.bram, s0);
    if (!r1.ok) throw new Error('recruit failed');
    const s1 = r1.state;
    expect(township.canBuild('plot.nowhere', 'building.carpentry', s1, 999, rich).ok).toBe(false);
    expect(township.canBuild('plot.hearthNorth', 'building.nope', s1, 999, rich).ok).toBe(false);
    expect(township.canBuild('plot.hearthNorth', 'building.carpentry', s1, 10, rich).reason).toMatch(/coin/);
    expect(township.canBuild('plot.hearthNorth', 'building.carpentry', s1, 999, {}).reason).toMatch(/Soft Hide/);
    expect(township.canBuild('plot.hearthSouth', 'building.smithy', s1, 999, rich).ok).toBe(false); // plot doesn't accept

    const b = township.build('plot.hearthNorth', 'building.carpentry', s1, 100, rich);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.built).toEqual({ 'plot.hearthNorth': 'building.carpentry' });
    expect(b.state.levels).toEqual({ 'plot.hearthNorth': 1 });
    expect(s1.built).toEqual({});
    expect(b.events).toEqual([
      { type: 'build', buildingId: 'building.carpentry' },
      { type: 'setFlag', key: 'township.carpentry', value: true },
    ]);
    expect(b.spend).toEqual({ coin: 60, items: [{ itemId: 'item.softHide', qty: 2 }, { itemId: 'item.wolfPelt', qty: 1 }] });

    expect(township.canBuild('plot.hearthNorth', 'building.smithy', b.state, 999, rich).reason).toMatch(/already built/);
    expect(township.canBuild('plot.hearthEast', 'building.carpentry', b.state, 999, rich).reason).toMatch(/already has/);

    const r2 = township.recruit(NPC.gilda, b.state);
    if (!r2.ok) throw new Error('recruit failed');
    const b2 = township.build('plot.hearthEast', 'building.smithy', r2.state, 100, rich);
    expect(b2.ok).toBe(true);
    if (b2.ok) expect(Object.values(b2.state.built).sort()).toEqual(['building.carpentry', 'building.smithy']);
  });

  it('npcPosition moves recruits into Hearthstead', () => {
    const bram = db.world.npcs.find((n) => n.id === NPC.bram);
    if (!bram) throw new Error('no bram');
    const s0 = township.initial();
    expect(township.npcPosition(bram, s0)).toEqual(bram.position);
    const r = township.recruit(NPC.bram, s0);
    if (!r.ok) throw new Error('recruit failed');
    const pos = township.npcPosition(bram, r.state);
    const recruit = db.township.recruits.find((x) => x.npcId === NPC.bram);
    expect(pos).toEqual(recruit?.townshipPosition);
    const hs = db.world.regions.find((x) => x.id === db.township.regionId);
    if (!hs) throw new Error('no region');
    expect(Math.hypot(pos.x - hs.center.x, pos.z - hs.center.z)).toBeLessThan(hs.radius);
  });

  describe('upgrades', () => {
    const plenty = Object.fromEntries(Object.keys(db.items).map((k) => [k, 99]));
    const built = () => {
      const r = township.recruit(NPC.bram, township.initial());
      if (!r.ok) throw new Error('recruit failed');
      const b = township.build('plot.hearthNorth', 'building.carpentry', r.state, 999, plenty);
      if (!b.ok) throw new Error('build failed');
      return b.state;
    };
    const carpentry = db.township.buildings.find((x) => x.id === 'building.carpentry')!;

    it('needs a building, coin, materials and (for level 3) the story', () => {
      const s0 = township.initial();
      expect(township.canUpgrade('plot.hearthNorth', s0, 9999, plenty, {}, yes, {}).reason).toMatch(/Nothing is built/);
      expect(township.canUpgrade('plot.nowhere', s0, 9999, plenty, {}, yes, {}).ok).toBe(false);
      const s1 = built();
      expect(township.canUpgrade('plot.hearthNorth', s1, 0, plenty, {}, yes, {}).reason).toMatch(/coin/);
      expect(township.canUpgrade('plot.hearthNorth', s1, 9999, {}, {}, yes, {}).reason).toMatch(/Needs/);
      expect(township.canUpgrade('plot.hearthNorth', s1, 9999, plenty, {}, no, {}).ok).toBe(true); // level 2 has no story gate
      const u2 = township.upgrade('plot.hearthNorth', s1, 9999, plenty, {}, yes, {});
      if (!u2.ok) throw new Error(u2.reason);
      expect(township.canUpgrade('plot.hearthNorth', u2.state, 9999, plenty, {}, no, {}).reason).toBe(carpentry.upgrades[1]?.requirementText);
    });

    it('raises the level one step at a time with flag events and spend, never mutating', () => {
      const s1 = built();
      const u2 = township.upgrade('plot.hearthNorth', s1, 9999, plenty, {}, yes, {});
      if (!u2.ok) throw new Error(u2.reason);
      expect(s1.levels['plot.hearthNorth']).toBe(1);
      expect(u2.state.levels['plot.hearthNorth']).toBe(2);
      expect(u2.state.built).toEqual(s1.built);
      expect(u2.events).toEqual([{ type: 'setFlag', key: carpentry.upgrades[0]!.unlocksFlag, value: true }]);
      expect(u2.spend.coin).toBe(carpentry.upgrades[0]!.cost.coin);
      expect(u2.spend.items).toEqual(carpentry.upgrades[0]!.cost.items.map((i) => ({ itemId: i.itemId, qty: i.qty })));
      const u3 = township.upgrade('plot.hearthNorth', u2.state, 9999, plenty, {}, yes, {});
      if (!u3.ok) throw new Error(u3.reason);
      expect(u3.state.levels['plot.hearthNorth']).toBe(3);
      expect(u3.events).toEqual([{ type: 'setFlag', key: carpentry.upgrades[1]!.unlocksFlag, value: true }]);
      const u4 = township.upgrade('plot.hearthNorth', u3.state, 9999, plenty, {}, yes, {});
      expect(u4.ok).toBe(false);
      if (!u4.ok) expect(u4.reason).toMatch(/fully upgraded/);
    });

    it('passes the real story condition to the evaluator', () => {
      const s1 = built();
      const u2 = township.upgrade('plot.hearthNorth', s1, 9999, plenty, {}, yes, {});
      if (!u2.ok) throw new Error(u2.reason);
      const seen: Condition[] = [];
      township.canUpgrade('plot.hearthNorth', u2.state, 9999, plenty, {}, (c) => (seen.push(c), true), {});
      expect(seen).toEqual([carpentry.upgrades[1]!.requires]);
    });
  });
});
