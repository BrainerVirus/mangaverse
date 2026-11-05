// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings } from '@app/shared';
import type * as SettingsModule from '@/features/settings';

const mocks = vi.hoisted(() => ({
  getTitleReaderSettingsLayers: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  resetTitleReaderSettings: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  fetchReaderSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  saveReaderSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
  saveTitleReaderSettings: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
}));

vi.mock('@app/db', () => ({
  getTitleReaderSettingsLayers: mocks.getTitleReaderSettingsLayers,
  resetTitleReaderSettings: mocks.resetTitleReaderSettings,
}));

vi.mock('@/features/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return {
    ...actual,
    fetchReaderSettings: mocks.fetchReaderSettings,
    saveReaderSettings: mocks.saveReaderSettings,
    saveTitleReaderSettings: mocks.saveTitleReaderSettings,
  };
});

// The route coalesces writes; run them immediately so the test asserts one save.
vi.mock('../../lib/use-coalesced-settings-write.js', () => ({
  useCoalescedSettingsWrite: <T,>(write: (value: T) => void) => ({
    schedule: write,
    flush: () => {},
    cancel: () => {},
  }),
}));

import { Route } from '../../routes/settings.reader.js';

async function renderRoute(
  search: { title?: string } = { title: 'manga-1' },
): Promise<{ root: Root; container: HTMLElement }> {
  vi.spyOn(Route, 'useSearch' as never).mockReturnValue(search as never);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Route.options.component />
      </QueryClientProvider>,
    );
  });
  return { root, container };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the UI');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function toggleKeepScreenOn(container: HTMLElement): Promise<void> {
  await waitFor(() => container.querySelector('[aria-label="Keep screen on"]') !== null);
  await act(async () => {
    container.querySelector<HTMLElement>('[aria-label="Keep screen on"]')?.click();
  });
}

describe('/settings/reader?title', () => {
  it('Given a title page, When a setting changes, Then only the title choices are written', async () => {
    mocks.saveReaderSettings.mockClear();
    mocks.saveTitleReaderSettings.mockClear();
    const global = getDefaultReaderSettings();
    mocks.getTitleReaderSettingsLayers.mockResolvedValue({
      global,
      overrides: { readingMode: 'rtl' },
      settings: { ...global, readingMode: 'rtl' },
    });

    const { root, container } = await renderRoute();
    await toggleKeepScreenOn(container);

    await waitFor(() => mocks.saveTitleReaderSettings.mock.calls.length > 0);
    expect(mocks.saveTitleReaderSettings).toHaveBeenCalledWith(expect.anything(), 'manga-1', {
      readingMode: 'rtl',
      keepScreenOn: false,
    });
    expect(mocks.saveReaderSettings).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('Given the plain page, When a setting changes, Then the global row is written', async () => {
    mocks.saveReaderSettings.mockClear();
    mocks.saveTitleReaderSettings.mockClear();
    mocks.fetchReaderSettings.mockResolvedValue({ settings: getDefaultReaderSettings() });

    const { root, container } = await renderRoute({});
    await toggleKeepScreenOn(container);

    await waitFor(() => mocks.saveReaderSettings.mock.calls.length > 0);
    expect(mocks.saveReaderSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ keepScreenOn: false }),
    );
    expect(mocks.saveTitleReaderSettings).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
