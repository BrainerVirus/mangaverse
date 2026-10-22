// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLibraryEntry,
  addProviderMapping,
  applyProviderMigration,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
  getMangaIdentity,
  refreshLibraryUnreadCount,
  setLibraryEntryActiveProviderMapping,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { fetchMangaDetail } from '@app/library';
import type { ProviderContract } from '@app/extensions-sdk';
import {
  toChapterId,
  toMangaId,
  toProviderId,
  type MangaId,
  type MangaProviderMapping,
  type ProviderMappingId,
} from '@app/shared';

const mocks = vi.hoisted(() => ({
  resolveInstalledProvider: vi.fn<(db: unknown, providerId: string) => Promise<unknown>>(),
  getProviderBinding: vi.fn<(providerId: string) => unknown>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({
  getProviderBinding: mocks.getProviderBinding,
  getBindingForChapterId: () => null,
  listProviderBindings: () => [],
  readInstalledExtensions: async () => [],
  resolveInstalledProvider: mocks.resolveInstalledProvider,
}));

vi.mock('@app/extensions', () => ({
  loadProviderSettings: async () => ({}),
  applyExplicitContentGate: <T>(settings: T): T => settings,
}));

import { runProviderAction } from '../manga-detail-route-helpers.js';
import { hydrateProviderChaptersForMapping } from '../provider-query-options.js';

const MANGA_ID = toMangaId('manga-1');

function provider(chapters: number, prefix: string): ProviderContract {
  return {
    manifest: { id: 'prov-b', name: 'Provider B', capabilities: { 'metadata.chapters': true } },
    getChapters: vi.fn<() => Promise<readonly unknown[]>>(async () =>
      Array.from({ length: chapters }, (_, index) => ({
        id: `${prefix}-${index + 1}`,
        title: `Chapter ${index + 1}`,
        index: index + 1,
      })),
    ),
  } as unknown as ProviderContract;
}

async function seed(): Promise<{
  db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'];
  mangaId: MangaId;
  sourceMappingId: ProviderMappingId;
  targetMapping?: MangaProviderMapping;
}> {
  const { db } = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Manga One',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'remote-a',
  });
  if (!created.ok) throw new Error(created.error.message);
  await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
  for (const index of [1, 2]) {
    const written = await upsertChapterWithPages(db, {
      chapterId: toChapterId(`a-${index}`),
      mangaId: created.value.mangaId,
      providerMappingId: created.value.mappingId,
      providerId: 'prov-a',
      title: `Chapter ${index}`,
      index,
      pages: [],
    });
    if (!written.ok) throw new Error(written.error.message);
  }
  await refreshLibraryUnreadCount(db, created.value.mangaId, created.value.mappingId);
  return { db, mangaId: created.value.mangaId, sourceMappingId: created.value.mappingId };
}

async function targetMapping(
  db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'],
  mangaId: MangaId,
  providerMangaId: string,
): Promise<MangaProviderMapping> {
  const added = await addProviderMapping(db, {
    mangaId,
    providerId: toProviderId('prov-b'),
    providerMangaId,
  });
  if (!added.ok) throw new Error(added.error.message);
  return { id: added.value, providerId: toProviderId('prov-b'), providerMangaId };
}

