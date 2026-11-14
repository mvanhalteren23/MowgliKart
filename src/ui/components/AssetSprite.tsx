import type { CSSProperties, ReactNode } from 'react';
import { useAsset } from '../assetRegistry';
import { assetView, fitFrame, type FrameSize } from '../logic/assetView';
import { cx } from './common';

export interface AssetSpriteProps {
  readonly assetId: string;
  /** Frame size used when the manifest has no entry yet. */
  readonly fallback: FrameSize;
  /** Optional box to fit into (aspect ratio preserved). */
  readonly fit?: { readonly maxW: number; readonly maxH: number };
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Extra text shown inside the debug fallback (e.g. the QTE direction word). */
  readonly fallbackText?: ReactNode;
  readonly alt?: string;
}

/**
 * Renders a pipeline asset: the delivered file once `ready`, otherwise a dashed
 * debug outline at the manifest frame size labelled with the asset id. Never draws art.
 */
export function AssetSprite({ assetId, fallback, fit, className, style, fallbackText, alt = '' }: AssetSpriteProps) {
  const record = useAsset(assetId);
  const view = assetView(assetId, record, fallback);
  const size = fit ? fitFrame(view, fit.maxW, fit.maxH) : { width: view.width, height: view.height };
  const box: CSSProperties = { width: size.width, height: size.height, ...style };
  if (view.kind === 'image') {
    const grid = record.entry?.grid;
    if (grid && grid.columns * grid.rows > 1) {
      return (
        <span
          className={cx('ew-asset', className)}
          data-asset={assetId}
          data-ready="1"
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
          style={{ ...box, backgroundImage: `url("${view.url}")`, backgroundSize: `${grid.columns * 100}% ${grid.rows * 100}%`, backgroundPosition: '0 0' }}
        />
      );
    }
    return <img className={cx('ew-asset', className)} data-asset={assetId} data-ready="1" src={view.url} alt={alt} draggable={false} style={box} />;
  }
  return (
    <span className={cx('ew-asset', 'ew-asset--fallback', className)} data-asset={assetId} data-ready="0" style={box} aria-label={alt || undefined}>
      <span className="ew-asset__id">{assetId}</span>
      {fallbackText !== undefined && <span className="ew-asset__text">{fallbackText}</span>}
    </span>
  );
}
