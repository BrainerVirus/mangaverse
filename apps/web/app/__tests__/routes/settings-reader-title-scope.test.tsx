// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings } from '@app/shared';
import type * as SettingsModule from '@app/settings';

const mocks = vi.hoisted(() => ({
  getTitleReaderSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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
  getTitleReaderSettings: mocks.getTitleReaderSettings,
  resetTitleReaderSettings: mocks.resetTitleReaderSettings,
}));

vi.mock('@app/settings', async (importOriginal) => {
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

async function renderRoute(): Promise<{ root: Root; container: HTMLElement }> {
  vi.spyOn(Route, 'useSearch' as never).mockReturnValue({ title: 'manga-1' } as never);

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

describe('/settings/reader?title', () => {
  it('Given global per-title overrides off, When title scope enables them, Then the save goes through the title helper', async () => {
    const global = { ...getDefaultReaderSettings(), rememberPerTitleOverrides: false };
    mocks.fetchReaderSettings.mockResolvedValue({ settings: global });
    mocks.getTitleReaderSettings.mockResolvedValue(global);

    const { root, container } = await renderRoute();
    await waitFor(
      () => container.querySelector('[aria-label="Remember per-title overrides"]') !== null,
    );

    const toggle = container.querySelector<HTMLElement>(
      '[aria-label="Remember per-title overrides"]',
    );
    await act(async () => {
      toggle?.click();
    });

    await waitFor(() => mocks.saveTitleReaderSettings.mock.calls.length > 0);
    expect(mocks.saveTitleReaderSettings).toHaveBeenCalledWith(
      expect.anything(),
      'manga-1',
      expect.objectContaining({ rememberPerTitleOverrides: true }),
    );
    expect(mocks.saveReaderSettings).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
