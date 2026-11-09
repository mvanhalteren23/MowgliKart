import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let grad = null;
/** Crisp 3-step cel ramp (shadow / mid / lit), nearest-filtered so the bands never blur. */
export function toonGradient() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([105, 178, 255]), 3, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false; grad.needsUpdate = true;
  }
  return grad;
}
/** Give every toon material under `root` the shared gradient (idempotent, cheap to call periodically). */
export function applyToon(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      if (x.isMeshToonMaterial && !x.gradientMap) { x.gradientMap = toonGradient(); x.needsUpdate = true; }
    }
  });
}

/* ------------------------------------------------------------------ cartoon outlines */
export const INK = 0x14141f;
const outlineCache = new Map();
/** Inverted-hull outline: BackSide ink material whose vertices are pushed along their (smoothed) normals. */
function outlineMaterial(width) {
  const key = width.toFixed(3);
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normalize(normal) * ${width.toFixed(4)};`); };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineCache.set(key, m);
  return m;
}
const smoothCache = new WeakMap();
/** Position-only copy with welded vertices + smooth normals, so extruded hulls have no cracks at hard edges. */
function smoothGeometry(src) {
  if (smoothCache.has(src)) return smoothCache.get(src);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  if (src.index) g.setIndex(src.index.clone());
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  smoothCache.set(src, g); return g;
}
/** Add ink outlines around every opaque mesh under `root` (skips decals, transparent glass, wireframes, instanced meshes). */
export function addOutlines(root, width = 0.028) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.outline && !o.userData.noOutline && !o.material.wireframe && !o.material.transparent && !o.material.isMeshBasicMaterial) meshes.push(o); });
  for (const m of meshes) {
    const ol = new THREE.Mesh(smoothGeometry(m.geometry), outlineMaterial(width));
    ol.userData.outline = true; ol.castShadow = false; ol.receiveShadow = false; ol.frustumCulled = m.frustumCulled;
    m.add(ol);
  }
}

/* ------------------------------------------------------------------ draw-call baking */
let bakedMat = null;
const bakedMaterial = () => (bakedMat ??= new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true }));

/** Names of nodes that animate/detach independently: they become their own bake unit instead of being merged into the body. */
const isUnit = (o) => /^(Wheel_|Cosmetic_|Driver_Seat|Weapon_Mount|Shield_Mount|Exhaust|Cockpit|Eye|rocket)/.test(o.name) || o.userData.unit;

/**
 * Collapse runs of plain toon primitives into one vertex-coloured mesh per bake unit (kart body, each wheel, each detachable
 * cosmetic, the kid ...). A ~180-mesh kart drops to ~15 draw calls with an identical look. Textured / transparent / basic
 * meshes and real GLB (standard-material) models are left untouched.
 */
export function bakeAssembly(root) {
  root.updateMatrixWorld(true);
  const bake = (unit) => {
    const geos = [], remove = [];
    const walk = (o) => {
      for (const c of [...o.children]) {
        if (c !== unit && isUnit(c) && c !== unit) { bake(c); continue; }
        const m = c;
        if (m.isMesh && !m.isInstancedMesh && m.material?.isMeshToonMaterial && !m.material.map && !m.material.transparent && !m.userData.keep) {
          const g = m.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
          if (!g.index) { /* mergeGeometries needs consistent indexing */ g.setIndex([...Array(g.attributes.position.count).keys()]); }
          const rel = new THREE.Matrix4().copy(unit.matrixWorld).invert().multiply(m.matrixWorld);
          g.applyMatrix4(rel);
          const n = g.attributes.position.count, col = new Float32Array(n * 3), c0 = m.material.color;
          for (let i = 0; i < n; i++) { col[i * 3] = c0.r; col[i * 3 + 1] = c0.g; col[i * 3 + 2] = c0.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          geos.push(g); remove.push(m);
        }
        walk(c);
      }
    };
    walk(unit);
    if (geos.length > 1) {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, bakedMaterial()); mesh.name = (unit.name || 'body') + '_baked'; mesh.castShadow = mesh.receiveShadow = true;
        for (const m of remove) m.parent?.remove(m);
        unit.add(mesh);
      }
    }
    for (const g of geos) g.dispose();
  };
  bake(root);
}

/** Soft radial blob used for ground shadows. */
let blob = null;
export function blobTexture() {
  if (blob || typeof document === 'undefined') return blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(10,12,30,0.8)'); r.addColorStop(0.6, 'rgba(10,12,30,0.4)'); r.addColorStop(1, 'rgba(10,12,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
/** Dark circular contact-shadow decal lying on a surface (pos = ground point, normal = surface normal). */
export function makeShadowDecal(scene, size = 2.6) {
  const bt = blobTexture();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bt, color: bt ? 0xffffff : 0x000000, transparent: true, opacity: bt ? 0.9 : 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.userData.noShadow = true; m.userData.outline = true; m.renderOrder = 1; scene.add(m); return m;
}
