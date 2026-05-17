import { describe, it, expect, beforeEach } from 'vitest';
import { useNavigationStore } from '../useNavigationStore';

describe('useNavigationStore', () => {
  beforeEach(() => {
    useNavigationStore.setState({
      recentRoutes: [],
      breadcrumbs: [],
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useNavigationStore.getState();
      expect(state.recentRoutes).toEqual([]);
      expect(state.breadcrumbs).toEqual([]);
    });
  });

  describe('pushRecentRoute', () => {
    it('adds a new route to recentRoutes', () => {
      useNavigationStore.getState().pushRecentRoute({
        path: '/library',
        label: 'Library',
        timestamp: Date.now(),
      });
      expect(useNavigationStore.getState().recentRoutes).toHaveLength(1);
      expect(useNavigationStore.getState().recentRoutes[0]!.path).toBe('/library');
      expect(useNavigationStore.getState().recentRoutes[0]!.label).toBe('Library');
    });

    it('caps recentRoutes at 20 entries', () => {
      const now = Date.now();
      for (let i = 0; i < 25; i++) {
        useNavigationStore.getState().pushRecentRoute({
          path: `/route-${i}`,
          label: `Route ${i}`,
          timestamp: now + i,
        });
      }
      expect(useNavigationStore.getState().recentRoutes).toHaveLength(20);
      expect(useNavigationStore.getState().recentRoutes[0]!.path).toBe('/route-24');
    });

    it('keeps most recent routes when capping', () => {
      const now = Date.now();
      useNavigationStore.setState({ recentRoutes: [] });
      for (let i = 0; i < 20; i++) {
        useNavigationStore.getState().pushRecentRoute({
          path: `/old-${i}`,
          label: `Old ${i}`,
          timestamp: now + i,
        });
      }
      useNavigationStore.getState().pushRecentRoute({
        path: '/new-route',
        label: 'New Route',
        timestamp: now + 100,
      });
      expect(useNavigationStore.getState().recentRoutes).toHaveLength(20);
      expect(useNavigationStore.getState().recentRoutes[0]!.path).toBe('/new-route');
      expect(useNavigationStore.getState().recentRoutes[19]!.path).toBe('/old-1');
    });
  });

  describe('setBreadcrumbs', () => {
    it('sets breadcrumbs to provided array', () => {
      const crumbs = [
        { path: '/', label: 'Home' },
        { path: '/library', label: 'Library' },
        { path: '/library/123', label: 'Manga Title' },
      ];
      useNavigationStore.getState().setBreadcrumbs(crumbs);
      expect(useNavigationStore.getState().breadcrumbs).toEqual(crumbs);
    });

    it('can set empty breadcrumbs', () => {
      useNavigationStore.setState({
        breadcrumbs: [{ path: '/', label: 'Home' }],
      });
      useNavigationStore.getState().setBreadcrumbs([]);
      expect(useNavigationStore.getState().breadcrumbs).toEqual([]);
    });
  });
});