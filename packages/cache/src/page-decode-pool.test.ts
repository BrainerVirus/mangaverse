import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPageDecodePool, type DecodedPage } from './page-decode-pool.js';
import {
  acquirePageObjectUrl,
  releasePageObjectUrl,
  type PageObjectUrlInput,
} from './page-object-url-registry.js';

type StoredPage = { objectUrl: string; fromCache: boolean; byteSize: number };

vi.mock('./page-object-url-registry.js', () => ({
  acquirePageObjectUrl: vi.fn<(input: PageObjectUrlInput) => Promise<StoredPage | undefined>>(),
  releasePageObjectUrl: vi.fn<(input: PageObjectUrlInput) => Promise<void>>(async () => {}),
}));

const acquire = vi.mocked(acquirePageObjectUrl);
const release = vi.mocked(releasePageObjectUrl);

const db = {} as never;
const adapter = {} as never;

function plan(...pageIndexes: number[]) {
  return pageIndexes.map((pageIndex) => ({
    pageIndex,
    remoteUrl: `https://example.com/${pageIndex}.jpg`,
  }));
}

function createPool(
  overrides: { concurrency?: number; maxEntries?: number; decode?: unknown } = {},
) {
  return createPageDecodePool({
    db,
    adapter,
    providerId: 'mangadex',
    mangaId: 'manga-1',
    chapterId: 'chapter-1',
    concurrency: overrides.concurrency ?? 2,
    maxEntries: overrides.maxEntries ?? 6,
    ...(overrides.decode === undefined
      ? {}
      : { decode: overrides.decode as (url: string) => Promise<DecodedPage | undefined> }),
  });
}

function deferredDecode() {
  const pending: {
    url: string;
    resolve: () => void;
    released: ReturnType<typeof vi.fn<() => void>>;
  }[] = [];
  const decode = vi.fn<(url: string) => Promise<DecodedPage | undefined>>(
    (url: string) =>
      new Promise<DecodedPage | undefined>((resolve) => {
        const released = vi.fn<() => void>();
        pending.push({
          url,
          released,
          resolve: () => resolve({ release: released }),
        });
      }),
  );
  return { decode, pending };
}

beforeEach(() => {
  acquire.mockReset();
  release.mockReset();
  acquire.mockImplementation(async (input) => ({
    objectUrl: `blob:${input.pageIndex}`,
    fromCache: true,
    byteSize: 1,
  }));
  release.mockResolvedValue(undefined);
});

describe('createPageDecodePool', () => {
  it('Given a plan larger than the window, When planned, Then only maxEntries pages are acquired', async () => {
    const pool = createPool({ maxEntries: 3 });
    pool.setPlan(plan(0, 1, 2, 3, 4, 5));
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(3));

    expect(acquire.mock.calls.map(([input]) => input.pageIndex)).toEqual([0, 1, 2]);
    pool.dispose();
  });

  it('Given concurrency two, When six pages are planned, Then only two decodes run at once', async () => {
    const { decode, pending } = deferredDecode();
    const pool = createPool({ concurrency: 2, maxEntries: 6, decode });
    pool.setPlan(plan(0, 1, 2));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));

    // The third waits for a worker rather than fanning out with the burst.
    expect(pending).toHaveLength(2);
    pending[0]!.resolve();
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(3));
    expect(pool.snapshot().decoded).toBe(1);
    pool.dispose();
  });

  it('Given a decoded page leaves the plan, When re-planned, Then its bitmap and URL reference are released', async () => {
    const { decode, pending } = deferredDecode();
    const pool = createPool({ concurrency: 1, maxEntries: 4, decode });
    pool.setPlan(plan(1, 2));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
    pending[0]!.resolve();
    await vi.waitFor(() => expect(pool.snapshot().decoded).toBe(1));
    const image = pool.snapshot().decoded;
    expect(image).toBe(1);

    pool.setPlan(plan(2));
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
    expect(release.mock.calls[0]?.[0]).toMatchObject({ pageIndex: 1 });
    pool.dispose();
  });

  it('Given a decode finishes after its page left the plan, When it settles, Then the bitmap is dropped, not cached', async () => {
    const { decode, pending } = deferredDecode();
    const pool = createPool({ concurrency: 1, maxEntries: 4, decode });
    pool.setPlan(plan(1));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));

    // The turn moves on before the decode lands.
    pool.setPlan(plan(2));
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ pageIndex: 1 }));

    pending[0]!.resolve();
    await vi.waitFor(() => expect(pending[0]!.released).toHaveBeenCalledTimes(1));
    // The late decode released its own handle and did not enter the window.
    expect(pool.snapshot().decoded).toBe(0);
    pool.dispose();
  });

  it('Given a page is not cached yet, When the plan is set again, Then the same page is retried', async () => {
    const { decode } = deferredDecode();
    acquire.mockImplementationOnce(async () => undefined);
    const pool = createPool({ concurrency: 1, maxEntries: 4, decode });
    pool.setPlan(plan(7));
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(pool.snapshot().pending).toBe(0));
    expect(decode).not.toHaveBeenCalled();

    // A later sweep cached the page; re-planning picks it up.
    pool.setPlan(plan(7));
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
    pool.dispose();
  });

  it('Given a decoded window, When the pool is disposed, Then every page is released', async () => {
    acquire.mockImplementation(async (input) => ({
      objectUrl: `blob:${input.pageIndex}`,
      fromCache: true,
      byteSize: 1,
    }));
    const decode = vi.fn<() => Promise<DecodedPage | undefined>>(async () => ({
      release: vi.fn<() => void>(),
    }));
    const pool = createPool({ concurrency: 2, maxEntries: 3, decode });
    pool.setPlan(plan(0, 1, 2));
    await vi.waitFor(() => expect(pool.snapshot().decoded).toBe(3));

    pool.dispose();
    expect(release.mock.calls.map(([input]) => input.pageIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2,
    ]);
    expect(pool.snapshot().decoded).toBe(0);
  });

  it('Given a decode failure, When the pool settles, Then the page is not counted and its URL is released', async () => {
    const decode = vi.fn<() => Promise<DecodedPage | undefined>>(async () => undefined);
    const pool = createPool({ concurrency: 1, maxEntries: 2, decode });
    pool.setPlan(plan(3));
    await vi.waitFor(() => expect(pool.snapshot().failures).toBe(1));
    expect(pool.snapshot().decoded).toBe(0);
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ pageIndex: 3 }));
    pool.dispose();
  });
});
