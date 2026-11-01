// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryObserver, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_LIBRARY_VIEW_STATE, libraryQueryKeys } from '@app/library';
import { getDefaultReaderSettings } from '@app/shared';

const { persistReaderProgress, fetchReaderPage } = vi.hoisted(() => ({
  persistReaderProgress: vi.fn<(...args: unknown[]) => Promise<void>>(),
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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

const LIBRARY_PAGE_KEY = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
const LIBRARY_STALE_TIME_MS = 5 * 60 * 1_000;

function readerData() {
  return {
    settings: getDefaultReaderSettings(),
    chapter: {
      id: 'dev-md-ch-1',
      mangaId: 'dev-md-manga-1',
      title: 'Ch. 1',
      pages: [{ id: 'page-0', index: 0, image: { url: 'https://example.com/0.jpg' } }],
      pageCount: 1,
    },
  };
}

/**
 * A client tuned like the library: a fresh page query and an active observer,
 * so a refetch would be observable.
 */
async function libraryClient(): Promise<{
  client: QueryClient;
  libraryFn: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  observer: QueryObserver;
  unsubscribe: () => void;
}> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: LIBRARY_STALE_TIME_MS } },
  });
  const libraryFn = vi.fn<() => Promise<unknown>>(async () => ({
    items: [],
    categories: [],
    viewState: DEFAULT_LIBRARY_VIEW_STATE,
  }));
  await client.prefetchQuery({ queryKey: LIBRARY_PAGE_KEY, queryFn: libraryFn });
  const observer = new QueryObserver(client, {
    queryKey: LIBRARY_PAGE_KEY,
    queryFn: libraryFn,
  });
  const unsubscribe = observer.subscribe(() => {});
  return { client, libraryFn, observer, unsubscribe };
}

async function renderRoute(
  client: QueryClient,
): Promise<{ root: Root; container: HTMLElement; onPersistProgress: (event: unknown) => void }> {
  vi.spyOn(Route, 'useParams' as never).mockReturnValue({ chapterId: 'dev-md-ch-1' } as never);

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
  await act(async () => {
    await vi.waitFor(() => expect(screenProps.data).toBeDefined(), { timeout: 2_000 });
  });
  return {
    root,
    container,
    onPersistProgress: screenProps.onPersistProgress as (event: unknown) => void,
  };
}

async function persist(onPersistProgress: (event: unknown) => void, pageIndex: number) {
  await act(async () => {
    onPersistProgress({ pageIndex });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function teardown(
  root: Root,
  container: HTMLElement,
  unsubscribe: () => void,
  observer: QueryObserver,
) {
  unsubscribe();
  observer.destroy();
  act(() => root.unmount());
  container.remove();
}

describe('/reader/$chapterId library freshness', () => {
  beforeEach(() => {
    reported.length = 0;
    screenProps = {};
    persistReaderProgress.mockReset();
    persistReaderProgress.mockResolvedValue(undefined);
    fetchReaderPage.mockReset();
    fetchReaderPage.mockResolvedValue(readerData());
  });

  it('Given a successful write, When progress persists, Then the library is stale but not refetched', async () => {
    const { client, libraryFn, observer, unsubscribe } = await libraryClient();
    const { root, container, onPersistProgress } = await renderRoute(client);

    expect(observer.getCurrentResult().isStale).toBe(false);

    await persist(onPersistProgress, 3);

    expect(client.getQueryState(LIBRARY_PAGE_KEY)?.isInvalidated).toBe(true);
    expect(observer.getCurrentResult().isStale).toBe(true);
    // The active observer stays untouched while the reader is open.
    expect(libraryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isFetching).toBe(false);

    teardown(root, container, unsubscribe, observer);
  });

  it('Given a rejected write, When progress persists, Then the library stays fresh and the failure is reported', async () => {
    persistReaderProgress.mockRejectedValueOnce(new Error('progress write rejected'));
    const { client, libraryFn, observer, unsubscribe } = await libraryClient();
    const { root, container, onPersistProgress } = await renderRoute(client);

    await persist(onPersistProgress, 3);

    expect(client.getQueryState(LIBRARY_PAGE_KEY)?.isInvalidated).toBe(false);
    expect(observer.getCurrentResult().isStale).toBe(false);
    expect(libraryFn).toHaveBeenCalledTimes(1);
    expect(reported.join(' ')).toContain('could not be saved');

    teardown(root, container, unsubscribe, observer);
  });

  it('Given repeated page turns, When each write succeeds, Then the library is invalidated once', async () => {
    const { client, libraryFn, observer, unsubscribe } = await libraryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { root, container, onPersistProgress } = await renderRoute(client);

    await persist(onPersistProgress, 1);
    await persist(onPersistProgress, 2);
    await persist(onPersistProgress, 3);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: libraryQueryKeys.all,
      refetchType: 'none',
    });
    expect(libraryFn).toHaveBeenCalledTimes(1);

    teardown(root, container, unsubscribe, observer);
  });
});
