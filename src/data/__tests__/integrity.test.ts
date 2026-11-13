import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, HERO_IDS, HOOK_COUNTER_ATTACK, SPIRIT_IDS } from '@/types/contracts';
import type { Condition, Vec2, WorldEvent } from '@/types/contracts';
import { gameData as db } from '@/data';
import { FLAG, QUEST, SPOT } from '@/data/ids';

const SPRITE_PREFIXES = ['hero.', 'dragon.', 'npc.', 'enemy.beast.', 'enemy.humanoid.', 'enemy.wisp.', 'animal.deer.', 'animal.boar.', 'animal.hare.', 'animal.bird.'];
const validSprite = (s: string) => SPRITE_PREFIXES.some((p) => s.startsWith(p) && s.length > p.length);
const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const inBounds = (p: Vec2) => p.x >= 0 && p.x <= CHUNK_SIZE && p.z >= 0 && p.z <= CHUNK_SIZE;
const waterDepth = (p: Vec2) => Math.max(...db.world.water.map((w) => w.radius - d(p, w.center)));

const npcIds = new Set(db.world.npcs.map((n) => n.id));
const spotIds = new Set(db.world.fishingSpots.map((s) => s.id));
const regionIds = new Set(db.world.regions.map((r) => r.id));
const questIds = new Set(db.quests.map((q) => q.id));
const buildingIds = new Set(db.township.buildings.map((b) => b.id));
const isItemOrGear = (id: string) => id in db.items || id in db.gear;

/* Collect every condition in the database. */
function conditionsOf(): { where: string; c: Condition }[] {
  const out: { where: string; c: Condition }[] = [];
  for (const q of db.quests) {
    out.push({ where: `${q.id}.discover`, c: q.discoverWhen }, { where: `${q.id}.activate`, c: q.activateWhen });
    for (const o of q.objectives) {
      out.push({ where: `${q.id}.${o.id}`, c: o.completeWhen });
      if (o.revealWhen) out.push({ where: `${q.id}.${o.id}.reveal`, c: o.revealWhen });
    }
  }
  for (const n of db.world.npcs) {
    if (n.presentWhen) out.push({ where: `${n.id}.present`, c: n.presentWhen });
    for (const x of n.dialogues) out.push({ where: `${n.id}.${x.dialogueId}`, c: x.when });
  }
  for (const z of db.world.encounterZones) if (z.presentWhen) out.push({ where: z.id, c: z.presentWhen });
  for (const r of db.township.recruits) out.push({ where: `recruit ${r.npcId}`, c: r.requires });
  for (const dl of Object.values(db.dialogues)) for (const ch of dl.choices ?? []) if (ch.when) out.push({ where: `${dl.id}.${ch.id}`, c: ch.when });
  return out;
}
function leaves(c: Condition): Condition[] {
  if (c.kind === 'all' || c.kind === 'any') return c.of.flatMap(leaves);
  if (c.kind === 'not') return leaves(c.of);
  return [c];
}
function allEvents(): WorldEvent[] {
  return Object.values(db.dialogues).flatMap((dl) => [...(dl.onEnd ?? []), ...(dl.choices ?? []).flatMap((c) => c.events ?? [])]);
}

/** Non-`evt:` flags that something actually sets. */
function settableFlags(): Set<string> {
  const s = new Set<string>();
  for (const e of allEvents()) if (e.type === 'setFlag') s.add(e.key);
  for (const b of db.township.buildings) s.add(b.unlocksFlag);
  for (const q of db.quests) for (const r of q.rewards) if (r.type === 'flag') s.add(r.key);
  return s;
}
/** Flags deliberately never set in the slice (gates for later acts). */
const INTENTIONALLY_UNSET = new Set(['slice.never', FLAG.act2Open]);

