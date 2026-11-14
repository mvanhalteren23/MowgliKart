import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, HERO_IDS, HOOK_COUNTER_ATTACK, HOOK_IDS, SPIRIT_IDS, TRAVERSAL_FOR_GATE } from '@/types/contracts';
import type { Condition, Vec2, WorldEvent } from '@/types/contracts';
import { gameData as db } from '@/data';
import { QUEST, SPOT } from '@/data/ids';
import { createWorldSystems } from '@/systems';
import { chunkKey, chunkLinks } from './harness';

const SPRITE_PREFIXES = ['hero.', 'dragon.', 'npc.', 'enemy.beast.', 'enemy.humanoid.', 'enemy.wisp.', 'animal.deer.', 'animal.boar.', 'animal.hare.', 'animal.bird.'];
const validSprite = (s: string) => SPRITE_PREFIXES.some((p) => s.startsWith(p) && s.length > p.length);
const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const waterDepth = (p: Vec2) => Math.max(...db.world.water.map((w) => w.radius - d(p, w.center)));
const authored = new Set(db.world.chunks.map((c) => `${c.cx},${c.cz}`));
const inAuthoredChunk = (p: Vec2) => authored.has(chunkKey(p));
const chunkOfRegion = new Map(db.world.regions.map((r) => [r.id, chunkKey(r.center)]));

const npcIds = new Set(db.world.npcs.map((n) => n.id));
const spotIds = new Set(db.world.fishingSpots.map((s) => s.id));
const gateIds = new Set(db.world.traversalGates.map((g) => g.id));
const regionIds = new Set(db.world.regions.map((r) => r.id));
const questIds = new Set(db.quests.map((q) => q.id));
const buildingIds = new Set(db.township.buildings.map((b) => b.id));
const isItemOrGear = (id: string) => id in db.items || id in db.gear;

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
  for (const g of db.world.traversalGates) if (g.presentWhen) out.push({ where: g.id, c: g.presentWhen });
  for (const r of db.township.recruits) out.push({ where: `recruit ${r.npcId}`, c: r.requires });
  for (const b of db.township.buildings) for (const u of b.upgrades) if (u.requires) out.push({ where: `${b.id}.${u.level}`, c: u.requires });
  for (const dl of Object.values(db.dialogues)) for (const ch of dl.choices ?? []) if (ch.when) out.push({ where: `${dl.id}.${ch.id}`, c: ch.when });
  for (const c of db.clues) out.push({ where: c.id, c: c.foundWhen });
  for (const e of db.endings) out.push({ where: e.id, c: e.when });
  return out;
}
function leaves(c: Condition): Condition[] {
  if (c.kind === 'all' || c.kind === 'any' || c.kind === 'count') return c.of.flatMap(leaves);
  if (c.kind === 'not') return leaves(c.of);
  return [c];
}
function allEvents(): WorldEvent[] {
  return Object.values(db.dialogues).flatMap((dl) => [...(dl.onEnd ?? []), ...(dl.choices ?? []).flatMap((c) => c.events ?? [])]);
}
function settableFlags(): Set<string> {
  const s = new Set<string>();
  for (const e of allEvents()) if (e.type === 'setFlag') s.add(e.key);
  for (const b of db.township.buildings) {
    s.add(b.unlocksFlag);
    for (const u of b.upgrades) s.add(u.unlocksFlag);
  }
  for (const q of db.quests) for (const r of q.rewards) if (r.type === 'flag') s.add(r.key);
  return s;
}

