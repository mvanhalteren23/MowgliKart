/**
 * Emberwake shader suite (lead-owned) — material factories + the HD-2D post pipeline.
 *
 * COLOUR PIPELINE: everything is authored and composited in gamma (display)
 * space. Colour management is disabled globally and the R3F canvas must be
 * created with `<Canvas flat linear gl={{ antialias: false }}>`. Built-in three
 * materials (MeshBasicMaterial / MeshLambertMaterial) are therefore also safe.
 *
 * GEOMETRY CONVENTIONS
 *  - Terrain mesh: world-space positions, needs vertex normals. The albedo is a
 *    canvas texture (flipY), so its uv is u = x across the chunk (west→east) and
 *    v = 1 at the north (min z) edge, 0 at the south edge.
 *  - Water mesh: a flat quad covering the chunk at y = WATER_LEVEL. It samples the
 *    height DataTexture (no flip): u west→east, v = 0 at the north edge, 1 at the south.
 *  - Billboards (sprite / aura / foliage): `createBillboardGeometry()`; put the
 *    object's position at the feet and its scale = (width, height, 1) in metres.
 */
import * as THREE from 'three';
import { WATER_LEVEL, type TerrainChunk } from '@/engine/bootstrapAssets';
import { auraFragment, auraVertex } from './aura';
import { foliageFragment, foliageVertex } from './foliage';
import { spriteFragment, spriteVertex } from './sprite';
import { terrainFragment, terrainVertex } from './terrain';
import { foliageTexture, heightTexture, terrainTexture } from './textures';
import { tiltShiftFragment, tiltShiftVertex } from './tiltShift';
import { waterFragment, waterVertex } from './water';

export * from './textures';
export { WATER_LEVEL };

THREE.ColorManagement.enabled = false;

/** '#rrggbb' → raw 0..1 vector (no colour-space conversion). */
export function hexToVec3(hex: string, target = new THREE.Vector3()): THREE.Vector3 {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return target.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Shared lighting/time uniforms — one object referenced by every material, updated once per frame. */
export const sharedUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
  uSunColor: { value: hexToVec3('#fff1d6').multiplyScalar(1.08) },
  uShadeColor: { value: hexToVec3('#7f86b8') },
  uWind: { value: new THREE.Vector2(0.3, 0.1) },
  uPlayer: { value: new THREE.Vector3() },
  uRippleOrigin: { value: new THREE.Vector3(0, 0, -100) },
};

/** Call once per frame before rendering. */
export function updateSharedUniforms(timeSec: number, wind: { direction: number; speed: number }, player: { x: number; y: number; z: number }): void {
  sharedUniforms.uTime.value = timeSec;
  const s = Math.min(1, wind.speed / 8);
  sharedUniforms.uWind.value.set(Math.cos(wind.direction) * s, Math.sin(wind.direction) * s);
  sharedUniforms.uPlayer.value.set(player.x, player.y, player.z);
}

/** Start an interactive ripple ring at a world position (e.g. the leader wading, a cast lure). */
export function emitRipple(x: number, z: number): void {
  sharedUniforms.uRippleOrigin.value.set(x, z, sharedUniforms.uTime.value);
}

/** Unit quad with its origin at the bottom-centre: x ∈ [−0.5, 0.5], y ∈ [0, 1]. */
export function createBillboardGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  // Billboarding happens in the vertex shader; give culling a generous sphere.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.2);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  return g;
}

export function createTerrainMaterial(chunk: TerrainChunk): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'EmberwakeTerrain',
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: {
      uMap: { value: terrainTexture(chunk) },
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uShadeColor: sharedUniforms.uShadeColor,
      uWaterLevel: { value: WATER_LEVEL },
    },
  });
}

export function createWaterMaterial(chunk: TerrainChunk): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'EmberwakeWater',
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uRippleOrigin: sharedUniforms.uRippleOrigin,
      uHeightMap: { value: heightTexture(chunk) },
      uShallow: { value: hexToVec3('#5fb7b4') },
      uDeep: { value: hexToVec3('#22507a') },
      uFoam: { value: hexToVec3('#f4fbff') },
    },
  });
}

export interface SpriteMaterialUniforms {
  uMap: { value: THREE.Texture };
  /** xy = frame offset, zw = frame size (see `frameUv`). Ignored when instanced. */
  uUvRect: { value: THREE.Vector4 };
  uTint: { value: THREE.Vector3 };
  /** 0..1 white flash (damage feedback). */
  uFlash: { value: number };
  /** 0..1 dithered dissolve. */
  uOpacity: { value: number };
  uRim: { value: THREE.Vector3 };
}

/**
 * BillboardSprite material. Use one per sprite Mesh (drive `uUvRect` each
 * frame) or one per InstancedMesh with `aUvRect` / `aTint` instanced
 * attributes (see `createSpriteInstanceAttributes`).
 */
export function createSpriteMaterial(map: THREE.Texture): THREE.ShaderMaterial & { uniforms: SpriteMaterialUniforms } {
  const uniforms: SpriteMaterialUniforms = {
    uMap: { value: map },
    uUvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFlash: { value: 0 },
    uOpacity: { value: 1 },
    uRim: { value: hexToVec3('#ffd9a0') },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'EmberwakeSprite',
    vertexShader: spriteVertex,
    fragmentShader: spriteFragment,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    side: THREE.DoubleSide,
  });
  return mat as THREE.ShaderMaterial & { uniforms: SpriteMaterialUniforms };
}