describe('roster', () => {
  it('defines all nine heroes; exactly Kael, Tobin and Vesna are playable', () => {
    expect(Object.keys(db.heroes).sort()).toEqual([...HERO_IDS].sort());
    expect(HERO_IDS.filter((h) => db.heroes[h].playable).sort()).toEqual(['kael', 'tobin', 'vesna']);
    expect(db.heroes.kael.fieldActions).toEqual(['fish', 'drakeSight']);
    expect(db.heroes.tobin.fieldActions).toEqual(['huntShot']);
    expect(db.heroes.vesna.fieldActions).toEqual(['huntDash']);
    expect(db.heroes.kael.fusionAffinity).toEqual(expect.arrayContaining(['ashka', 'mirelle']));
    expect(db.heroes.tobin.fusionAffinity).toContain('mirelle');
    expect(db.heroes.vesna.fusionAffinity).toContain('ashka');
  });

  it('Kael has a dragon form at the start level and one unlocked later', () => {
    const forms = db.heroes.kael.dragonForms;
    expect(forms.length).toBeGreaterThanOrEqual(2);
    expect(forms.some((f) => f.level <= db.start.level)).toBe(true);
    expect(forms.some((f) => f.level > db.start.level)).toBe(true);
    for (const f of forms) expect(db.dragonForms[f.formId]).toBeDefined();
  });

  it('every skill reference exists', () => {
    const refs: string[] = [
      ...HERO_IDS.flatMap((h) => db.heroes[h].skills.map((s) => s.skillId)),
      ...Object.values(db.dragonForms).flatMap((f) => f.skills),
      ...Object.values(db.spirits).flatMap((s) => s.grantsSkills),
      ...Object.values(db.enemies).flatMap((e) => e.skills),
    ];
    for (const r of refs) expect(db.skills[r], r).toBeDefined();
    for (const [k, s] of Object.entries(db.skills)) expect(s.id).toBe(k);
  });

  it('balance: hero HP ~60–110 at slice levels, first form reachable in 2–3 turns', () => {
    for (const h of ['kael', 'tobin', 'vesna'] as const) {
      const hero = db.heroes[h];
      for (const lvl of [db.start.level, db.start.level + 2]) {
        const hp = hero.baseStats.maxHp + hero.growth.maxHp * (lvl - 1);
        expect(hp).toBeGreaterThanOrEqual(60);
        expect(hp).toBeLessThanOrEqual(110);
      }
    }
    const first = db.dragonForms[db.heroes.kael.dragonForms[0]?.formId ?? ''];
    expect(first).toBeDefined();
    const perTurn = 12 + 8;
    expect(first!.syncRequired).toBeGreaterThan(perTurn);
    expect(first!.syncRequired).toBeLessThanOrEqual(perTurn * 3);
    const kaelAp = db.heroes.kael.baseStats.maxAp + db.heroes.kael.growth.maxAp * (db.start.level - 1);
    expect(first!.apCostToEnter + first!.apDrainPerTurn).toBeLessThan(kaelAp);
  });
});

describe('spirits', () => {
  it('six Wardens; Ashka + Mirelle awakened with a mutual named resonance', () => {
    expect(Object.keys(db.spirits).sort()).toEqual([...SPIRIT_IDS].sort());
    for (const s of SPIRIT_IDS) expect(db.spirits[s].awakened).toBe(s === 'ashka' || s === 'mirelle');
    const a = db.spirits.ashka.resonance?.find((r) => r.with === 'mirelle');
    const m = db.spirits.mirelle.resonance?.find((r) => r.with === 'ashka');
    expect(a?.name).toBe('Steamveil');
    expect(m?.name).toBe('Steamveil');
  });
  it('a single fusion breaks after ~2–3 solid (15–20) hits', () => {
    for (const s of ['ashka', 'mirelle'] as const) {
      expect(db.spirits[s].armor).toBeGreaterThanOrEqual(30);
      expect(db.spirits[s].armor).toBeLessThanOrEqual(60);
    }
  });
});

