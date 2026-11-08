import { box, cyl, cone, sphere, makeGenericKart, toon } from './_mesh.js';


export const KARTS = {
  rocket_grocery_kart: {
    id: 'rocket_grocery_kart', playable: true, name: 'Rocket Grocery Kart',
    topSpeed: 23.41, accel: 1.15, mass: 135, thrusters: [-0.38, 0.38], driftTurn: 1.12, knockbackRes: 1.0, color: '#d92b2b',
    desc: 'Supermarket cart welded to a firework thruster. Quick, light, tight drifts.',
    parts: ['Left wire side-gate', 'Right wire side-gate', 'Child-seat flap', 'Shopping-basket bumper'],
    assetPrompt: 'Cartoon supermarket shopping cart soapbox racer with a giant red firework rocket thruster welded on the back, wire-frame sides, four small wheels, side-gates, child-seat flap, basket bumper, glossy toon style, low poly.',
    proceduralFallback(THREE) {
      return makeGenericKart(THREE, {
        body: 0xb8bcc4, trim: 0xd92b2b, accent: 0xd92b2b,
        extra(T, root) {
          // wire basket
          root.add(box(T, 1.0, 0.5, 1.0, 0xdfe3ea, [0, 0.0, -0.1]));
          root.children[root.children.length - 1].material.wireframe = true;
          // rocket thruster
          const rocket = cyl(T, 0.26, 0.3, 1.4, 0xd92b2b, [0, 0.2, 1.2], [Math.PI / 2, 0, 0]);
          rocket.add(cone(T, 0.26, 0.5, 0xffffff, [0, -0.9, 0]));
          rocket.add(cone(T, 0.3, 0.35, 0xffaa00, [0, 0.85, 0], [Math.PI, 0, 0]));
          root.add(rocket);
        },
      });
    },
  },
  chicken_coop: {
    id: 'chicken_coop', playable: true, name: 'Motorized Chicken Coop',
    topSpeed: 23.64, accel: 1.0, mass: 170, driftTurn: 0.95, knockbackRes: 1.14, color: '#b5651d',
    desc: 'Barn-roof soapbox on lawnmower tires. Heavy, shrugs off knockback.',
    parts: ['Left cedar shutter', 'Right cedar shutter', 'Shingle roof ridge', 'Weather-vane ornament'],
    assetPrompt: 'Cartoon wooden chicken coop soapbox racer with a red barn roof, cedar shutter doors, weather-vane hood ornament, on four chunky tractor lawnmower tires, feathers fluttering, glossy toon style, low poly.',
    proceduralFallback(THREE) {
      return makeGenericKart(THREE, {
        body: 0xb5651d, trim: 0x8a4b12, accent: 0xc0392b,
        extra(T, root) {
          root.add(box(T, 1.15, 0.7, 1.1, 0xc98a4b, [0, 0.35, 0.1]));
          const roof = cone(T, 0.95, 0.55, 0xc0392b, [0, 0.95, 0.1], [0, Math.PI / 4, 0], 4);
          roof.scale.set(1.05, 1, 0.95);
          root.add(roof);
          root.add(sphere(T, 0.14, 0xffdd55, [0, 1.3, -0.95]));
          root.add(box(T, 0.42, 0.34, 0.05, 0x2a1d12, [0, 0.45, -0.46]));          // little barn window
          root.add(box(T, 0.5, 0.06, 0.08, 0xf2e2c4, [0, 0.27, -0.47]));           // window sill
          root.add(box(T, 0.28, 0.5, 0.28, 0xb23a2a, [0.32, 1.15, 0.35]));          // chimney
          root.add(box(T, 1.2, 0.05, 0.05, 0x7a4a1c, [0, 0.55, -0.45]));
          root.add(box(T, 0.6, 0.38, 0.5, 0xd9a05b, [0, -0.05, 0.9]));               // nesting box
        },
      });
    },
  },
};

// Pre-registered expansion karts (data entries only; `playable: false` until Milestone 2).
const EXP = [
  ['hot_dog_car', 'Hot Dog Cruiser', 0xe0762b, 'Bun-shaped hull with a mustard racing stripe.', 23.2, 1.05, 150],
  ['bathtub_racer', 'Clawfoot Bathtub Racer', 0xf2f2f2, 'Porcelain tub with gold lion-paw feet.', 23.0, 1.0, 175],
  ['cardboard_jet', 'Cardboard Jet Fighter', 0xc89b5e, 'Duct-taped cardboard fuselage with crayon flames.', 23.8, 1.1, 110],
  ['porta_potty_turbo', 'Port-a-Potty Turbo', 0x2f8de0, 'Blue portable toilet with a turbo-charged vent pipe.', 23.3, 1.0, 160],
  ['roller_skate', 'Giant Roller Skate', 0xe84a9a, 'Retro quad-skate boot with neon laces.', 23.5, 1.12, 120],
  ['school_desk', 'School Desk Dragster', 0xa9743a, 'Wooden desk with an inkwell exhaust and gum under the seat.', 23.1, 1.0, 140],
  ['taco_soapbox', 'Taco Truck Soapbox', 0xf4c542, 'Hard-shell taco on wheels with a salsa-red awning.', 23.4, 1.03, 145],
  ['pirate_barrel', 'Pirate Barrel Brig', 0x6b4423, 'Rum barrel with a tiny mast and jolly roger.', 23.2, 0.98, 165],
  ['gaming_chair', 'Gaming Chair 9000', 0x222a35, 'Racing-seat office chair with RGB underglow.', 23.6, 1.08, 130],
  ['trash_bobsled', 'Trash Bin Bobsled', 0x3a6b3a, 'Wheelie bin with sled runners and a lid flap.', 23.0, 1.0, 155],
];
for (const [id, name, color, desc, topSpeed, accel, mass] of EXP) {
  KARTS[id] = {
    id, name, playable: false, topSpeed, accel, mass, driftTurn: 1.0, knockbackRes: 1.0,
    color: '#' + color.toString(16).padStart(6, '0'), desc,
    parts: ['Left panel', 'Right panel', 'Roof spoiler', 'Bumper prop'],
    assetPrompt: `Cartoon soapbox racer: ${name}. ${desc} Four wheels, glossy toon style, low poly.`,
    proceduralFallback: (THREE) => makeGenericKart(THREE, { body: color, trim: 0xffffff, accent: 0xffcc00 }),
  };
}

export const PLAYABLE_KARTS = Object.values(KARTS).filter((k) => k.playable);
export const KART_IDS = Object.keys(KARTS);
