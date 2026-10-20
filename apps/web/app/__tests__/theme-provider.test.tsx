import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ThemeModule from '@app/theme';
import { buildThemeCssVariables, getBuiltInThemeDefinition } from '@app/theme';
import type { ThemeDefinition } from '@app/shared';
import { ThemeProvider, useTheme } from '../providers/theme-provider.js';
import { ThemeSettingsBridge } from '../providers/theme-settings-bridge.js';

const mocks = vi.hoisted(() => ({
  fetchThemeDefinitions: vi.fn<() => Promise<readonly ThemeDefinition[]>>(),
  fetchThemeSettings: vi.fn<() => Promise<{ settings: { themeId: string; dark: boolean } }>>(),
  saveThemeSettings: vi.fn<() => Promise<{ ok: true; value: undefined }>>(),
  fakeDb: { id: 'fake-db' },
}));

vi.mock('@app/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof ThemeModule>();
  return {
    ...actual,
    fetchThemeDefinitions: mocks.fetchThemeDefinitions,
    fetchThemeSettings: mocks.fetchThemeSettings,
    saveThemeSettings: mocks.saveThemeSettings,
  };
});

vi.mock('../providers/local-db-provider.js', () => ({
  useLocalDb: () => mocks.fakeDb,
  useLocalDbStatus: () => 'ready',
}));

const customDefinition: ThemeDefinition = {
  ...getBuiltInThemeDefinition('default'),
  id: 'custom:demo',
  name: 'Custom Demo',
  basedOn: 'default',
  light: {
    seeds: {
      ...getBuiltInThemeDefinition('default').light.seeds,
      background: '#fdf6ec',
      foreground: '#2b2118',
    },
  },
};

function customSettings() {
  return { themeId: customDefinition.id, dark: false };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('ThemeProvider custom definitions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.fetchThemeDefinitions.mockReset().mockResolvedValue([customDefinition]);
    mocks.fetchThemeSettings.mockReset().mockResolvedValue({ settings: customSettings() });
    mocks.saveThemeSettings.mockReset().mockResolvedValue({ ok: true, value: undefined });
    document.documentElement.removeAttribute('style');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.documentElement.removeAttribute('style');
  });

  it('Given a custom themeId, When the definitions load, Then the definition is applied and exposed', async () => {
    function Probe() {
      const { themeDefinition, customThemes } = useTheme();
      return (
        <output data-testid="probe">
          {themeDefinition?.id ?? 'none'}|{customThemes.length}
        </output>
      );
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ThemeProvider>
            <ThemeSettingsBridge />
            <Probe />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        customDefinition.light.seeds.background,
      );
    });

    expect(mocks.fetchThemeDefinitions).toHaveBeenCalledWith(mocks.fakeDb);
    const probe = container.querySelector('[data-testid="probe"]');
    expect(probe?.textContent).toBe('custom:demo|1');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('Given a custom themeId with no stored definition, Then the default applies and a notice is visible', async () => {
    mocks.fetchThemeDefinitions.mockResolvedValue([]);

    await act(async () => {
      root.render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ThemeProvider>
            <ThemeSettingsBridge />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    const fallback = getBuiltInThemeDefinition('default');
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        fallback.light.seeds.background,
      );
      expect(document.querySelector('[data-theme-notice]')).not.toBeNull();
    });

    const notice = document.querySelector('[data-theme-notice]');
    expect(notice?.textContent).toContain('could not be found');
    expect(notice?.textContent).toContain('default theme');
  });

  it('Given a failed definitions load, Then the default applies with a load notice instead of crashing', async () => {
    mocks.fetchThemeDefinitions.mockRejectedValue(new Error('db closed'));

    await act(async () => {
      root.render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ThemeProvider>
            <ThemeSettingsBridge />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    const fallback = getBuiltInThemeDefinition('default');
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        fallback.light.seeds.background,
      );
      expect(document.querySelector('[data-theme-notice]')).not.toBeNull();
    });

    expect(document.querySelector('[data-theme-notice]')?.textContent).toContain(
      'Custom themes could not be loaded',
    );
  });

  it('applies the definition in dark when the settings ask for dark', async () => {
    mocks.fetchThemeSettings.mockResolvedValue({
      settings: { themeId: customDefinition.id, dark: true },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ThemeProvider>
            <ThemeSettingsBridge />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    const expected = buildThemeCssVariables(
      { themeId: customDefinition.id, dark: true },
      customDefinition,
    );
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        expected['--background'],
      );
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('ThemeProvider stored settings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    mocks.fetchThemeDefinitions.mockReset().mockResolvedValue([]);
    // Keep the settings query pending so the stored value is what lands.
    mocks.fetchThemeSettings.mockReset().mockReturnValue(new Promise(() => {}));
    document.documentElement.removeAttribute('style');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.documentElement.removeAttribute('style');
    localStorage.clear();
  });

  function renderStoredProvider() {
    act(() => {
      root.render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ThemeProvider>
            <ThemeSettingsBridge />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });
  }

  it('Given legacy keys, Then they migrate to themeId/dark and still apply after a reload', async () => {
    localStorage.setItem('theme-preset-id', 'sakura');
    localStorage.setItem('theme-dark', 'true');

    renderStoredProvider();

    const expected = buildThemeCssVariables({ themeId: 'sakura', dark: true });
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        expected['--background'],
      );
      expect(localStorage.getItem('themeId')).toBe('sakura');
    });
    expect(localStorage.getItem('dark')).toBe('true');
    expect(localStorage.getItem('theme-preset-id')).toBeNull();
    expect(localStorage.getItem('theme-dark')).toBeNull();

    act(() => {
      root.unmount();
    });
    document.documentElement.removeAttribute('style');
    root = createRoot(container);
    renderStoredProvider();

    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        expected['--background'],
      );
    });
  });

  it('Given an unknown stored id, Then the default settings apply and storage is normalised', async () => {
    localStorage.setItem('theme-preset-id', 'not-a-theme');
    localStorage.setItem('theme-dark', 'true');

    renderStoredProvider();

    const fallback = buildThemeCssVariables({ themeId: 'default', dark: false });
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--background')).toBe(
        fallback['--background'],
      );
      expect(localStorage.getItem('themeId')).toBe('default');
    });
    expect(localStorage.getItem('dark')).toBe('false');
  });
});
