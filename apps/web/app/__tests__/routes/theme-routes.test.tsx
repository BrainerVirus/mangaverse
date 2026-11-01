import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type * as ThemeModule from '@app/theme';
import { getBuiltInThemeDefinition } from '@app/theme';
import type { AppResult, ThemeDefinition, ThemeSettings } from '@app/shared';

import { getRouter } from '../../router.js';
import { Route as ThemeRoute } from '../../routes/theme.lazy.js';
import { Route as ThemeEditorRoute } from '../../routes/theme.editor.lazy.js';

const mocks = vi.hoisted(() => ({
  theme: {
    settings: { themeId: 'default', dark: false } as ThemeSettings,
    customThemes: [] as readonly ThemeDefinition[],
    setThemeSettings: vi.fn<(next: ThemeSettings) => void>(),
    hydrateThemeDefinitions: vi.fn<(next: readonly ThemeDefinition[]) => void>(),
  },
  saveThemeDefinition:
    vi.fn<(db: unknown, definition: unknown) => Promise<AppResult<ThemeDefinition>>>(),
  deleteThemeDefinition: vi.fn<(db: unknown, themeId: string) => Promise<AppResult<void>>>(),
}));

vi.mock('@app/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof ThemeModule>();
  return {
    ...actual,
    saveThemeDefinition: mocks.saveThemeDefinition,
    deleteThemeDefinition: mocks.deleteThemeDefinition,
  };
});

vi.mock('../../providers/theme-provider.js', () => ({
  useTheme: () => ({
    settings: mocks.theme.settings,
    setThemeSettings: mocks.theme.setThemeSettings,
    hydrateThemeDefinitions: mocks.theme.hydrateThemeDefinitions,
    isSaving: false,
    customThemes: mocks.theme.customThemes,
    isLoadingCustomThemes: false,
    isCustomThemesError: false,
    themeNotice: null,
  }),
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
}));

const customTheme: ThemeDefinition = {
  ...getBuiltInThemeDefinition('sakura'),
  id: 'custom:sakura',
  name: 'My Sakura',
  basedOn: 'sakura',
};

const galleryComponent = ThemeRoute.options.component;
const editorComponent = ThemeEditorRoute.options.component;

if (galleryComponent === undefined || editorComponent === undefined) {
  throw new Error('Theme routes must expose their components.');
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const themeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/theme',
  component: galleryComponent,
});
const editorRoute = createRoute({
  getParentRoute: () => themeRoute,
  path: '/editor',
  component: editorComponent,
});
const testRouteTree = rootRoute.addChildren([themeRoute.addChildren([editorRoute])]);

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

