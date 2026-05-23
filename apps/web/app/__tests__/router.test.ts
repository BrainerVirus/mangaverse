import { describe, it, expect } from 'vitest';
import { getRouter } from '../router.js';
import { routeTree } from '../routeTree.gen.js';

const PHASE_8_ROUTES = [
  '/',
  '/library',
  '/search',
  '/settings',
  '/settings/app',
  '/settings/reader',
  '/manga/$id',
  '/reader/$chapterId',
  '/extensions',
  '/extensions/$providerId',
  '/backup',
  '/migration',
  '/theme',
  '/diagnostics',
  '/onboarding',
] as const;

type RouteNode = {
  fullPath?: string;
  children?: RouteNode[] | Record<string, RouteNode>;
};

function collectFullPaths(route: RouteNode): string[] {
  const paths: string[] = [];
  if (route.fullPath) paths.push(route.fullPath);

  const { children } = route;
  if (!children) return paths;

  const childRoutes = Array.isArray(children) ? children : Object.values(children);
  for (const child of childRoutes) {
    if (child) paths.push(...collectFullPaths(child));
  }

  return paths;
}

describe('router', () => {
  it('enables intent preloading and scroll restoration', () => {
    const router = getRouter();
    expect(router.options.defaultPreload).toBe('intent');
    expect(router.options.scrollRestoration).toBe(true);
  });

  it('declares all Phase 8 core and stub routes', () => {
    const paths = collectFullPaths(routeTree as unknown as RouteNode);
    for (const expected of PHASE_8_ROUTES) {
      expect(paths).toContain(expected);
    }
  });
});
