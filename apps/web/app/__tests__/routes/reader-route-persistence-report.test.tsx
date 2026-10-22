// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings } from '@app/shared';
import type * as RouterModule from '@tanstack/react-router';

const {
  persistReaderProgress,
  saveTitleSettings,
  saveGlobalSettings,
  resetTitleSettings,
  fetchReaderPage,
} = vi.hoisted(() => ({
  persistReaderProgress: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  saveTitleSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
  saveGlobalSettings: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
  resetTitleSettings: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    mangaId: 'dev-md-manga-1',
    chapterId: 'dev-md-ch-1',
    settings: getDefaultReaderSettings(),
    chapter: {
      id: 'dev-md-ch-1',
      mangaId: 'dev-md-manga-1',
      title: 'Ch. 1',
      pages: [{ id: 'page-0', index: 0, image: { url: 'https://example.com/0.jpg' } }],
      pageCount: 1,
    },
  })),
}));

const reported: string[] = [];
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => vi.fn<() => Promise<void>>(async () => {}),
}));
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
  readerQueryKeys: {
    chapter: (id: string) => ['reader', 'chapter', id],
    chapterHydration: (id: string) => ['reader', 'chapter-hydration', id],
  },
  toReaderEngineSettings: (settings: unknown) => settings,
  ReaderScreen: (props: Record<string, unknown>) => {
    screenProps = props;
    return null;
  },
}));

vi.mock('@app/settings', () => ({
  saveReaderSettings: saveGlobalSettings,
  settingsQueryKeys: { reader: () => ['settings', 'reader'] },
}));
vi.mock('@app/db', () => ({
  upsertTitleReaderSettings: saveTitleSettings,
  resetTitleReaderSettings: resetTitleSettings,
}));

import { Route } from '@/routes/reader.$chapterId.js';

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

/** Flushes the debounced write and the mutation's async tail. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

describe('/reader/$chapterId persistence reporting', () => {
  it('marks a chapter unread through the progress persistence path', async () => {
    persistReaderProgress.mockClear();
    const { root, container } = await renderRoute();
    await act(async () => {
      (screenProps.onMarkRead as (completed: boolean) => void)(false);
    });
    expect(persistReaderProgress).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chapterId: 'dev-md-ch-1',
        mangaId: 'dev-md-manga-1',
        completed: false,
        pageIndex: 0,
        readPercent: 0,
      }),
    );
    act(() => root.unmount());
    container.remove();
  });
  beforeEach(() => {
    reported.length = 0;
    vi.clearAllMocks();
  });

  it('Given per-title overrides are off, When a setting changes, Then the global reader defaults are written', async () => {
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onChangeSettings as (patch: unknown) => void)({
        readingMode: 'rtl',
        rememberPerTitleOverrides: false,
      });
    });
    await settle();

    expect(saveGlobalSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ readingMode: 'rtl', rememberPerTitleOverrides: false }),
    );
    expect(saveTitleSettings).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('Given a per-title override, When the title settings are reset, Then the stored override is deleted', async () => {
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onResetSettings as () => void)();
    });
    await settle();

    expect(resetTitleSettings).toHaveBeenCalledWith(expect.anything(), 'dev-md-manga-1');

    act(() => root.unmount());
    container.remove();
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
    saveTitleSettings.mockResolvedValueOnce({
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
