import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@/types/contracts';
import type { AssetManifestEntry, StatusId } from '@/types/contracts';
import { allAssetRequests, phase3Assets } from '@/assets/manifests';
import { gameData as db } from '@/data';
import { HAZARD } from '@/data/hazards';
import { MOUNT } from '@/data/mounts';

const STATUSES: readonly StatusId[] = ['burn', 'soak', 'stun', 'guardUp', 'atkUp', 'defDown', 'regen'];
const assetIds = new Set(db.assetRequests.map((a) => a.asset_id));

/** The reaction a hit of `element` triggers (lowest priority wins), given target statuses and side hazards. */
function react(element: string, statuses: readonly StatusId[], hazards: readonly string[]) {
  return [...db.reactions]
    .sort((a, b) => a.priority - b.priority)
    .find((r) => r.element === element
      && (r.when.targetStatus === undefined || statuses.includes(r.when.targetStatus))
      && (r.when.sideHazard === undefined || hazards.includes(r.when.sideHazard)));
}

describe('elemental interaction matrix', () => {
  it('every hazard is well-formed and balanced', () => {
    expect(Object.keys(db.hazards).length).toBeGreaterThanOrEqual(5);
    for (const [id, h] of Object.entries(db.hazards)) {
      expect(h.id).toBe(id);
      expect(h.durationRounds).toBeGreaterThanOrEqual(1);
      expect(h.durationRounds).toBeLessThanOrEqual(4);
      if (h.dot) {
        expect(ELEMENTS).toContain(h.dot.element);
        expect(h.dot.fraction).toBeGreaterThan(0);
        expect(h.dot.fraction).toBeLessThanOrEqual(0.08);
      }
      if (h.inflicts) expect(STATUSES).toContain(h.inflicts.status);
      for (const [el, m] of Object.entries(h.amplifies ?? {})) {
        expect(ELEMENTS).toContain(el);
        expect(m).toBeGreaterThan(1);
        expect(m).toBeLessThanOrEqual(1.6);
      }
      if (h.obscures !== undefined) expect(h.obscures).toBeGreaterThan(0), expect(h.obscures).toBeLessThan(0.6);
      expect(assetIds.has(h.iconAssetId), h.iconAssetId).toBe(true);
      expect(assetIds.has(h.fxAssetId), h.fxAssetId).toBe(true);
    }
  });

  it('every reaction references real elements, statuses and hazards, with unique ids and unambiguous priorities', () => {
    const ids = new Set<string>();
    for (const r of db.reactions) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(ELEMENTS).toContain(r.element);
      if (r.when.targetStatus) expect(STATUSES).toContain(r.when.targetStatus);
      if (r.when.sideHazard) expect(db.hazards[r.when.sideHazard], r.id).toBeDefined();
      if (r.spawns) expect(db.hazards[r.spawns], r.id).toBeDefined();
      if (r.consumes?.hazard) expect(db.hazards[r.consumes.hazard], r.id).toBeDefined();
      if (r.consumes?.status) expect(STATUSES).toContain(r.consumes.status);
      if (r.inflicts) expect(STATUSES).toContain(r.inflicts.status);
      expect(r.spawns || r.consumes || r.bonusDamage || r.inflicts, r.id).toBeTruthy();
    }
    const prios = db.reactions.map((r) => r.priority);
    expect(new Set(prios).size).toBe(prios.length);
    // Every hazard is reachable from some reaction.
    for (const id of Object.keys(db.hazards)) expect(db.reactions.some((r) => r.spawns === id), id).toBe(true);
  });

  it('the required chains resolve as designed', () => {
    expect(react('water', ['burn'], [])?.spawns).toBe(HAZARD.steamVent);
    expect(react('water', [], [])?.spawns).toBe(HAZARD.waterPuddle);
    const live = react('lightning', [], [HAZARD.waterPuddle]);
    expect(live?.spawns).toBe(HAZARD.electrifiedWater);
    expect(live?.consumes?.hazard).toBe(HAZARD.waterPuddle);
    const freeze = react('ice', [], [HAZARD.waterPuddle]);
    expect(freeze?.spawns).toBe(HAZARD.frozenLake);
    expect(freeze?.consumes?.hazard).toBe(HAZARD.waterPuddle);
    const thaw = react('fire', [], [HAZARD.frozenLake]);
    expect(thaw?.spawns).toBe(HAZARD.steamVent);
    expect(thaw?.consumes?.hazard).toBe(HAZARD.frozenLake);
    // Smoke: fire into steam, or wind/earth fanning an ember field.
    expect(react('fire', [], [HAZARD.steamVent])?.spawns).toBe(HAZARD.smokeCloud);
    expect(react('wind', [], [HAZARD.emberField])?.spawns).toBe(HAZARD.smokeCloud);
    expect(react('earth', [], [HAZARD.emberField])?.spawns).toBe(HAZARD.smokeCloud);
    expect(react('wind', [], [HAZARD.smokeCloud])?.consumes?.hazard).toBe(HAZARD.smokeCloud);
    // Terrain beats status: fire on a burning foe standing in steam makes smoke, not embers.
    expect(react('fire', ['burn'], [HAZARD.steamVent])?.spawns).toBe(HAZARD.smokeCloud);
    expect(react('fire', ['burn'], [])?.spawns).toBe(HAZARD.emberField);
  });

  it('the full water → lightning / ice → fire → smoke loop is playable step by step', () => {
    let side: string[] = [];
    const apply = (el: string, statuses: StatusId[] = []) => {
      const r = react(el, statuses, side);
      if (!r) return;
      if (r.consumes?.hazard) side = side.filter((h) => h !== r.consumes?.hazard);
      if (r.spawns && !side.includes(r.spawns)) side = [...side, r.spawns];
    };
    apply('water');
    expect(side).toEqual([HAZARD.waterPuddle]);
    apply('ice');
    expect(side).toEqual([HAZARD.frozenLake]);
    apply('fire');
    expect(side).toEqual([HAZARD.steamVent]);
    apply('fire');
    expect(side).toEqual([HAZARD.smokeCloud]);
    apply('wind');
    expect(side).toEqual([]);
  });

  it('lightning and ice appear in skills, forms and enemy affinities; every act fields water and fire users', () => {
    const skills = Object.values(db.skills);
    for (const el of ['lightning', 'ice'] as const) {
      expect(skills.some((s) => s.element === el), el).toBe(true);
      expect(Object.values(db.enemies).some((e) => e.affinities[el] !== undefined), el).toBe(true);
    }
    const thunder = db.dragonForms['form.thunderDrake'];
    expect(thunder?.element).toBe('lightning');
    for (const id of thunder?.skills ?? []) expect(db.skills[id]?.element).toBe('lightning');
    for (const id of db.dragonForms['form.rimeWyrm']?.skills ?? []) expect(db.skills[id]?.element).toBe('ice');

    // Enemies per act, via the chunk that hosts their encounter zones.
    const actOfZone = new Map<string, number>();
    for (const c of db.world.chunks) {
      for (const z of db.world.encounterZones) {
        const cx = Math.floor(z.position.x / 250);
        const cz = Math.floor(z.position.z / 250);
        if (cx === c.cx && cz === c.cz) actOfZone.set(z.encounterId, c.act);
      }
    }
    for (const act of [1, 2, 3]) {
      const enemyIds = Object.values(db.encounters).filter((e) => actOfZone.get(e.id) === act).flatMap((e) => e.enemies);
      const els = new Set(enemyIds.flatMap((id) => db.enemies[id]?.skills ?? []).map((s) => db.skills[s]?.element));
      expect(els.has('water'), `act ${act} water`).toBe(true);
      expect(els.has('fire'), `act ${act} fire`).toBe(true);
    }
  });
});