describe('switching to an empty mapping', () => {
  beforeEach(() => {
    mocks.resolveInstalledProvider.mockReset();
    mocks.getProviderBinding.mockReset().mockReturnValue({
      providerId: 'prov-b',
      toChapter: (
        providerMangaId: string,
        chapter: { id: string; title: string; index: number },
      ) => ({
        id: toChapterId(chapter.id),
        mangaId: MANGA_ID,
        title: chapter.title,
        index: chapter.index,
        pages: [],
      }),
    });
  });

  it('Given two unread chapters on A, When switching to empty B and hydrating 3 chapters, Then the stored badge is 3', async () => {
    const { db, mangaId } = await seed();
    const mappingB = await targetMapping(db, mangaId, 'remote-b');
    const detail = await fetchMangaDetail(db, mangaId);

    await runProviderAction(db, mangaId, detail, { type: 'select', mappingId: mappingB.id });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(0);

    mocks.resolveInstalledProvider.mockResolvedValue(provider(3, 'b'));
    await hydrateProviderChaptersForMapping(db, mangaId, mappingB);

    const entry = await getLibraryEntryForManga(db, mangaId);
    const refreshed = await fetchMangaDetail(db, mangaId);
    const bChapters = refreshed?.chapters.filter(
      (chapter) => chapter.providerMappingId === mappingB.id,
    );
    expect(entry?.unreadCount).toBe(3);
    expect(bChapters).toHaveLength(3);
    // The card count and the detail list must agree after hydration.
    expect(entry?.unreadCount).toBe(bChapters?.length);
  });

  it('Given hydration for the previous mapping, When it finishes after a switch, Then it cannot overwrite the new badge', async () => {
    const { db, mangaId, sourceMappingId } = await seed();
    const mappingB = await targetMapping(db, mangaId, 'remote-b');

    let releaseChapters!: () => void;
    const chaptersGate = new Promise<void>((resolve) => {
      releaseChapters = resolve;
    });
    mocks.resolveInstalledProvider.mockResolvedValue({
      manifest: { id: 'prov-b', name: 'Provider B', capabilities: { 'metadata.chapters': true } },
      getChapters: async () => {
        await chaptersGate;
        return [
          { id: 'a-1', title: 'Chapter 1', index: 1 },
          { id: 'a-2', title: 'Chapter 2', index: 2 },
        ];
      },
    } as unknown as ProviderContract);

    const hydration = hydrateProviderChaptersForMapping(db, mangaId, {
      id: sourceMappingId,
      providerId: toProviderId('prov-a'),
      providerMangaId: 'remote-a',
    });

    await runProviderAction(db, mangaId, await fetchMangaDetail(db, mangaId), {
      type: 'select',
      mappingId: mappingB.id,
    });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(0);

    releaseChapters();
    await hydration;

    // The late hydration belongs to A; B's badge must survive it.
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(0);
  });

  it('Given a provider without chapter support, When hydration is skipped, Then the stored badge still follows that mapping', async () => {
    const { db, mangaId } = await seed();
    const mappingB = await targetMapping(db, mangaId, 'remote-b');
    await runProviderAction(db, mangaId, await fetchMangaDetail(db, mangaId), {
      type: 'select',
      mappingId: mappingB.id,
    });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(0);

    mocks.resolveInstalledProvider.mockResolvedValue({
      manifest: { id: 'prov-b', name: 'Provider B', capabilities: { 'metadata.details': true } },
      getChapters: vi.fn<() => Promise<readonly unknown[]>>(async () => []),
    } as unknown as ProviderContract);
    await hydrateProviderChaptersForMapping(db, mangaId, mappingB);

    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(0);
  });

  it('Given a migration to an empty target, When its chapters hydrate, Then the badge follows the target mapping', async () => {
    const { db, mangaId, sourceMappingId } = await seed();
    const entry = await getLibraryEntryForManga(db, mangaId);
    if (entry === undefined) throw new Error('library entry should exist');
    await setLibraryEntryActiveProviderMapping(db, entry.id, sourceMappingId);
    const migrated = await applyProviderMigration(db, {
      sourceProviderId: 'prov-a',
      targetProviderId: 'prov-b',
      selections: [{ mangaId, targetProviderMangaId: 'remote-b' }],
    });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;

    const identity = await getMangaIdentity(db, mangaId);
    const target = identity?.providerMappings.find((mapping) => mapping.providerId === 'prov-b');
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect((await getLibraryEntryForManga(db, mangaId))?.activeProviderMappingId).toBe(target.id);

    mocks.resolveInstalledProvider.mockResolvedValue(provider(3, 'b'));
    await hydrateProviderChaptersForMapping(db, mangaId, target);

    const refreshedEntry = await getLibraryEntryForManga(db, mangaId);
    expect(refreshedEntry?.unreadCount).toBe(3);
  });
});
