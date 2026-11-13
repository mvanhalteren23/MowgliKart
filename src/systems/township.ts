import type {
  BuildingDef, GameDatabase, ItemId, NpcDef, NpcId, PlotId, TownshipResult, TownshipState, Vec2, WorldSystems,
} from '@/types/contracts';

type Check = { readonly ok: boolean; readonly reason?: string };

export function createTownship(db: GameDatabase): WorldSystems['township'] {
  const t = db.township;
  const recruitOf = (npcId: NpcId) => t.recruits.find((r) => r.npcId === npcId);
  const buildingOf = (id: string): BuildingDef | undefined => t.buildings.find((b) => b.id === id);
  const plotOf = (id: PlotId) => t.plots.find((p) => p.id === id);
  const npcName = (npcId: NpcId) => db.world.npcs.find((n) => n.id === npcId)?.name ?? npcId;

  function initial(): TownshipState {
    return { recruited: [], built: {} };
  }

  const canRecruit: WorldSystems['township']['canRecruit'] = (npcId, state, flags, evaluate, log) => {
    const def = recruitOf(npcId);
    if (!def) return { ok: false, reason: `${npcName(npcId)} has no trade Hearthstead needs.` };
    if (state.recruited.includes(npcId)) return { ok: false, reason: `${npcName(npcId)} already lives in ${t.name}.` };
    if (!evaluate(def.requires, flags, log)) return { ok: false, reason: def.requirementText };
    return { ok: true };
  };

  function recruit(npcId: NpcId, state: TownshipState): TownshipResult {
    const def = recruitOf(npcId);
    if (!def) return { ok: false, reason: `${npcName(npcId)} has no trade Hearthstead needs.` };
    if (state.recruited.includes(npcId)) return { ok: false, reason: `${npcName(npcId)} already lives in ${t.name}.` };
    return {
      ok: true,
      state: { recruited: [...state.recruited, npcId], built: state.built },
      events: [{ type: 'recruit', npcId }],
      spend: { coin: 0, items: [] },
    };
  }

  function canBuild(
    plotId: PlotId, buildingId: string, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>,
  ): Check {
    const plot = plotOf(plotId);
    if (!plot) return { ok: false, reason: `No plot called ${plotId}.` };
    const building = buildingOf(buildingId);
    if (!building) return { ok: false, reason: `No blueprint called ${buildingId}.` };
    if (!plot.accepts.includes(buildingId)) return { ok: false, reason: `${building.name} won't fit on the ${plot.name}.` };
    if (state.built[plotId] !== undefined) return { ok: false, reason: `The ${plot.name} is already built on.` };
    if (Object.values(state.built).includes(buildingId)) return { ok: false, reason: `${t.name} already has a ${building.name}.` };
    if (!state.recruited.includes(building.requiresRecruit)) {
      return { ok: false, reason: `Recruit ${npcName(building.requiresRecruit)} first.` };
    }
    if (coin < building.cost.coin) return { ok: false, reason: `Needs ${building.cost.coin} coin (you have ${coin}).` };
    for (const need of building.cost.items) {
      const have = inventory[need.itemId] ?? 0;
      if (have < need.qty) {
        const name = db.items[need.itemId]?.name ?? need.itemId;
        return { ok: false, reason: `Needs ${need.qty} × ${name} (you have ${have}).` };
      }
    }
    return { ok: true };
  }

  function build(
    plotId: PlotId, buildingId: string, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>,
  ): TownshipResult {
    const check = canBuild(plotId, buildingId, state, coin, inventory);
    const building = buildingOf(buildingId);
    if (!check.ok || !building) return { ok: false, reason: check.reason ?? 'Cannot build here.' };
    return {
      ok: true,
      state: { recruited: state.recruited, built: { ...state.built, [plotId]: buildingId } },
      events: [
        { type: 'build', buildingId },
        { type: 'setFlag', key: building.unlocksFlag, value: true },
      ],
      spend: { coin: building.cost.coin, items: building.cost.items.map((i) => ({ itemId: i.itemId, qty: i.qty })) },
    };
  }

  function npcPosition(npc: NpcDef, state: TownshipState): Vec2 {
    if (!state.recruited.includes(npc.id)) return npc.position;
    return recruitOf(npc.id)?.townshipPosition ?? npc.position;
  }

  return { initial, canRecruit, recruit, canBuild, build, npcPosition };
}
