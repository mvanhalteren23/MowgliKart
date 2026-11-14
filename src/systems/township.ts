import type {
  BuildingDef, BuildingUpgradeDef, GameDatabase, ItemId, NpcDef, NpcId, PlotId, TownshipResult, TownshipState, Vec2, WorldSystems,
} from '@/types/contracts';

type Check = { readonly ok: boolean; readonly reason?: string };

export function createTownship(db: GameDatabase): WorldSystems['township'] {
  const t = db.township;
  const recruitOf = (npcId: NpcId) => t.recruits.find((r) => r.npcId === npcId);
  const buildingOf = (id: string): BuildingDef | undefined => t.buildings.find((b) => b.id === id);
  const plotOf = (id: PlotId) => t.plots.find((p) => p.id === id);
  const npcName = (npcId: NpcId) => db.world.npcs.find((n) => n.id === npcId)?.name ?? npcId;

  function initial(): TownshipState {
    return { recruited: [], built: {}, levels: {} };
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
      state: { recruited: [...state.recruited, npcId], built: state.built, levels: state.levels },
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
    const missing = missingItem(building.cost.items, inventory);
    if (missing) return { ok: false, reason: missing };
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
      state: { recruited: state.recruited, built: { ...state.built, [plotId]: buildingId }, levels: { ...state.levels, [plotId]: 1 } },
      events: [
        { type: 'build', buildingId },
        { type: 'setFlag', key: building.unlocksFlag, value: true },
      ],
      spend: { coin: building.cost.coin, items: building.cost.items.map((i) => ({ itemId: i.itemId, qty: i.qty })) },
    };
  }

  const missingItem = (items: readonly { readonly itemId: string; readonly qty: number }[], inventory: Readonly<Record<ItemId, number>>): string | null => {
    for (const need of items) {
      const have = inventory[need.itemId] ?? 0;
      if (have < need.qty) return `Needs ${need.qty} × ${db.items[need.itemId]?.name ?? need.itemId} (you have ${have}).`;
    }
    return null;
  };

  /** The next architectural upgrade for the building on `plotId`, if any. */
  function nextUpgrade(plotId: PlotId, state: TownshipState): { building: BuildingDef; upgrade: BuildingUpgradeDef } | { reason: string } {
    const plot = plotOf(plotId);
    if (!plot) return { reason: `No plot called ${plotId}.` };
    const buildingId = state.built[plotId];
    if (buildingId === undefined) return { reason: `Nothing is built on the ${plot.name} yet.` };
    const building = buildingOf(buildingId);
    if (!building) return { reason: `No blueprint called ${buildingId}.` };
    const level = state.levels[plotId] ?? 1;
    const upgrade = building.upgrades.find((u) => u.level === level + 1);
    if (!upgrade) return { reason: `The ${building.name} is fully upgraded.` };
    return { building, upgrade };
  }

  const canUpgrade: WorldSystems['township']['canUpgrade'] = (plotId, state, coin, inventory, flags, evaluate, log) => {
    const next = nextUpgrade(plotId, state);
    if ('reason' in next) return { ok: false, reason: next.reason };
    const { upgrade } = next;
    if (upgrade.requires && !evaluate(upgrade.requires, flags, log)) {
      return { ok: false, reason: upgrade.requirementText ?? `${upgrade.name} is not available yet.` };
    }
    if (coin < upgrade.cost.coin) return { ok: false, reason: `Needs ${upgrade.cost.coin} coin (you have ${coin}).` };
    const missing = missingItem(upgrade.cost.items, inventory);
    if (missing) return { ok: false, reason: missing };
    return { ok: true };
  };

  const upgrade: WorldSystems['township']['upgrade'] = (plotId, state, coin, inventory, flags, evaluate, log) => {
    const check = canUpgrade(plotId, state, coin, inventory, flags, evaluate, log);
    const next = nextUpgrade(plotId, state);
    if (!check.ok || 'reason' in next) return { ok: false, reason: check.reason ?? 'Cannot upgrade here.' };
    const u = next.upgrade;
    return {
      ok: true,
      state: { recruited: state.recruited, built: state.built, levels: { ...state.levels, [plotId]: u.level } },
      events: [{ type: 'setFlag', key: u.unlocksFlag, value: true }],
      spend: { coin: u.cost.coin, items: u.cost.items.map((i) => ({ itemId: i.itemId, qty: i.qty })) },
    };
  };

  function npcPosition(npc: NpcDef, state: TownshipState): Vec2 {
    if (!state.recruited.includes(npc.id)) return npc.position;
    return recruitOf(npc.id)?.townshipPosition ?? npc.position;
  }

  return { initial, canUpgrade, upgrade, canRecruit, recruit, canBuild, build, npcPosition };
}
