/**
 * HUD asset ids requested from the external pipeline (Phase 3). The manifest
 * entries live in `src/assets/manifests` (world-lore); sizes here are only the
 * debug-fallback frame size used until an entry/record is available.
 */
import type { QteGrade, QteInput } from '@/types/contracts';
import type { FrameSize } from './logic/assetView';

export const QTE_PROMPT_ASSET: Readonly<Record<QteInput, string>> = {
  up: 'hud.qte.prompt.up',
  down: 'hud.qte.prompt.down',
  left: 'hud.qte.prompt.left',
  right: 'hud.qte.prompt.right',
  tap: 'hud.qte.prompt.tap',
};
export const QTE_RING_ASSET = 'hud.qte.ring';
export const QTE_GRADE_ASSET: Readonly<Record<QteGrade, string>> = {
  perfect: 'hud.qte.grade.perfect',
  good: 'hud.qte.grade.good',
  miss: 'hud.qte.grade.miss',
};
export const STAMINA_FRAME_ASSET = 'hud.stamina.frame';
export const STAMINA_FILL_ASSET = 'hud.stamina.fill';

/** Debug-fallback frame sizes (CSS px) when the manifest has no entry yet. */
export const FALLBACK_SIZE = {
  qtePrompt: { width: 128, height: 128 },
  qteRing: { width: 192, height: 192 },
  qteGrade: { width: 256, height: 96 },
  staminaFrame: { width: 128, height: 24 },
  staminaFill: { width: 120, height: 16 },
  hazardIcon: { width: 32, height: 32 },
  mountIcon: { width: 48, height: 48 },
} as const satisfies Record<string, FrameSize>;
