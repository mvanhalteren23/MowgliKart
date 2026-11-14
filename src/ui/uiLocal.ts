/** Transient HUD-only state (not game state): which HUD-owned overlays are open. */
import { create } from 'zustand';

interface UiLocal {
  readonly mapOpen: boolean;
  readonly mountPickerOpen: boolean;
  setMapOpen(open: boolean): void;
  setMountPickerOpen(open: boolean): void;
}

export const useUiLocal = create<UiLocal>()((set) => ({
  mapOpen: false,
  mountPickerOpen: false,
  setMapOpen: (open) => set({ mapOpen: open, mountPickerOpen: false }),
  setMountPickerOpen: (open) => set({ mountPickerOpen: open }),
}));
