/** Asset render decision (delivered image vs debug fallback) — framework-free, unit tested. */
import type { AssetManifestEntry, AssetRecord } from '@/types/contracts';

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export type AssetView =
  | { readonly kind: 'image'; readonly url: string; readonly width: number; readonly height: number; readonly frames: number }
  | { readonly kind: 'fallback'; readonly assetId: string; readonly width: number; readonly height: number };

/** Manifest frame size: one grid cell for sheets, the full resolution otherwise. */
export function frameSize(entry: AssetManifestEntry | null | undefined, fallback: FrameSize): FrameSize {
  if (!entry) return fallback;
  if (entry.grid && entry.grid.frame_width > 0 && entry.grid.frame_height > 0) return { width: entry.grid.frame_width, height: entry.grid.frame_height };
  if (entry.resolution.width > 0 && entry.resolution.height > 0) return { width: entry.resolution.width, height: entry.resolution.height };
  return fallback;
}

/**
 * Render the delivered file only when the record is `ready` with a URL;
 * anything else (pending, in progress, rejected, unknown id) is the dashed debug box.
 */
export function assetView(assetId: string, record: AssetRecord | null | undefined, fallback: FrameSize): AssetView {
  const size = frameSize(record?.entry, fallback);
  if (record && record.ready && typeof record.url === 'string' && record.url.length > 0) {
    const frames = record.entry?.grid ? Math.max(1, record.entry.grid.columns * record.entry.grid.rows) : 1;
    return { kind: 'image', url: record.url, width: size.width, height: size.height, frames };
  }
  return { kind: 'fallback', assetId, width: size.width, height: size.height };
}

/** Scale a frame to fit a target box (CSS px), preserving aspect ratio. */
export function fitFrame(size: FrameSize, maxW: number, maxH: number): FrameSize {
  if (size.width <= 0 || size.height <= 0) return { width: maxW, height: maxH };
  const k = Math.min(maxW / size.width, maxH / size.height);
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}
