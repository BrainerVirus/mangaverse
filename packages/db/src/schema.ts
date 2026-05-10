import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Single global reader settings row. */
export const readerPreferences = sqliteTable('reader_preferences', {
  id: text('id').primaryKey(),
  settingsJson: text('settings_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: text('updated_at'),
});

export const themePreferences = sqliteTable('theme_preferences', {
  id: text('id').primaryKey(),
  presetId: text('preset_id').notNull(),
  dark: integer('dark', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at'),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json', { mode: 'json' }).notNull().$type<unknown>(),
  updatedAt: text('updated_at'),
});

export const providerSettings = sqliteTable('provider_settings', {
  providerId: text('provider_id').primaryKey(),
  label: text('label'),
  settingsJson: text('settings_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: text('updated_at'),
});

export const mangaIdentities = sqliteTable(
  'manga_identities',
  {
    id: text('id').primaryKey(),
    canonicalTitle: text('canonical_title').notNull(),
    status: text('status').notNull(),
    contentRating: text('content_rating').notNull(),
    language: text('language'),
    description: text('description'),
    coverImageUrl: text('cover_image_url'),
    merged: integer('merged', { mode: 'boolean' }).notNull().default(false),
    mergedFromIdsJson: text('merged_from_ids_json', { mode: 'json' }).$type<string[] | null>(),
    userOverridesJson: text('user_overrides_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    defaultProviderMappingId: text('default_provider_mapping_id').notNull(),
    preferredChapterSourceId: text('preferred_chapter_source_id'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [index('manga_identities_default_mapping_idx').on(t.defaultProviderMappingId)],
);

export const mangaProviderMappings = sqliteTable(
  'manga_provider_mappings',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    providerId: text('provider_id').notNull(),
    providerMangaId: text('provider_manga_id').notNull(),
    providerTitle: text('provider_title'),
    providerUrl: text('provider_url'),
    lastSyncedAt: text('last_synced_at'),
  },
  (t) => [
    uniqueIndex('manga_provider_mappings_provider_remote_uidx').on(t.providerId, t.providerMangaId),
    index('manga_provider_mappings_manga_idx').on(t.mangaId),
  ],
);

export const mangaTitles = sqliteTable(
  'manga_titles',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale'),
    value: text('value').notNull(),
  },
  (t) => [index('manga_titles_manga_idx').on(t.mangaId)],
);

export const mangaPeople = sqliteTable(
  'manga_people',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    kind: text('kind').notNull(),
  },
  (t) => [index('manga_people_manga_idx').on(t.mangaId)],
);

export const mangaTags = sqliteTable('manga_tags', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  namespace: text('namespace'),
});

export const mangaTagMemberships = sqliteTable(
  'manga_tag_memberships',
  {
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => mangaTags.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mangaId, t.tagId] })],
);

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  sortIndex: integer('sort_index'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const libraryEntries = sqliteTable(
  'library_entries',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull(),
    unreadCount: integer('unread_count').notNull().default(0),
    lastReadChapterId: text('last_read_chapter_id'),
    activeProviderMappingId: text('active_provider_mapping_id'),
    progressPercent: real('progress_percent'),
    notes: text('notes'),
    addedAt: text('added_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [index('library_entries_manga_idx').on(t.mangaId)],
);

export const libraryCategoryMemberships = sqliteTable(
  'library_category_memberships',
  {
    libraryEntryId: text('library_entry_id')
      .notNull()
      .references(() => libraryEntries.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.libraryEntryId, t.categoryId] }),
    index('library_category_memberships_category_entry_idx').on(t.categoryId, t.libraryEntryId),
  ],
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    providerMappingId: text('provider_mapping_id')
      .notNull()
      .references(() => mangaProviderMappings.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    providerId: text('provider_id'),
    providerChapterId: text('provider_chapter_id'),
    title: text('title').notNull(),
    chapterIndex: integer('chapter_index').notNull(),
    volume: text('volume'),
    publishedAt: text('published_at'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [
    uniqueIndex('chapters_mapping_index_uidx').on(t.providerMappingId, t.chapterIndex),
    index('chapters_manga_idx').on(t.mangaId),
  ],
);

export const chapterPages = sqliteTable(
  'chapter_pages',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    pageIndex: integer('page_index').notNull(),
    imageUrl: text('image_url').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    mimeType: text('mime_type'),
    loadFailed: integer('load_failed', { mode: 'boolean' }),
    retryCount: integer('retry_count'),
    lastErrorCode: text('last_error_code'),
  },
  (t) => [index('chapter_pages_chapter_idx').on(t.chapterId)],
);

export const chapterReadState = sqliteTable(
  'chapter_read_state',
  {
    chapterId: text('chapter_id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    providerMappingId: text('provider_mapping_id'),
    readPercent: real('read_percent').notNull(),
    lastPageIndex: integer('last_page_index').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull(),
    startedAt: text('started_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [index('chapter_read_state_manga_chapter_idx').on(t.mangaId, t.chapterId)],
);

export const readingHistory = sqliteTable(
  'reading_history',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    chapterId: text('chapter_id').notNull(),
    readAt: text('read_at').notNull(),
    providerMappingId: text('provider_mapping_id'),
  },
  (t) => [index('reading_history_read_at_idx').on(t.readAt)],
);

export const extensionRegistries = sqliteTable('extension_registries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  registryUrl: text('registry_url').notNull(),
  description: text('description'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const installedExtensions = sqliteTable('installed_extensions', {
  id: text('id').primaryKey(),
  manifestJson: text('manifest_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  sourceUrl: text('source_url').notNull(),
  registryUrl: text('registry_url'),
  checksum: text('checksum'),
  installedVersion: text('installed_version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  installedAt: text('installed_at').notNull(),
  updatedAt: text('updated_at'),
  state: text('state').notNull(),
  health: text('health').notNull(),
  warningsJson: text('warnings_json', { mode: 'json' }).notNull().$type<unknown[]>(),
});

export const migrationJobs = sqliteTable('migration_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  payloadJson: text('payload_json', { mode: 'json' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const migrationHistory = sqliteTable(
  'migration_history',
  {
    id: text('id').primaryKey(),
    sourceProviderId: text('source_provider_id').notNull(),
    sourceProviderMangaId: text('source_provider_manga_id').notNull(),
    targetProviderId: text('target_provider_id').notNull(),
    targetProviderMangaId: text('target_provider_manga_id').notNull(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    completedAt: text('completed_at').notNull(),
    notes: text('notes'),
  },
  (t) => [
    index('migration_history_providers_idx').on(
      t.sourceProviderId,
      t.sourceProviderMangaId,
      t.targetProviderId,
      t.targetProviderMangaId,
    ),
  ],
);

export const trackingLinks = sqliteTable(
  'tracking_links',
  {
    id: text('id').primaryKey(),
    mangaId: text('manga_id')
      .notNull()
      .references(() => mangaIdentities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    service: text('service').notNull(),
    externalId: text('external_id').notNull(),
    externalUrl: text('external_url'),
    lastSyncedAt: text('last_synced_at'),
  },
  (t) => [index('tracking_links_manga_idx').on(t.mangaId)],
);

export const searchHistory = sqliteTable(
  'search_history',
  {
    id: text('id').primaryKey(),
    query: text('query').notNull(),
    searchedAt: text('searched_at').notNull(),
    providerId: text('provider_id'),
  },
  (t) => [index('search_history_query_time_idx').on(t.query, t.searchedAt)],
);

export const savedSearches = sqliteTable('saved_searches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  query: text('query').notNull(),
  filterJson: text('filter_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at'),
});

export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    mangaId: text('manga_id').notNull(),
    chapterId: text('chapter_id'),
    cacheKind: text('cache_kind').notNull(),
    lastAccessAt: text('last_access_at').notNull(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index('cache_entries_provider_manga_chapter_access_idx').on(
      t.providerId,
      t.mangaId,
      t.chapterId,
      t.lastAccessAt,
    ),
  ],
);

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  valueJson: text('value_json', { mode: 'json' }).notNull().$type<unknown>(),
  updatedAt: text('updated_at'),
});

export const schema = {
  readerPreferences,
  themePreferences,
  appSettings,
  providerSettings,
  mangaIdentities,
  mangaProviderMappings,
  mangaTitles,
  mangaPeople,
  mangaTags,
  mangaTagMemberships,
  categories,
  libraryEntries,
  libraryCategoryMemberships,
  chapters,
  chapterPages,
  chapterReadState,
  readingHistory,
  extensionRegistries,
  installedExtensions,
  migrationJobs,
  migrationHistory,
  trackingLinks,
  searchHistory,
  savedSearches,
  cacheEntries,
  syncState,
};

export type AppSchema = typeof schema;