describe('gear and items', () => {
  it("Wyrm's Lament scales by sqrt(level) + liberated regions, capped", () => {
    const g = db.gear['relic.wyrmsLament'];
    expect(g?.slot).toBe('relic');
    expect(g?.archetype).toBe('relic');
    if (g?.archetype !== 'relic') return;
    expect(g.scaling.levelCurve).toBe('sqrt');
    expect(Object.keys(g.scaling.perLiberatedRegion).length).toBeGreaterThan(0);
    expect(g.scaling.cap).toBeDefined();
  });
  it('Cinder Ring Talon is Vesna\'s counter-attack signature', () => {
    const g = db.gear['sig.cinderRingTalon'];
    expect(g?.archetype).toBe('signature');
    if (g?.archetype !== 'signature') return;
    expect(g.slot).toBe('signature');
    expect(g.boundHero).toBe('vesna');
    expect(g.hookId).toBe(HOOK_COUNTER_ATTACK);
    expect(g.hookParams).toEqual({ chance: 0.5, power: 1.1 });
  });
  it('all item/gear references resolve', () => {
    for (const [k, g] of Object.entries(db.gear)) {
      expect(g.id).toBe(k);
      if (g.boundHero) expect(HERO_IDS).toContain(g.boundHero);
    }
    for (const [k, it] of Object.entries(db.items)) expect(it.id).toBe(k);
    const itemRefs = [
      ...Object.values(db.enemies).flatMap((e) => e.drops.map((x) => x.itemId)),
      ...Object.values(db.species).flatMap((s) => s.drops.map((x) => x.itemId)),
      ...Object.values(db.fish).flatMap((f) => [f.itemId, ...(f.preferredLure ? [f.preferredLure] : [])]),
      ...db.township.buildings.flatMap((b) => b.cost.items.map((x) => x.itemId)),
      ...Object.keys(db.start.inventory),
    ];
    for (const r of itemRefs) expect(db.items[r], r).toBeDefined();
    for (const g of db.start.gearOwned) expect(db.gear[g], g).toBeDefined();
    for (const [hero, lo] of Object.entries(db.start.loadouts)) {
      for (const [slot, id] of Object.entries(lo ?? {})) {
        const g = db.gear[id ?? ''];
        expect(g, `${hero}.${slot}`).toBeDefined();
        expect(g?.slot).toBe(slot);
        expect(db.start.gearOwned).toContain(id);
      }
    }
    for (const q of db.quests) {
      for (const r of q.rewards) {
        if (r.type === 'gear') expect(db.gear[r.gearId], r.gearId).toBeDefined();
        if (r.type === 'item') expect(db.items[r.itemId], r.itemId).toBeDefined();
      }
    }
  });
  it('building costs are payable from hunting / fishing / combat drops', () => {
    const droppable = new Set([
      ...Object.values(db.enemies).flatMap((e) => e.drops.map((x) => x.itemId)),
      ...Object.values(db.species).flatMap((s) => s.drops.map((x) => x.itemId)),
      ...Object.values(db.fish).map((f) => f.itemId),
    ]);
    for (const b of db.township.buildings) for (const it of b.cost.items) expect(droppable.has(it.itemId), it.itemId).toBe(true);
  });
});

