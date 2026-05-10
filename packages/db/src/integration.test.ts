import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  BACKUP_SCHEMA_VERSION,
  getDefaultReaderSettings,
  validateBackupDocument,
  toChapterPageId,
  toProviderId,
  toExtensionInstallId,
  type ExtensionInstallMetadata,
  type MangaId,
} from '@app/shared';
import {
  PACKAGE_NAME,
  addLibraryEntry,
  addProviderMapping,
  appendReadingHistory,
  appendSearchHistory,
  createMangaIdentityWithInitialMapping,
  exportBackupDocumentV1,
  getMangaIdentity,
  getReaderSettings,
  listLibraryEntries,
  listRecentReadingHistory,
  migrateDatabaseToLatest,
  previewBackupRestore,
  setLibraryEntryActiveProviderMapping,
  upsertChapterReadState,
  upsertChapterWithPages,
  upsertInstalledExtension,
  withTransaction,
} from './index.js';
import { createSqlJsHarness } from './testing/sqljs-harness.js';
import { libraryEntries, readerPreferences } from './schema.js';

describe('@app/db', () => {
  it('exports PACKAGE_NAME', () => {
    expect(PACKAGE_NAME).toBe('@app/db');
  });

  it('applies migrations idempotently on sql.js', async () => {
    const { raw, db } = await createSqlJsHarness();
    expect(db).toBeDefined();
    migrateDatabaseToLatest(raw);
    migrateDatabaseToLatest(raw);
    const tables = raw.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='manga_identities'",
    );
    expect(tables.length).toBeGreaterThan(0);
  });

  it('creates identity, library entry, chapter progress, and exports a valid backup', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Test Manga',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-a',
      providerMangaId: 'remote-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { mangaId, mappingId } = created.value;

    const lib = await addLibraryEntry(db, { mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);

    const chapterId = await upsertChapterWithPages(db, {
      mangaId,
      providerMappingId: mappingId,
      providerId: toProviderId('prov-a'),
      providerChapterId: 'ch-remote-1',
      title: 'Chapter 1',
      index: 1,
      pages: [
        {
          id: toChapterPageId(crypto.randomUUID()),
          index: 0,
          image: { url: 'https://example.com/1.png' },
        },
      ],
    });
    expect(chapterId.ok).toBe(true);
    if (!chapterId.ok) return;

    const read = await upsertChapterReadState(db, {
      chapterId: chapterId.value,
      mangaId,
      progress: { readPercent: 50, lastPageIndex: 0, completed: false },
    });
    expect(read.ok).toBe(true);

    await appendReadingHistory(db, { mangaId, chapterId: chapterId.value, providerMappingId: mappingId });

    const history = await listRecentReadingHistory(db, 5);
    expect(history.length).toBe(1);

    await appendSearchHistory(db, { query: 'naruto', providerId: 'prov-a' });

    const manifest = {
      id: toProviderId('prov-a'),
      name: 'Provider A',
      version: '1.0.0',
      source: { url: 'https://example.com/src' },
      compatibility: { platforms: ['web'] as const },
      capabilities: { 'discovery.search': true },
      permissions: ['network.http' as const],
      languages: ['en'],
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    };

    const extMeta: ExtensionInstallMetadata = {
      id: toExtensionInstallId('ext-1'),
      manifest,
      sourceUrl: 'https://example.com/ext',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: new Date().toISOString(),
      state: 'installed',
      health: 'ok',
      warnings: [],
    };
    const extUpsert = await upsertInstalledExtension(db, extMeta);
    expect(extUpsert.ok).toBe(true);

    const doc = await exportBackupDocumentV1(db, {
      createdAt: new Date().toISOString(),
      appVersion: '0.0.0-test',
    });
    expect(doc.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    const validated = validateBackupDocument(doc);
    expect(validated.ok).toBe(true);

    const preview = await previewBackupRestore(db, doc);
    expect(preview.backupOk).toBe(true);
  });

  it('runs synchronous writes inside withTransaction', async () => {
    const { db } = await createSqlJsHarness();
    const now = new Date().toISOString();
    const settings = getDefaultReaderSettings();
    withTransaction(db, (tx) => {
      tx.insert(readerPreferences)
        .values({
          id: 'global',
          settingsJson: settings as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: readerPreferences.id,
          set: {
            settingsJson: settings as unknown as Record<string, unknown>,
            updatedAt: now,
          },
        });
    });
    const loaded = await getReaderSettings(db);
    expect(loaded.readingMode).toBe(settings.readingMode);
  });

  it('rolls back writes when a synchronous error is thrown inside withTransaction', async () => {
    const { db } = await createSqlJsHarness();
    const now = new Date().toISOString();
    const settings = getDefaultReaderSettings();
    expect(() => {
      withTransaction(db, (tx) => {
        tx.insert(readerPreferences)
          .values({
            id: 'doomed',
            settingsJson: settings as unknown as Record<string, unknown>,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: readerPreferences.id,
            set: {
              settingsJson: settings as unknown as Record<string, unknown>,
              updatedAt: now,
            },
          });
        throw new Error('abort transaction');
      });
    }).toThrow('abort transaction');

    const row = await db
      .select({ id: readerPreferences.id })
      .from(readerPreferences)
      .where(eq(readerPreferences.id, 'doomed'))
      .get();
    expect(row).toBeUndefined();
  });

  it('reports duplicate remote mappings in restore preview', async () => {
    const { db } = await createSqlJsHarness();
    const doc = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      metadata: { createdAt: new Date().toISOString(), appVersion: 't' },
      library: [],
      mangaIdentities: [
        {
          id: 'm1',
          canonicalTitle: 'A',
          alternativeTitles: [],
          authors: [],
          artists: [],
          tags: [],
          status: 'unknown',
          contentRating: 'unknown',
          providerMappings: [
            {
              id: 'map1',
              providerId: 'p',
              providerMangaId: 'same',
            },
            {
              id: 'map2',
              providerId: 'p',
              providerMangaId: 'same',
            },
          ],
          defaultProviderMappingId: 'map1',
          merged: false,
        },
      ],
      installedExtensions: [],
      readerSettings: getDefaultReaderSettings(),
      providerSettings: { providerSnapshots: [] },
      themeSettings: { presetId: 'default', dark: false },
    };
    const preview = await previewBackupRestore(db, doc);
    expect(preview.backupOk).toBe(true);
    expect(preview.previewIssues.some((i) => i.code === 'restore.duplicate_remote_mapping')).toBe(true);
  });

  it('loads a round-tripped identity', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Roundtrip',
      status: 'completed',
      contentRating: 'safe',
      providerId: 'prov-b',
      providerMangaId: 'remote-b',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const identity = await getMangaIdentity(db, created.value.mangaId);
    expect(identity?.canonicalTitle).toBe('Roundtrip');
    const entries = await listLibraryEntries(db);
    expect(entries.length).toBe(0);
  });

  it('rejects setting active mapping from a different manga', async () => {
    const { db } = await createSqlJsHarness();
    const a = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Manga A',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-x',
      providerMangaId: 'remote-x',
    });
    const b = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Manga B',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-y',
      providerMangaId: 'remote-y',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const lib = await addLibraryEntry(db, { mangaId: a.value.mangaId, status: 'reading' });
    expect(lib.ok).toBe(true);
    if (!lib.ok) return;

    const result = await setLibraryEntryActiveProviderMapping(db, lib.value, b.value.mappingId);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('db.library.mapping_wrong_manga');
  });

  it('rejects chapter upsert when mapping does not belong to the manga', async () => {
    const { db } = await createSqlJsHarness();
    const a = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Manga A',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-x',
      providerMangaId: 'remote-x',
    });
    const b = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Manga B',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-y',
      providerMangaId: 'remote-y',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const result = await upsertChapterWithPages(db, {
      mangaId: a.value.mangaId,
      providerMappingId: b.value.mappingId,
      title: 'Bad Chapter',
      index: 1,
      pages: [],
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('db.chapters.mapping_wrong_manga');
  });

  it('rejects read state when chapter and manga do not match', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Manga',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-x',
      providerMangaId: 'remote-x',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const ch = await upsertChapterWithPages(db, {
      mangaId: created.value.mangaId,
      providerMappingId: created.value.mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });
    expect(ch.ok).toBe(true);
    if (!ch.ok) return;

    const result = await upsertChapterReadState(db, {
      chapterId: ch.value,
      mangaId: 'wrong-manga-id' as MangaId,
      progress: { readPercent: 0, lastPageIndex: 0, completed: false },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('db.read_state.manga_chapter_mismatch');
  });

  it('reports remote mapping collisions with current database', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Existing Manga',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'prov-col',
      providerMangaId: 'collision-id',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const doc = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      metadata: { createdAt: new Date().toISOString(), appVersion: 't' },
      library: [],
      mangaIdentities: [
        {
          id: 'other-manga',
          canonicalTitle: 'Other Manga',
          alternativeTitles: [],
          authors: [],
          artists: [],
          tags: [],
          status: 'unknown',
          contentRating: 'unknown',
          providerMappings: [
            {
              id: 'map-col',
              providerId: 'prov-col',
              providerMangaId: 'collision-id',
            },
          ],
          defaultProviderMappingId: 'map-col',
          merged: false,
        },
      ],
      installedExtensions: [],
      readerSettings: getDefaultReaderSettings(),
      providerSettings: { providerSnapshots: [] },
      themeSettings: { presetId: 'default', dark: false },
    };
    const preview = await previewBackupRestore(db, doc);
    expect(preview.backupOk).toBe(true);
    expect(preview.previewIssues.some((i) => i.code === 'restore.remote_collision_with_db')).toBe(true);
  });

  it('enforces foreign keys on invalid references', async () => {
    const { db } = await createSqlJsHarness();
    await expect(
      db.insert(libraryEntries).values({
        id: 'bad-entry',
        mangaId: 'nonexistent-manga',
        favorite: false,
        status: 'reading',
        unreadCount: 0,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();
  });
});
