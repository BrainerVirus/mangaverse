import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  addProviderMapping,
  createMangaIdentityWithInitialMapping,
  findMigrationHistoryByProviders,
  getLibraryEntryForManga,
  getMangaIdentity,
  listMigratableLibraryEntries,
  listMigrationHistory,
  previewProviderMigration,
  applyProviderMigration,
  rollbackProviderMigration,
  setLibraryEntryActiveProviderMapping,
  setDefaultProviderMapping,
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

describe('provider migration rollback', () => {
  async function migrateOneTitle() {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Berserk',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'berserk-old',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('identity was not created');

    const lib = await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);
    if (!lib.ok) throw new Error('library entry was not created');
    await setLibraryEntryActiveProviderMapping(db, lib.value, created.value.mappingId);

    const applied = await applyProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [{ mangaId: created.value.mangaId, targetProviderMangaId: 'berserk-new' }],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('migration did not apply');

    return {
      db,
      mangaId: created.value.mangaId,
      libraryEntryId: lib.value,
      batchId: applied.value.batchId,
    };
  }

  it('restores the default and active mapping of the last batch', async () => {
    const { db, mangaId, libraryEntryId, batchId } = await migrateOneTitle();

    const rolledBack = await rollbackProviderMigration(db, { batchId });

    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) return;
    expect(rolledBack.value.restored).toHaveLength(1);
    expect(rolledBack.value.alreadyRestored).toHaveLength(0);

    const identity = await getMangaIdentity(db, mangaId);
    const source = identity?.providerMappings.find((m) => m.providerId === 'prov-old');
    expect(identity?.defaultProviderMappingId).toBe(source?.id);
    // The added target mapping stays; undo never deletes mapping state.
    expect(identity?.providerMappings.some((m) => m.providerId === 'prov-new')).toBe(true);

    const { getLibraryEntry } = await import('../index.js');
    const entry = await getLibraryEntry(db, libraryEntryId);
    expect(entry?.activeProviderMappingId).toBe(source?.id);
  });

  it('restores the active mapping when the default already belonged to a third provider', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Vinland Saga',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'vinland-old',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lib = await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);
    if (!lib.ok) return;
    await setLibraryEntryActiveProviderMapping(db, lib.value, created.value.mappingId);

    const third = await addProviderMapping(db, {
      mangaId: created.value.mangaId,
      providerId: 'prov-third',
      providerMangaId: 'vinland-third',
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    await setDefaultProviderMapping(db, created.value.mangaId, third.value);

    const applied = await applyProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [{ mangaId: created.value.mangaId, targetProviderMangaId: 'vinland-new' }],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const rolledBack = await rollbackProviderMigration(db, { batchId: applied.value.batchId });
    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) return;
    expect(rolledBack.value.restored).toHaveLength(1);

    const identity = await getMangaIdentity(db, created.value.mangaId);
    const source = identity?.providerMappings.find((m) => m.providerId === 'prov-old');
    const entry = await getLibraryEntryForManga(db, created.value.mangaId);
    expect(identity?.defaultProviderMappingId).toBe(third.value);
    expect(entry?.activeProviderMappingId).toBe(source?.id);
  });

  it('restores the default when the title had no active mapping', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Vagabond',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'vagabond-old',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'planned' });

    const applied = await applyProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [{ mangaId: created.value.mangaId, targetProviderMangaId: 'vagabond-new' }],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const rolledBack = await rollbackProviderMigration(db, { batchId: applied.value.batchId });
    expect(rolledBack.ok).toBe(true);

    const identity = await getMangaIdentity(db, created.value.mangaId);
    const source = identity?.providerMappings.find((m) => m.providerId === 'prov-old');
    expect(identity?.defaultProviderMappingId).toBe(source?.id);
  });

  it('treats a batch that only gained a mapping as already restored', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'No-op Migration',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-old',
      providerMangaId: 'noop-old',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lib = await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);
    if (!lib.ok) return;

    const target = await addProviderMapping(db, {
      mangaId: created.value.mangaId,
      providerId: 'prov-new',
      providerMangaId: 'noop-new',
    });
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    await setDefaultProviderMapping(db, created.value.mangaId, target.value);
    await setLibraryEntryActiveProviderMapping(db, lib.value, target.value);

    const applied = await applyProviderMigration(db, {
      sourceProviderId: 'prov-old',
      targetProviderId: 'prov-new',
      selections: [{ mangaId: created.value.mangaId, targetProviderMangaId: 'noop-new' }],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const rolledBack = await rollbackProviderMigration(db, { batchId: applied.value.batchId });
    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) return;
    expect(rolledBack.value.restored).toHaveLength(0);
    expect(rolledBack.value.alreadyRestored).toHaveLength(1);
  });

  it('is idempotent when the same batch is undone twice', async () => {
    const { db, mangaId, batchId } = await migrateOneTitle();

    const first = await rollbackProviderMigration(db, { batchId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.restored).toHaveLength(1);

    const second = await rollbackProviderMigration(db, { batchId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.restored).toHaveLength(0);
    expect(second.value.alreadyRestored).toHaveLength(1);

    const identity = await getMangaIdentity(db, mangaId);
    const source = identity?.providerMappings.find((m) => m.providerId === 'prov-old');
    expect(identity?.defaultProviderMappingId).toBe(source?.id);
  });

  it('skips titles whose default provider changed after the migration', async () => {
    const { db, mangaId, batchId } = await migrateOneTitle();

    const third = await addProviderMapping(db, {
      mangaId,
      providerId: 'prov-third',
      providerMangaId: 'berserk-third',
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    const changed = await setDefaultProviderMapping(db, mangaId, third.value);
    expect(changed.ok).toBe(true);

    const rolledBack = await rollbackProviderMigration(db, { batchId });

    expect(rolledBack.ok).toBe(false);
    if (rolledBack.ok) return;
    expect(rolledBack.error.message).toContain('default provider changed');
  });

  it('skips titles whose active provider changed after the migration', async () => {
    const { db, mangaId, libraryEntryId, batchId } = await migrateOneTitle();

    const third = await addProviderMapping(db, {
      mangaId,
      providerId: 'prov-third',
      providerMangaId: 'berserk-third',
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    const changed = await setLibraryEntryActiveProviderMapping(db, libraryEntryId, third.value);
    expect(changed.ok).toBe(true);

    const rolledBack = await rollbackProviderMigration(db, { batchId });

    expect(rolledBack.ok).toBe(false);
    if (rolledBack.ok) return;
    expect(rolledBack.error.message).toContain('active provider changed');
  });

  it('reports a batch without migration history instead of replacing state', async () => {
    const { db } = await createSqlJsHarness();

    const rolledBack = await rollbackProviderMigration(db, { batchId: 'missing-batch' });

    expect(rolledBack.ok).toBe(false);
    if (rolledBack.ok) return;
    expect(rolledBack.error.message).toContain('migration history');
  });

  it('lists the latest migrations first with a readable title', async () => {
    const { db } = await migrateOneTitle();
    const history = await listMigrationHistory(db);
    expect(history).toHaveLength(1);
    expect(history[0]?.targetProviderId).toBe('prov-new');
    expect(history[0]?.mangaId).toBeTypeOf('string');
    expect(history[0]?.canonicalTitle).toBe('Berserk');
    expect(history[0]?.batchId).toBeTypeOf('string');
  });
});
