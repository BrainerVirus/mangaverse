import { create } from 'zustand';

const initialDeviceLayout = typeof window !== 'undefined'
  ? detectDeviceLayout()
  : 'desktop';

export function detectDeviceLayout(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

interface LayoutState {
  sidebarOpen: boolean;
  sidebarExpanded: boolean;
  deviceLayout: 'desktop' | 'tablet' | 'mobile';
  readerChromeVisible: boolean;
}

interface LayoutActions {
  toggleSidebar: () => void;
  toggleSidebarExpand: () => void;
  setDeviceLayout: (layout: 'desktop' | 'tablet' | 'mobile') => void;
  toggleReaderChrome: () => void;
  setReaderChrome: (visible: boolean) => void;
}

type LayoutStore = LayoutState & LayoutActions;

export const useLayoutStore = create<LayoutStore>((set) => ({
  sidebarOpen: true,
  sidebarExpanded: false,
  deviceLayout: initialDeviceLayout,
  readerChromeVisible: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleSidebarExpand: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
  setDeviceLayout: (layout) => set({ deviceLayout: layout }),
  toggleReaderChrome: () => set((state) => ({ readerChromeVisible: !state.readerChromeVisible })),
  setReaderChrome: (visible) => set({ readerChromeVisible: visible }),
}));