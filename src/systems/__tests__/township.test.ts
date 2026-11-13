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
    expect(township.initial()).toEqual({ recruited: [], built: {} });
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
});
