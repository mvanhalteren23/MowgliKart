import { useGame } from '@/app/store';
import { GameCanvas } from '@/engine';
import { Hud } from '@/ui';

export function App() {
  const booted = useGame((s) => s.mode !== 'boot');
  if (!booted) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#0d0a12' }}>
      <GameCanvas />
      <Hud />
    </div>
  );
}
