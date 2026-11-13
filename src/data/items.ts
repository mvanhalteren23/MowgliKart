import type { ConsumableDef } from '@/types/contracts';

export const items = {
  /* ── Consumables ──────────────────────────────────────────────────── */
  'item.tonic': { id: 'item.tonic', name: 'Hearth Tonic', description: 'Restores 40 HP.', icon: '🧪', kind: 'heal', potency: 40, value: 12 },
  'item.hiTonic': { id: 'item.hiTonic', name: 'Strong Hearth Tonic', description: 'Restores 90 HP.', icon: '⚗️', kind: 'heal', potency: 90, value: 30 },
  'item.emberDraught': { id: 'item.emberDraught', name: 'Ember Draught', description: 'Restores 15 AP.', icon: '🔥', kind: 'ap', potency: 15, value: 20 },
  'item.phoenixAsh': { id: 'item.phoenixAsh', name: 'Rekindling Ash', description: 'Revives a fallen ally at 50 % HP.', icon: '🪶', kind: 'revive', potency: 0.5, value: 60 },
  'item.smokedVenison': { id: 'item.smokedVenison', name: 'Smoked Venison', description: 'Frontier ration. Restores 55 HP.', icon: '🍖', kind: 'heal', potency: 55, value: 18 },

  /* ── Materials (hunting / combat) ─────────────────────────────────── */
  'item.softHide': { id: 'item.softHide', name: 'Soft Hide', description: 'Ashdeer hide. Carpenters want it for hinges and lashings.', icon: '🟫', kind: 'material', potency: 0, value: 8 },
  'item.antlerVelvet': { id: 'item.antlerVelvet', name: 'Antler Velvet', description: 'Fine and rare. Apothecaries pay well.', icon: '🦌', kind: 'material', potency: 0, value: 25 },
  'item.boarTusk': { id: 'item.boarTusk', name: 'Bristleboar Tusk', description: 'Hard as horn. Smiths quench with it for luck.', icon: '🦷', kind: 'material', potency: 0, value: 14 },
  'item.boarHide': { id: 'item.boarHide', name: 'Bristleboar Hide', description: 'Thick, bristled, nearly armour already.', icon: '🟤', kind: 'material', potency: 0, value: 12 },
  'item.hareFoot': { id: 'item.hareFoot', name: 'Thistlehare Foot', description: 'Lucky for someone. Not the hare.', icon: '🐾', kind: 'material', potency: 0, value: 6 },
  'item.grouseFeather': { id: 'item.grouseFeather', name: 'Reedgrouse Feather', description: 'Fletching for Tobin\'s arrows.', icon: '🪶', kind: 'material', potency: 0, value: 5 },
  'item.wolfPelt': { id: 'item.wolfPelt', name: 'Thornwolf Pelt', description: 'Hackles like briar. Handle with gloves.', icon: '🐺', kind: 'material', potency: 0, value: 10 },
  'item.wispDust': { id: 'item.wispDust', name: 'Stilled Wisp-Dust', description: 'Cold grey motes that were once a spirit\'s warmth.', icon: '✨', kind: 'material', potency: 0, value: 15 },
  'item.covenantIron': { id: 'item.covenantIron', name: 'Covenant Iron', description: 'Tithe-forged iron, stamped with the Still Flame. Melts down fine.', icon: '⛓️', kind: 'material', potency: 0, value: 16 },
  'item.shoreclawShell': { id: 'item.shoreclawShell', name: 'Shoreclaw Shell', description: 'Barnacled plate from the Saltmarket shallows.', icon: '🦀', kind: 'material', potency: 0, value: 9 },

  /* ── Lures ────────────────────────────────────────────────────────── */
  'item.lure.cricket': { id: 'item.lure.cricket', name: 'Cricket Lure', description: 'Tarn fish love it.', icon: '🦗', kind: 'lure', potency: 1, value: 3 },
  'item.lure.silverSpoon': { id: 'item.lure.silverSpoon', name: 'Silver Spoon', description: 'Flashes like a fleeing minnow. Pike can\'t resist.', icon: '🥄', kind: 'lure', potency: 1, value: 10 },
  'item.lure.emberFly': { id: 'item.lure.emberFly', name: 'Ember Fly', description: 'A hand-tied fly that glows faintly. Draws strange fish.', icon: '🪰', kind: 'lure', potency: 1, value: 18 },

  /* ── Key items ────────────────────────────────────────────────────── */
  'item.trueLedgerPage': { id: 'item.trueLedgerPage', name: 'True Ledger Page', description: 'The wagon captain\'s private tally: forty sacks of tithe-grain, diverted to the Greyford post.', icon: '📜', kind: 'key', potency: 0, value: 0 },
  'item.emberScale': { id: 'item.emberScale', name: 'Ember-Scale', description: 'A drake scale still warm after twenty years under the tarn.', icon: '🔶', kind: 'key', potency: 0, value: 0 },
  'item.ringMarker': { id: 'item.ringMarker', name: 'Cinder Ring Marker', description: 'Vesna\'s debt-token. Heavier than brass ought to be.', icon: '🪙', kind: 'key', potency: 0, value: 0 },

  /* ── Catches ──────────────────────────────────────────────────────── */
  'item.fish.tarnPerch': { id: 'item.fish.tarnPerch', name: 'Tarn Perch', description: 'Striped and stubborn.', icon: '🐟', kind: 'catch', potency: 20, value: 6 },
  'item.fish.reedPike': { id: 'item.fish.reedPike', name: 'Reed Pike', description: 'All teeth and grudge.', icon: '🐟', kind: 'catch', potency: 30, value: 14 },
  'item.fish.ashfinKoi': { id: 'item.fish.ashfinKoi', name: 'Ashfin Koi', description: 'Grey fins edged with ember-orange. Said to swim where drakes drowned.', icon: '🐠', kind: 'catch', potency: 45, value: 40 },
  'item.fish.silverHerring': { id: 'item.fish.silverHerring', name: 'Silver Herring', description: 'Saltmarket\'s daily bread.', icon: '🐟', kind: 'catch', potency: 18, value: 4 },
  'item.fish.brineSnapper': { id: 'item.fish.brineSnapper', name: 'Brine Snapper', description: 'Red-backed, sharp-tempered.', icon: '🐡', kind: 'catch', potency: 32, value: 16 },
  'item.fish.lanternEel': { id: 'item.fish.lanternEel', name: 'Lantern Eel', description: 'Glows like a hooded lamp. The Brinefolk follow them home.', icon: '🪱', kind: 'catch', potency: 40, value: 55 },
  'item.fish.cinderwyrmGar': { id: 'item.fish.cinderwyrmGar', name: 'Cinderwyrm Gar', description: 'A legend of the drowned shrine: scaled like a drake, older than the tarn.', icon: '🐉', kind: 'catch', potency: 80, value: 250 },
} satisfies Record<string, ConsumableDef>;