describe('quick-time heavy skills', () => {
  const withQte = Object.values(db.skills).filter((s) => s.qte);

  it('every spec sits inside the tuning ranges', () => {
    expect(withQte.length).toBeGreaterThan(0);
    for (const s of withQte) {
      const q = s.qte!;
      expect(q.prompts, s.id).toBeGreaterThanOrEqual(2);
      expect(q.prompts, s.id).toBeLessThanOrEqual(4);
      expect(q.windowMs).toBeGreaterThanOrEqual(700);
      expect(q.windowMs).toBeLessThanOrEqual(1100);
      expect(q.perfectWithin).toBeGreaterThanOrEqual(0.35);
      expect(q.perfectWithin).toBeLessThanOrEqual(0.55);
      expect(q.goodMultiplier).toBeGreaterThanOrEqual(1.2);
      expect(q.goodMultiplier).toBeLessThanOrEqual(1.4);
      expect(q.perfectMultiplier).toBeGreaterThanOrEqual(1.5);
      expect(q.perfectMultiplier).toBeLessThanOrEqual(1.75);
      expect(q.perfectMultiplier).toBeGreaterThan(q.goodMultiplier);
      expect(q.hitStopMs).toBeGreaterThanOrEqual(80);
      expect(q.hitStopMs).toBeLessThanOrEqual(140);
      expect(q.pool).toContain('tap');
      expect(q.pool.filter((i) => i !== 'tap').length).toBeGreaterThanOrEqual(2);
      expect(s.kind === 'physical' || s.kind === 'magical', s.id).toBe(true);
    }
  });

  it('each playable starter hero has 1–2 QTE heavies and every dragon form has a QTE finisher', () => {
    for (const h of ['kael', 'tobin', 'vesna'] as const) {
      const n = db.heroes[h].skills.filter((s) => db.skills[s.skillId]?.qte).length;
      expect(n, h).toBeGreaterThanOrEqual(1);
      expect(n, h).toBeLessThanOrEqual(2);
    }
    for (const f of Object.values(db.dragonForms)) expect(f.skills.some((s) => db.skills[s]?.qte), f.id).toBe(true);
  });
});

