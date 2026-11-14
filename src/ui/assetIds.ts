/**
 * HUD asset ids — re-exported from the shared asset manifests (`@/assets/manifests`).
 * Sizes here are only the debug-fallback frame size used when a record has no manifest entry.
 */
import { ASSET, QTE_PROMPT_ASSET as MANIFEST_QTE_PROMPT } from '@/assets/manifests';
import type { QteGrade, QteInput } from '@/types/contracts';
import type { FrameSize } from './logic/assetView';

export const QTE_PROMPT_ASSET: Readonly<Record<QteInput, string>> = MANIFEST_QTE_PROMPT;
export const QTE_RING_ASSET: string = ASSET.qteRing;
export const QTE_GRADE_ASSET: Readonly<Record<QteGrade, string>> = {
  perfect: ASSET.qtePerfect,
  good: ASSET.qteGood,
  miss: ASSET.qteMiss,
};
export const STAMINA_FRAME_ASSET: string = ASSET.staminaFrame;
export const STAMINA_FILL_ASSET: string = ASSET.staminaFill;
export const STAMINA_EXHAUSTED_ASSET: string = ASSET.staminaExhausted;
export const HITSTOP_FLASH_ASSET: string = ASSET.hitStopFlash;

/** Debug-fallback frame sizes (CSS px) when the manifest has no entry. */
export const FALLBACK_SIZE = {
  qtePrompt: { width: 128, height: 128 },
  qteRing: { width: 192, height: 192 },
  qteGrade: { width: 256, height: 96 },
  staminaFrame: { width: 128, height: 24 },
  staminaFill: { width: 120, height: 16 },
  hazardIcon: { width: 32, height: 32 },
  mountIcon: { width: 48, height: 48 },
  flash: { width: 64, height: 64 },
} as const satisfies Record<string, FrameSize>;
