// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings } from '@app/shared';

const { persistReaderProgress, saveReaderSettings, fetchReaderPage } = vi.hoisted(() => ({
  persistReaderProgress: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  saveReaderSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    settings: getDefaultReaderSettings(),
  })),
}));

const reported: string[] = [];
vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => () => {},
  useReportPersistenceError: () => (message: string) => reported.push(message),
}));
vi.mock('../../components/PersistenceErrorBanner.js', () => ({
  PersistenceErrorBanner: () => null,
}));
vi.mock('../../queries/provider-query-options.js', () => ({
  ensureProviderChapterPages: vi.fn<() => Promise<void>>(async () => {}),
}));

let screenProps: Record<string, unknown> = {};
vi.mock('@app/reader', () => ({
  fetchReaderPage,
  persistReaderProgress,
  readerQueryKeys: { chapter: (id: string) => ['reader', 'chapter', id] },
  toReaderEngineSettings: (settings: unknown) => settings,
  ReaderScreen: (props: Record<string, unknown>) => {
    screenProps = props;
    return null;
  },
}));

vi.mock('@app/settings', () => ({
  saveReaderSettings,
  settingsQueryKeys: { reader: () => ['settings', 'reader'] },
}));

import { Route } from '../../routes/reader.$chapterId.js';

async function renderRoute(): Promise<{ root: Root; container: HTMLElement }> {
  vi.spyOn(Route, 'useParams' as never).mockReturnValue({ chapterId: 'dev-md-ch-1' } as never);

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
  // Wait for the reader query so `data.settings` exists for the settings path.
  await act(async () => {
    await vi.waitFor(() => expect(screenProps.data).toBeDefined(), { timeout: 2_000 });
  });
  return { root, container };
}

/** Flushes the mutation's async tail so its callbacks have run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('/reader/$chapterId persistence reporting', () => {
  beforeEach(() => {
    reported.length = 0;
  });

  it('Given a rejected progress write, When progress is persisted, Then the failure reaches the report sink', async () => {
    persistReaderProgress.mockRejectedValueOnce(new Error('progress write rejected'));
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onPersistProgress as (event: unknown) => void)({ pageIndex: 3 });
    });
    await act(async () => {});

    expect(reported).toContain('progress write rejected');

    act(() => root.unmount());
    container.remove();
  });

  it('Given a rejected settings save, When a setting changes, Then the failure reaches the report sink', async () => {
    saveReaderSettings.mockResolvedValueOnce({
      ok: false,
      error: { message: 'settings rejected' },
    });
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onChangeSettings as (patch: unknown) => void)({ readingMode: 'rtl' });
    });
    await settle();

    expect(reported).toContain('settings rejected');

    act(() => root.unmount());
    container.remove();
  });
});
