// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PageCacheLookupInput } from './page-cache-store.js';
import {
  acquirePageObjectUrl,
  pageObjectUrlKey,
  releasePageObjectUrl,
} from './page-object-url-registry.js';

const store = vi.hoisted(() => ({
  getCachedPageObjectUrl:
    vi.fn<
      (
        input: PageCacheLookupInput,
      ) => Promise<{ objectUrl: string; fromCache: boolean; byteSize: number } | undefined>
    >(),
  resolvePageObjectUrl:
    vi.fn<
      (
        input: PageCacheLookupInput,
      ) => Promise<{ objectUrl: string; fromCache: boolean; byteSize: number } | undefined>
    >(),
}));

vi.mock('./page-cache-store.js', () => store);

const revokeObjectUrl = vi.fn<(url: string) => Promise<{ ok: true; value: undefined }>>(
  async (_url: string) => ({ ok: true as const, value: undefined }),
);
const adapter = {
  blobStorage: { revokeObjectUrl },
} as unknown as PageCacheLookupInput['adapter'];
const db = {} as PageCacheLookupInput['db'];

function input(pageIndex: number, overrides: Partial<PageCacheLookupInput> = {}) {
  return {
    db,
    adapter,
    providerId: 'mangadex',
    mangaId: 'manga-1',
    chapterId: 'chapter-1',
    pageIndex,
    remoteUrl: `https://example.com/${pageIndex}.jpg`,
    ...overrides,
  };
}

beforeEach(() => {
  store.getCachedPageObjectUrl.mockReset();
  store.resolvePageObjectUrl.mockReset();
  revokeObjectUrl.mockClear();
});

describe('acquirePageObjectUrl', () => {
  it('Given one page requested twice, When both hold it, Then they share one URL and one resolve', async () => {
    store.resolvePageObjectUrl.mockResolvedValue({
      objectUrl: 'blob:one',
      fromCache: true,
      byteSize: 10,
    });

    const first = await acquirePageObjectUrl(input(3));
    const second = await acquirePageObjectUrl(input(3));

    expect(first?.objectUrl).toBe('blob:one');
    expect(second?.objectUrl).toBe('blob:one');
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(1);
    expect(store.resolvePageObjectUrl.mock.calls[0]?.[0]).toMatchObject({ pageIndex: 3 });
  });

  it('Given two holders, When one releases, Then the URL stays alive until the last releases', async () => {
    store.resolvePageObjectUrl.mockResolvedValue({
      objectUrl: 'blob:shared',
      fromCache: true,
      byteSize: 10,
    });

    await acquirePageObjectUrl(input(1));
    await acquirePageObjectUrl(input(1));
    await releasePageObjectUrl(input(1));
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await releasePageObjectUrl(input(1));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:shared');
  });

  it('Given a cached-only acquire, When the page is not cached, Then no network resolve runs and nothing is held', async () => {
    store.getCachedPageObjectUrl.mockResolvedValue(undefined);

    expect(await acquirePageObjectUrl(input(2), { cachedOnly: true })).toBeUndefined();
    expect(store.resolvePageObjectUrl).not.toHaveBeenCalled();
    expect(store.getCachedPageObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('Given a page already held, When a second acquire is cached-only, Then the held URL is reused without a lookup', async () => {
    store.resolvePageObjectUrl.mockResolvedValue({
      objectUrl: 'blob:held',
      fromCache: false,
      byteSize: 5,
    });
    await acquirePageObjectUrl(input(4));

    const cached = await acquirePageObjectUrl(input(4), { cachedOnly: true });

    expect(cached?.objectUrl).toBe('blob:held');
    expect(store.getCachedPageObjectUrl).not.toHaveBeenCalled();
  });

  it('Given a concurrent first load, When two callers await it, Then both get the settled URL', async () => {
    let settle!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    store.resolvePageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    const first = acquirePageObjectUrl(input(5));
    const second = acquirePageObjectUrl(input(5));
    settle({ objectUrl: 'blob:race', fromCache: false, byteSize: 1 });

    expect((await first)?.objectUrl).toBe('blob:race');
    expect((await second)?.objectUrl).toBe('blob:race');
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('Given a resolve failure, When acquiring, Then it returns undefined and holds nothing', async () => {
    store.resolvePageObjectUrl.mockResolvedValue(undefined);

    expect(await acquirePageObjectUrl(input(6))).toBeUndefined();
    await releasePageObjectUrl(input(6));
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it('Given the same page under different retention, When keyed, Then the keys differ', () => {
    expect(pageObjectUrlKey(input(1))).not.toBe(
      pageObjectUrlKey({ ...input(1), retention: 'normal' }),
    );
  });
});
