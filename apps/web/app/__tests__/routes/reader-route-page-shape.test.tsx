// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';
import type * as RouterModule from '@tanstack/react-router';
import type * as ReaderModule from '@app/reader';
import type { ReaderPageData, ReaderPageMeasurement } from '@app/reader';

const { fetchReaderPage, updateChapterPageDimensions } = vi.hoisted(() => ({
  fetchReaderPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateChapterPageDimensions: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    ok: true,
    value: 1,
  })),
}));

const CHAPTER = 'dev-md-ch-shape';
const MANGA = 'dev-md-manga-shape';

let screenProps: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => () => {},
  useReportPersistenceError: () => () => {},
}));
vi.mock('../../queries/provider-query-options.js', () => ({
  ensureProviderChapterPages: vi.fn<() => Promise<void>>(async () => {}),
}));
// The Auto switch and its merge are the reader's own; only the screen is a stand-in.
vi.mock('@app/reader', async (importOriginal) => ({
  ...(await importOriginal<typeof ReaderModule>()),
  fetchReaderPage,
  ReaderScreen: (props: Record<string, unknown>) => {
    screenProps = props;
    return null;
  },
}));
vi.mock('@/features/settings', () => ({
  READER_SETTINGS_MUTATION_SCOPE: 'reader-settings',
  saveReaderSettingsPatch: vi.fn<() => Promise<void>>(async () => {}),
  settingsQueryKeys: { reader: () => ['settings', 'reader'] },
}));
vi.mock('@app/db', () => ({
  updateChapterPageDimensions,
  resetTitleReaderSettings: vi.fn<() => Promise<void>>(async () => {}),
  setChapterCompleted: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
  markPreviousChaptersCompleted: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
}));

import { readerQueryKeys, toReaderEngineSettings } from '@app/reader';
import { Route } from '@/routes/reader.$chapterId.js';
import { PAGE_DIMENSIONS_WRITE_DELAY_MS } from '@/lib/use-reader-page-shape.js';

