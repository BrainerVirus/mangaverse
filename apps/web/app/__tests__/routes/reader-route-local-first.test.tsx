// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';

const { fetchReaderPage, ensureProviderChapterPages } = vi.hoisted(() => ({
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  ensureProviderChapterPages: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

const DEV_CHAPTER = 'dev-md-ch-c7649b69-6d7a-466c-a428-ab9b086ebe35';
const DEV_MANGA = 'dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';

let screenProps: Record<string, unknown> = {};

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => () => {},
  useReportPersistenceError: () => () => {},
}));
vi.mock('../../components/PersistenceErrorBanner.js', () => ({
  PersistenceErrorBanner: () => null,
}));
vi.mock('../../queries/provider-query-options.js', () => ({
  ensureProviderChapterPages,
}));
vi.mock('@app/reader', () => ({
  fetchReaderPage,
  persistReaderProgress: vi.fn<() => Promise<void>>(async () => {}),
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
  saveReaderSettings: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
  settingsQueryKeys: { reader: () => ['settings', 'reader'] },
}));

import { Route } from '@/routes/reader.$chapterId.js';

function readerData(pageCount: number, chapterId = DEV_CHAPTER) {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: pageCount }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
  return {
    chapter: {
      id: chapterId,
      mangaId: DEV_MANGA,
      title: 'Ch. 1 - The Summoner',
      pages,
      pageCount: pages.length,
    },
    mangaId: DEV_MANGA,
    chapterId,
    providerId: 'mangadex',
    initialPageIndex: 0,
    settings,
    engineSettings: settings,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function renderRoute(
  chapterId = DEV_CHAPTER,
): Promise<{ root: Root; container: HTMLElement; client: QueryClient }> {
  vi.spyOn(Route, 'useParams' as never).mockReturnValue({ chapterId } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Route.options.component />
      </QueryClientProvider>,
    );
  });
  return { root, container, client };
}

async function waitForReader(predicate: () => boolean): Promise<void> {
  await act(async () => {
    await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 2_000 });
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('/reader/$chapterId local-first hydration', () => {
  beforeEach(() => {
    screenProps = {};
    fetchReaderPage.mockReset();
    ensureProviderChapterPages.mockReset();
  });

  it('Given a chapter with local pages, When the reader mounts, Then it never calls the provider', async () => {
    fetchReaderPage.mockResolvedValue(readerData(2));
    const { root, container } = await renderRoute();

    await waitForReader(() => screenProps.data !== undefined);
    await settle();

    expect(ensureProviderChapterPages).not.toHaveBeenCalled();
    expect(screenProps.isHydrating).toBe(false);
    expect(screenProps.isHydrationError).toBe(false);

    act(() => root.unmount());
    container.remove();
  });

  it('Given a locally empty chapter, When mounting, Then local metadata and hydrating render before the provider pages arrive', async () => {
    const hydration = deferred();
    fetchReaderPage.mockResolvedValueOnce(readerData(0)).mockResolvedValue(readerData(1));
    ensureProviderChapterPages.mockReturnValue(hydration.promise);

    const { root, container } = await renderRoute();

    await waitForReader(() => ensureProviderChapterPages.mock.calls.length === 1);
    const data = screenProps.data as { chapter: { title: string; pageCount: number } };
    expect(data.chapter.pageCount).toBe(0);
    expect(data.chapter.title).toBe('Ch. 1 - The Summoner');
    expect(screenProps.isHydrating).toBe(true);
    expect(screenProps.isHydrationError).toBe(false);

    await act(async () => {
      hydration.resolve();
      await hydration.promise;
    });
    await waitForReader(() => {
      const next = screenProps.data as { chapter: { pageCount: number } };
      return next.chapter.pageCount === 1;
    });

    expect(screenProps.isHydrating).toBe(false);
    expect(ensureProviderChapterPages).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it('Given provider hydration fails, When rendered, Then local metadata stays and Retry re-runs hydration', async () => {
    fetchReaderPage.mockResolvedValue(readerData(0));
    ensureProviderChapterPages.mockRejectedValueOnce(new Error('provider unavailable'));

    const { root, container } = await renderRoute();

    await waitForReader(() => screenProps.isHydrationError === true);
    const data = screenProps.data as { chapter: { title: string; pageCount: number } };
    expect(data.chapter.title).toBe('Ch. 1 - The Summoner');
    expect(data.chapter.pageCount).toBe(0);
    expect(screenProps.isHydrating).toBe(false);

    fetchReaderPage.mockResolvedValue(readerData(1));
    ensureProviderChapterPages.mockResolvedValueOnce(undefined);
    await act(async () => {
      (screenProps.onRetry as () => void)();
    });
    await waitForReader(() => {
      const next = screenProps.data as { chapter: { pageCount: number } };
      return next.chapter.pageCount === 1;
    });

    expect(ensureProviderChapterPages).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    container.remove();
  });

  it('Given hydration is in flight, When the local chapter read refreshes, Then the provider is not fetched twice', async () => {
    const hydration = deferred();
    fetchReaderPage.mockResolvedValue(readerData(0));
    ensureProviderChapterPages.mockReturnValue(hydration.promise);

    const { root, container, client } = await renderRoute();

    await waitForReader(() => ensureProviderChapterPages.mock.calls.length === 1);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['reader', 'chapter', DEV_CHAPTER] });
    });

    expect(ensureProviderChapterPages).toHaveBeenCalledTimes(1);

    await act(async () => {
      hydration.resolve();
      await hydration.promise;
    });
    expect(ensureProviderChapterPages).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it('Given a chapter no provider binding owns, When it has no pages, Then the provider is never called', async () => {
    fetchReaderPage.mockResolvedValue(readerData(0, 'other-ch-1'));
    const { root, container } = await renderRoute('other-ch-1');

    await waitForReader(() => screenProps.data !== undefined);
    await settle();

    expect(ensureProviderChapterPages).not.toHaveBeenCalled();
    expect(screenProps.isHydrating).toBe(false);
    expect(screenProps.isHydrationError).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
