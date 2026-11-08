import { box, cyl, cone, sphere } from './_mesh.js';

// Single-use consumables from Mystery Boxes (SPEC 3.4.5)
export const ITEMS = {
  nitro_boost: {
    id: 'nitro_boost', icon: '🚀', name: 'Nitrous Boost', mult: 1.55, duration: 2.5,
    desc: 'Twin backfire thrusters, off-road immunity, instant duct-tape repair.',
    assetPrompt: 'Chrome nitrous bottle with glowing blue flame decal, cartoon, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(cyl(THREE, 0.3, 0.3, 0.9, 0x2f6fd8, [0, 0, 0]));
      g.add(cone(THREE, 0.3, 0.3, 0xdddddd, [0, 0.6, 0]));
      return g;
    },
  },
  banana_rocket: {
    id: 'banana_rocket', icon: '🍌', name: 'Banana Rocket Launcher', speed: 48,
    desc: 'Spline-tracking banana missile; spins out the racer ahead, scatters peels.',
    assetPrompt: 'Giant cartoon banana shaped like a missile with tiny fins and a smoke trail, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 8, 14, Math.PI * 0.8),
        new THREE.MeshToonMaterial({ color: 0xffe135 }));
      b.rotation.set(0, Math.PI / 2, Math.PI * 0.1);
      g.add(b);
      g.add(box(THREE, 0.7, 0.05, 0.25, 0xd02020, [0, 0.0, 0.5]));
      return g;
    },
  },
  flaming_poo_bag: {
    id: 'flaming_poo_bag', icon: '💩', name: 'Flaming Dog Poo Bag', radius: 2.2, stun: 1.4,
    desc: 'Drop or lob a flaming stink bomb: Grossed-Out Spin + stink cloud.',
    assetPrompt: 'Paper bag on fire containing a cartoon dog poo swirl, green stink lines, low poly.',
    proceduralFallback(THREE) {
      const g = new THREE.Group();
      g.add(box(THREE, 0.6, 0.55, 0.6, 0x9a6a3a, [0, 0, 0]));
      g.add(cone(THREE, 0.3, 0.6, 0xff6a00, [0, 0.55, 0]));
      g.add(cone(THREE, 0.16, 0.4, 0xffd23a, [0, 0.62, 0]));
      return g;
    },
  },
};
export const ITEM_IDS = Object.keys(ITEMS);

export function makeMysteryBox(THREE) {
  const g = new THREE.Group();
  const m = box(THREE, 1.5, 1.5, 1.5, 0xffffff);
  m.material = new THREE.MeshToonMaterial({ color: 0x66ddff, transparent: true, opacity: 0.8 });
  g.add(m);
  g.add(sphere(THREE, 0.34, 0xffd400, [0, 0, 0], 8));
  return g;
}