function readerData(
  patch: Partial<ReaderSettings> = {},
  titleOverrides?: ReaderPageData['titleOverrides'],
): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...patch };
  const pages = Array.from({ length: 4 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.png` },
  }));
  return {
    chapter: { id: CHAPTER, mangaId: MANGA, title: 'Ch. 1', pages, pageCount: pages.length },
    mangaId: MANGA as ReaderPageData['mangaId'],
    chapterId: CHAPTER as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 1,
    settings,
    ...(titleOverrides !== undefined ? { titleOverrides } : {}),
    engineSettings: toReaderEngineSettings(settings, { titleOverrides, pages }),
  };
}

async function renderRoute(): Promise<{
  root: Root;
  container: HTMLElement;
  client: QueryClient;
}> {
  vi.spyOn(Route, 'useParams' as never).mockReturnValue({ chapterId: CHAPTER } as never);
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
  await act(async () => {
    await vi.waitFor(() => expect(screenProps.data).toBeDefined(), { timeout: 2_000 });
  });
  return { root, container, client };
}

function shown(): ReaderPageData {
  return screenProps.data as ReaderPageData;
}

/** Reports a decoded size; the cache's notify tick re-renders the screen. */
async function measure(measurement: ReaderPageMeasurement) {
  await act(async () => {
    (screenProps.onPageMeasured as (value: ReaderPageMeasurement) => void)(measurement);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function settleWrites() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PAGE_DIMENSIONS_WRITE_DELAY_MS + 50));
  });
}

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

describe('/reader/$chapterId first-decode page shape', () => {
  beforeEach(() => {
    screenProps = {};
    fetchReaderPage.mockReset();
    updateChapterPageDimensions.mockClear();
  });

  it('Given Auto, When the first page measures 800x6000, Then the reader switches to the strip once, on the same page, and the size is stored', async () => {
    fetchReaderPage.mockResolvedValue(readerData());
    const mounted = await renderRoute();
    expect(shown().engineSettings.readingMode).toBe('ltr');

    await measure({ pageIndex: 1, width: 800, height: 6000 });

    expect(shown().engineSettings.readingMode).toBe('vertical');
    expect(shown().chapter.pages[1]?.image).toMatchObject({ width: 800, height: 6000 });
    expect(shown().initialPageIndex).toBe(1);
    // Auto resolving is not a saved choice.
    expect(shown().settings.readingMode).toBe('auto');
    expect(shown().titleOverrides).toBeUndefined();
    // The size that switched the reader is stored at once.
    expect(updateChapterPageDimensions).toHaveBeenCalledTimes(1);
    expect(updateChapterPageDimensions).toHaveBeenCalledWith(expect.anything(), CHAPTER, [
      { pageIndex: 1, width: 800, height: 6000 },
    ]);

    await measure({ pageIndex: 2, width: 800, height: 5800 });
    expect(shown().engineSettings.readingMode).toBe('vertical');
    expect(shown().chapter.pages[2]?.image).toMatchObject({ width: 800, height: 5800 });
    await settleWrites();
    expect(updateChapterPageDimensions).toHaveBeenLastCalledWith(expect.anything(), CHAPTER, [
      { pageIndex: 2, width: 800, height: 5800 },
    ]);
    unmount(mounted);
  });

  it('Given Auto, When the first page is an ordinary page, Then the reader stays paged and the sizes are stored together', async () => {
    fetchReaderPage.mockResolvedValue(readerData());
    const mounted = await renderRoute();

    await measure({ pageIndex: 1, width: 800, height: 1200 });
    await measure({ pageIndex: 2, width: 800, height: 1200 });
    // A tall page after the first decode does not switch a paged chapter.
    await measure({ pageIndex: 3, width: 800, height: 6000 });

    expect(shown().chapter.pages[1]?.image).toMatchObject({ width: 800, height: 1200 });
    expect(shown().chapter.pages[2]?.image).toMatchObject({ width: 800, height: 1200 });
    expect(shown().engineSettings.readingMode).toBe('ltr');
    expect(updateChapterPageDimensions).not.toHaveBeenCalled();
    await settleWrites();
    expect(updateChapterPageDimensions).toHaveBeenCalledTimes(1);
    expect(updateChapterPageDimensions).toHaveBeenCalledWith(expect.anything(), CHAPTER, [
      { pageIndex: 1, width: 800, height: 1200 },
      { pageIndex: 2, width: 800, height: 1200 },
      { pageIndex: 3, width: 800, height: 6000 },
    ]);
    unmount(mounted);
  });

  it('Given a concrete title mode, When a strip page decodes first, Then the reader does not switch', async () => {
    fetchReaderPage.mockResolvedValue(readerData({ readingMode: 'rtl' }, { readingMode: 'rtl' }));
    const mounted = await renderRoute();

    await measure({ pageIndex: 1, width: 800, height: 6000 });

    expect(shown().engineSettings.readingMode).toBe('rtl');
    await settleWrites();
    expect(updateChapterPageDimensions).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given two decodes in one tick, When the first is ordinary and the second tall, Then the first decision holds', async () => {
    fetchReaderPage.mockResolvedValue(readerData());
    const mounted = await renderRoute();
    const onMeasured = screenProps.onPageMeasured as (value: ReaderPageMeasurement) => void;

    await act(async () => {
      onMeasured({ pageIndex: 1, width: 800, height: 1200 });
      onMeasured({ pageIndex: 2, width: 800, height: 6000 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(shown().chapter.pages[1]?.image).toMatchObject({ width: 800, height: 1200 });
    expect(shown().chapter.pages[2]?.image).toMatchObject({ width: 800, height: 6000 });
    expect(shown().engineSettings.readingMode).toBe('ltr');
    // Flush the ordinary page's batched size so the timer cannot outlive the test.
    await settleWrites();
    unmount(mounted);
  });

  it('Given a size already stored or already written, When the page decodes again, Then nothing is written', async () => {
    const data = readerData();
    const stored = {
      ...data,
      chapter: {
        ...data.chapter,
        pages: data.chapter.pages.map((page) =>
          page.index === 0 ? { ...page, image: { ...page.image, width: 800, height: 1200 } } : page,
        ),
      },
    };
    fetchReaderPage.mockResolvedValue(stored);
    const mounted = await renderRoute();

    await measure({ pageIndex: 0, width: 800, height: 1200 });
    await measure({ pageIndex: 1, width: 800, height: 1200 });
    await settleWrites();
    await measure({ pageIndex: 1, width: 800, height: 1200 });
    await settleWrites();

    expect(updateChapterPageDimensions).toHaveBeenCalledTimes(1);
    expect(updateChapterPageDimensions).toHaveBeenCalledWith(expect.anything(), CHAPTER, [
      { pageIndex: 1, width: 800, height: 1200 },
    ]);
    unmount(mounted);
  });

  it('Given the first decode switched to the strip, When the chapter refetches before the size write lands, Then the strip stays', async () => {
    let releaseWrite: (() => void) | undefined;
    updateChapterPageDimensions.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseWrite = () => resolve({ ok: true, value: 1 });
        }),
    );
    fetchReaderPage.mockResolvedValue(readerData());
    const { root, container, client } = await renderRoute();

    await measure({ pageIndex: 1, width: 800, height: 6000 });
    expect(shown().engineSettings.readingMode).toBe('vertical');

    // The write is still pending: a refetch reads the old, size-less chapter.
    await act(async () => {
      await client.refetchQueries({ queryKey: readerQueryKeys.chapter(CHAPTER) });
    });
    expect(shown().engineSettings.readingMode).toBe('vertical');

    await act(async () => {
      releaseWrite?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await client.refetchQueries({ queryKey: readerQueryKeys.chapter(CHAPTER) });
    });
    expect(shown().engineSettings.readingMode).toBe('vertical');
    unmount({ root, container });
  });
});
