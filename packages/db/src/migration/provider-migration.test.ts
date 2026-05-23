import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  findMigrationHistoryByProviders,
  getMangaIdentity,
  listMigratableLibraryEntries,
  previewProviderMigration,
  applyProviderMigration,
  setLibraryEntryActiveProviderMapping,
} from '../index.js';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';

describe('provider migration', () => {
  it('lists library titles linked to a source provider', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Naruto',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'source-provider',
      providerMangaId: 'naruto-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });

    const entries = await listMigratableLibraryEntries(db, 'source-provider');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.canonicalTitle).toBe('Naruto');
    expect(entries[0]?.isDefaultProvider).toBe(true);
  });

  it('previews and applies a provider migration', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'One Piece',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'op-old',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lib = await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);
    if (!lib.ok) return;

    await setLibraryEntryActiveProviderMapping(db, lib.value, created.value.mappingId);

    const preview = await previewProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [
        {
          mangaId: created.value.mangaId,
          targetProviderMangaId: 'op-new',
        },
      ],
    });

    expect(preview.canApply).toBe(true);
    expect(preview.items[0]?.willAddMapping).toBe(true);
    expect(preview.items[0]?.willUpdateDefault).toBe(true);
    expect(preview.items[0]?.willUpdateActive).toBe(true);

    const applied = await applyProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [
        {
          mangaId: created.value.mangaId,
          targetProviderMangaId: 'op-new',
        },
      ],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.applied).toHaveLength(1);

    const identity = await getMangaIdentity(db, created.value.mangaId);
    expect(identity?.providerMappings.some((m) => m.providerId === 'prov-new')).toBe(true);

    const history = await findMigrationHistoryByProviders(db, {
      sourceProviderId: 'prov-old',
      sourceProviderMangaId: 'op-old',
      targetProviderId: 'prov-new',
      targetProviderMangaId: 'op-new',
    });
    expect(history).toBeDefined();
  });

  it('blocks migration when target remote id belongs to another title', async () => {
    const { db } = await createSqlJsHarness();

    const source = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Title A',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'a-old',
    });
    const targetOwner = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Title B',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-new',
      providerMangaId: 'shared-remote',
    });
    expect(source.ok && targetOwner.ok).toBe(true);
    if (!source.ok || !targetOwner.ok) return;

    await addLibraryEntry(db, { mangaId: source.value.mangaId, status: 'reading' });

    const preview = await previewProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [
        {
          mangaId: source.value.mangaId,
          targetProviderMangaId: 'shared-remote',
        },
      ],
    });

    expect(preview.canApply).toBe(false);
    expect(preview.items[0]?.blocked).toBe(true);
  });
});