describe('combat content', () => {
  it('enemies have valid sprites, HP 40–160 and real drops', () => {
    for (const [k, e] of Object.entries(db.enemies)) {
      expect(e.id).toBe(k);
      expect(validSprite(e.sprite), e.sprite).toBe(true);
      expect(e.stats.maxHp).toBeGreaterThanOrEqual(40);
      expect(e.stats.maxHp).toBeLessThanOrEqual(160);
    }
  });
  it('encounters reference real enemies; exactly the occupied region is liberated by a boss', () => {
    for (const [k, enc] of Object.entries(db.encounters)) {
      expect(enc.id).toBe(k);
      expect(enc.enemies.length).toBeGreaterThan(0);
      for (const e of enc.enemies) expect(db.enemies[e], e).toBeDefined();
    }
    const occupied = db.world.regions.filter((r) => r.occupied);
    expect(occupied).toHaveLength(1);
    const liberator = Object.values(db.encounters).find((e) => e.liberatesRegion === occupied[0]?.id);
    expect(liberator?.boss).toBe(true);
    for (const e of Object.values(db.encounters)) if (e.liberatesRegion) expect(regionIds.has(e.liberatesRegion)).toBe(true);
  });
  it('every sprite id uses an asset-bootstrapper prefix', () => {
    const sprites = [
      ...HERO_IDS.map((h) => db.heroes[h].sprite),
      ...Object.values(db.dragonForms).map((f) => f.sprite),
      ...db.world.npcs.map((n) => n.sprite),
      ...db.world.encounterZones.map((z) => z.sprite),
      ...Object.values(db.species).map((s) => s.sprite),
    ];
    for (const s of sprites) expect(validSprite(s), s).toBe(true);
    for (const h of HERO_IDS) expect(db.heroes[h].sprite).toBe(`hero.${h}`);
  });
});

describe('quests and dialogue', () => {
  it('quest ids are unique and every quest belongs to an act', () => {
    expect(questIds.size).toBe(db.quests.length);
    const inActs = db.acts.flatMap((a) => a.questIds);
    for (const id of inActs) expect(questIds.has(id), id).toBe(true);
    for (const q of db.quests) expect(inActs).toContain(q.id);
    expect(db.acts.map((a) => a.act)).toEqual([1, 2, 3]);
    for (const a of db.acts) expect(a.beats.length).toBeGreaterThanOrEqual(4);
  });
  it('slice quests have the required shape', () => {
    const main = db.quests.find((q) => q.id === QUEST.ledger);
    expect(main?.kind).toBe('main');
    expect(main?.objectives.length).toBeGreaterThanOrEqual(5);
    expect(main?.objectives.length).toBeLessThanOrEqual(7);
    const embers = db.quests.find((q) => q.id === QUEST.embers);
    expect(embers?.companion).toBe('kael');
    expect(embers?.rewards).toContainEqual({ type: 'gear', gearId: 'relic.wyrmsLament' });
    const debts = db.quests.find((q) => q.id === QUEST.debts);
    expect(debts?.companion).toBe('vesna');
    expect(debts?.rewards).toContainEqual({ type: 'gear', gearId: 'sig.cinderRingTalon' });
    expect(db.quests.filter((q) => q.kind === 'township').length).toBeGreaterThanOrEqual(1);
    expect(db.quests.filter((q) => q.kind === 'investigation').length).toBeGreaterThanOrEqual(2);
    for (const q of db.quests) {
      const ids = q.objectives.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      if (q.giver) expect(npcIds.has(q.giver), q.giver).toBe(true);
    }
  });
  it('every condition references real ids and settable flags', () => {
    const settable = settableFlags();
    for (const { where, c } of conditionsOf()) {
      for (const leaf of leaves(c)) {
        if (leaf.kind === 'quest' || leaf.kind === 'questAtLeast') {
          expect(questIds.has(leaf.questId), `${where}: ${leaf.questId}`).toBe(true);
          continue;
        }
        if (leaf.kind !== 'flag') continue;
        const [ns, type, ...rest] = leaf.key.split(':');
        const id = rest.join(':');
        if (ns !== 'evt') {
          expect(settable.has(leaf.key) || INTENTIONALLY_UNSET.has(leaf.key), `${where}: flag ${leaf.key} is never set`).toBe(true);
          continue;
        }
        const msg = `${where}: ${leaf.key}`;
        switch (type) {
          case 'talk': expect(npcIds.has(id), msg).toBe(true); break;
          case 'defeat': expect(db.encounters[id], msg).toBeDefined(); break;
          case 'obtain': expect(isItemOrGear(id), msg).toBe(true); break;
          case 'enter': case 'liberate': expect(regionIds.has(id), msg).toBe(true); break;
          case 'recruit': expect(db.township.recruits.some((r) => r.npcId === id), msg).toBe(true); break;
          case 'build': expect(buildingIds.has(id), msg).toBe(true); break;
          case 'accept': expect(questIds.has(id), msg).toBe(true); break;
          case 'field': {
            const [action, ...t] = rest;
            const target = t.join(':');
            expect(db.fieldActions[action as keyof typeof db.fieldActions], msg).toBeDefined();
            const ok = npcIds.has(target) || spotIds.has(target) || target in db.species || target === 'area';
            expect(ok, msg).toBe(true);
            if (action === 'drakeSight') {
              const hidden = db.world.npcs.find((n) => n.id === target)?.hiddenUntilDrakeSight
                ?? db.world.fishingSpots.find((s) => s.id === target)?.hiddenUntilDrakeSight;
              expect(hidden, `${msg} must target a hidden entity`).toBe(true);
            }
            break;
          }
          default: throw new Error(`unknown event flag ${msg}`);
        }
      }
    }
  });
  it('dialogue events reference real quests / encounters', () => {
    for (const e of allEvents()) if (e.type === 'acceptQuest') expect(questIds.has(e.questId)).toBe(true);
    for (const dl of Object.values(db.dialogues)) if (dl.startsEncounter) expect(db.encounters[dl.startsEncounter]).toBeDefined();
  });
  it('NPC dialogue lists resolve and end with an `always` fallback; dialogues are 2–5 lines', () => {
    const used = new Set<string>();
    for (const n of db.world.npcs) {
      expect(n.dialogues.length).toBeGreaterThan(0);
      expect(n.dialogues[n.dialogues.length - 1]?.when).toEqual({ kind: 'always' });
      for (const x of n.dialogues) {
        expect(db.dialogues[x.dialogueId], x.dialogueId).toBeDefined();
        used.add(x.dialogueId);
      }
    }
    for (const [k, dl] of Object.entries(db.dialogues)) {
      expect(dl.id).toBe(k);
      expect(dl.lines.length, k).toBeGreaterThanOrEqual(2);
      expect(dl.lines.length, k).toBeLessThanOrEqual(5);
      expect(used.has(k), `${k} is unreachable`).toBe(true);
    }
  });
  it('quest givers offer an accept choice', () => {
    for (const id of [QUEST.ledger, QUEST.embers, QUEST.debts, QUEST.timber]) {
      const accepts = allEvents().some((e) => e.type === 'acceptQuest' && e.questId === id);
      expect(accepts, id).toBe(true);
    }
  });
});

