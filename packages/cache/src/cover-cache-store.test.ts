import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import {
  getCachedCoverObjectUrl,
  getCoverCacheUsage,
  resolveCoverObjectUrl,
  storeCoverInCache,
} from './cover-cache-store.js';
import { evictCacheToLimit } from './cache-maintenance.js';
import { buildCoverBlobKey } from './constants.js';
import { installFakeWebLocks } from './testing/fake-web-locks.js';

function createMockAdapter(
  store = new Map<string, { data: ArrayBuffer; mimeType: string }>(),
): PlatformAdapter {
  const objectUrls = new Map<string, string>();
  let urlCounter = 0;

  return {
    capabilities: async () => ok({ runtime: 'web' } as never),
    clipboard: { readText: async () => ok(''), writeText: async () => ok(undefined) },
    files: {
      openTextFile: async () => ok({ content: '', cancelled: true }),
      saveTextFile: async () => ok({ content: '' }),
    },
    fullscreen: {
      enter: async () => ok(undefined),
      exit: async () => ok(undefined),
      isActive: async () => ok(false),
    },
    protocol: {
      getPendingInstallUrl: async () => ok(null),
      canHandleInstallLinks: async () => ok(false),
    },
    externalLinks: { open: async () => ok(undefined) },
    installPrompt: {
      getState: async () => ok({ kind: 'unsupported' }),
      prompt: async () => ok(undefined),
    },
    secureStorage: {
      get: async () => ok(undefined),
      set: async () => ok(undefined),
      delete: async () => ok(undefined),
    },
    diagnostics: { getSnapshot: async () => ok({}) },
    localService: {
      getInfo: async () => ok({ running: false, host: null, port: null }),
    },
    storage: {
      getItem: async () => ok(undefined),
      setItem: async () => ok(undefined),
      deleteItem: async () => ok(undefined),
      estimate: async () => ok({}),
      persist: async () => ok(false),
    },
    blobStorage: {
      put: async (key, data, mimeType) => {
        store.set(key, { data, mimeType });
        return ok(undefined);
      },
      get: async (key) => ok(store.get(key)),
      delete: async (key) => {
        store.delete(key);
        return ok(undefined);
      },
      listKeys: async () => ok([...store.keys()]),
      createObjectUrl: async (_data, mimeType) => {
        const url = `blob:mock-${urlCounter++}`;
        objectUrls.set(url, mimeType);
        return ok(url);
      },
      revokeObjectUrl: async (url) => {
        objectUrls.delete(url);
        return ok(undefined);
      },
    },
    providerNetwork: {
      replaceProviders: async () => ok(undefined),
      request: async () =>
        ok({ status: 200, headers: {}, bodyText: '', finalUrl: 'https://example.com' }),
    },
    network: {
      fetchBytes: async (url) => {
        if (url.includes('fail')) {
          return ok(undefined);
        }
        return ok({ data: new Uint8Array([9, 8, 7]).buffer, mimeType: 'image/jpeg' });
      },
    },
  };
}

