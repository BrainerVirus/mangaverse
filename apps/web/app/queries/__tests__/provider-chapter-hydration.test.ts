import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderContract } from '@app/extensions-sdk';
import type { MangaProviderMapping } from '@app/shared';
import {
  toChapterId,
  toMangaId,
  toProviderId,
  toProviderMangaId,
  toProviderMappingId,
} from '@app/shared';

const mocks = vi.hoisted(() => ({
  resolveInstalledProvider: vi.fn<(db: unknown, providerId: string) => Promise<unknown>>(),
  getProviderBinding: vi.fn<(providerId: string) => unknown>(),
  upsertChapterWithPages: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({
  getProviderBinding: mocks.getProviderBinding,
  getBindingForChapterId: () => null,
  resolveInstalledProvider: mocks.resolveInstalledProvider,
}));

vi.mock('@app/db/browser', () => ({
  getChapter: vi.fn<(...args: unknown[]) => unknown>(),
  refreshLibraryUnreadCount: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 0),
  upsertChapterWithPages: mocks.upsertChapterWithPages,
}));

vi.mock('@app/extensions', () => ({
  loadProviderSettings: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
  applyExplicitContentGate: <T>(settings: T): T => settings,
}));

import { ensureProviderChaptersForMapping } from '../provider-query-options.js';

const db = {} as AppDrizzleDb;
const mangaId = toMangaId('manga-1');
const mapping: MangaProviderMapping = {
  id: toProviderMappingId('map-1'),
  providerId: toProviderId('fake'),
  providerMangaId: toProviderMangaId('remote-1'),
};

function provider(capabilities: Record<string, boolean>, chapters = 1): ProviderContract {
  return {
    manifest: { id: 'fake', name: 'Fake', capabilities },
    getChapters: vi.fn<() => Promise<readonly unknown[]>>(async () =>
      Array.from({ length: chapters }, (_, index) => ({
        id: `remote-ch-${index + 1}`,
        title: `Chapter ${index + 1}`,
        index: index + 1,
      })),
    ),
  } as unknown as ProviderContract;
}

describe('ensureProviderChaptersForMapping', () => {
  beforeEach(() => {
    mocks.resolveInstalledProvider.mockReset();
    mocks.upsertChapterWithPages.mockReset().mockResolvedValue({ ok: true, value: 'written' });
    mocks.getProviderBinding.mockReset().mockReturnValue({
      providerId: 'fake',
      toChapter: (
        providerMangaId: string,
        chapter: { id: string; title: string; index: number },
      ) => ({
        id: toChapterId(chapter.id),
        mangaId: toMangaId(`dev-${providerMangaId}`),
        title: chapter.title,
        index: chapter.index,
        pages: [],
      }),
    });
  });

  it('persists provider chapters under the requested mapping', async () => {
    mocks.resolveInstalledProvider.mockResolvedValue(provider({ 'metadata.chapters': true }, 2));

    await expect(ensureProviderChaptersForMapping(db, mangaId, mapping)).resolves.toBe(2);

    expect(mocks.upsertChapterWithPages).toHaveBeenCalledTimes(2);
    expect(mocks.upsertChapterWithPages).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        chapterId: toChapterId('remote-ch-1'),
        mangaId,
        providerMappingId: mapping.id,
        providerId: 'fake',
        title: 'Chapter 1',
        index: 1,
        pages: [],
      }),
    );
  });

  it('never calls a provider that does not declare metadata.chapters', async () => {
    const unsupported = provider({ 'metadata.details': true });
    mocks.resolveInstalledProvider.mockResolvedValue(unsupported);

    await expect(ensureProviderChaptersForMapping(db, mangaId, mapping)).resolves.toBe(0);

    expect(unsupported.getChapters).not.toHaveBeenCalled();
    expect(mocks.upsertChapterWithPages).not.toHaveBeenCalled();
  });

  it('normalizes a provider failure without persisting a partial list', async () => {
    const broken = provider({ 'metadata.chapters': true });
    Object.assign(broken, {
      getChapters: vi.fn<() => Promise<never>>(async () => {
        throw new Error('upstream exploded');
      }),
    });
    mocks.resolveInstalledProvider.mockResolvedValue(broken);

    await expect(ensureProviderChaptersForMapping(db, mangaId, mapping)).rejects.toThrow(
      'An unexpected error occurred.',
    );
    expect(mocks.upsertChapterWithPages).not.toHaveBeenCalled();
  });
});
