import { toon, box, cyl, cone, sphere } from './_mesh.js';

// γ_dim(n) = max(0.75, 1 - 0.06 n): diminishing return for the n-th drafted stat card (SPEC 3.3).
export const gammaDim = (n) => Math.max(0.75, 1.0 - 0.06 * n);

/* ------------------------------------------------------------------ STAT BOOSTS */
// `apply(M, g)` mutates the CircuitBuildState multipliers; g = gammaDim(n).
// "+0.38 m/s equivalent" entries are converted against the ~23.5 m/s reference top speed
// (0.38 / 23.5 = 0.0162) for jump boost, and mapped to a +5% drift-charge rate.
export const STAT_BOOSTS = {
  leaf_blower: {
    id: 'leaf_blower', icon: '🌪️', name: 'Overclocked Leaf-Blower Turbo',
    desc: '+3.6% top speed, +8% knockback resistance',
    apply(M, g) { M.topSpeed += 0.036 * g; M.knockbackRes += 0.08 * g; },
  },
  shopping_casters: {
    id: 'shopping_casters', icon: '🛒', name: 'Greased Shopping-Cart Casters',
    desc: '+2.0% top speed, faster drift charge & exit speed',
    apply(M, g) { M.topSpeed += 0.02 * g; M.driftCharge += 0.05 * g; },
  },
  pogo_shocks: {
    id: 'pogo_shocks', icon: '🦘', name: 'Pogo-Stick Ramp Shocks',
    desc: '+2.0% top speed, stronger trick boost & forgiving trick window',
    apply(M, g) { M.topSpeed += 0.02 * g; M.jumpBoost += 0.0162 * g; M.trickWindow += 0.04 * g; },
  },
  lead_ballast: {
    id: 'lead_ballast', icon: '⚓', name: 'Lead-Piping Chassis Ballast',
    desc: '+2.4% top speed, +25% knockback & stun resistance',
    apply(M, g) { M.topSpeed += 0.024 * g; M.knockbackRes += 0.25 * g; },
  },
};

export const newBuildState = () => ({
  topSpeed: 1, accel: 1, driftCharge: 1, jumpBoost: 1, knockbackRes: 1, trickWindow: 0, gripMul: 1,
});

/* ------------------------------------------------------------------ WEAPONS */
// Level scaling: effectiveness +34%/extra level, cooldown -16%/extra level (SPEC 3.4.1 Card B).
export const WEAPONS = {
  ballistic_chicken: {
    id: 'ballistic_chicken', icon: '🐔', name: 'Ballistic Chicken Launcher', cooldown: 7.5, range: 65,
    desc: 'Homing rubber chicken: knock-up, feather-blind. Lv2+: 3-chicken volley.',
    projectileSpeed: 52, homingCone: 15,
    assetPrompt: 'Cartoon rubber chicken with open beak and tiny wings flying forward, glossy yellow-white, low poly, game-ready prop.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(sphere(THREE, 0.5, 0xfff4d0, [0, 0, 0]));
      g.add(sphere(THREE, 0.28, 0xfff4d0, [0, 0.45, -0.3]));
      g.add(cone(THREE, 0.12, 0.35, 0xff9900, [0, 0.42, -0.65], [-Math.PI / 2, 0, 0]));
      g.add(box(THREE, 0.9, 0.08, 0.35, 0xffe9a8, [0, 0.1, 0.05]));
      g.add(sphere(THREE, 0.08, 0xcc0000, [0, 0.72, -0.3]));
      return g;
    },
  },
  baby_oil_puddle: {
    id: 'baby_oil_puddle', icon: '🛢️', name: 'Baby Oil Puddle Dispenser', cooldown: 6.5, range: 55,
    desc: 'Squirts a slick puddle behind you. Lv2+: Triple Giant Slick.',
    width: 3.8, width2: 6.0, life: 18,
    assetPrompt: 'Flat iridescent translucent baby-oil puddle decal, rainbow sheen, glossy, top-down, low poly disc.',
    proceduralFallback(THREE) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 0.05, 28),
        new THREE.MeshToonMaterial({ color: 0xffd77a, transparent: true, opacity: 0.75 }),
      );
      m.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 24),
        new THREE.MeshToonMaterial({ color: 0xff9ad8, transparent: true, opacity: 0.6 })));
      return m;
    },
  },
  mentos_mortar: {
    id: 'mentos_mortar', icon: '🥤', name: 'Soda & Mentos Mortar', cooldown: 8.0, range: 75,
    desc: 'Lobs a diet soda bottle that erupts into a sticky foam geyser.',
    foamRadius: 4.0, stun: 1.85,
    assetPrompt: 'Cartoon 2-liter diet soda bottle with a white mint candy stuck in the neck, glossy, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(cyl(THREE, 0.28, 0.28, 0.9, 0xc9c9c9, [0, 0, 0]));
      g.add(cyl(THREE, 0.1, 0.28, 0.3, 0xc9c9c9, [0, 0.55, 0]));
      g.add(cyl(THREE, 0.11, 0.11, 0.12, 0xd02020, [0, 0.76, 0]));
      g.add(cyl(THREE, 0.29, 0.29, 0.3, 0x111111, [0, -0.05, 0]));
      return g;
    },
  },
  boxing_glove: {
    id: 'boxing_glove', icon: '🥊', name: 'Spring-Loaded Boxing Glove', cooldown: 6.0, range: 25,
    desc: 'Giant spring-fist slams adjacent karts sideways and siphons 30% of their speed.',
    stun: 1.55, siphon: 0.30,
    assetPrompt: 'Giant red cartoon boxing glove on a coiled metal spring, side view, low poly, glossy.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(sphere(THREE, 0.55, 0xd01818, [0, 0, 0]));
      g.add(box(THREE, 0.5, 0.3, 0.3, 0xd01818, [0.3, -0.25, 0.1]));
      g.add(cyl(THREE, 0.18, 0.18, 0.7, 0xaaaaaa, [0, 0, 0.7], [Math.PI / 2, 0, 0], 8));
      return g;
    },
  },
};

