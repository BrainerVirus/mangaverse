import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { NotFoundPage, RouteErrorPage } from '../../components/StatusPages.js';

const link = (name: string) =>
  [...document.querySelectorAll('a')].find((anchor) => anchor.textContent === name);

const SECRET = 'TypeError: internal.db.handle is not a function';

async function renderAt(path: string) {
  const onCatch = vi.fn<(error: Error) => void>();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRootRoute();
  const crash = createRoute({
    getParentRoute: () => root,
    path: '/crash',
    component: () => {
      throw new Error(SECRET);
    },
  });
  const library = createRoute({
    getParentRoute: () => root,
    path: '/library',
    component: () => <p>library page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([crash, library]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteErrorPage,
    defaultNotFoundComponent: NotFoundPage,
    defaultOnCatch: onCatch,
  });
  await act(async () => {
    createRoot(host).render(<RouterProvider router={router as never} />);
    await router.load();
  });
  return { onCatch };
}

describe('status pages', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Given a route throws internal text, When it renders, Then recovery shows and the text is hidden', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { onCatch } = await renderAt('/crash');

    expect(document.body.textContent).toContain('Something went wrong');
    expect(document.body.textContent).toContain('Retry');
    expect(link('Back to library')?.getAttribute('href')).toBe('/library');
    expect(document.body.textContent).not.toContain('internal.db.handle');
    expect(onCatch).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('Given an unknown URL, When it loads, Then a 404 offers a way back to the library', async () => {
    await renderAt('/nowhere/at/all');

    expect(document.querySelector('h1')?.textContent).toBe('Page not found');
    expect(link('Back to library')?.getAttribute('href')).toBe('/library');
  });
});
