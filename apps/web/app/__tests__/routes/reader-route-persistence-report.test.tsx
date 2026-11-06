// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings } from '@app/shared';
import type * as RouterModule from '@tanstack/react-router';

const {
  persistReaderProgress,
  saveLayers,
  resetTitleSettings,
  fetchReaderPage,
  setChapterCompleted,
  markPreviousChaptersCompleted,
} = vi.hoisted(() => ({
  persistReaderProgress: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  saveLayers: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  resetTitleSettings: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  setChapterCompleted: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true })),
  markPreviousChaptersCompleted: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    ok: true,
    value: { updated: 0 },
  })),
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    mangaId: 'dev-md-manga-1',
    chapterId: 'dev-md-ch-1',
    settings: { ...getDefaultReaderSettings(), readingMode: 'rtl' },
    globalSettings: getDefaultReaderSettings(),
    titleOverrides: { readingMode: 'rtl' },
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
  applyPageShapeDecision: (data: unknown) => data,
  isUsableMeasurement: () => false,
  pageHasSize: () => false,
  resolveAutoStripSwitch: () => undefined,
  fetchReaderPage,
  persistReaderProgress,
  readerQueryKeys: {
    chapter: (id: string) => ['reader', 'chapter', id],
    chapterHydration: (id: string) => ['reader', 'chapter-hydration', id],
  },
  // Stands in for the reader's scoped merge; its own rules are tested in @app/reader.
  applyReaderSettingsChange: (
    data: Record<string, Record<string, unknown>>,
    patch: Record<string, unknown>,
    scope: 'title' | 'global',
  ) => ({
    ...data,
    settings: { ...data.settings, ...patch },
    ...(scope === 'title'
      ? { titleOverrides: { ...data.titleOverrides, ...patch } }
      : { globalSettings: { ...data.globalSettings, ...patch } }),
  }),
  ReaderScreen: (props: Record<string, unknown>) => {
    screenProps = props;
    return null;
  },
}));

vi.mock('@/features/settings', () => ({
  saveReaderSettingsLayers: saveLayers,
  settingsQueryKeys: { reader: () => ['settings', 'reader'] },
}));
vi.mock('@app/db', () => ({
  resetTitleReaderSettings: resetTitleSettings,
  setChapterCompleted,
  markPreviousChaptersCompleted,
}));

import { Route } from '@/routes/reader.$chapterId.js';
import { useLayoutStore } from '@/stores/useLayoutStore.js';

/** The route's `beforeLoad`, called the way the router calls it for an open or a preload. */
async function enterReader(preload: boolean): Promise<void> {
  const beforeLoad: unknown = Route.options.beforeLoad;
  if (typeof beforeLoad !== 'function') throw new Error('The reader route has no beforeLoad.');
  await (beforeLoad as (context: { preload: boolean }) => unknown)({ preload });
}

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
  it('marks a chapter unread through the read-state repository without leaving the reader', async () => {
    setChapterCompleted.mockClear();
    const { root, container } = await renderRoute();
    await act(async () => {
      await (screenProps.onMarkRead as (completed: boolean) => Promise<void>)(false);
    });
    expect(setChapterCompleted).toHaveBeenCalledWith(expect.anything(), 'dev-md-ch-1', false);
    act(() => root.unmount());
    container.remove();
  });

  it('marks previous chapters read through the read-state repository', async () => {
    markPreviousChaptersCompleted.mockClear();
    const { root, container } = await renderRoute();
    await act(async () => {
      await (screenProps.onMarkPreviousRead as () => Promise<void>)();
    });
    expect(markPreviousChaptersCompleted).toHaveBeenCalledWith(expect.anything(), 'dev-md-ch-1');
    act(() => root.unmount());
    container.remove();
  });
  beforeEach(() => {
    reported.length = 0;
    vi.clearAllMocks();
  });

  it('Given This title scope, When a setting changes, Then the title choices are written with it', async () => {
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onChangeSettings as (patch: unknown, scope: string) => void)(
        { fitMode: 'width' },
        'title',
      );
    });
    await settle();

    expect(saveLayers).toHaveBeenCalledTimes(1);
    expect(saveLayers).toHaveBeenCalledWith(expect.anything(), 'dev-md-manga-1', {
      globalSettings: getDefaultReaderSettings(),
      titleOverrides: { readingMode: 'rtl', fitMode: 'width' },
    });

    act(() => root.unmount());
    container.remove();
  });

  it('Given All titles scope, When a setting changes, Then the global row carries it', async () => {
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onChangeSettings as (patch: unknown, scope: string) => void)(
        { pageTransition: 'slide' },
        'global',
      );
    });
    await settle();

    expect(saveLayers).toHaveBeenCalledWith(expect.anything(), 'dev-md-manga-1', {
      globalSettings: { ...getDefaultReaderSettings(), pageTransition: 'slide' },
      titleOverrides: { readingMode: 'rtl' },
    });

    act(() => root.unmount());
    container.remove();
  });

  it('Given controls left visible by the last session, When the reader opens, Then they start hidden', async () => {
    useLayoutStore.getState().setReaderChrome(true);

    await enterReader(false);

    expect(useLayoutStore.getState().readerChromeVisible).toBe(false);
  });

  it('Given a hover preload of a reader link, When it loads, Then the chrome state is untouched', async () => {
    useLayoutStore.getState().setReaderChrome(true);

    await enterReader(true);

    expect(useLayoutStore.getState().readerChromeVisible).toBe(true);
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

    expect(reported.join(' ')).toContain('could not be saved');

    act(() => root.unmount());
    container.remove();
  });

  it('Given a rejected settings save, When a setting changes, Then the failure reaches the report sink', async () => {
    saveLayers.mockRejectedValueOnce(new Error('settings rejected'));
    const { root, container } = await renderRoute();

    await act(async () => {
      (screenProps.onChangeSettings as (patch: unknown, scope: string) => void)(
        { readingMode: 'ltr' },
        'title',
      );
    });
    await settle();

    expect(reported.join(' ')).toContain('could not be saved');

    act(() => root.unmount());
    container.remove();
  });
});