describe('theme routes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.theme.customThemes = [];
    mocks.theme.settings = { themeId: 'default', dark: false };
    mocks.theme.setThemeSettings.mockReset();
    mocks.theme.hydrateThemeDefinitions.mockReset();
    mocks.saveThemeDefinition.mockReset().mockImplementation(async (_db, definition) => ({
      ok: true,
      value: definition as ThemeDefinition,
    }));
    mocks.deleteThemeDefinition.mockReset().mockResolvedValue({ ok: true, value: undefined });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  async function renderAt(path: string) {
    const router = createRouter({
      routeTree: testRouteTree,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await act(async () => {
      await router.load();
    });
    act(() => {
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
    });
  }

  it('Given the real route tree, Then /theme/editor resolves to the editor child route', () => {
    const matches = getRouter().matchRoutes('/theme/editor');

    expect(matches.map((match) => match.routeId)).toContain('/theme/editor');
    expect(matches.at(-1)?.routeId).toBe('/theme/editor');
  });

  it('Given /theme/editor, Then the editor renders instead of the gallery', async () => {
    await renderAt('/theme/editor');

    expect(container.textContent).toContain('Theme editor');
    expect(container.textContent).not.toContain('Built-in themes');
    expect(container.textContent).not.toContain('Your themes');
  });

  it('Given /theme, Then the gallery renders instead of the editor', async () => {
    await renderAt('/theme');

    expect(container.textContent).toContain('Built-in themes');
    expect(container.textContent).toContain('Your themes');
    expect(container.textContent).not.toContain('Theme editor');
  });

  it('Given a built-in card, When Duplicate is pressed, Then the copy is saved and selected', async () => {
    await renderAt('/theme');

    await act(async () => {
      buttonByText(container, 'Duplicate').click();
    });

    await vi.waitFor(() => {
      expect(mocks.saveThemeDefinition).toHaveBeenCalledTimes(1);
    });
    const saved = mocks.saveThemeDefinition.mock.calls[0]?.[1] as ThemeDefinition;
    expect(saved.name).toBe('Minimal copy');
    expect(saved.basedOn).toBe('default');
    expect(saved.id).toMatch(/^custom:/);
    await vi.waitFor(() => {
      expect(mocks.theme.setThemeSettings).toHaveBeenCalledWith({
        themeId: saved.id,
        dark: false,
      });
    });
  });

  it('Given an unsaved draft, When Save is pressed, Then the draft reaches the themes table', async () => {
    await renderAt('/theme/editor');

    await act(async () => {
      buttonByText(container, 'Save theme').click();
    });

    await vi.waitFor(() => {
      expect(mocks.saveThemeDefinition).toHaveBeenCalledTimes(1);
    });
    const saved = mocks.saveThemeDefinition.mock.calls[0]?.[1] as ThemeDefinition;
    expect(saved.name).toBe('Minimal copy');
    expect(saved.basedOn).toBe('default');
  });

  it('Given the editor draft, When Duplicate is saved, Then the copy has a custom id and becomes selected', async () => {
    await renderAt('/theme/editor');

    act(() => {
      buttonByText(container, 'Duplicate').click();
    });
    await act(async () => {
      buttonByText(container, 'Save theme').click();
    });

    await vi.waitFor(() => {
      expect(mocks.saveThemeDefinition).toHaveBeenCalledTimes(1);
    });
    const saved = mocks.saveThemeDefinition.mock.calls[0]?.[1] as ThemeDefinition;
    expect(saved.id).toMatch(/^custom:/);
    expect(saved.name).toBe('Minimal copy copy');
    await vi.waitFor(() => {
      expect(mocks.theme.setThemeSettings).toHaveBeenCalledWith({
        themeId: saved.id,
        dark: false,
      });
    });
  });

  it('Given the selected theme is open in the editor, When Delete is confirmed, Then the selection falls back to default and the gallery returns', async () => {
    mocks.theme.settings = { themeId: customTheme.id, dark: true };
    mocks.theme.customThemes = [customTheme];
    await renderAt('/theme/editor');

    act(() => {
      buttonByText(container, 'Delete theme').click();
    });
    expect(document.body.textContent).toContain('Delete “My Sakura”?');

    act(() => {
      [...document.body.querySelectorAll('button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Delete theme')
        .at(-1)
        ?.click();
    });

    await vi.waitFor(() => {
      expect(mocks.deleteThemeDefinition).toHaveBeenCalledWith({ id: 'fake-db' }, customTheme.id);
    });
    await vi.waitFor(() => {
      expect(mocks.theme.setThemeSettings).toHaveBeenCalledWith({ themeId: 'default', dark: true });
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Built-in themes');
    });
  });

  it('Given a rejected save, Then the alert says save and a retry clears it', async () => {
    mocks.saveThemeDefinition.mockResolvedValueOnce({
      ok: false,
      error: { code: 'theme.save-failed', message: 'disk is full' },
    });
    await renderAt('/theme/editor');

    await act(async () => {
      buttonByText(container, 'Save theme').click();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not save the theme',
      );
    });
    expect(container.textContent).toContain('out of storage');
    expect(container.textContent).not.toContain('Could not delete the theme');

    await act(async () => {
      buttonByText(container, 'Save theme').click();
    });

    await vi.waitFor(() => {
      expect(mocks.saveThemeDefinition).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });

  it('Given a rejected delete, Then the alert says delete, keeps the theme, and a retry clears it', async () => {
    mocks.theme.settings = { themeId: customTheme.id, dark: true };
    mocks.theme.customThemes = [customTheme];
    mocks.deleteThemeDefinition.mockResolvedValueOnce({
      ok: false,
      error: { code: 'theme.delete-failed', message: 'database is locked' },
    });
    await renderAt('/theme/editor');

    act(() => {
      buttonByText(container, 'Delete theme').click();
    });
    act(() => {
      [...document.body.querySelectorAll('button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Delete theme')
        .at(-1)
        ?.click();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not delete the theme',
      );
    });
    expect(container.textContent).toContain("couldn't be read or saved");
    expect(container.textContent).not.toContain('Could not save the theme');
    expect(container.textContent).toContain('Theme editor');
    expect(mocks.theme.setThemeSettings).not.toHaveBeenCalled();

    act(() => {
      buttonByText(container, 'Delete theme').click();
    });
    act(() => {
      [...document.body.querySelectorAll('button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Delete theme')
        .at(-1)
        ?.click();
    });

    await vi.waitFor(() => {
      expect(mocks.theme.setThemeSettings).toHaveBeenCalledWith({ themeId: 'default', dark: true });
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Built-in themes');
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('Given the selected custom theme, When Delete is confirmed, Then the selection falls back to default', async () => {
    mocks.theme.settings = { themeId: customTheme.id, dark: true };
    mocks.theme.customThemes = [customTheme];
    await renderAt('/theme');

    await act(async () => {
      buttonByText(container, 'Delete').click();
    });
    expect(document.body.textContent).toContain('Delete “My Sakura”?');

    await act(async () => {
      [...document.body.querySelectorAll('button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Delete theme')
        .at(-1)
        ?.click();
    });

    await vi.waitFor(() => {
      expect(mocks.deleteThemeDefinition).toHaveBeenCalledWith({ id: 'fake-db' }, customTheme.id);
    });
    await vi.waitFor(() => {
      expect(mocks.theme.setThemeSettings).toHaveBeenCalledWith({ themeId: 'default', dark: true });
    });
  });
});
