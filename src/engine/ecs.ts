/** Miniplex ECS world for the engine. */
import { World } from 'miniplex';
import type { SpriteAnim, WorldEntity } from '@/types/contracts';

/** Contract entity + engine-only render state. */
export type EngineEntity = WorldEntity & {
  /** World heading (radians, atan2(dz, dx)); the sprite row is derived from it each frame. */
  heading?: number;
  /** Skip rendering (and interaction) this frame. */
  hidden?: boolean;
  /** 0..1 dissolve (only honoured by per-mesh BillboardSprites). */
  opacity?: number;
  /** Uniform scale on the sheet's world height. */
  scale?: number;
};

export type EngineWorld = World<EngineEntity>;

export function createEngineWorld(): EngineWorld {
  return new World<EngineEntity>();
}

/** Switch animation, restarting its clock only when it actually changes. */
export function setAnim(e: EngineEntity, anim: SpriteAnim): void {
  if (!e.sprite || e.sprite.anim === anim) return;
  e.sprite.anim = anim;
  e.sprite.frameTime = 0;
}
