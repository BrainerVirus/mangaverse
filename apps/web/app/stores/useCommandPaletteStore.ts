import { create } from 'zustand';

interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
}

interface CommandPaletteActions {
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (idx: number) => void;
  moveSelection: (delta: number, maxIndex?: number) => void;
}

type CommandPaletteStore = CommandPaletteState & CommandPaletteActions;

export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', selectedIndex: 0 }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setQuery: (q) => set({ query: q }),
  setSelectedIndex: (idx) => set({ selectedIndex: idx }),
  moveSelection: (delta, maxIndex) =>
    set((state) => ({
      selectedIndex: Math.max(
        0,
        Math.min(state.selectedIndex + delta, maxIndex ?? Infinity)
      ),
    })),
}));