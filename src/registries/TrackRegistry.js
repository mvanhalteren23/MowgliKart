import { box, cyl, cone, sphere } from './_mesh.js';

/**
 * Regional cartoon hazards. `behavior` drives ObstacleManager:
 *  cross  - sweeps laterally across the whole road at `speed` m/s
 *  zigzag - sinusoidal lateral weave while slowly sliding down-track
 *  static - dances on the spot (bobbing); `reach` > radius makes it a swinging hazard (palms)
 *  slide  - rolls down-track at `speed` with a gentle sway
 *  hop    - bouncing lateral hops across the road
 */
function critter(THREE, o) {
  const g = new THREE.Group();
  const s = o.size ?? 1;
  g.add(sphere(THREE, 0.55 * s, o.body, [0, 0.6 * s, 0]));
  g.add(sphere(THREE, 0.34 * s, o.head ?? o.body, [0, 1.35 * s, 0]));
  g.add(sphere(THREE, 0.07 * s, 0x111111, [-0.12 * s, 1.42 * s, -0.28 * s], 6));
  g.add(sphere(THREE, 0.07 * s, 0x111111, [0.12 * s, 1.42 * s, -0.28 * s], 6));
  if (o.extra) o.extra(THREE, g, s);
  return g;
}

export const OBSTACLES = {
  // --- Whistler
  ski_jerry: { id: 'ski_jerry', name: 'Speeding Ski Jerry', behavior: 'zigzag', radius: 1.1, speed: 9, amp: 6.5, power: 1.0,
    assetPrompt: 'Cartoon ski jerry in neon one-piece suit pizza-wedging down a slope, mirrored goggles, low poly.',
    proceduralFallback: (T) => critter(T, { body: 0xff2fa0, head: 0xffd9a0, extra: (T2, g) => { g.add(box(T2, 0.15, 0.05, 2.0, 0x2244ff, [-0.3, 0.05, 0])); g.add(box(T2, 0.15, 0.05, 2.0, 0x2244ff, [0.3, 0.05, 0])); } }) },
  mascot_bear: { id: 'mascot_bear', name: 'Raving Mascot Bear', behavior: 'static', radius: 1.5, power: 1.1,
    assetPrompt: 'Giant fluffy brown mascot bear costume dancing with glow sticks, low poly.',
    proceduralFallback: (T) => critter(T, { body: 0x8a5a2b, size: 1.6, extra: (T2, g, s) => { g.add(sphere(T2, 0.14 * s, 0x8a5a2b, [-0.25 * s, 1.65 * s, 0], 6)); g.add(sphere(T2, 0.14 * s, 0x8a5a2b, [0.25 * s, 1.65 * s, 0], 6)); } }) },
  apres_tuber: { id: 'apres_tuber', name: 'Rowdy Après-Ski Partygoer', behavior: 'slide', radius: 1.4, speed: 11, power: 0.9,
    assetPrompt: 'Partygoer sliding on a giant inflatable tube holding a drink, low poly cartoon.',
    proceduralFallback: (T) => critter(T, { body: 0x40c0ff, extra: (T2, g) => { const t = new T2.Mesh(new T2.TorusGeometry(0.9, 0.35, 8, 16), new T2.MeshToonMaterial({ color: 0xffd400 })); t.rotation.x = Math.PI / 2; t.position.y = 0.3; g.add(t); } }) },
  // --- San Diego
  tech_scooter: { id: 'tech_scooter', name: 'Swerving Tech-Bro E-Scooter', behavior: 'zigzag', radius: 1.0, speed: 12, amp: 7, power: 1.0,
    assetPrompt: 'Tech-bro on an electric scooter staring at his phone, vest and AirPods, low poly cartoon.',
    proceduralFallback: (T) => critter(T, { body: 0x3a3a3a, extra: (T2, g) => { g.add(box(T2, 0.3, 0.1, 1.4, 0x00d0a0, [0, 0.1, 0])); } }) },
  raccoon_dumpster: { id: 'raccoon_dumpster', name: 'Trash-Can Bandit (Raccoon)', behavior: 'cross', radius: 1.7, speed: 7, power: 1.2,
    assetPrompt: 'Raccoon bandit pushing a rolling green dumpster, black mask, low poly cartoon.',
    proceduralFallback: (T) => critter(T, { body: 0x777777, extra: (T2, g) => { g.add(box(T2, 1.8, 1.2, 1.2, 0x2f8f4f, [0, 0.6, 0.9])); } }) },
  surf_cart: { id: 'surf_cart', name: 'Runaway Surfboard Cart', behavior: 'slide', radius: 1.5, speed: 13, power: 0.9,
    assetPrompt: 'Runaway wheeled cart stacked with colorful surfboards, low poly cartoon.',
    proceduralFallback: (T) => { const g = new T.Group(); g.add(box(T, 1.3, 0.3, 1.8, 0x888888, [0, 0.3, 0])); for (const [i, c] of [0xff5050, 0x50c0ff, 0xffe050].entries()) g.add(box(T, 0.3, 1.8, 0.6, c, [-0.4 + i * 0.4, 1.0, 0])); return g; } },
  // --- Great Wall
  sleepy_panda: { id: 'sleepy_panda', name: 'Sleepy Giant Panda', behavior: 'cross', radius: 1.7, speed: 4.5, power: 1.1,
    assetPrompt: 'Giant sleepy panda curled in a ball rolling along a stone walkway, low poly cartoon.',
    proceduralFallback: (T) => critter(T, { body: 0xffffff, head: 0xffffff, size: 1.7, extra: (T2, g, s) => { g.add(sphere(T2, 0.15 * s, 0x111111, [-0.28 * s, 1.6 * s, 0], 6)); g.add(sphere(T2, 0.15 * s, 0x111111, [0.28 * s, 1.6 * s, 0], 6)); g.add(box(T2, 1.4 * s, 0.4 * s, 0.4 * s, 0x111111, [0, 0.8 * s, -0.5 * s])); } }) },
  taichi_master: { id: 'taichi_master', name: 'Grumpy Tai-Chi Master', behavior: 'static', radius: 1.2, reach: 3.6, power: 1.6,
    assetPrompt: 'Grumpy elderly tai-chi master in white robe with long beard, mid energy-palm pose, low poly cartoon.',
    proceduralFallback: (T) => critter(T, { body: 0xf2f2e8, head: 0xffd9a0, extra: (T2, g) => { g.add(box(T2, 0.15, 0.15, 1.1, 0xf2f2e8, [0.7, 1.0, -0.4])); g.add(sphere(T2, 0.25, 0xffffff, [0, 1.05, -0.2], 6)); } }) },
  rickshaw: { id: 'rickshaw', name: 'Runaway Rickshaw', behavior: 'slide', radius: 1.6, speed: 12, power: 1.0,
    assetPrompt: 'Runaway red rickshaw with no driver, tasseled canopy, low poly cartoon.',
    proceduralFallback: (T) => { const g = new T.Group(); g.add(box(T, 1.3, 0.8, 1.6, 0xc0392b, [0, 0.7, 0])); g.add(box(T, 1.4, 0.1, 1.7, 0xffd400, [0, 1.6, 0])); return g; } },
  // --- Zoo
  charging_rhino: { id: 'charging_rhino', name: 'Charging Rhino', behavior: 'cross', radius: 2.0, speed: 9, power: 1.4,
    assetPrompt: 'Charging cartoon rhino, grey, big horn, stampede pose, low poly.',
    proceduralFallback: (T) => critter(T, { body: 0x8a8f99, size: 1.9, extra: (T2, g, s) => { g.add(cone(T2, 0.1 * s, 0.5 * s, 0xf0e8d0, [0, 1.4 * s, -0.5 * s], [-Math.PI / 2.3, 0, 0], 6)); } }) },
  kangaroo: { id: 'kangaroo', name: 'Bouncing Kangaroo', behavior: 'hop', radius: 1.2, speed: 8, power: 1.0,
    assetPrompt: 'Bouncing cartoon kangaroo mid-hop with boxing gloves, low poly.',
    proceduralFallback: (T) => critter(T, { body: 0xd08a3a, extra: (T2, g) => { g.add(cone(T2, 0.18, 1.0, 0xd08a3a, [0, 0.4, 0.8], [Math.PI / 2.6, 0, 0], 6)); } }) },
  field_trip_kids: { id: 'field_trip_kids', name: 'Sugar-Rushed Field-Trip Kids', behavior: 'static', radius: 1.6, power: 0.8,
    assetPrompt: 'Group of three screaming school kids with popcorn and balloons, matching yellow t-shirts, low poly cartoon.',
    proceduralFallback: (T) => { const g = new T.Group(); for (const [i, c] of [0xffd400, 0xff7070, 0x70d0ff].entries()) { const k = critter(T, { body: c, size: 0.7 }); k.position.x = (i - 1) * 0.9; g.add(k); } return g; } },
  safari_tram: { id: 'safari_tram', name: 'Runaway Safari Tram', behavior: 'slide', radius: 2.6, speed: 10, power: 1.5,
    assetPrompt: 'Runaway open-air safari tram with striped canopy and empty seats, low poly cartoon.',
    proceduralFallback: (T) => { const g = new T.Group(); g.add(box(T, 2.4, 0.9, 4.0, 0x5aa02c, [0, 0.8, 0])); g.add(box(T, 2.5, 0.12, 4.1, 0xffe0a0, [0, 2.2, 0])); return g; } },
};

