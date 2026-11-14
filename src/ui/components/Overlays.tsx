import { useEffect, useRef } from 'react';
import { useGame } from '@/app/store';
import { runtime } from '@/app/runtime';
import type { Toast } from '@/types/contracts';
import { cx } from './common';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.tone === 'warn' ? 4500 : 3500);
    return () => clearTimeout(id);
  }, [toast.id, toast.tone, dismiss]);
  return (
    <div className={cx('ew-toast', `ew-toast--${toast.tone}`)} role="status" data-testid={`toast-${toast.id}`} onPointerUp={() => dismiss(toast.id)}>
      {toast.text}
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="ew-toasts" data-testid="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/** Tiny dev readout: draw calls + fps, refreshed ~2×/s via ref. */
export function PerfChip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (ref.current) ref.current.textContent = `${Math.round(runtime.perf.fps)} fps · ${runtime.perf.drawCalls} dc`;
    }, 500);
    return () => clearInterval(id);
  }, []);
  return <div ref={ref} className="ew-perf" data-testid="perf" />;
}

export function RotateVeil() {
  return (
    <div className="ew-rotate" aria-hidden="true">
      <div className="ew-rotate__icon">⟳</div>
      <div>Rotate your device</div>
      <small>Emberwake plays in landscape</small>
    </div>
  );
}