describe('stamina and mounts', () => {
  it('sprint lasts 6–8 s from full with a ~0.8 s regen delay', () => {
    const t = db.stamina;
    const secs = t.max / t.sprintDrainPerSec;
    expect(secs).toBeGreaterThanOrEqual(6);
    expect(secs).toBeLessThanOrEqual(8);
    expect(t.regenDelaySec).toBeGreaterThanOrEqual(0.6);
    expect(t.regenDelaySec).toBeLessThanOrEqual(1);
    expect(t.recoverFraction).toBeGreaterThan(0);
    expect(t.recoverFraction).toBeLessThan(1);
  });

  it('defines Kael\'s drake flight and a ground beast mount', () => {
    const flight = db.mounts[MOUNT.drakeFlight]!;
    const beast = db.mounts[MOUNT.thornbackStrider]!;
    expect(flight.kind).toBe('flight');
    expect(flight.hero).toBe('kael');
    expect(flight.ignoresCollision).toBe(true);
    expect(flight.altitude).toBeGreaterThanOrEqual(10);
    expect(flight.speed).toBeGreaterThan(beast.speed);
    expect(beast.kind).toBe('beast');
    expect(beast.ignoresCollision).toBe(false);
    // Flight pulls the camera back and up relative to the beast.
    expect(flight.camera.distance).toBeGreaterThan(beast.camera.distance);
    expect(flight.camera.pitchDeg).toBeGreaterThan(beast.camera.pitchDeg);
    for (const m of [flight, beast]) {
      expect(m.boostSpeed).toBeGreaterThan(m.speed);
      expect(assetIds.has(m.assetId), m.assetId).toBe(true);
      expect(assetIds.has(m.iconAssetId), m.iconAssetId).toBe(true);
      expect(m.unlockText.length).toBeGreaterThan(10);
    }
  });
});

