import { describe, expect, it } from 'vitest';
import { ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import {
  evictCoverCacheToLimit,
  getCachedCoverObjectUrl,
  getCoverCacheUsage,
  storeCoverInCache,
} from './cover-cache-store.js';
import { buildCoverBlobKey } from './constants.js';

function createMockAdapter(store = new Map<string, { data: ArrayBuffer; mimeType: string }>()): PlatformAdapter {
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
      createObjectUrl: async (data, mimeType) => {
        const url = `blob:mock-${urlCounter++}`;
        objectUrls.set(url, mimeType);
        return ok(url);
      },
      revokeObjectUrl: async (url) => {
        objectUrls.delete(url);
        return ok(undefined);
      },
    },
  };
}

describe('cover cache store', () => {
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

    const evicted = await evictCoverCacheToLimit(db, adapter, 250);
    expect(evicted).toBe(1);

    const usage = await getCoverCacheUsage(db);
    expect(usage.totalBytes).toBe(200);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-old'))).toBe(false);
    expect(blobStore.has(buildCoverBlobKey('mangadex', 'dev-md-new'))).toBe(true);
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
