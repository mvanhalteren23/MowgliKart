/**
 * Turns ready `AssetRecord`s into GPU textures and hot-swaps them.
 *
 * Textures follow the gamma pipeline (`NoColorSpace`, see `src/engine/shaders/index.ts`)
 * with nearest filtering and no mipmaps (pixel art). When the registry reports a newer
 * `version` the image is reloaded and every binding receives the new texture in place —
 * no reload, no remount — and the old texture is disposed.
 */
import * as THREE from 'three';
import type { AssetId, AssetManifestEntry } from '@/types/contracts';
import { assetRegistry, type AssetRegistry } from './registry';

export type TextureBinding = (texture: THREE.Texture, entry: AssetManifestEntry | null) => void;

interface Slot {
  texture: THREE.Texture | null;
  version: number;
  loadingVersion: number;
  readonly bindings: Set<TextureBinding>;
}

export function configureAssetTexture(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class AssetRegistryLoader {
  private readonly slots = new Map<AssetId, Slot>();
  private readonly loader = new THREE.TextureLoader();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(private readonly registry: AssetRegistry = assetRegistry) {
    this.unsubscribe = registry.subscribe(() => this.sync());
  }

  private slot(id: AssetId): Slot {
    let s = this.slots.get(id);
    if (!s) {
      s = { texture: null, version: 0, loadingVersion: 0, bindings: new Set() };
      this.slots.set(id, s);
      this.refresh(id, s);
    }
    return s;
  }

  private sync(): void {
    for (const [id, s] of this.slots) this.refresh(id, s);
  }

  private refresh(id: AssetId, s: Slot): void {
    const rec = this.registry.get(id);
    if (!rec.ready || !rec.url || rec.version <= s.version || rec.version <= s.loadingVersion) return;
    const version = rec.version;
    s.loadingVersion = version;
    this.loader.load(
      rec.url,
      (tex) => {
        if (this.disposed || version < s.version) {
          tex.dispose();
          return;
        }
        configureAssetTexture(tex);
        tex.name = `${id}@${version}`;
        const old = s.texture;
        s.texture = tex;
        s.version = version;
        for (const b of s.bindings) b(tex, this.registry.get(id).entry);
        old?.dispose();
      },
      undefined,
      () => {
        if (s.loadingVersion === version) s.loadingVersion = s.version;
      },
    );
  }

  /** Current texture for a delivered asset (null until loaded). Starts loading on first ask. */
  textureFor(id: AssetId): THREE.Texture | null {
    return this.slot(id).texture;
  }

  /** Loaded version (0 = nothing yet). */
  versionOf(id: AssetId): number {
    return this.slots.get(id)?.version ?? 0;
  }

  entryFor(id: AssetId): AssetManifestEntry | null {
    return this.registry.get(id).entry;
  }

  /** Call `apply` now (if loaded) and again on every newer version. Returns an unbind function. */
  bind(id: AssetId, apply: TextureBinding): () => void {
    const s = this.slot(id);
    s.bindings.add(apply);
    if (s.texture) apply(s.texture, this.registry.get(id).entry);
    return () => {
      s.bindings.delete(apply);
    };
  }

  /** Keep `material.map` pointing at the latest texture of `id`. */
  bindMap(id: AssetId, material: THREE.MeshBasicMaterial): () => void {
    return this.bind(id, (tex) => {
      const had = material.map !== null;
      material.map = tex;
      if (!had) material.needsUpdate = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    for (const s of this.slots.values()) {
      s.texture?.dispose();
      s.bindings.clear();
    }
    this.slots.clear();
  }
}