describe('cover cache store', () => {
  let fakeLocks: ReturnType<typeof installFakeWebLocks>;

  beforeEach(() => {
    fakeLocks = installFakeWebLocks();
  });

  afterEach(() => {
    fakeLocks.restore();
  });

  it('stores and reads cover blobs from cache metadata + blob storage', async () => {
    const { db } = await createSqlJsHarness();
    const adapter = createMockAdapter();
    const data = new Uint8Array([1, 2, 3]).buffer;

    const stored = await storeCoverInCache({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-abc',
      remoteUrl: 'https://example.com/cover.jpg',
      data,
      mimeType: 'image/jpeg',
    });

    expect(stored?.fromCache).toBe(false);
    expect(stored?.objectUrl).toMatch(/^blob:mock-/);

    const cached = await getCachedCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-abc',
      remoteUrl: 'https://example.com/cover.jpg',
    });

    expect(cached?.fromCache).toBe(true);
    expect(cached?.objectUrl).toMatch(/^blob:mock-/);

    const usage = await getCoverCacheUsage(db);
    expect(usage.totalCount).toBe(1);
    expect(usage.totalBytes).toBe(3);
  });

  it('evicts least recently used entries when over limit', async () => {
    const { db } = await createSqlJsHarness();
    const blobStore = new Map<string, { data: ArrayBuffer; mimeType: string }>();
    const adapter = createMockAdapter(blobStore);

    await storeCoverInCache({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-old',
      remoteUrl: 'https://example.com/old.jpg',
      data: new Uint8Array(100).buffer,
      mimeType: 'image/jpeg',
    });

    await storeCoverInCache({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-new',
      remoteUrl: 'https://example.com/new.jpg',
      data: new Uint8Array(200).buffer,
      mimeType: 'image/jpeg',
    });

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 250 });
    expect(eviction.evictedCount).toBe(1);

    const usage = await getCoverCacheUsage(db);
    expect(usage.totalBytes).toBe(200);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-old'))).toBe(false);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-new'))).toBe(true);
  });

  it('refetches when the cover source URL changes instead of reusing the old blob', async () => {
    const { db } = await createSqlJsHarness();
    const adapter = createMockAdapter();

    const old = await storeCoverInCache({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-override',
      remoteUrl: 'https://uploads.mangadex.org/covers/provider.jpg',
      data: new Uint8Array([1, 1, 1]).buffer,
      mimeType: 'image/jpeg',
    });
    expect(old?.fromCache).toBe(false);

    const stale = await getCachedCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-override',
      remoteUrl: 'https://example.com/custom.jpg',
    });
    expect(stale).toBeUndefined();

    const resolved = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-override',
      remoteUrl: 'https://example.com/custom.jpg',
    });
    expect(resolved?.fromCache).toBe(false);
    expect(resolved?.objectUrl).not.toBe(old?.objectUrl);

    const cachedNew = await getCachedCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-override',
      remoteUrl: 'https://example.com/custom.jpg',
    });
    expect(cachedNew?.fromCache).toBe(true);
    expect(cachedNew?.objectUrl).not.toBe(old?.objectUrl);
  });

  it('Given an in-flight fetch for the old URL, When a new URL resolves for the same cover, Then they never share an object URL', async () => {
    const { db } = await createSqlJsHarness();
    const adapter = createMockAdapter();
    let releaseOld: () => void = () => {};
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    let markOldStarted: () => void = () => {};
    const oldStarted = new Promise<void>((resolve) => {
      markOldStarted = resolve;
    });

    adapter.network.fetchBytes = async (url) => {
      if (url.includes('/old.jpg')) {
        markOldStarted();
        await oldGate;
      }
      return ok({
        data: new Uint8Array(url.includes('/old.jpg') ? [1] : [2]).buffer,
        mimeType: 'image/jpeg',
      });
    };

    const oldFetch = resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-inflight',
      remoteUrl: 'https://example.com/old.jpg',
    });
    await oldStarted;

    // A shared in-flight key would make this await the gated old fetch and hand
    // back its object URL, so the race reports the regression instead of hanging.
    const newResult = await Promise.race([
      resolveCoverObjectUrl({
        db,
        adapter,
        providerId: 'mangadex',
        mangaId: 'dev-md-inflight',
        remoteUrl: 'https://example.com/new.jpg',
      }),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3_000)),
    ]);

    releaseOld();
    const oldResult = await oldFetch;

    expect(newResult?.objectUrl).toBeDefined();
    expect(oldResult?.objectUrl).toBeDefined();
    expect(newResult?.objectUrl).not.toBe(oldResult?.objectUrl);
  });

  it('downloads remote cover bytes via platform network and stores blob URL', async () => {
    const { db } = await createSqlJsHarness();
    const blobStore = new Map<string, { data: ArrayBuffer; mimeType: string }>();
    const adapter = createMockAdapter(blobStore);

    const resolved = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-remote',
      remoteUrl: 'https://uploads.mangadex.org/covers/remote.jpg',
    });

    expect(resolved?.fromCache).toBe(false);
    expect(resolved?.objectUrl).toMatch(/^blob:mock-/);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-remote'))).toBe(true);

    const cachedAgain = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-remote',
      remoteUrl: 'https://uploads.mangadex.org/covers/remote.jpg',
    });
    expect(cachedAgain?.fromCache).toBe(true);
  });
});

