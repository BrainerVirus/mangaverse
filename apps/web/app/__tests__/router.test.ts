import { describe, it, expect } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { getRouter } from '../router.js';
import { routeTree } from '../routeTree.gen.js';
import { Route as IndexRoute } from '../routes/index.js';
import { Route as DiagnosticsAlias } from '../routes/diagnostics.js';
import { Route as MigrationAlias } from '../routes/migration.js';
import { Route as ThemeEditorAlias } from '../routes/theme.editor.js';

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
  '/storage',
  '/theme',
  '/theme/editor',
  '/diagnostics',
  '/onboarding',
  '/advanced',
  '/advanced/theme',
  '/advanced/diagnostics',
  '/advanced/migration',
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

  it('redirects / to /discover before the landing document renders', () => {
    let thrown: unknown;
    try {
      IndexRoute.options.beforeLoad?.({} as never);
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/discover' } });
  });

  function redirectOf(run: () => unknown): unknown {
    try {
      run();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it.each([
    ['/theme/editor', ThemeEditorAlias, '/advanced/theme'],
    ['/diagnostics', DiagnosticsAlias, '/advanced/diagnostics'],
  ] as const)('redirects the old %s URL to its Advanced route', (_path, alias, to) => {
    const thrown = redirectOf(() => alias.options.beforeLoad?.({} as never));

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to } });
  });

  it('redirects the old /migration URL with its raw search params', () => {
    const search = MigrationAlias.options.validateSearch?.({
      ids: 'not-a-title-list',
      sources: ['mangadex'],
      source: ['a', 'b'],
      other: 'dropped',
    });
    expect(search).toEqual({
      ids: 'not-a-title-list',
      sources: ['mangadex'],
      source: ['a', 'b'],
    });

    const thrown = redirectOf(() => MigrationAlias.options.beforeLoad?.({ search } as never));

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/advanced/migration', search } });
  });

  it.each([['/advanced/theme'], ['/advanced/diagnostics'], ['/advanced/migration']])(
    'matches %s under the hub without an alias shadowing it',
    (path) => {
      const matches = getRouter().matchRoutes(path);

      expect(matches.at(-1)?.routeId).toBe(path);
      expect(matches.map((match) => match.routeId)).toContain('/advanced');
    },
  );
});
