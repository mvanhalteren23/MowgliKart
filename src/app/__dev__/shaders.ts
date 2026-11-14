// Lead dev harness: compiles every shader and renders one frame without the game.
import * as THREE from 'three';
import { frameUv, generateTerrainChunk, getFoliageAtlas, getSpriteMeta, sampleHeight } from '@/engine/bootstrapAssets';
import {
  Hd2dPipeline, createAuraMaterial, createBillboardGeometry, createFoliageMaterial, createSpriteMaterial,
  createTerrainMaterial, createWaterMaterial, spriteTexture, updateSharedUniforms,
} from '@/engine/shaders';
import type { WorldMapDef } from '@/types/contracts';

const world: WorldMapDef = {
  seed: 7, playerStart: { x: 90, z: 110 },
  regions: [{ id: 'r', name: 'Town', biome: 'frontier', center: { x: 90, z: 110 }, radius: 30, occupied: false, blurb: '' }],
  props: [{ kind: 'well', position: { x: 90, z: 104 } }], npcs: [], encounterZones: [], fishingSpots: [],
  paths: [{ points: [{ x: 20, z: 110 }, { x: 90, z: 110 }, { x: 200, z: 150 }], width: 4 }],
  water: [{ center: { x: 118, z: 96 }, radius: 16, kind: 'lake' }, { center: { x: 330, z: 125 }, radius: 110, kind: 'sea' }],
  chunks: [{ cx: 0, cz: 0, name: 'Test', biome: 'frontier', act: 1, scatterProps: [], foliageDensity: 1 }], traversalGates: [],
};
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.debug.onShaderError = (gl, _p, vs, fs) => {
  console.error('SHADER ERROR', gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
};
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 960 / 540, 1, 900);
const chunk = generateTerrainChunk(world, 0, 0, 129, 512);
const n = chunk.resolution;
const geo = new THREE.PlaneGeometry(250, 250, n - 1, n - 1);
geo.rotateX(-Math.PI / 2); geo.translate(125, 0, 125);
const pos = geo.attributes.position as THREE.BufferAttribute; const uv = geo.attributes.uv as THREE.BufferAttribute;
for (let i = 0; i < pos.count; i++) { pos.setY(i, chunk.heights[i] ?? 0); uv.setXY(i, pos.getX(i) / 250, pos.getZ(i) / 250); }
geo.computeVertexNormals();
scene.add(new THREE.Mesh(geo, createTerrainMaterial(chunk)));
const wgeo = new THREE.PlaneGeometry(250, 250); wgeo.rotateX(-Math.PI / 2); wgeo.translate(125, 0, 125);
const wuv = wgeo.attributes.uv as THREE.BufferAttribute; const wpos = wgeo.attributes.position as THREE.BufferAttribute;
for (let i = 0; i < wpos.count; i++) wuv.setXY(i, wpos.getX(i) / 250, wpos.getZ(i) / 250);
scene.add(new THREE.Mesh(wgeo, createWaterMaterial(chunk)));
const bb = createBillboardGeometry();
const ids = ['hero.kael', 'hero.tobin', 'hero.vesna', 'npc.covenant.deacon', 'enemy.beast.mirehound', 'enemy.wisp.still', 'animal.deer.red', 'dragon.emberwhelp', 'dragon.ashdrake', 'animal.boar.x', 'animal.hare.x', 'animal.bird.x', 'npc.smith', 'hero.orla', 'hero.sable'];
ids.forEach((id, i) => {
  const meta = getSpriteMeta(id);
  const mat = createSpriteMaterial(spriteTexture(id));
  const r = frameUv(meta, i % 8, 0); mat.uniforms.uUvRect.value.set(r.offsetX, r.offsetY, r.scaleX, r.scaleY);
  const m = new THREE.Mesh(bb, mat);
  const x = 78 + (i % 8) * 3.2; const z = 112 + Math.floor(i / 8) * 4;
  const h = meta.worldHeight; m.scale.set((h * meta.frameWidth) / meta.frameHeight, h, 1);
  m.position.set(x, sampleHeight(world, x, z), z); scene.add(m);
  if (i < 3) {
    const a = new THREE.Mesh(bb, createAuraMaterial(i === 0 ? ['#ff6a2a'] : i === 1 ? ['#3fb8ff'] : ['#ff6a2a', '#3fb8ff'], i));
    if (i === 1) a.material.uniforms.uBroken.value = 1;
    a.scale.set(m.scale.x * 1.9, h * 1.35, 1); a.position.copy(m.position); a.renderOrder = 2; scene.add(a);
  }
});
const atlas = getFoliageAtlas();
const kinds = Object.keys(atlas.rects) as (keyof typeof atlas.rects)[];
const count = 1500; const fgeo = createBillboardGeometry();
const uvRect = new Float32Array(count * 4); const params = new Float32Array(count * 4);
const inst = new THREE.InstancedMesh(fgeo, createFoliageMaterial(), count); const mtx = new THREE.Matrix4();
let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < count; i++) {
  const k = (i % 14 === 0 ? kinds[Math.floor(rnd() * kinds.length)] : i % 5 === 0 ? 'flower' : 'grass') ?? 'grass'; const r = atlas.rects[k];
  const x = 30 + rnd() * 140; const z = 60 + rnd() * 110; if (Math.abs(z - 114) < 5 && Math.abs(x - 88) < 16) { inst.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); continue; } const y = sampleHeight(world, x, z);
  mtx.compose(new THREE.Vector3(x, y < 0.3 ? -50 : y, z), new THREE.Quaternion(), new THREE.Vector3(r.width, r.height, 1)); inst.setMatrixAt(i, mtx);
  uvRect.set(r.uv, i * 4); params.set([r.sway, rnd() * 6.28, rnd() * 2 - 1, 0], i * 4);
}
fgeo.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(uvRect, 4)); fgeo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
inst.frustumCulled = false; scene.add(inst);
const pipeline = new Hd2dPipeline(renderer); pipeline.setSize(960, 540, 1);
const target = new THREE.Vector3(88, 1.5, 114);
const combat = new URLSearchParams(location.search).has('combat');
camera.position.copy(target).add(combat ? new THREE.Vector3(0, 3.2, 15) : new THREE.Vector3(0, 13, 18)); camera.lookAt(target);
let t = 2.2;
function frame() {
  t += 1 / 60; updateSharedUniforms(t, { direction: 0.5, speed: 4 }, { x: 88, y: 1, z: 114 });
  pipeline.render(scene, camera, { focusDistance: camera.position.distanceTo(target), combatBlend: combat ? 1 : 0 });
  (window as unknown as Record<string, unknown>).__calls = pipeline.drawCalls;
  requestAnimationFrame(frame);
}
frame();