describe('world map', () => {
  it('has the slice-sized feature set', () => {
    expect(db.world.npcs.length).toBeGreaterThanOrEqual(10);
    expect(db.world.npcs.length).toBeLessThanOrEqual(14);
    expect(db.world.props.length).toBeGreaterThanOrEqual(25);
    expect(db.world.props.length).toBeLessThanOrEqual(40);
    expect(db.world.encounterZones.length).toBeGreaterThanOrEqual(3);
    expect(db.world.encounterZones.length).toBeLessThanOrEqual(5);
    expect(db.world.fishingSpots).toHaveLength(3);
    expect(db.world.fishingSpots.filter((s) => s.hiddenUntilDrakeSight)).toHaveLength(1);
    const merchant = db.world.fishingSpots.filter((s) => s.merchantFish);
    expect(merchant).toHaveLength(1);
    expect(merchant[0]?.fish).toContain(merchant[0]?.merchantFish);
    expect(new Set(db.world.npcs.map((n) => n.id)).size).toBe(db.world.npcs.length);
    expect(db.world.water.some((w) => w.kind === 'lake')).toBe(true);
    expect(db.world.water.some((w) => w.kind === 'sea')).toBe(true);
  });

  it('positions are in bounds; NPCs/props are on land and ≥ 3 m apart', () => {
    const solid = [
      ...db.world.npcs.map((n) => ({ id: n.id, p: n.position })),
      ...db.world.props.map((p, i) => ({ id: `prop#${i}:${p.kind}`, p: p.position })),
      ...db.township.recruits.map((r) => ({ id: `${r.npcId}@township`, p: r.townshipPosition })),
    ];
    for (const s of solid) {
      expect(inBounds(s.p), s.id).toBe(true);
      expect(waterDepth(s.p), `${s.id} is in water`).toBeLessThan(-1);
    }
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        expect(d(a.p, b.p), `${a.id} ↔ ${b.id}`).toBeGreaterThanOrEqual(3);
      }
    }
    const misc = [
      db.world.playerStart,
      ...db.world.encounterZones.map((z) => z.position),
      ...db.township.plots.map((p) => p.position),
      ...db.world.paths.flatMap((p) => p.points),
      ...Object.values(db.species).flatMap((s) => s.habitat.map((h) => h.center)),
    ];
    for (const p of misc) {
      expect(inBounds(p), JSON.stringify(p)).toBe(true);
      expect(waterDepth(p), JSON.stringify(p)).toBeLessThan(0);
    }
    for (const r of db.world.regions) expect(inBounds(r.center), r.id).toBe(true);
  });

  it('fishing spots sit on the shore of real water and list real fish', () => {
    for (const s of db.world.fishingSpots) {
      const depth = waterDepth(s.position);
      expect(depth, s.id).toBeLessThan(0);
      expect(depth, s.id).toBeGreaterThan(-6);
      for (const f of s.fish) expect(db.fish[f], f).toBeDefined();
    }
    const rarities = Object.values(db.fish).map((f) => f.rarity);
    expect(rarities).toContain('rare');
    expect(rarities).toContain('legend');
    expect(Object.keys(db.fish).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(db.fish).length).toBeLessThanOrEqual(7);
    expect(db.world.fishingSpots.find((s) => s.id === SPOT.drownedShrine)?.hiddenUntilDrakeSight).toBe(true);
  });

  it('player starts in Lanternwick; regions are distinct', () => {
    const lw = db.world.regions.find((r) => r.id === 'lanternwick');
    expect(lw).toBeDefined();
    expect(d(db.world.playerStart, lw!.center)).toBeLessThan(lw!.radius);
    expect(regionIds.size).toBe(db.world.regions.length);
    expect(regionIds.has(db.township.regionId)).toBe(true);
  });

  it('township: ≥ 3 plots, carpenter + blacksmith recruits for carpentry + smithy', () => {
    expect(db.township.plots.length).toBeGreaterThanOrEqual(3);
    for (const id of ['building.carpentry', 'building.smithy']) expect(buildingIds.has(id)).toBe(true);
    for (const b of db.township.buildings) {
      expect(db.township.recruits.some((r) => r.npcId === b.requiresRecruit && r.unlocksBuildings.includes(b.id))).toBe(true);
      expect(db.township.plots.some((p) => p.accepts.includes(b.id))).toBe(true);
    }
    for (const r of db.township.recruits) expect(npcIds.has(r.npcId)).toBe(true);
  });

  it('wildlife: 3–4 species with distinct alert/scent profiles', () => {
    const sp = Object.values(db.species);
    expect(sp.length).toBeGreaterThanOrEqual(3);
    expect(sp.length).toBeLessThanOrEqual(4);
    const profiles = new Set(sp.map((s) => `${s.alertRadius}/${s.scentSensitivity}`));
    expect(profiles.size).toBe(sp.length);
  });

  it('the database is deep-frozen', () => {
    expect(Object.isFrozen(db)).toBe(true);
    expect(Object.isFrozen(db.world.npcs[0])).toBe(true);
  });
});