/* ------------------------------------------------------------------ SHIELDS */
// Level scaling: +27% surge/reflect, -15% cooldown per extra level (SPEC 3.4.1 Card C).
export const SHIELDS = {
  bubble_wrap_shield: {
    id: 'bubble_wrap_shield', icon: '🫧', name: 'Bubble-Wrap Bumper', cooldown: 10.5, window: 3.0,
    surge: 1.35, surgeTime: 1.1, reflect: 0.42, immuneOil: true, immunePoo: true, repairs: true,
    desc: 'Absorbs all weapon hits (42% ricochet), immune to oil & poo, welds panels back.',
    assetPrompt: 'Giant translucent sphere of industrial bubble wrap, soft blue tint, low poly bubble pattern.',
    proceduralFallback(THREE) {
      return new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 16),
        new THREE.MeshToonMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.32 }));
    },
  },
  trash_lid_shield: {
    id: 'trash_lid_shield', icon: '🗑️', name: 'Trash-Can Lid Buckler', cooldown: 11.0, window: 2.8,
    surge: 1.28, surgeTime: 1.1, reflect: 0.72, knocksObstacles: true,
    desc: '72% parry: deflects hits back at the attacker, bats obstacles aside.',
    assetPrompt: 'Two galvanized aluminum trash-can lids orbiting a kart like bucklers, dented metal, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      for (const a of [0, Math.PI]) {
        const lid = cyl(THREE, 0.7, 0.7, 0.07, 0xb9c0c8, [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5], [Math.PI / 2, 0, 0], 20);
        lid.add(cyl(THREE, 0.12, 0.12, 0.12, 0x555555, [0, 0.07, 0], [0, 0, 0], 8));
        g.add(lid);
      }
      return g;
    },
  },
  tinfoil_shield: {
    id: 'tinfoil_shield', icon: '📡', name: 'Tinfoil Faraday Dome', cooldown: 10.5, window: 3.2,
    surge: 1.40, surgeTime: 1.1, reflect: 0.32, immuneOil: true, immunePoo: true,
    desc: 'Total hazard & slick immunity; blocked hits become a 1.40x static boost.',
    assetPrompt: 'Crinkly kitchen-tinfoil radar dish on a kid helmet with a glowing blue static dome, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 14),
        new THREE.MeshToonMaterial({ color: 0x66aaff, transparent: true, opacity: 0.22 })));
      g.add(cone(THREE, 0.5, 0.25, 0xdfe6ee, [0, 1.3, 0], [Math.PI, 0, 0], 10));
      return g;
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const SHIELD_IDS = Object.keys(SHIELDS);
export const STAT_IDS = Object.keys(STAT_BOOSTS);

/** Level-scaled helpers. level is 1-based. */
export const weaponEffectiveness = (lvl) => 1 + 0.34 * (lvl - 1);
export const weaponCooldown = (w, lvl) => w.cooldown * Math.max(0.35, 1 - 0.16 * (lvl - 1));
export const shieldPower = (lvl) => 1 + 0.27 * (lvl - 1);
export const shieldCooldown = (s, lvl) => s.cooldown * Math.max(0.35, 1 - 0.15 * (lvl - 1));

/** Draft AI personas (SPEC 3.5/3.6). `order` = preference of card categories by pick index. */
export const PERSONAS = {
  balanced_hybrid: { name: 'Balanced Hybrid', order: ['weapon', 'shield', 'stat', 'stat'] },
  defensive_sprinter: { name: 'Defensive Sprinter', order: ['shield', 'stat', 'stat', 'stat'] },
  offensive_brawler: { name: 'Offensive Brawler', order: ['weapon', 'weapon', 'stat', 'weapon'] },
  adaptive_counter: { name: 'Adaptive Counter', order: null },
};