describe('asset requests', () => {
  const SCHEMA_KEYS = ['asset_id', 'type', 'target_path', 'resolution', 'grid', 'fps', 'loop', 'alpha_channel', 'prompt_spec', 'status', 'category', 'animation_states'];
  const DENY = /breath of fire|capcom|square ?enix|octopath|nintendo|zelda|final fantasy|pok[eé]mon|ghibli|chrono|dragon quest|toriyama|sega|atlus|persona|fire emblem|mario|metroid|castlevania|konami|bandai|namco|tales of|xenoblade|kingdom hearts|disney|pixar|blizzard|warcraft|elden|fromsoft|souls|genshin|mihoyo|hoyoverse|sprite ?project|in the style of|by artist/i;

  it('the database requests exactly the manifest set', () => {
    expect(db.assetRequests).toEqual(allAssetRequests);
    expect(allAssetRequests.length).toBeGreaterThanOrEqual(phase3Assets.length);
  });

  it('every entry is unique, pending, lives under public/assets/generated and has consistent grids', () => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const a of db.assetRequests) {
      expect(ids.has(a.asset_id), a.asset_id).toBe(false);
      expect(paths.has(a.target_path), a.target_path).toBe(false);
      ids.add(a.asset_id);
      paths.add(a.target_path);
      expect(a.asset_id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(a.status).toBe('pending');
      expect(a.target_path).toMatch(/^public\/assets\/generated\/(mounts|fx|hud|qte)\/[a-z0-9_]+\.(webp|png)$/);
      expect(a.target_path.endsWith(`${a.asset_id}.${a.type === 'spritesheet' ? 'webp' : 'png'}`), a.asset_id).toBe(true);
      expect(a.prompt_spec.length).toBeGreaterThan(60);
      if (a.type === 'spritesheet') {
        expect(a.grid, a.asset_id).toBeDefined();
        expect(a.fps).toBeGreaterThan(0);
        expect(typeof a.loop).toBe('boolean');
      }
      if (a.grid) {
        expect(a.grid.columns * a.grid.frame_width, a.asset_id).toBe(a.resolution.width);
        expect(a.grid.rows * a.grid.frame_height, a.asset_id).toBe(a.resolution.height);
      }
      for (const s of a.animation_states ?? []) {
        expect(a.grid).toBeDefined();
        expect(s.row).toBeLessThan(a.grid!.rows);
        expect(s.from + s.count).toBeLessThanOrEqual(a.grid!.columns);
      }
      if (a.grid && a.grid.rows > 1) expect(a.animation_states?.length, a.asset_id).toBeGreaterThan(0);
    }
  });

  it('prompts describe an original style and never name existing games, studios or artists', () => {
    for (const a of db.assetRequests) {
      expect(DENY.test(a.prompt_spec), a.asset_id).toBe(false);
      expect(a.prompt_spec).toMatch(/Emberwake/);
    }
  });

  it('serialises to exactly the shared schema keys', () => {
    const round = JSON.parse(JSON.stringify(db.assetRequests)) as AssetManifestEntry[];
    expect(round).toEqual(db.assetRequests);
    for (const a of round) {
      for (const k of Object.keys(a)) expect(SCHEMA_KEYS, `${a.asset_id}.${k}`).toContain(k);
      for (const k of ['asset_id', 'type', 'target_path', 'resolution', 'alpha_channel', 'prompt_spec', 'status']) expect(a, k).toHaveProperty(k);
      expect(Object.keys(a.resolution).sort()).toEqual(['height', 'width']);
      if (a.grid) expect(Object.keys(a.grid).sort()).toEqual(['columns', 'frame_height', 'frame_width', 'rows']);
    }
  });

  it('covers both mounts (8 facings, rider sheets), every hazard, every QTE input and grade, and the stamina gauge', () => {
    const by = (c: string) => db.assetRequests.filter((a) => a.category === c);
    const mountSheets = by('mount');
    expect(mountSheets.length).toBeGreaterThanOrEqual(4);
    for (const m of mountSheets) expect(m.grid?.rows).toBe(8);
    expect(mountSheets.some((a) => /drake.*rider_kael/.test(a.asset_id))).toBe(true);
    expect(mountSheets.some((a) => /strider.*rider/.test(a.asset_id))).toBe(true);
    for (const st of ['idle', 'move', 'takeoff', 'land']) {
      expect(db.assetRequests.find((a) => a.asset_id === db.mounts[MOUNT.drakeFlight]?.assetId)?.animation_states?.some((s) => s.name.startsWith(`${st}_`)), st).toBe(true);
    }
    for (const h of Object.values(db.hazards)) {
      expect(db.assetRequests.find((a) => a.asset_id === h.fxAssetId)?.loop, h.id).toBe(true);
    }
    for (const dir of ['up', 'down', 'left', 'right', 'tap']) {
      const a = by('qte').find((x) => x.asset_id.includes(`_${dir}_`));
      expect(a, dir).toBeDefined();
      expect(a?.animation_states?.map((s) => s.name)).toEqual(['idle', 'hit', 'perfect']);
    }
    for (const g of ['good', 'perfect', 'miss', 'ring']) expect(by('qte').some((a) => a.asset_id.includes(g)), g).toBe(true);
    expect(by('hud').some((a) => a.asset_id.includes('stamina') && a.asset_id.includes('frame'))).toBe(true);
    expect(by('hud').some((a) => a.asset_id.includes('stamina') && a.asset_id.includes('fill'))).toBe(true);
  });
});
