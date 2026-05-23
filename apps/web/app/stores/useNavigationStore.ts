import { create } from 'zustand';

interface RouteEntry {
  path: string;
  label: string;
  timestamp: number;
}

interface BreadcrumbEntry {
  path: string;
  label: string;
}

interface NavigationState {
  recentRoutes: RouteEntry[];
  breadcrumbs: BreadcrumbEntry[];
}

interface NavigationActions {
  pushRecentRoute: (route: RouteEntry) => void;
  setBreadcrumbs: (breadcrumbs: BreadcrumbEntry[]) => void;
}

type NavigationStore = NavigationState & NavigationActions;

const MAX_RECENT_ROUTES = 20;

export const useNavigationStore = create<NavigationStore>((set) => ({
  recentRoutes: [],
  breadcrumbs: [],
  pushRecentRoute: (route) =>
    set((state) => {
      const updated = [route, ...state.recentRoutes].slice(0, state.recentRoutes.length >= MAX_RECENT_ROUTES ? state.recentRoutes.length : MAX_RECENT_ROUTES);
      return { recentRoutes: updated };
    }),
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
}));