describe('roster', () => {
  it('all nine heroes are playable; the starting trio keeps the slice field actions', () => {
    expect(Object.keys(db.heroes).sort()).toEqual([...HERO_IDS].sort());
    for (const h of HERO_IDS) expect(db.heroes[h].playable, h).toBe(true);
    expect([...db.start.party].sort()).toEqual(['kael', 'tobin', 'vesna']);
    expect(db.heroes.kael.fieldActions).toEqual(['fish', 'drakeSight']);
    expect(db.heroes.tobin.fieldActions).toEqual(['huntShot']);
    expect(db.heroes.vesna.fieldActions).toEqual(['huntDash']);
    expect(db.heroes.kael.fusionAffinity).toEqual(expect.arrayContaining(['ashka', 'mirelle']));
  });

  it('each newcomer joins through a main chapter that rewards them, and owns one traversal', () => {
    const traversal = { hadrik: 'roll', orla: 'glide', sable: 'grapple', pim: 'leap', moss: 'commune', quill: 'unseal' } as const;
    for (const [hero, action] of Object.entries(traversal)) {
      const def = db.heroes[hero as keyof typeof traversal];
      const q = db.quests.find((x) => x.id === def.joinQuest);
      expect(q?.kind, hero).toBe('main');
      expect(q?.rewards).toContainEqual({ type: 'hero', heroId: hero });
      expect(def.fieldActions[0]).toBe(action);
      for (const a of def.fieldActions) expect(db.fieldActions[a], a).toBeDefined();
    }
    for (const [kind, action] of Object.entries(TRAVERSAL_FOR_GATE)) {
      expect(db.fieldActions[action].clears).toBe(kind);
      expect(db.fieldActions[action].range).toBeGreaterThanOrEqual(3);
      expect(db.fieldActions[action].range).toBeLessThanOrEqual(6);
    }
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

  it("Kael's forms: hatchling at the start level, fire/ice/storm by Act II, one story-gated sovereign apex", () => {
    const forms = db.heroes.kael.dragonForms.map((f) => ({ ...f, def: db.dragonForms[f.formId]! }));
    for (const f of forms) {
      expect(f.def, f.formId).toBeDefined();
      expect(f.def.sprite.startsWith('dragon.')).toBe(true);
      expect(f.def.apCostToEnter + f.def.apDrainPerTurn).toBeLessThan(db.heroes.kael.baseStats.maxAp + db.heroes.kael.growth.maxAp * (f.level - 1));
    }
    const first = forms.find((f) => /pup|hatch|whelp|kit/.test(f.def.sprite));
    expect(first?.level).toBeLessThanOrEqual(db.start.level);
    expect(first!.def.syncRequired).toBeGreaterThan(20);
    expect(first!.def.syncRequired).toBeLessThanOrEqual(60);
    for (const re of [/cinder|ember/, /rime|frost/, /storm|thunder/]) {
      const f = forms.find((x) => re.test(x.def.sprite) && !/pup|hatch|whelp|kit/.test(x.def.sprite));
      expect(f, String(re)).toBeDefined();
      expect(f!.level).toBeLessThanOrEqual(22);
    }
    const apex = forms.filter((f) => f.def.apex);
    expect(apex).toHaveLength(1);
    expect(apex[0]!.def.sprite).toMatch(/sovereign/);
    expect(apex[0]!.def.requiresFlag).toBe('story.sovereignAwakened');
    expect(settableFlags().has(apex[0]!.def.requiresFlag!)).toBe(true);
  });
});

describe('spirits', () => {
  it('six Wardens; Ashka + Mirelle awakened with the Steamveil resonance', () => {
    expect(Object.keys(db.spirits).sort()).toEqual([...SPIRIT_IDS].sort());
    for (const s of SPIRIT_IDS) expect(db.spirits[s].awakened).toBe(s === 'ashka' || s === 'mirelle');
    expect(db.spirits.ashka.resonance?.find((r) => r.with === 'mirelle')?.name).toBe('Steamveil');
  });
});

describe('gear and items', () => {
  const sigHook = { kael: HOOK_IDS.dragonSurge, tobin: HOOK_IDS.markedQuarry, vesna: HOOK_IDS.counterAttack, orla: HOOK_IDS.mendingEcho, hadrik: HOOK_IDS.bulwark, pim: HOOK_IDS.pilfer, quill: HOOK_IDS.spellEcho, moss: HOOK_IDS.rootbind, sable: HOOK_IDS.reap } as const;
  it('each hero: one bound relic and one bound signature with the mapped hook, both awarded by their chain', () => {
    const curves = new Set<string>();
    for (const h of HERO_IDS) {
      const mine = Object.values(db.gear).filter((g) => g.boundHero === h);
      const relics = mine.filter((g) => g.archetype === 'relic');
      const sigs = mine.filter((g) => g.archetype === 'signature');
      expect(relics, h).toHaveLength(1);
      expect(sigs, h).toHaveLength(1);
      const sig = sigs[0]!;
      if (sig.archetype === 'signature') expect(sig.hookId).toBe(sigHook[h]);
      const r = relics[0]!;
      if (r.archetype === 'relic') curves.add(`${r.scaling.levelCurve}:${Object.keys(r.scaling.perLevel).sort().join(',')}`);
      const chainQuests = db.quests.filter((q) => q.chain?.id === db.heroes[h].personalChain);
      const rewarded = chainQuests.flatMap((q) => q.rewards).flatMap((x) => (x.type === 'gear' ? [x.gearId] : []));
      expect(rewarded, h).toEqual(expect.arrayContaining([r.id, sig.id]));
    }
    expect(curves.size).toBe(HERO_IDS.length); // distinct curve / stat focus
  });
  it('the slice relic and talon are unchanged', () => {
    const g = db.gear['sig.cinderRingTalon'];
    expect(g?.archetype === 'signature' && g.hookId).toBe(HOOK_COUNTER_ATTACK);
    if (g?.archetype === 'signature') expect(g.hookParams).toEqual({ chance: 0.5, power: 1.1 });
    const r = db.gear['relic.wyrmsLament'];
    expect(r?.archetype === 'relic' && r.scaling.levelCurve).toBe('sqrt');
    expect(db.quests.find((q) => q.id === QUEST.embers)?.rewards).toContainEqual({ type: 'gear', gearId: 'relic.wyrmsLament' });
    expect(db.quests.find((q) => q.id === QUEST.debts)?.rewards).toContainEqual({ type: 'gear', gearId: 'sig.cinderRingTalon' });
  });
  it('all item/gear references resolve', () => {
    for (const [k, g] of Object.entries(db.gear)) expect(g.id).toBe(k);
    for (const [k, it] of Object.entries(db.items)) expect(it.id).toBe(k);
    const itemRefs = [
      ...Object.values(db.enemies).flatMap((e) => e.drops.map((x) => x.itemId)),
      ...Object.values(db.species).flatMap((s) => s.drops.map((x) => x.itemId)),
      ...Object.values(db.fish).flatMap((f) => [f.itemId, ...(f.preferredLure ? [f.preferredLure] : [])]),
      ...db.township.buildings.flatMap((b) => [...b.cost.items, ...b.upgrades.flatMap((u) => u.cost.items)].map((x) => x.itemId)),
      ...Object.keys(db.start.inventory),
    ];
    for (const r of itemRefs) expect(db.items[r], r).toBeDefined();
    for (const [hero, lo] of Object.entries(db.start.loadouts)) {
      for (const [slot, id] of Object.entries(lo ?? {})) {
        const g = db.gear[id ?? ''];
        expect(g?.slot, `${hero}.${slot}`).toBe(slot);
        expect(db.start.gearOwned).toContain(id);
        if (g?.boundHero) expect(g.boundHero).toBe(hero);
      }
    }
    for (const q of db.quests) for (const r of q.rewards) {
      if (r.type === 'gear') expect(db.gear[r.gearId], r.gearId).toBeDefined();
      if (r.type === 'item') expect(db.items[r.itemId], r.itemId).toBeDefined();
    }
  });
  it('every township cost is payable from hunting / fishing / combat drops', () => {
    const droppable = new Set([
      ...Object.values(db.enemies).flatMap((e) => e.drops.map((x) => x.itemId)),
      ...Object.values(db.species).flatMap((s) => s.drops.map((x) => x.itemId)),
      ...Object.values(db.fish).map((f) => f.itemId),
    ]);
    for (const b of db.township.buildings) {
      for (const it of [...b.cost.items, ...b.upgrades.flatMap((u) => u.cost.items)]) expect(droppable.has(it.itemId), `${b.id}: ${it.itemId}`).toBe(true);
    }
  });
});

describe('combat content', () => {
  it('enemies have valid sprites and level-appropriate HP', () => {
    for (const [k, e] of Object.entries(db.enemies)) {
      expect(e.id).toBe(k);
      expect(validSprite(e.sprite), e.sprite).toBe(true);
      expect(e.stats.maxHp).toBeGreaterThanOrEqual(40);
      expect(e.stats.maxHp).toBeLessThanOrEqual(1200);
      expect(e.level).toBeGreaterThanOrEqual(2);
      expect(e.level).toBeLessThanOrEqual(35);
    }
  });
  it('level curve by act: Act I 2–10, Act II 10–24, Act III 22–35', () => {
    const range = { 1: [2, 11], 2: [10, 24], 3: [22, 35] } as const;
    const chainQuest = (c: Condition) => leaves(c).some((l) => (l.kind === 'quest' || l.kind === 'questAtLeast') && db.quests.find((q) => q.id === l.questId)?.chain);
    // Story and roaming zones follow their chunk's act; personal-chain fights return to old chunks later and scale with the chain.
    for (const z of db.world.encounterZones.filter((x) => !x.presentWhen || !chainQuest(x.presentWhen))) {
      const chunk = db.world.chunks.find((c) => `${c.cx},${c.cz}` === chunkKey(z.position));
      const enc = db.encounters[z.encounterId];
      expect(chunk && enc, z.id).toBeTruthy();
      const [lo, hi] = range[chunk!.act];
      for (const id of enc!.enemies) {
        const lv = db.enemies[id]!.level;
        expect(lv, `${z.id}:${id}`).toBeGreaterThanOrEqual(lo);
        expect(lv, `${z.id}:${id}`).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('every occupied region is liberated by a boss encounter placed in its chunk', () => {
    for (const r of db.world.regions.filter((x) => x.occupied)) {
      const enc = Object.values(db.encounters).find((e) => e.liberatesRegion === r.id);
      expect(enc?.boss, r.id).toBe(true);
      const zone = db.world.encounterZones.find((z) => z.encounterId === enc!.id);
      expect(zone && chunkKey(zone.position), r.id).toBe(chunkKey(r.center));
    }
    for (const [k, enc] of Object.entries(db.encounters)) {
      expect(enc.id).toBe(k);
      for (const e of enc.enemies) expect(db.enemies[e], e).toBeDefined();
      if (enc.liberatesRegion) expect(regionIds.has(enc.liberatesRegion)).toBe(true);
      expect(db.world.encounterZones.some((z) => z.encounterId === k) || Object.values(db.dialogues).some((dl) => dl.startsEncounter === k), `${k} is never fought`).toBe(true);
    }
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

describe('quests, story and dialogue', () => {
  it('quest ids are unique and every quest belongs to an act', () => {
    expect(questIds.size).toBe(db.quests.length);
    const inActs = db.acts.flatMap((a) => a.questIds);
    for (const id of inActs) expect(questIds.has(id), id).toBe(true);
    for (const q of db.quests) expect(inActs, q.id).toContain(q.id);
    expect(db.acts.map((a) => a.act)).toEqual([1, 2, 3]);
    for (const a of db.acts) expect(a.beats.length).toBeGreaterThanOrEqual(4);
  });
  it('story graph: ten main chapters, one per authored chunk region, chained by discovery', () => {
    expect(db.storyGraph).toHaveLength(10);
    const chunksSeen = new Set<string>();
    for (const n of db.storyGraph) {
      const q = db.quests.find((x) => x.id === n.questId);
      expect(q?.kind, n.id).toBe('main');
      expect(q?.act).toBe(n.act);
      chunksSeen.add(chunkOfRegion.get(n.regionId) ?? '?');
      const preds = db.storyGraph.filter((m) => m.next.includes(n.id));
      for (const p of preds) {
        const refs = leaves(q!.discoverWhen).filter((l) => l.kind === 'quest' || l.kind === 'questAtLeast').map((l) => (l.kind === 'quest' || l.kind === 'questAtLeast' ? l.questId : ''));
        expect(refs, `${n.id} discovery must wait on ${p.id}`).toContain(p.questId);
      }
    }
    expect(chunksSeen.size).toBe(10);
    expect(db.storyGraph[1]?.questId).toBe(QUEST.ledger);
  });
  it('personal chains: 3 stages for every hero, kind companion, companion set', () => {
    for (const h of HERO_IDS) {
      const stages = db.quests.filter((q) => q.chain?.id === db.heroes[h].personalChain).sort((a, b) => a.chain!.stage - b.chain!.stage);
      expect(stages.map((q) => q.chain!.stage), h).toEqual([1, 2, 3]);
      for (const q of stages) {
        expect(q.kind).toBe('companion');
        expect(q.companion).toBe(h);
        expect(q.chain?.of).toBe(3);
      }
    }
    expect(db.quests.find((q) => q.id === QUEST.embers)?.chain?.stage).toBe(1);
    expect(db.quests.find((q) => q.id === QUEST.debts)?.chain?.stage).toBe(1);
  });
  it('traversal heroes use their own action in every stage of their chain', () => {
    const traversal = { hadrik: 'roll', orla: 'glide', sable: 'grapple', pim: 'leap', moss: 'commune', quill: 'unseal' } as const;
    for (const [h, action] of Object.entries(traversal)) {
      for (const q of db.quests.filter((x) => x.chain?.id === db.heroes[h as keyof typeof traversal].personalChain)) {
        const keys = q.objectives.flatMap((o) => leaves(o.completeWhen)).flatMap((l) => (l.kind === 'flag' ? [l.key] : []));
        expect(keys.some((k) => k.startsWith(`evt:field:${action}:`)), q.id).toBe(true);
      }
    }
  });
  it('investigations: 4–5, 12–16 clues across ≥ 6 chunks, each clue keyed `clue:<id>` and settable', () => {
    const inv = db.quests.filter((q) => q.kind === 'investigation');
    expect(inv.length).toBeGreaterThanOrEqual(4);
    expect(inv.length).toBeLessThanOrEqual(5);
    for (const id of ['investigation.saltLedgers', 'investigation.stilledChoir', 'investigation.ashenRoad']) expect(questIds.has(id)).toBe(true);
    expect(db.clues.length).toBeGreaterThanOrEqual(12);
    expect(db.clues.length).toBeLessThanOrEqual(16);
    const settable = settableFlags();
    for (const c of db.clues) {
      expect(c.foundWhen).toEqual({ kind: 'flag', key: `clue:${c.id}`, equals: true });
      expect(settable.has(`clue:${c.id}`), c.id).toBe(true);
      expect(questIds.has(c.investigationId)).toBe(true);
      expect(regionIds.has(c.regionId)).toBe(true);
    }
    expect(new Set(db.clues.map((c) => chunkOfRegion.get(c.regionId))).size).toBeGreaterThanOrEqual(6);
  });
  it('endings: three or more with distinct priorities; the true ending counts clues, recruits and chains', () => {
    expect(db.endings.length).toBeGreaterThanOrEqual(3);
    expect(new Set(db.endings.map((e) => e.priority)).size).toBe(db.endings.length);
    const best = db.endings.reduce((a, b) => (b.priority > a.priority ? b : a));
    const counts = (best.when.kind === 'all' ? best.when.of : []).flatMap((c) => (c.kind === 'all' ? c.of : [c])).filter((c) => c.kind === 'count');
    expect(counts.length).toBe(3);
    expect(JSON.stringify(best.when)).toMatch(/evt:choice:dlg\.flameHeart\.choice:unbind/);
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
          expect(settable.has(leaf.key), `${where}: flag ${leaf.key} is never set`).toBe(true);
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
          case 'choice': {
            const choiceId = rest[rest.length - 1] ?? '';
            expect(db.dialogues[rest.slice(0, -1).join(':')]?.choices?.some((ch) => ch.id === choiceId), msg).toBe(true);
            break;
          }
          case 'field': {
            const [action, ...t] = rest;
            const target = t.join(':');
            const def = db.fieldActions[action as keyof typeof db.fieldActions];
            expect(def, msg).toBeDefined();
            if (def?.clears) {
              const gate = db.world.traversalGates.find((g) => g.id === target);
              expect(gate?.kind, msg).toBe(def.clears);
              break;
            }
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
  it('dialogue events reference real quests / encounters; givers exist', () => {
    for (const e of allEvents()) if (e.type === 'acceptQuest') expect(questIds.has(e.questId), e.questId).toBe(true);
    for (const dl of Object.values(db.dialogues)) if (dl.startsEncounter) expect(db.encounters[dl.startsEncounter]).toBeDefined();
    for (const q of db.quests) if (q.giver) expect(npcIds.has(q.giver), `${q.id}: ${q.giver}`).toBe(true);
    for (const q of db.quests.filter((x) => x.kind === 'main' || x.kind === 'township')) {
      const offered = allEvents().some((e) => e.type === 'acceptQuest' && e.questId === q.id);
      expect(offered, `${q.id} needs an accept choice`).toBe(true);
    }
  });
  it('NPC dialogue lists resolve and end with an `always` fallback; dialogues are 2–5 lines and all reachable', () => {
    const used = new Set<string>();
    for (const n of db.world.npcs) {
      expect(n.dialogues[n.dialogues.length - 1]?.when, n.id).toEqual({ kind: 'always' });
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
});

describe('continent', () => {
  it('ten authored chunks in the required layout, (0,0) included', () => {
    const expected = { '0,-1': ['ruin', 1], '0,0': ['frontier', 1], '-1,-1': ['skyreach', 1], '-1,0': ['highland', 1], '-2,0': ['marsh', 2], '-2,1': ['desert', 2], '-1,1': ['forest', 2], '-1,-2': ['tundra', 2], '0,-2': ['volcanic', 3], '0,1': ['ruin', 3] } as const;
    expect(db.world.chunks).toHaveLength(10);
    for (const c of db.world.chunks) {
      const e = expected[`${c.cx},${c.cz}` as keyof typeof expected];
      expect(e, `${c.cx},${c.cz}`).toBeDefined();
      expect([c.biome, c.act]).toEqual(e);
      expect(c.scatterProps.length).toBeGreaterThanOrEqual(2);
      expect(c.scatterProps.length).toBeLessThanOrEqual(4);
      expect(c.foliageDensity).toBeGreaterThanOrEqual(0);
      expect(c.foliageDensity).toBeLessThanOrEqual(1);
    }
  });

  it('each new chunk has 1–3 regions, 15–30 props, 6–10 NPCs, 3–7 zones incl. a boss, 1–2 fishing spots', () => {
    for (const c of db.world.chunks.filter((x) => !(x.cx === 0 && x.cz === 0))) {
      const k = `${c.cx},${c.cz}`;
      const here = <T extends { position: Vec2 }>(xs: readonly T[]) => xs.filter((x) => chunkKey(x.position) === k).length;
      const regions = db.world.regions.filter((r) => chunkKey(r.center) === k).length;
      expect(regions, k).toBeGreaterThanOrEqual(1);
      expect(regions, k).toBeLessThanOrEqual(3);
      expect(here(db.world.props), k).toBeGreaterThanOrEqual(15);
      expect(here(db.world.props), k).toBeLessThanOrEqual(30);
      expect(here(db.world.npcs), k).toBeGreaterThanOrEqual(6);
      expect(here(db.world.npcs), k).toBeLessThanOrEqual(10);
      const zones = db.world.encounterZones.filter((z) => chunkKey(z.position) === k);
      expect(zones.length, k).toBeGreaterThanOrEqual(3);
      expect(zones.length, k).toBeLessThanOrEqual(7);
      expect(zones.some((z) => db.encounters[z.encounterId]?.boss && db.encounters[z.encounterId]?.liberatesRegion), k).toBe(true);
      expect(here(db.world.fishingSpots), k).toBeGreaterThanOrEqual(1);
      expect(here(db.world.fishingSpots), k).toBeLessThanOrEqual(2);
    }
  });

  it('every positioned entity sits inside an authored chunk; solids are on land and ≥ 3 m apart', () => {
    const solid = [
      ...db.world.npcs.map((n) => ({ id: n.id, p: n.position })),
      ...db.world.props.map((p, i) => ({ id: `prop#${i}:${p.kind}`, p: p.position })),
      ...db.township.recruits.map((r) => ({ id: `${r.npcId}@township`, p: r.townshipPosition })),
    ];
    for (const s of solid) {
      expect(inAuthoredChunk(s.p), s.id).toBe(true);
      expect(waterDepth(s.p), `${s.id} is in water`).toBeLessThan(-1);
    }
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        if (Math.abs(a.p.x - b.p.x) < 3 && Math.abs(a.p.z - b.p.z) < 3) expect(d(a.p, b.p), `${a.id} ↔ ${b.id}`).toBeGreaterThanOrEqual(3);
      }
    }
    const misc = [
      db.world.playerStart,
      ...db.world.encounterZones.map((z) => z.position),
      ...db.township.plots.map((p) => p.position),
      ...Object.values(db.species).flatMap((s) => s.habitat.map((h) => h.center)),
    ];
    for (const r of db.world.regions) expect(inAuthoredChunk(r.center), r.id).toBe(true);
    for (const p of misc) {
      expect(inAuthoredChunk(p), JSON.stringify(p)).toBe(true);
      expect(waterDepth(p), JSON.stringify(p)).toBeLessThan(0);
    }
    for (const path of db.world.paths) for (const p of path.points) {
      expect(inAuthoredChunk(p) || authored.has(chunkKey({ x: p.x - 0.01, z: p.z - 0.01 })), JSON.stringify(p)).toBe(true);
      expect(waterDepth(p), `path point ${JSON.stringify(p)} in water`).toBeLessThan(0);
    }
  });

  it('paths connect every chunk to its story neighbours across chunk edges', () => {
    const { free, gated } = chunkLinks(db);
    const links = new Set([...free, ...gated.keys()]);
    const seen = new Set(['0,0']);
    const queue = ['0,0'];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const l of links) {
        const [a, b] = l.split('|') as [string, string];
        const other = a === cur ? b : b === cur ? a : null;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    expect(seen.size).toBe(10);
  });

  it('12–20 traversal gates with walkable sides; each Act II/III chunk is entered through one', () => {
    const gates = db.world.traversalGates;
    expect(gates.length).toBeGreaterThanOrEqual(12);
    expect(gates.length).toBeLessThanOrEqual(20);
    expect(gateIds.size).toBe(gates.length);
    for (const g of gates) {
      expect(inAuthoredChunk(g.position), g.id).toBe(true);
      expect(g.width).toBeGreaterThan(0);
      expect(g.depth).toBeGreaterThan(0);
      for (const s of g.sides) {
        expect(inAuthoredChunk(s), `${g.id} side`).toBe(true);
        expect(waterDepth(s), `${g.id} side in water`).toBeLessThan(0);
      }
      expect(d(g.sides[0], g.sides[1]), g.id).toBeGreaterThanOrEqual(g.depth);
      expect(d(g.sides[0], g.position) + d(g.sides[1], g.position)).toBeLessThan(d(g.sides[0], g.sides[1]) + 1);
    }
    const { gated, free } = chunkLinks(db);
    for (const c of db.world.chunks.filter((x) => x.act >= 2)) {
      const k = `${c.cx},${c.cz}`;
      expect([...free].some((l) => l.split('|').includes(k)), `${k} has an ungated road in`).toBe(false);
      expect([...gated.keys()].some((l) => l.split('|').includes(k)), `${k} needs an entry gate`).toBe(true);
    }
  });

  it('fishing spots sit on the shore of real water, list real fish, keep the merchant and hidden spots', () => {
    for (const s of db.world.fishingSpots) {
      const depth = waterDepth(s.position);
      expect(depth, s.id).toBeLessThan(0);
      expect(depth, s.id).toBeGreaterThan(-6);
      for (const f of s.fish) expect(db.fish[f], f).toBeDefined();
    }
    expect(db.world.fishingSpots.filter((s) => s.merchantFish).map((s) => s.merchantFish)).toEqual(['fish.lanternEel']);
    expect(db.world.fishingSpots.find((s) => s.id === SPOT.drownedShrine)?.hiddenUntilDrakeSight).toBe(true);
    expect(Object.values(db.fish).some((f) => f.rarity === 'legend')).toBe(true);
  });

  it('wildlife and fish per biome chunk: 2–4 species with distinct profiles, 2–4 fish incl. a rare', () => {
    for (const c of db.world.chunks) {
      const k = `${c.cx},${c.cz}`;
      const sp = Object.values(db.species).filter((s) => s.habitat.some((h) => chunkKey(h.center) === k));
      expect(sp.length, k).toBeGreaterThanOrEqual(2);
      expect(sp.length, k).toBeLessThanOrEqual(4);
      expect(new Set(sp.map((s) => `${s.alertRadius}/${s.scentSensitivity}`)).size, k).toBe(sp.length);
      const fish = new Set(db.world.fishingSpots.filter((s) => chunkKey(s.position) === k).flatMap((s) => s.fish));
      expect(fish.size, k).toBeGreaterThanOrEqual(2);
      expect([...fish].some((f) => ['rare', 'legend'].includes(db.fish[f]?.rarity ?? '')), k).toBe(true);
    }
    const maxAnimals = Object.values(db.species).reduce((n, s) => n + s.herd.max * s.habitat.length, 0);
    expect(maxAnimals).toBeLessThanOrEqual(60);
  });

  it('player starts in Lanternwick; regions are distinct', () => {
    const lw = db.world.regions.find((r) => r.id === 'lanternwick')!;
    expect(d(db.world.playerStart, lw.center)).toBeLessThan(lw.radius);
    expect(regionIds.size).toBe(db.world.regions.length);
    expect(chunkKey(db.world.playerStart)).toBe('0,0');
  });
});

describe('township', () => {
  it('≥ 6 residents, buildings and plots; carpenter + blacksmith first; every building upgradable to 3 with a story gate', () => {
    expect(db.township.recruits.length).toBeGreaterThanOrEqual(6);
    expect(db.township.buildings.length).toBeGreaterThanOrEqual(6);
    expect(db.township.plots.length).toBeGreaterThanOrEqual(6);
    expect(db.township.recruits.slice(0, 2).map((r) => r.npcId)).toEqual(['npc.carpenterBram', 'npc.smithGilda']);
    for (const b of db.township.buildings) {
      expect(db.township.recruits.some((r) => r.npcId === b.requiresRecruit && r.unlocksBuildings.includes(b.id)), b.id).toBe(true);
      expect(db.township.plots.some((p) => p.accepts.includes(b.id))).toBe(true);
      expect(b.upgrades.map((u) => u.level)).toEqual([2, 3]);
      expect(b.upgrades[1]?.requires, `${b.id} level 3 needs a story gate`).toBeDefined();
      expect(b.upgrades[0]!.propScale).toBeGreaterThan(1);
      expect(b.upgrades[1]!.propScale).toBeGreaterThan(b.upgrades[0]!.propScale);
    }
    for (const r of db.township.recruits) expect(npcIds.has(r.npcId)).toBe(true);
    // Residents are found across the continent.
    expect(new Set(db.township.recruits.map((r) => chunkKey(db.world.npcs.find((n) => n.id === r.npcId)!.position))).size).toBeGreaterThanOrEqual(4);
    expect(db.quests.filter((q) => q.kind === 'township').length).toBe(db.township.recruits.length);
  });

  it('the database is deep-frozen and the systems build from it', () => {
    expect(Object.isFrozen(db)).toBe(true);
    expect(Object.isFrozen(db.world.npcs[0])).toBe(true);
    expect(() => createWorldSystems(db)).not.toThrow();
  });
});
