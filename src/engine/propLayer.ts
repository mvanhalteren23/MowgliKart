/**
 * Prop rendering: all static props merged into one mesh, dynamic props
 * (township buildings, plots, the merchant barge) into a second one.
 * Own small toon material over the bootstrapper's pattern atlas.
 */
import * as THREE from 'three';
import { getPattern, makeCanvas } from '@/engine/bootstrapAssets';
import { canvasTexture, sharedUniforms } from '@/engine/shaders';
import type { WorldMapDef } from '@/types/contracts';
import type { Collider } from './movement';
import { buildProps, PATTERN_SLOTS, type PropInstance, type WalkArea } from './props';

const SLOT_PX = 64;

let atlasCanvas: HTMLCanvasElement | null = null;
function patternAtlas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const c = makeCanvas(SLOT_PX * PATTERN_SLOTS.length, SLOT_PX);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    PATTERN_SLOTS.forEach((slot, i) => {
      if (slot === 'plain') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(i * SLOT_PX, 0, SLOT_PX, SLOT_PX);
      } else ctx.drawImage(getPattern(slot), i * SLOT_PX, 0);
    });
  }
  atlasCanvas = c;
  return c;
}

const propVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSlot;
attribute float aEmissive;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
varying float vSlot;
varying float vEmissive;
void main() {
  vUv = uv;
  vColor = aColor;
  vSlot = aSlot;
  vEmissive = aEmissive;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const propFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uSlots;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadeColor;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
varying float vSlot;
varying float vEmissive;
void main() {
  vec2 f = fract(vUv);
  float inset = 0.5 / 64.0;
  vec2 a = vec2((vSlot + inset + f.x * (1.0 - 2.0 * inset)) / uSlots, inset + f.y * (1.0 - 2.0 * inset));
  vec3 albedo = texture2D(uAtlas, a).rgb * vColor;
  vec3 n = normalize(vNormal);
  float ndl = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
  float band = floor(ndl * 3.0 + 0.5) / 3.0;
  vec3 lit = albedo * mix(uShadeColor, uSunColor, mix(ndl, band, 0.7));
  gl_FragColor = vec4(mix(lit, vColor * 1.1, vEmissive), 1.0);
}
`;

export function createPropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'EmberwakeProps',
    vertexShader: propVertex,
    fragmentShader: propFragment,
    uniforms: {
      uAtlas: { value: canvasTexture(patternAtlas(), { pixel: true }) },
      uSlots: { value: PATTERN_SLOTS.length },
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uShadeColor: sharedUniforms.uShadeColor,
    },
  });
}

export interface PropBuild {
  readonly mesh: THREE.Mesh | null;
  readonly colliders: readonly Collider[];
  readonly walkAreas: readonly WalkArea[];
}

export function buildPropMesh(world: WorldMapDef, props: readonly PropInstance[], material: THREE.Material): PropBuild {
  const b = buildProps(world, props);
  if (b.indices.length === 0) return { mesh: null, colliders: b.colliders, walkAreas: b.walkAreas };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(b.colors, 3));
  g.setAttribute('aSlot', new THREE.Float32BufferAttribute(b.tiles, 1));
  g.setAttribute('aEmissive', new THREE.Float32BufferAttribute(b.emissive, 1));
  g.setIndex(b.indices);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'props';
  return { mesh, colliders: b.colliders, walkAreas: b.walkAreas };
}

/** Two merged prop meshes: static (authored) and dynamic (rebuilt on change). */
export class PropLayer {
  readonly root = new THREE.Group();
  private readonly material = createPropMaterial();
  private staticBuild: PropBuild;
  private dynamicBuild: PropBuild = { mesh: null, colliders: [], walkAreas: [] };
  private dynamicKey = '';
  colliders: readonly Collider[] = [];
  walkAreas: readonly WalkArea[] = [];

  constructor(
    private readonly world: WorldMapDef,
    staticProps: readonly PropInstance[],
  ) {
    this.root.name = 'props';
    this.staticBuild = buildPropMesh(world, staticProps, this.material);
    if (this.staticBuild.mesh) this.root.add(this.staticBuild.mesh);
    this.refreshCollision();
  }

  setDynamic(props: readonly PropInstance[]): void {
    const key = JSON.stringify(props);
    if (key === this.dynamicKey) return;
    this.dynamicKey = key;
    if (this.dynamicBuild.mesh) {
      this.root.remove(this.dynamicBuild.mesh);
      this.dynamicBuild.mesh.geometry.dispose();
    }
    this.dynamicBuild = buildPropMesh(this.world, props, this.material);
    if (this.dynamicBuild.mesh) this.root.add(this.dynamicBuild.mesh);
    this.refreshCollision();
  }

  private refreshCollision(): void {
    this.colliders = [...this.staticBuild.colliders, ...this.dynamicBuild.colliders];
    this.walkAreas = [...this.staticBuild.walkAreas, ...this.dynamicBuild.walkAreas];
  }

  dispose(): void {
    this.staticBuild.mesh?.geometry.dispose();
    this.dynamicBuild.mesh?.geometry.dispose();
    this.material.dispose();
  }
}
