import { detail } from './Lod.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeGenericKart } from '../registries/_mesh.js';

const BASE = (import.meta.env?.BASE_URL ?? './');

/**
 * Loads optional .glb models from /public/assets/models (listed in manifest.json by scripts/validate-assets.js).
 * Anything missing renders the registry's `proceduralFallback(THREE)` cartoon primitives, so the game is 100%
 * playable at every stage of asset production.
 */
export class AssetManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.available = new Set();
    this.cache = new Map();
    this.skyboxes = new Set();
    this.audioNames = [];
  }

  /** Optional equirectangular skybox (public/assets/skyboxes/<track_id>.jpg). Resolves null if absent. */
  loadSkybox(id) {
    if (!this.skyboxes.has(id)) return Promise.resolve(null);
    return new Promise((resolve) => new THREE.TextureLoader().load(`${BASE}assets/skyboxes/${id}.jpg`, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; resolve(t); }, undefined, () => resolve(null)));
  }

  async init() {
    try {
      const res = await fetch(`${BASE}assets/models/manifest.json`, { cache: 'no-cache' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.includes('json')) {
        const m = await res.json();
        for (const id of m.models ?? []) this.available.add(id);
        for (const id of m.skyboxes ?? []) this.skyboxes.add(id);
        this.audioNames = m.audio ?? [];
      }
    } catch { /* offline / no manifest: fully procedural */ }
    return this;
  }

  /** Preload every available model referenced by this race. */
  async preload(ids) {
    await Promise.all(ids.filter((id) => this.available.has(id) && !this.cache.has(id)).map((id) => new Promise((resolve) => {
      this.loader.load(`${BASE}assets/models/${id}.glb`, (g) => { this.cache.set(id, g.scene); resolve(); }, undefined, () => { this.available.delete(id); resolve(); });
    })));
  }

  _instance(id, fallback) {
    const src = this.cache.get(id);
    if (src) return src.clone(true);
    return fallback();
  }

  getKart(def) { return this._instance(def.id, () => def.proceduralFallback(detail.T) ?? makeGenericKart(detail.T)); }
  getCharacter(def) { return this._instance(def.id, () => def.proceduralFallback(detail.T)); }
  getObstacle(def) { return this._instance(def.id, () => def.proceduralFallback(detail.T)); }
  getProp(id, def) { return this._instance(id, () => def.proceduralFallback(detail.T)); }
}
