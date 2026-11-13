/**
 * BillboardSprite — one 8-directional, Y-axis billboarded sprite mesh driven by
 * an ECS entity (`sprite` + `position`, optional `opacity` / `scale`). Used for
 * combat actors, which need per-sprite dissolve; crowds go through the
 * instanced `SpriteBatcher` instead. The row (`sprite.facing`) is expected to be
 * camera-relative already (the engine derives it from `heading` each frame).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getSpriteMeta } from '@/engine/bootstrapAssets';
import { createBillboardGeometry, createSpriteMaterial, spriteTexture } from '@/engine/shaders';
import type { EngineEntity } from './ecs';
import { parseHexColor, spriteFrameRect, spriteWorldSize } from './spriteMath';

let sharedGeometry: THREE.BufferGeometry | null = null;
function billboardGeometry(): THREE.BufferGeometry {
  if (!sharedGeometry) sharedGeometry = createBillboardGeometry();
  return sharedGeometry;
}

export interface BillboardSpriteProps {
  readonly entity: EngineEntity;
}

export function BillboardSprite({ entity }: BillboardSpriteProps) {
  const initialSheet = entity.sprite?.sheet ?? 'hero.kael';
  const { mesh, material } = useMemo(() => {
    const material = createSpriteMaterial(spriteTexture(initialSheet));
    const mesh = new THREE.Mesh(billboardGeometry(), material);
    mesh.frustumCulled = false;
    mesh.userData.sheet = initialSheet;
    return { mesh, material };
  }, [initialSheet]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const s = entity.sprite;
    const p = entity.position;
    if (!s || !p) {
      mesh.visible = false;
      return;
    }
    if (mesh.userData.sheet !== s.sheet) {
      material.uniforms.uMap.value = spriteTexture(s.sheet);
      mesh.userData.sheet = s.sheet;
    }
    const opacity = entity.opacity ?? 1;
    mesh.visible = !entity.hidden && opacity > 0.01;
    if (!mesh.visible) return;
    const meta = getSpriteMeta(s.sheet);
    const size = spriteWorldSize(meta);
    const k = entity.scale ?? 1;
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.set(size.width * k, size.height * k, 1);
    const r = spriteFrameRect(meta, s.facing, s.anim, s.frameTime);
    material.uniforms.uUvRect.value.set(r[0], r[1], r[2], r[3]);
    const c = parseHexColor(s.tint);
    material.uniforms.uTint.value.set(c[0], c[1], c[2]);
    material.uniforms.uFlash.value = Math.min(1, Math.max(0, s.flash ?? 0));
    material.uniforms.uOpacity.value = Math.min(1, opacity);
  });

  return <primitive object={mesh} />;
}
