import { z } from 'zod';
import { LIBRARY_PAGE_MAX } from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import type { ProcedureName } from '../procedure-names.js';
import * as sources from '../procedure-sources.js';
import { CHAPTER_WINDOW_MAX } from '../repositories/chapters.js';
import { DOWNLOAD_STATUSES } from '../repositories/downloads.js';

// The host's trust boundary (ADR 0001, decision 5): every call's arguments are checked against
// the shape the repository's TypeScript signature promises before it runs. Domain rules stay in
// the repositories, which already answer an invalid value with an `AppResult` error; these
// schemas refuse only what the signature itself rules out.

const text = z.string();
const id = z.string();
const ids = z.array(id);
const count = z.number();
const flag = z.boolean();
const record = z.record(z.string(), z.unknown());
/** Objects a repository validates itself (settings, themes, manifests): shape only. */
const object = z.object({}).loose();

const libraryStatus = z.enum(['reading', 'completed', 'on_hold', 'dropped', 'planned']);
const logLevel = z.enum(['info', 'warn', 'error']);
const mangaStatus = z.enum(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']);
const contentRating = z.enum(['unknown', 'safe', 'suggestive', 'mature', 'explicit']);
const extensionHealth = z.enum(['ok', 'degraded', 'broken', 'unknown']);
const downloadStatus = z.enum(DOWNLOAD_STATUSES);

const downloadWrite = z.object({
  chapterId: id,
  mangaId: id,
  providerId: text,
  status: downloadStatus,
  pageCount: count.optional(),
  completedPages: count.optional(),
  failedPageIndexes: z.array(count).optional(),
  attempts: count.optional(),
  lastErrorCode: text.nullable().optional(),
  startedAt: text.nullable().optional(),
  completedAt: text.nullable().optional(),
});

const downloadPatch = z.object({
  status: downloadStatus.optional(),
  pageCount: count.optional(),
  completedPages: count.optional(),
  failedPageIndexes: z.array(count).optional(),
  attempts: count.optional(),
  lastErrorCode: text.nullable().optional(),
  startedAt: text.nullable().optional(),
  completedAt: text.nullable().optional(),
});

const libraryEntry = z
  .object({
    id,
    mangaId: id,
    favorite: flag,
    categoryIds: ids,
    status: libraryStatus,
    unreadCount: count,
    lastReadChapterId: id.optional(),
    activeProviderMappingId: id.optional(),
    progressPercent: count.optional(),
    notes: text.optional(),
    addedAt: text.optional(),
    updatedAt: text.optional(),
  })
  .loose();

const libraryQuery = z.object({
  filter: z
    .object({
      query: text.optional(),
      categoryIds: ids.optional(),
      statuses: z.array(libraryStatus).optional(),
      favoritesOnly: flag.optional(),
      providerIds: ids.optional(),
    })
    .optional(),
  sort: z
    .object({
      key: z.enum([
        'title',
        'last_read',
        'last_updated',
        'date_added',
        'unread',
        'provider',
        'progress',
      ]),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
});

const chapterMetadata = z
  .object({
    chapterId: id.optional(),
    mangaId: id,
    providerMappingId: id,
    providerId: text.optional(),
    providerChapterId: text.optional(),
    title: text,
    index: count,
    volume: text.optional(),
    publishedAt: text.optional(),
  })
  .loose();

const chapterPage = z
  .object({
    id,
    index: count,
    image: z
      .object({
        url: text,
        width: count.optional(),
        height: count.optional(),
        bytes: count.optional(),
        mimeType: text.optional(),
      })
      .loose(),
    loadFailed: flag.optional(),
    retryCount: count.optional(),
    lastErrorCode: text.optional(),
  })
  .loose();

const chapterReadState = z
  .object({
    chapterId: id,
    mangaId: id,
    providerMappingId: id.optional(),
    progress: z
      .object({
        readPercent: count,
        lastPageIndex: count,
        completed: flag,
        startedAt: text.optional(),
        updatedAt: text.optional(),
      })
      .loose(),
  })
  .loose();

const mangaIdentity = z
  .object({
    id,
    canonicalTitle: text,
    alternativeTitles: z.array(object),
    authors: z.array(object),
    artists: z.array(object),
    tags: z.array(object),
    status: mangaStatus,
    contentRating,
    providerMappings: z.array(object),
    defaultProviderMappingId: id,
    merged: flag,
  })
  .loose();

const extensionInstall = z
  .object({
    id,
    manifest: object,
    sourceUrl: text,
    installedVersion: text,
    enabled: flag,
    installedAt: text,
    state: z.enum(['pending', 'installing', 'installed', 'disabled', 'failed', 'uninstalled']),
    health: extensionHealth,
    warnings: z.array(object),
  })
  .loose();

const migrationRequest = z.object({
  sourceProviderId: text,
  targetProviderId: text,
  selections: z.array(
    z.object({
      mangaId: id,
      targetProviderMangaId: text,
      targetProviderTitle: text.optional(),
    }),
  ),
});

const providerPair = {
  sourceProviderId: text,
  sourceProviderMangaId: text,
  targetProviderId: text,
  targetProviderMangaId: text,
};

const categoryInput = z.object({ name: text, color: text.optional() });

/** Arguments after `db`, as a tuple; a trailing optional parameter may be left out. */
export const PROCEDURE_INPUTS: { readonly [K in ProcedureName]: z.ZodType<readonly unknown[]> } = {
  // backup
  exportBackupDocumentV1: z.tuple([
    z.object({ createdAt: text, appVersion: text, deviceName: text.optional() }),
  ]),
  applyBackupRestore: z.tuple([z.unknown()]),
  previewBackupRestore: z.tuple([z.unknown()]),

  // provider migration
  listMigratableLibraryEntries: z.tuple([text]),
  previewProviderMigration: z.tuple([migrationRequest]),
  applyProviderMigration: z.tuple([migrationRequest]),
  rollbackProviderMigration: z.tuple([z.object({ batchId: text })]),

  // cache
  upsertCacheEntry: z.tuple([
    z.object({
      id: id.optional(),
      providerId: text,
      mangaId: text,
      chapterId: text.optional(),
      cacheKind: text,
      sourceUrl: text.optional(),
      mimeType: text.optional(),
      byteSize: count.optional(),
      blobKey: text.optional(),
      metadata: record.nullable().optional(),
    }),
  ]),
  touchCacheEntry: z.tuple([id]),
  getCacheEntryById: z.tuple([id]),
  getCacheEntryByKey: z.tuple([
    z.object({
      providerId: text,
      mangaId: text,
      cacheKind: text,
      chapterId: text.optional(),
    }),
  ]),
  listCacheEntriesForManga: z.tuple([text, text]),
  listCacheEntriesByKind: z.tuple([text]),
  rewriteCacheBlobKeys: z.tuple([z.array(z.object({ id: text, blobKey: text })).max(200_000)]),
  deleteCacheEntry: z.tuple([id]),
  deleteCacheEntries: z.tuple([ids]),
  summarizeCacheStorage: z.tuple([]),
  listCacheBlobKeys: z.tuple([]),
  hasCacheBlobKey: z.tuple([text]),
  listAllCacheEntries: z.tuple([]),
  clearAllCacheEntries: z.tuple([]),

  // downloads
  upsertDownload: z.tuple([downloadWrite]),
  updateDownloadState: z.tuple([id, downloadPatch]),
  getDownload: z.tuple([id]),
  listDownloadsForManga: z.tuple([id]),
  listDownloads: z.tuple([]),
  listActiveDownloads: z.tuple([]),
  listDownloadDetails: z.tuple([]),
  removeDownload: z.tuple([id]),

  // chapters
  upsertChapterMetadata: z.tuple([chapterMetadata]),
  upsertChapterWithPages: z.tuple([chapterMetadata.extend({ pages: z.array(chapterPage) })]),
  listChapterHeadersForMapping: z.tuple([id]),
  getChapter: z.tuple([id]),
  listChaptersForManga: z.tuple([id]),
  getChapterProviderMappingId: z.tuple([id]),
  // A limit is required and bounded: the host refuses an unbounded chapter load.
  listChapterWindow: z.tuple([
    z.object({
      mangaId: id,
      limit: z.number().int().min(1).max(CHAPTER_WINDOW_MAX),
      afterIndex: count.optional(),
      exactIndex: count.optional(),
    }),
  ]),
  getChapterRows: z.tuple([ids.max(CHAPTER_WINDOW_MAX * 4)]),

  // diagnostics
  summarizeLocalDatabase: z.tuple([]),

  // extension logs
  appendExtensionLog: z.tuple([
    z.object({
      providerId: text,
      level: logLevel,
      code: text,
      message: text,
      details: record.optional(),
      createdAt: text.optional(),
    }),
  ]),
  listExtensionLogs: z.tuple([
    z
      .object({
        providerId: text.optional(),
        level: logLevel.optional(),
        codePrefix: text.optional(),
        limit: count.optional(),
      })
      .optional(),
  ]),
  clearExtensionLogs: z.tuple([text.optional()]),
  countExtensionLogs: z.tuple([
    z.object({ providerId: text.optional(), level: logLevel.optional() }).optional(),
  ]),

  // extensions
  listInstalledExtensions: z.tuple([]),
  upsertInstalledExtension: z.tuple([extensionInstall]),
  updateInstalledExtensionHealth: z.tuple([id, extensionHealth]),
  listExtensionRegistries: z.tuple([]),
  upsertExtensionRegistry: z.tuple([
    z.object({
      id: id.optional(),
      name: text,
      registryUrl: text,
      description: text.optional(),
    }),
  ]),
  deleteInstalledExtension: z.tuple([id]),

  // identities
  getMangaIdentities: z.tuple([ids]),
  getMangaIdentity: z.tuple([id]),
  createMangaIdentityWithInitialMapping: z.tuple([
    z.object({
      canonicalTitle: text,
      status: mangaStatus,
      contentRating,
      providerId: text,
      providerMangaId: text,
      language: text.optional(),
    }),
  ]),
  addProviderMapping: z.tuple([
    z.object({
      mangaId: id,
      providerId: text,
      providerMangaId: text,
      providerTitle: text.optional(),
      providerUrl: text.optional(),
    }),
  ]),
  setDefaultProviderMapping: z.tuple([id, id]),
  setPreferredChapterSource: z.tuple([id, id.optional()]),
  setMangaCoverOverride: z.tuple([id, text.optional()]),
  markIdentityMerged: z.tuple([id, ids]),
  clearIdentityMergeMetadata: z.tuple([id]),
  listMangaIdentities: z.tuple([]),
  upsertMangaIdentity: z.tuple([mangaIdentity]),

  // identity merge
  listIdentityMatchProfiles: z.tuple([]),
  previewMergeMangaIdentities: z.tuple([id, id]),
  mergeMangaIdentities: z.tuple([z.object({ targetId: id, sourceId: id })]),
  previewUnmergeProviderMapping: z.tuple([id, id]),
  unmergeProviderMapping: z.tuple([z.object({ mangaId: id, mappingId: id })]),

  // library activity
  getLibraryChapterStats: z.tuple([z.array(libraryEntry)]),
  recomputeLibraryUnreadCounts: z.tuple([z.array(libraryEntry)]),
  getLibraryEntryUnreadCount: z.tuple([libraryEntry]),

  // library
  toLibraryEntry: z.tuple([z.object({ id, mangaId: id }).loose()]),
  listLibraryCategories: z.tuple([]),
  listLibraryEntries: z.tuple([libraryQuery.optional()]),
  // Both overview shelves are top-N queries; the host never reads the whole library for them.
  listLibraryContinueReading: z.tuple([
    z.object({ filter: libraryQuery.shape.filter, limit: z.number().int().min(0) }),
  ]),
  listLibraryRecentlyUpdated: z.tuple([
    z.object({ filter: libraryQuery.shape.filter, limit: z.number().int().min(0) }),
  ]),
  // A page is required and bounded: the host refuses an unbounded library load from a window.
  listLibraryEntryPage: z.tuple([
    z.object({
      filter: libraryQuery.shape.filter,
      sort: libraryQuery.shape.sort,
      // Zero asks for the total alone; the maximum keeps one call from loading the library.
      limit: z.number().int().min(0).max(LIBRARY_PAGE_MAX),
      offset: z.number().int().min(0).optional(),
    }),
  ]),
  listRecentlyReadLibraryEntries: z.tuple([count]),
  listLibraryProviderIds: z.tuple([]),
  addLibraryEntry: z.tuple([z.object({ mangaId: id, status: libraryStatus, id: id.optional() })]),
  removeLibraryEntry: z.tuple([id]),
  setLibraryEntryFavorite: z.tuple([id, flag]),
  setLibraryEntryCategories: z.tuple([id, ids]),
  setLibraryEntryActiveProviderMapping: z.tuple([id, id.optional()]),
  createLibraryCategory: z.tuple([categoryInput]),
  updateLibraryCategory: z.tuple([id, categoryInput]),
  deleteLibraryCategory: z.tuple([id]),
  setLibraryCategoryPinned: z.tuple([id, flag]),
  reorderLibraryCategories: z.tuple([ids]),
  addLibraryEntriesToCategories: z.tuple([ids, ids]),
  removeLibraryEntriesFromCategories: z.tuple([ids, ids]),
  setLibraryEntriesStatus: z.tuple([ids, libraryStatus]),
  setLibraryEntriesFavorite: z.tuple([ids, flag]),
  getLibraryEntry: z.tuple([id]),
  getLibraryEntryForManga: z.tuple([id]),
  updateLibraryEntryReadingProgress: z.tuple([
    z.object({
      mangaId: id,
      chapterId: id,
      progressPercent: count,
      updatedAt: text.optional(),
    }),
  ]),

  // migration history
  recordMigrationHistory: z.tuple([
    z.object({
      mangaId: id,
      ...providerPair,
      batchId: text.optional(),
      previousDefaultMappingId: id.optional(),
      previousActiveMappingId: id.optional(),
      notes: text.optional(),
    }),
  ]),
  findMigrationHistoryByProviders: z.tuple([z.object(providerPair)]),
  listMigrationHistory: z.tuple([count.optional()]),
  listMigrationHistoryByBatch: z.tuple([text]),

  // progress ordering
  getChapterReadStateOrdering: z.tuple([id]),
  getLibraryResumeOrdering: z.tuple([id]),

  // read state
  upsertChapterReadState: z.tuple([chapterReadState]),
  refreshLibraryUnreadCount: z.tuple([id, id.optional()]),
  refreshLibraryUnreadCountForChapter: z.tuple([id]),
  setChapterCompleted: z.tuple([id, flag]),
  markPreviousChaptersCompleted: z.tuple([id]),
  getChapterReadState: z.tuple([id]),
  listChapterReadStates: z.tuple([]),
  listChapterReadStatesForManga: z.tuple([id]),
  appendReadingHistory: z.tuple([
    z.object({ mangaId: id, chapterId: id, providerMappingId: id.optional() }),
  ]),
  listRecentReadingHistory: z.tuple([count]),
  listReadingHistory: z.tuple([]),

  // search history
  appendSearchHistory: z.tuple([z.object({ query: text, providerId: text.optional() })]),
  listSearchHistory: z.tuple([count]),
  upsertSavedSearch: z.tuple([
    z.object({ id: id.optional(), name: text, query: text, filter: record.optional() }),
  ]),
  listSavedSearches: z.tuple([]),
  removeSavedSearch: z.tuple([id]),
  countSearchHistory: z.tuple([]),
  countSavedSearches: z.tuple([]),
  clearSearchHistory: z.tuple([]),

  // settings
  getTitleReaderSettings: z.tuple([id]),
  upsertTitleReaderSettings: z.tuple([id, object]),
  resetTitleReaderSettings: z.tuple([id]),
  getReaderSettings: z.tuple([]),
  upsertReaderSettings: z.tuple([object]),
  getThemeSettings: z.tuple([]),
  upsertThemeSettings: z.tuple([object]),
  getAppSettings: z.tuple([]),
  upsertAppSettings: z.tuple([object]),
  getAppSetting: z.tuple([text]),
  upsertAppSetting: z.tuple([text, z.unknown()]),
  deleteAppSetting: z.tuple([text]),
  getProviderSettingsRecord: z.tuple([text]),
  upsertProviderSettingsRecord: z.tuple([
    z.object({ providerId: text, label: text.optional(), settings: record }),
  ]),

  // themes
  listThemeDefinitions: z.tuple([]),
  getThemeDefinition: z.tuple([text]),
  upsertThemeDefinition: z.tuple([object]),
  deleteThemeDefinition: z.tuple([text]),
};

type Procedure = (db: AppDrizzleDb, ...args: readonly unknown[]) => Promise<unknown>;

export interface ProcedureSpec {
  readonly input: z.ZodType<readonly unknown[]>;
  readonly run: Procedure;
}

/** The procedures a window may call, by name. `withTransaction` is not one: it stays here. */
export const PROCEDURES: ReadonlyMap<string, ProcedureSpec> = new Map(
  (Object.keys(PROCEDURE_INPUTS) as ProcedureName[]).map((name) => [
    name,
    { input: PROCEDURE_INPUTS[name], run: sources[name] as unknown as Procedure },
  ]),
);