const sweep = (d, dir, len = 420, turn = 150) => ({ d, dir, len, turn });
const SHORT_LEN = 440;

/**
 * Each track: a seeded procedural downhill. Hairpin "sweepers" make the room for Janky Shortcuts that
 * cut a chord across the horseshoe (~26-28% shorter than the main arc).
 */
export const TRACKS = {
  whistler_run: {
    id: 'whistler_run', stage: 1, milestone: 1, name: 'Whistler Ski Run', length: 4500, seed: 11,
    open: true, width: 44, grooveHalf: 9, // open-slope: 18 m groomed groove + powder & trees either side
    startHeight: 720, pitch: [5, 9.5], gentle: 0.0016,
    sweepers: [sweep(1000, -1), sweep(2200, 1), sweep(3400, -1)],
    jumps: [450, 820, 1650, 1950, 2800, 3150, 3950, 4250],
    shortcuts: [
      { id: 'lodge_roof_a', name: 'Alpine Lodge Rooftop', dEntry: 1000 - 10, dExit: 1000 - 10 + SHORT_LEN },
      { id: 'lodge_roof_b', name: 'Chalet Chimney Run', dEntry: 2200 - 10, dExit: 2200 - 10 + SHORT_LEN },
      { id: 'lodge_roof_c', name: 'Gondola Station Plank', dEntry: 3400 - 10, dExit: 3400 - 10 + SHORT_LEN },
    ],
    obstacles: [['ski_jerry', 14], ['mascot_bear', 12], ['apres_tuber', 10]],
    theme: {
      sky: [0x4aa8ff, 0xdff2ff], fog: 0xdff2ff, ground: 0xf4f9ff, road: 0xdfe8f2, line: 0x6fa8dc,
      deck: 0x8a5a2b, scenery: 'pine', weather: 'snow', curbA: 0xd32f2f, curbB: 0xffffff,
    },
  },
  san_diego_streets: {
    id: 'san_diego_streets', stage: 2, milestone: 2, name: 'San Diego Streets', length: 4500, seed: 23,
    startHeight: 420, pitch: [4, 8.5], gentle: 0.0018,
    sweepers: [sweep(900, 1), sweep(2100, -1), sweep(3300, 1)],
    jumps: [380, 700, 1600, 1850, 2750, 3000, 3900, 4200],
    shortcuts: [
      { id: 'boardwalk_rail_a', name: 'Boardwalk Stair-Handrail Grind', dEntry: 900 - 10, dExit: 900 - 10 + SHORT_LEN },
      { id: 'boardwalk_rail_b', name: 'Pier Railing Slide', dEntry: 2100 - 10, dExit: 2100 - 10 + SHORT_LEN },
      { id: 'boardwalk_rail_c', name: 'Taco-Stand Awning Run', dEntry: 3300 - 10, dExit: 3300 - 10 + SHORT_LEN },
    ],
    obstacles: [['tech_scooter', 14], ['raccoon_dumpster', 10], ['surf_cart', 10]],
    theme: {
      sky: [0x58b6ff, 0xffe8c9], fog: 0xffe8c9, ground: 0xe9d7a8, road: 0x4a4d55, line: 0xfff176,
      deck: 0x7a4a2a, scenery: 'palm', curbA: 0x1976d2, curbB: 0xffffff,
    },
  },
  great_wall_sprint: {
    id: 'great_wall_sprint', stage: 3, milestone: 2, name: 'Great Wall Sprint', length: 4500, seed: 37,
    startHeight: 560, pitch: [4.5, 9], gentle: 0.0014,
    sweepers: [sweep(1050, -1), sweep(2250, 1), sweep(3450, -1)],
    jumps: [420, 780, 1700, 1980, 2850, 3200, 4000, 4300],
    shortcuts: [
      { id: 'watchtower_a', name: 'Watchtower Battlement', dEntry: 1050 - 10, dExit: 1050 - 10 + SHORT_LEN },
      { id: 'watchtower_b', name: 'Catapult Gap Shortcut', dEntry: 2250 - 10, dExit: 2250 - 10 + SHORT_LEN },
      { id: 'watchtower_c', name: 'Beacon Tower Bridge', dEntry: 3450 - 10, dExit: 3450 - 10 + SHORT_LEN },
    ],
    obstacles: [['sleepy_panda', 10], ['taichi_master', 10], ['rickshaw', 10]],
    theme: {
      sky: [0x6a8fb8, 0xe6d9c2], fog: 0xe6d9c2, ground: 0x7d8f5a, road: 0x9c9486, line: 0xd4c7a8,
      deck: 0x6b4a2a, scenery: 'tower', curbA: 0x8c2f2f, curbB: 0xd9c9a8,
    },
  },
  zoo_rampage: {
    id: 'zoo_rampage', stage: 4, milestone: 2, name: 'Zoo Rampage', length: 4500, seed: 53,
    startHeight: 380, pitch: [4, 8], gentle: 0.002,
    sweepers: [sweep(950, 1), sweep(2150, -1), sweep(3350, 1)],
    jumps: [400, 760, 1600, 1900, 2800, 3100, 3950, 4250],
    shortcuts: [
      { id: 'hippo_bridge_a', name: 'Hippo-Back River Bridge', dEntry: 950 - 10, dExit: 950 - 10 + SHORT_LEN },
      { id: 'hippo_bridge_b', name: 'Giraffe-Neck Gangway', dEntry: 2150 - 10, dExit: 2150 - 10 + SHORT_LEN },
      { id: 'hippo_bridge_c', name: 'Elephant Trunk Slide', dEntry: 3350 - 10, dExit: 3350 - 10 + SHORT_LEN },
    ],
    obstacles: [['charging_rhino', 8], ['kangaroo', 10], ['field_trip_kids', 8], ['safari_tram', 4]],
    theme: {
      sky: [0x4fc3a1, 0xf3ffd9], fog: 0xf3ffd9, ground: 0x6fbf5a, road: 0xb08a5a, line: 0xf5e6c8,
      deck: 0x5a8a3a, scenery: 'jungle', curbA: 0xff7043, curbB: 0xffffff,
    },
  },
};

export const TRACK_ORDER = ['whistler_run', 'san_diego_streets', 'great_wall_sprint', 'zoo_rampage'];
