import type { EncounterDef, EnemyDef } from '@/types/contracts';
import { ENC, REGION } from './ids';

/**
 * Slice party (L3–5, gear on): atk ~20–25, def ~12–16, 66–90 HP.
 * Enemy HP 40–160 so encounters last 3–6 rounds.
 * Drops with chance 1 are guaranteed (quest-critical key items).
 */
export const enemies = {
  thornwolf: {
    id: 'thornwolf', name: 'Thornback Wolf', sprite: 'enemy.beast.thornwolf', level: 2,
    stats: { maxHp: 52, maxAp: 10, atk: 13, def: 7, mag: 3, res: 6, spd: 14, luck: 5 },
    affinities: { fire: 1.3, earth: 0.9 },
    skills: ['skill.enemy.rend', 'skill.enemy.packHowl'],
    xp: 18, coin: 6, skillBias: 0.35,
    drops: [{ itemId: 'item.wolfPelt', chance: 0.6 }, { itemId: 'item.tonic', chance: 0.15 }],
  },
  stilledWisp: {
    id: 'stilledWisp', name: 'Stilled Wisp', sprite: 'enemy.wisp.stilled', level: 3,
    stats: { maxHp: 40, maxAp: 14, atk: 6, def: 14, mag: 14, res: 8, spd: 11, luck: 4 },
    affinities: { physical: 0.7, fire: 1.5, holy: 0.5, water: 0.8 },
    skills: ['skill.enemy.stillChill'],
    xp: 20, coin: 4, skillBias: 0.6,
    drops: [{ itemId: 'item.wispDust', chance: 0.7 }, { itemId: 'item.emberDraught', chance: 0.12 }],
  },
  shoreclaw: {
    id: 'shoreclaw', name: 'Shoreclaw', sprite: 'enemy.beast.shoreclaw', level: 3,
    stats: { maxHp: 62, maxAp: 10, atk: 14, def: 16, mag: 2, res: 6, spd: 7, luck: 4 },
    affinities: { water: 0.5, fire: 1.2, earth: 1.3 },
    skills: ['skill.enemy.pinch', 'skill.enemy.shellUp'],
    xp: 22, coin: 8, skillBias: 0.4,
    drops: [{ itemId: 'item.shoreclawShell', chance: 0.65 }, { itemId: 'item.tonic', chance: 0.2 }],
  },
  covenantAcolyte: {
    id: 'covenantAcolyte', name: 'Covenant Acolyte', sprite: 'enemy.humanoid.acolyte', level: 3,
    stats: { maxHp: 50, maxAp: 18, atk: 8, def: 8, mag: 13, res: 12, spd: 10, luck: 5 },
    affinities: { holy: 0.6, shadow: 1.3 },
    skills: ['skill.enemy.acolyteMend', 'skill.enemy.stillingHymn'],
    xp: 22, coin: 12, skillBias: 0.5,
    drops: [{ itemId: 'item.tonic', chance: 0.35 }, { itemId: 'item.covenantIron', chance: 0.3 }],
  },
  titheWarden: {
    id: 'titheWarden', name: 'Tithe-Warden', sprite: 'enemy.humanoid.titheWarden', level: 4,
    stats: { maxHp: 75, maxAp: 12, atk: 16, def: 12, mag: 5, res: 8, spd: 9, luck: 5 },
    affinities: { holy: 0.8, fire: 1.1 },
    skills: ['skill.enemy.titheStrike'],
    xp: 28, coin: 15, skillBias: 0.4,
    drops: [{ itemId: 'item.covenantIron', chance: 0.6 }, { itemId: 'item.tonic', chance: 0.2 }],
  },
  wagonCaptain: {
    id: 'wagonCaptain', name: 'Wagon-Captain Ferris', sprite: 'enemy.humanoid.wagonCaptain', level: 4,
    stats: { maxHp: 110, maxAp: 16, atk: 17, def: 13, mag: 6, res: 9, spd: 10, luck: 6 },
    affinities: { holy: 0.9 },
    skills: ['skill.enemy.titheStrike', 'skill.enemy.crowdRoar'],
    xp: 45, coin: 30, skillBias: 0.45,
    drops: [{ itemId: 'item.trueLedgerPage', chance: 1 }, { itemId: 'item.covenantIron', chance: 1 }],
  },
  deaconVash: {
    id: 'deaconVash', name: 'Deacon Vash of the Still Flame', sprite: 'enemy.humanoid.deaconVash', level: 5,
    stats: { maxHp: 160, maxAp: 30, atk: 15, def: 14, mag: 20, res: 15, spd: 11, luck: 8 },
    affinities: { holy: 0.5, fire: 0.9, shadow: 1.4 },
    skills: ['skill.enemy.judgement', 'skill.enemy.stillingHymn', 'skill.enemy.acolyteMend'],
    xp: 110, coin: 80, skillBias: 0.55,
    drops: [{ itemId: 'item.covenantIron', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.6 }, { itemId: 'item.phoenixAsh', chance: 0.4 }],
  },
  ringChampion: {
    id: 'ringChampion', name: 'Halvard the Unbowed', sprite: 'enemy.humanoid.ringChampion', level: 5,
    stats: { maxHp: 130, maxAp: 20, atk: 18, def: 12, mag: 4, res: 9, spd: 12, luck: 9 },
    affinities: { fire: 0.8 },
    skills: ['skill.enemy.ringFlourish', 'skill.enemy.crowdRoar'],
    xp: 70, coin: 60, skillBias: 0.5,
    drops: [{ itemId: 'item.hiTonic', chance: 0.5 }, { itemId: 'item.emberDraught', chance: 0.5 }],
  },
  ringHound: {
    id: 'ringHound', name: 'Ring-Hound', sprite: 'enemy.beast.ringHound', level: 4,
    stats: { maxHp: 55, maxAp: 8, atk: 14, def: 8, mag: 2, res: 6, spd: 15, luck: 5 },
    affinities: { fire: 0.8, water: 1.2 },
    skills: ['skill.enemy.rend'],
    xp: 24, coin: 5, skillBias: 0.3,
    drops: [{ itemId: 'item.wolfPelt', chance: 0.4 }],
  },
} satisfies Record<string, EnemyDef>;

export const encounters = {
  [ENC.thornwolves]: {
    id: ENC.thornwolves, name: 'Thornback Pack', enemies: ['thornwolf', 'thornwolf', 'thornwolf'], canFlee: true,
  },
  [ENC.wisps]: {
    id: ENC.wisps, name: 'Stilled Wisps of the Tarn', enemies: ['stilledWisp', 'stilledWisp', 'stilledWisp'], canFlee: true,
  },
  [ENC.shoreclaws]: {
    id: ENC.shoreclaws, name: 'Shoreclaw Shallows', enemies: ['shoreclaw', 'shoreclaw'], canFlee: true,
  },
  [ENC.wagon]: {
    id: ENC.wagon, name: 'The Tithe Wagon', enemies: ['wagonCaptain', 'titheWarden', 'covenantAcolyte'], canFlee: true,
  },
  [ENC.tithePost]: {
    id: ENC.tithePost, name: 'Greyford Tithe-Post', enemies: ['deaconVash', 'titheWarden', 'covenantAcolyte'],
    canFlee: false, boss: true, liberatesRegion: REGION.tithePost,
  },
  [ENC.cinderRing]: {
    id: ENC.cinderRing, name: 'Bout of the Cinder Ring', enemies: ['ringChampion', 'ringHound'], canFlee: false,
  },
} satisfies Record<string, EncounterDef>;
