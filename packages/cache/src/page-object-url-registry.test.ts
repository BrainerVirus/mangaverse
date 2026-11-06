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

  it('Given a pending cached-only miss, When a full acquire arrives, Then it resolves the page instead of failing', async () => {
    let settleCached!: (value: undefined) => void;
    store.getCachedPageObjectUrl.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          settleCached = resolve;
        }),
    );
    store.resolvePageObjectUrl.mockResolvedValue({
      objectUrl: 'blob:full',
      fromCache: false,
      byteSize: 20,
    });

    const cached = acquirePageObjectUrl(input(98), { cachedOnly: true });
    const full = acquirePageObjectUrl(input(98));
    settleCached(undefined);

    expect(await cached).toBeUndefined();
    expect((await full)?.objectUrl).toBe('blob:full');
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('Given a cached-only and a full lookup settle together, Then both share the first URL and the duplicate is revoked', async () => {
    let settleCached!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    let settleFull!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    store.getCachedPageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleCached = resolve;
        }),
    );
    store.resolvePageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleFull = resolve;
        }),
    );

    const cached = acquirePageObjectUrl(input(77), { cachedOnly: true });
    const full = acquirePageObjectUrl(input(77));
    settleCached({ objectUrl: 'blob:cached', fromCache: true, byteSize: 20 });
    settleFull({ objectUrl: 'blob:full', fromCache: false, byteSize: 20 });

    const [cachedResult, fullResult] = await Promise.all([cached, full]);
    expect(cachedResult?.objectUrl).toBe('blob:cached');
    expect(fullResult?.objectUrl).toBe('blob:cached');
    // The duplicate was revoked, the shared one was not.
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:full');
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:cached');

    await releasePageObjectUrl(input(77));
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:cached');
    await releasePageObjectUrl(input(77));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cached');
  });

  it('Given a full lookup fails while a cached-only lookup holds the URL, Then the full acquire resolves with it and one release leaves it held', async () => {
    let settleCached!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    let settleFull!: (value: undefined) => void;
    store.getCachedPageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleCached = resolve;
        }),
    );
    store.resolvePageObjectUrl.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          settleFull = resolve;
        }),
    );

    const cached = acquirePageObjectUrl(input(60), { cachedOnly: true });
    const full = acquirePageObjectUrl(input(60));
    settleCached({ objectUrl: 'blob:cached-wins', fromCache: true, byteSize: 7 });
    expect((await cached)?.objectUrl).toBe('blob:cached-wins');
    settleFull(undefined);

    expect(await full).toMatchObject({ objectUrl: 'blob:cached-wins', fromCache: true });

    await releasePageObjectUrl(input(60));
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    await releasePageObjectUrl(input(60));
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cached-wins');
  });

  it('Given two full acquires share a failing lookup beside a cached success, Then each takes exactly one reference', async () => {
    let settleCached!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    let settleFull!: (value: undefined) => void;
    store.getCachedPageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleCached = resolve;
        }),
    );
    store.resolvePageObjectUrl.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          settleFull = resolve;
        }),
    );

    const cached = acquirePageObjectUrl(input(61), { cachedOnly: true });
    const fullOwner = acquirePageObjectUrl(input(61));
    const fullJoiner = acquirePageObjectUrl(input(61));
    settleCached({ objectUrl: 'blob:cached-wins', fromCache: true, byteSize: 7 });
    await cached;
    settleFull(undefined);

    expect((await fullOwner)?.objectUrl).toBe('blob:cached-wins');
    expect((await fullJoiner)?.objectUrl).toBe('blob:cached-wins');
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(1);

    // cached + owner + joiner = three references, one release each.
    await releasePageObjectUrl(input(61));
    await releasePageObjectUrl(input(61));
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    await releasePageObjectUrl(input(61));
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('Given a cached-only miss while a full acquire is still in flight, Then it stays a miss and does not wait for or take the full URL', async () => {
    let settleFull!: (value: { objectUrl: string; fromCache: boolean; byteSize: number }) => void;
    store.getCachedPageObjectUrl.mockResolvedValue(undefined);
    store.resolvePageObjectUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleFull = resolve;
        }),
    );

    const full = acquirePageObjectUrl(input(62));
    expect(await acquirePageObjectUrl(input(62), { cachedOnly: true })).toBeUndefined();
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(1);

    settleFull({ objectUrl: 'blob:full-only', fromCache: false, byteSize: 3 });
    expect((await full)?.objectUrl).toBe('blob:full-only');

    // The miss took no reference: a single release revokes.
    await releasePageObjectUrl(input(62));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:full-only');
  });

  it('Given two cached-only callers miss after a full acquire held the page, Then both stay misses and take no reference', async () => {
    let settleCached!: (value: undefined) => void;
    store.getCachedPageObjectUrl.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          settleCached = resolve;
        }),
    );
    store.resolvePageObjectUrl.mockResolvedValue({
      objectUrl: 'blob:full-only',
      fromCache: false,
      byteSize: 3,
    });

    const cachedOwner = acquirePageObjectUrl(input(63), { cachedOnly: true });
    const cachedJoiner = acquirePageObjectUrl(input(63), { cachedOnly: true });
    expect((await acquirePageObjectUrl(input(63)))?.objectUrl).toBe('blob:full-only');
    settleCached(undefined);

    expect(await cachedOwner).toBeUndefined();
    expect(await cachedJoiner).toBeUndefined();
    await releasePageObjectUrl(input(63));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:full-only');
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

  it('Given the same page under different display caps, When keyed, Then each cap has its own key and the same cap shares one', () => {
    const original = pageObjectUrlKey(input(1));
    const capped = pageObjectUrlKey(input(1, { maxDisplayEdge: 2048 }));

    expect(capped).not.toBe(original);
    expect(capped).not.toBe(pageObjectUrlKey(input(1, { maxDisplayEdge: 1024 })));
    expect(pageObjectUrlKey(input(1, { maxDisplayEdge: 2048 }))).toBe(capped);
    expect(pageObjectUrlKey(input(1, { maxDisplayEdge: undefined }))).toBe(original);
  });

  it('Given a capped and an uncapped holder of one page, When both acquire, Then each gets its own URL, resolved with its own cap', async () => {
    store.resolvePageObjectUrl.mockImplementation(async (lookup) => ({
      objectUrl: lookup.maxDisplayEdge === undefined ? 'blob:original' : 'blob:display',
      fromCache: true,
      byteSize: 10,
    }));

    const original = await acquirePageObjectUrl(input(20));
    const capped = await acquirePageObjectUrl(input(20, { maxDisplayEdge: 2048 }));
    const cappedAgain = await acquirePageObjectUrl(input(20, { maxDisplayEdge: 2048 }));

    expect(original?.objectUrl).toBe('blob:original');
    expect(capped?.objectUrl).toBe('blob:display');
    expect(cappedAgain?.objectUrl).toBe('blob:display');
    expect(store.resolvePageObjectUrl).toHaveBeenCalledTimes(2);
    expect(store.resolvePageObjectUrl.mock.calls[1]?.[0]).toMatchObject({ maxDisplayEdge: 2048 });

    await releasePageObjectUrl(input(20));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:original');
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:display');
    await releasePageObjectUrl(input(20, { maxDisplayEdge: 2048 }));
    await releasePageObjectUrl(input(20, { maxDisplayEdge: 2048 }));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:display');
  });
});