/** Allocate + attach the per-instance sprite attributes on an InstancedMesh geometry. */
export function createSpriteInstanceAttributes(geometry: THREE.BufferGeometry, count: number): { uvRect: THREE.InstancedBufferAttribute; tint: THREE.InstancedBufferAttribute } {
  const uvRect = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const tintArr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) tintArr.set([1, 1, 1, 0], i * 4);
  const tint = new THREE.InstancedBufferAttribute(tintArr, 4);
  uvRect.setUsage(THREE.DynamicDrawUsage);
  tint.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aUvRect', uvRect);
  geometry.setAttribute('aTint', tint);
  return { uvRect, tint };
}

export interface AuraMaterialUniforms {
  uTime: { value: number };
  uColorA: { value: THREE.Vector3 };
  uColorB: { value: THREE.Vector3 };
  uIntensity: { value: number };
  uBroken: { value: number };
  uSeed: { value: number };
}

/**
 * Warden resonance aura. Render on a billboard quad ≈ 1.9× the host sprite's
 * width and 1.35× its height, at the host's feet. `colors` = aura colours of
 * the fused spirits, innermost first (1 or 2 entries).
 */
export function createAuraMaterial(colors: readonly string[], seed = 0): THREE.ShaderMaterial & { uniforms: AuraMaterialUniforms } {
  const a = colors[0] ?? '#ffffff';
  const b = colors[1] ?? a;
  const uniforms: AuraMaterialUniforms = {
    uTime: sharedUniforms.uTime,
    uColorA: { value: hexToVec3(a) },
    uColorB: { value: hexToVec3(b) },
    uIntensity: { value: 1 },
    uBroken: { value: 0 },
    uSeed: { value: seed },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'EmberwakeAura',
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, // premultiplied additive
    blendDst: THREE.OneFactor,
  });
  return mat as THREE.ShaderMaterial & { uniforms: AuraMaterialUniforms };
}

export function setAuraColors(mat: { uniforms: AuraMaterialUniforms }, colors: readonly string[]): void {
  const a = colors[0] ?? '#ffffff';
  hexToVec3(a, mat.uniforms.uColorA.value);
  hexToVec3(colors[1] ?? a, mat.uniforms.uColorB.value);
}

/**
 * Instanced foliage material (shared atlas). The InstancedMesh geometry must be
 * `createBillboardGeometry()` plus instanced attributes `aUvRect` (vec4, from
 * `getFoliageAtlas().rects[kind].uv`) and `aParams` (vec4: sway, phase, tint variation, 0).
 * Instance matrix: translation = base position, scale = (width, height, 1).
 */
export function createFoliageMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'EmberwakeFoliage',
    vertexShader: foliageVertex,
    fragmentShader: foliageFragment,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: foliageTexture() },
      uTime: sharedUniforms.uTime,
      uWind: sharedUniforms.uWind,
      uPlayer: sharedUniforms.uPlayer,
      uSunColor: sharedUniforms.uSunColor,
      uShadeColor: sharedUniforms.uShadeColor,
    },
  });
}

export interface Hd2dFrameParams {
  /** View-space distance (m) from the camera to the subject that must stay sharp. */
  readonly focusDistance: number;
  /** 0 = overworld framing, 1 = combat framing. */
  readonly combatBlend: number;
}

/**
 * HD-2D post pipeline: renders the scene into a colour + depth target, then
 * composites tilt-shift DoF, depth fog, sky and grade to the canvas in one
 * full-screen draw. Owns `renderer.info` resets so `drawCalls` is the true
 * per-frame total (scene + 1).
 *
 * Usage inside R3F (take over rendering with a positive useFrame priority):
 *   const pipeline = useMemo(() => new Hd2dPipeline(gl), [gl]);
 *   useFrame(() => { pipeline.setSize(size.width, size.height, gl.getPixelRatio()); pipeline.render(scene, camera, params); }, 1);
 */
export class Hd2dPipeline {
  readonly uniforms = {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uFocus: { value: 40 },
    uFocusRange: { value: 26 },
    uMaxBlur: { value: 7 },
    uBand: { value: 0.3 },
    uFogColor: { value: hexToVec3('#c9d6e8') },
    uFogStart: { value: 90 },
    uFogEnd: { value: 420 },
    uSkyTop: { value: hexToVec3('#6fa4d8') },
    uSkyHorizon: { value: hexToVec3('#f3e3c4') },
    uCombat: { value: 0 },
    uTime: sharedUniforms.uTime,
  };
  /** Total draw calls / triangles of the last frame (scene + post). */
  drawCalls = 0;
  triangles = 0;

  private readonly target: THREE.WebGLRenderTarget;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private width = 0;
  private height = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const depthTexture = new THREE.DepthTexture(2, 2);
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, depthTexture, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.uniforms.tColor.value = this.target.texture;
    this.uniforms.tDepth.value = depthTexture;
    this.material = new THREE.ShaderMaterial({
      name: 'EmberwakeTiltShift',
      vertexShader: tiltShiftVertex,
      fragmentShader: tiltShiftFragment,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      depthTest: false,
      depthWrite: false,
    });
    // One oversized triangle covers the screen with no diagonal seam.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    renderer.info.autoReset = false;
  }

  /** Cheap to call every frame; only reallocates when the size changes. */
  setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    const w = Math.max(2, Math.floor(cssWidth * pixelRatio));
    const h = Math.max(2, Math.floor(cssHeight * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.target.setSize(w, h);
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
    // Keep the blur a constant fraction of the frame regardless of DPR.
    this.uniforms.uMaxBlur.value = Math.max(3, h / 110);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, params: Hd2dFrameParams): void {
    const r = this.renderer;
    r.info.reset();
    this.uniforms.uNear.value = camera.near;
    this.uniforms.uFar.value = camera.far;
    this.uniforms.uFocus.value = params.focusDistance;
    this.uniforms.uCombat.value = params.combatBlend;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
    this.drawCalls = r.info.render.calls;
    this.triangles = r.info.render.triangles;
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
    this.renderer.info.autoReset = true;
  }
}
