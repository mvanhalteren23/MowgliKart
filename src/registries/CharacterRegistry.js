import { detailedKid } from './_detail.js';

// 12 cartoon kid racers. mods are +/-5% (speed, weight, driftCharge).
const ROSTER = [
  ['barnaby', 'Barnaby the Daredevil', 0xff4040, 0xffd9a0, 'bark_whoop', 1.05, 1.0, 1.0],
  ['chloe', 'Chloe the Tinkering Genius', 0x40a0ff, 0xf1c27d, 'bark_aha', 1.0, 0.95, 1.05],
  ['max', 'Max the Sugar Fiend', 0xffa500, 0xffdbac, 'bark_zoom', 1.02, 0.95, 1.03],
  ['zoe', 'Zoe the Drift Queen', 0xc040ff, 0xc68642, 'bark_yes', 0.97, 1.0, 1.05],
  ['wally', 'Wally the Wobbly', 0x60d060, 0xffdbac, 'bark_woah', 0.98, 1.05, 1.0],
  ['dex', 'Dex the Gamer', 0x202020, 0xe0ac69, 'bark_gg', 1.0, 1.0, 1.0],
  ['rosa', 'Rosa the Rocket Girl', 0xff5ca8, 0x8d5524, 'bark_blast', 1.04, 0.97, 1.0],
  ['finn', 'Finn the Fearless', 0x30c0c0, 0xffdbac, 'bark_charge', 1.03, 1.02, 0.97],
  ['pip', 'Pip the Pint-Sized', 0xfff060, 0xf1c27d, 'bark_wee', 0.96, 0.95, 1.05],
  ['gus', 'Gus the Goofball', 0x8060ff, 0xc68642, 'bark_haha', 1.0, 1.05, 1.0],
  ['luna', 'Luna the Daydreamer', 0xa0a0ff, 0xffdbac, 'bark_ooh', 0.99, 0.98, 1.04],
  ['ollie', 'Ollie the Orbit', 0xffffff, 0xe0ac69, 'bark_liftoff', 1.01, 1.0, 1.02],
];

export const CHARACTERS = {};
for (const [id, name, helmet, skin, bark, speed, weight, driftCharge] of ROSTER) {
  CHARACTERS[id] = {
    id, name, helmet: '#' + helmet.toString(16).padStart(6, '0'), skin: '#' + skin.toString(16).padStart(6, '0'),
    bark, mods: { speed, weight, driftCharge },
    assetPrompt: `Cartoon kid racer "${name}" seated pose, oversized ${helmet.toString(16)} helmet with goggles, big grin, soapbox derby jumpsuit, glossy toon style, low poly, origin at seat.`,
    proceduralFallback(THREE) { return detailedKid(THREE, CHARACTERS[id]); },
  };
}
export const CHARACTER_IDS = Object.keys(CHARACTERS);