describe('cache constants', () => {
  it('formats byte sizes for display', async () => {
    const { formatCacheBytes } = await import('./constants.js');
    expect(formatCacheBytes(512)).toBe('512 B');
    expect(formatCacheBytes(2048)).toBe('2.0 KB');
    expect(formatCacheBytes(524288000)).toBe('500.0 MB');
  });
});

describe('cover cache store with a main-side fetch-and-store', () => {
  it('Given a provider cover, When resolving it, Then main stores it under the provider allowlist and only page:// comes back', async () => {
    const { db } = await createSqlJsHarness();
    const blobStore = new Map<string, { data: ArrayBuffer; mimeType: string }>();
    const adapter = createMockAdapter(blobStore);
    let fetchBytes = 0;
    const storeCalls: unknown[] = [];
    adapter.network.fetchBytes = async () => {
      fetchBytes += 1;
      return ok(undefined);
    };
    adapter.blobStorage.resolveUrl = async (key: string) =>
      ok(key.startsWith('page:cover:') ? 'page://store/cover' : undefined);
    Object.assign(adapter.providerNetwork, {
      fetchAndStore: async (input: unknown) => {
        storeCalls.push(input);
        return ok({ url: 'page://store/cover', mimeType: 'image/jpeg', byteSize: 3 });
      },
      fetchAndStoreUserInitiated: async () => {
        throw new Error('a provider cover must not use the user-initiated path');
      },
    });

    const resolved = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-main',
      remoteUrl: 'https://uploads.mangadex.org/covers/main.jpg',
    });

    expect(resolved).toMatchObject({ fromCache: false, objectUrl: 'page://store/cover' });
    expect(storeCalls).toEqual([
      {
        providerId: 'mangadex',
        url: 'https://uploads.mangadex.org/covers/main.jpg',
        key: 'page:cover:mangadex:dev-md-main',
      },
    ]);
    expect(fetchBytes).toBe(0);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-main'))).toBe(false);

    const cached = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-main',
      remoteUrl: 'https://uploads.mangadex.org/covers/main.jpg',
    });
    expect(cached).toMatchObject({ fromCache: true, objectUrl: 'page://store/cover' });
    expect(storeCalls).toHaveLength(1);
  });

  it('Given a user-supplied custom cover, When resolving it, Then main stores it without the provider allowlist and only page:// comes back', async () => {
    const { db } = await createSqlJsHarness();
    const blobStore = new Map<string, { data: ArrayBuffer; mimeType: string }>();
    const adapter = createMockAdapter(blobStore);
    const userCalls: unknown[] = [];
    let fetchBytes = 0;
    adapter.network.fetchBytes = async () => {
      fetchBytes += 1;
      return ok(undefined);
    };
    adapter.blobStorage.resolveUrl = async (key: string) =>
      ok(key.startsWith('page:cover:') ? 'page://store/custom' : undefined);
    Object.assign(adapter.providerNetwork, {
      fetchAndStore: async () => {
        throw new Error('a custom cover must not use the provider allowlist path');
      },
      fetchAndStoreUserInitiated: async (input: unknown) => {
        userCalls.push(input);
        return ok({ url: 'page://store/custom', mimeType: 'image/jpeg', byteSize: 3 });
      },
    });

    const resolved = await resolveCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-custom',
      remoteUrl: 'https://example.com/cover.jpg',
      userProvided: true,
    });

    expect(resolved).toMatchObject({ fromCache: false, objectUrl: 'page://store/custom' });
    expect(userCalls).toEqual([
      { url: 'https://example.com/cover.jpg', key: 'page:cover:mangadex:dev-md-custom' },
    ]);
    expect(fetchBytes).toBe(0);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-custom'))).toBe(false);

    const cached = await getCachedCoverObjectUrl({
      db,
      adapter,
      providerId: 'mangadex',
      mangaId: 'dev-md-custom',
      remoteUrl: 'https://example.com/cover.jpg',
      userProvided: true,
    });
    expect(cached).toMatchObject({ fromCache: true, objectUrl: 'page://store/custom' });
    expect(userCalls).toHaveLength(1);
  });
});
