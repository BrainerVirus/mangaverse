import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  compareLibraryCategories,
  createAppError,
  err,
  ok,
  toCategoryId,
  toChapterId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
  type CategoryId,
  type ChapterId,
  type LibraryCategory,
  type LibraryEntry,
  type LibraryEntryId,
  type LibraryFilter,
  type LibrarySort,
  type LibrarySortKey,
  type LibraryStatus,
  type MangaId,
  type ProviderId,
  type ProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { readIdChunks } from '../read-id-chunks.js';
import { withTransaction } from '../transactions.js';
import {
  categories,
  chapterReadState,
  libraryCategoryMemberships,
  libraryEntries,
  mangaIdentities,
  mangaProviderMappings,
} from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

async function categoryIdsForEntry(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
): Promise<CategoryId[]> {
  const rows = db
    .select({ categoryId: libraryCategoryMemberships.categoryId })
    .from(libraryCategoryMemberships)
    .where(eq(libraryCategoryMemberships.libraryEntryId, entryId))
    .all();
  return rows.map((r) => toCategoryId(r.categoryId));
}

function mapLibraryEntry(
  row: typeof libraryEntries.$inferSelect,
  categoryIds: readonly CategoryId[],
): LibraryEntry {
  return {
    id: toLibraryEntryId(row.id),
    mangaId: toMangaId(row.mangaId),
    favorite: row.favorite,
    categoryIds: [...categoryIds],
    status: row.status as LibraryEntry['status'],
    unreadCount: row.unreadCount,
    ...(row.lastReadChapterId !== null &&
    row.lastReadChapterId !== undefined &&
    row.lastReadChapterId !== ''
      ? { lastReadChapterId: toChapterId(row.lastReadChapterId) }
      : {}),
    ...(row.activeProviderMappingId !== null &&
    row.activeProviderMappingId !== undefined &&
    row.activeProviderMappingId !== ''
      ? { activeProviderMappingId: toProviderMappingId(row.activeProviderMappingId) }
      : {}),
    ...(row.progressPercent !== null && row.progressPercent !== undefined
      ? { progressPercent: row.progressPercent }
      : {}),
    ...(row.notes !== null && row.notes !== undefined && row.notes !== ''
      ? { notes: row.notes }
      : {}),
    ...(row.addedAt !== null && row.addedAt !== undefined && row.addedAt !== ''
      ? { addedAt: row.addedAt }
      : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
      ? { updatedAt: row.updatedAt }
      : {}),
  };
}

export async function toLibraryEntry(
  db: AppDrizzleDb,
  row: typeof libraryEntries.$inferSelect,
): Promise<LibraryEntry> {
  const categoryIds = await categoryIdsForEntry(db, toLibraryEntryId(row.id));
  return mapLibraryEntry(row, categoryIds);
}

/** One membership read per chunk instead of one per entry. */
function categoryIdsByEntry(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
): Map<string, CategoryId[]> {
  const grouped = new Map<string, CategoryId[]>();
  if (entryIds.length === 0) return grouped;

  const rows = readIdChunks(entryIds, (chunk) =>
    db
      .select({
        libraryEntryId: libraryCategoryMemberships.libraryEntryId,
        categoryId: libraryCategoryMemberships.categoryId,
      })
      .from(libraryCategoryMemberships)
      .where(inArray(libraryCategoryMemberships.libraryEntryId, chunk))
      .all(),
  );

  for (const row of rows) {
    const list = grouped.get(row.libraryEntryId);
    const categoryId = toCategoryId(row.categoryId);
    if (list === undefined) grouped.set(row.libraryEntryId, [categoryId]);
    else list.push(categoryId);
  }
  return grouped;
}

function canonicalTitlesByMangaId(
  db: AppDrizzleDb,
  rows: readonly (typeof libraryEntries.$inferSelect)[],
): Map<string, string> {
  const titles = new Map<string, string>();
  if (rows.length === 0) return titles;
  const identities = readIdChunks(
    rows.map((row) => row.mangaId),
    (chunk) =>
      db
        .select({ id: mangaIdentities.id, canonicalTitle: mangaIdentities.canonicalTitle })
        .from(mangaIdentities)
        .where(inArray(mangaIdentities.id, chunk))
        .all(),
  );
  for (const identity of identities) titles.set(identity.id, identity.canonicalTitle);
  return titles;
}

function compareSortValues(a: string, b: string, direction: LibrarySort['direction']): number {
  // Empty timestamps sort last in both directions instead of posing as "the oldest".
  if (a === '' || b === '') {
    if (a === b) return 0;
    return a === '' ? 1 : -1;
  }
  return (direction === 'asc' ? 1 : -1) * a.localeCompare(b);
}

function compareSortNumbers(a: number, b: number, direction: LibrarySort['direction']): number {
  if (a === b) return 0;
  return (direction === 'asc' ? 1 : -1) * (a - b);
}

function compareOptionalSortNumbers(
  a: number | null,
  b: number | null,
  direction: LibrarySort['direction'],
): number {
  // No progress yet ranks last in both directions, like empty timestamps.
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  return compareSortNumbers(a, b, direction);
}

/**
 * The provider a title is filed under: the active mapping, then the manga's
 * default mapping, then any mapping. Missing providers sort last.
 */
function providerKeysByEntryId(
  db: AppDrizzleDb,
  rows: readonly (typeof libraryEntries.$inferSelect)[],
): Map<string, string> {
  const keys = new Map<string, string>();
  if (rows.length === 0) return keys;
  const mangaIds = rows.map((row) => row.mangaId);

  const defaultMappingByMangaId = new Map(
    readIdChunks(mangaIds, (chunk) =>
      db
        .select({
          id: mangaIdentities.id,
          defaultProviderMappingId: mangaIdentities.defaultProviderMappingId,
        })
        .from(mangaIdentities)
        .where(inArray(mangaIdentities.id, chunk))
        .all(),
    ).map((identity) => [identity.id, identity.defaultProviderMappingId]),
  );

  const providerByMappingId = new Map<string, string>();
  const firstProviderByMangaId = new Map<string, string>();
  for (const mapping of readIdChunks(mangaIds, (chunk) =>
    db
      .select({
        id: mangaProviderMappings.id,
        mangaId: mangaProviderMappings.mangaId,
        providerId: mangaProviderMappings.providerId,
      })
      .from(mangaProviderMappings)
      .where(inArray(mangaProviderMappings.mangaId, chunk))
      .all(),
  )) {
    providerByMappingId.set(mapping.id, mapping.providerId);
    if (!firstProviderByMangaId.has(mapping.mangaId)) {
      firstProviderByMangaId.set(mapping.mangaId, mapping.providerId);
    }
  }

  for (const row of rows) {
    const providerId =
      (row.activeProviderMappingId === null || row.activeProviderMappingId === undefined
        ? undefined
        : providerByMappingId.get(row.activeProviderMappingId)) ??
      providerByMappingId.get(defaultMappingByMangaId.get(row.mangaId) ?? '') ??
      firstProviderByMangaId.get(row.mangaId) ??
      '';
    keys.set(row.id, providerId);
  }
  return keys;
}

/**
 * Reading time per title comes from the chapter read state, one grouped query
 * for the whole library instead of one per entry. `library_entries.updated_at`
 * is only a fallback: favorites, status and category edits bump it too, so it
 * cannot rank "last read". The fallback still helps entries restored from a
 * backup that carried resume metadata but no read-state rows. Entries that were
 * never opened rank last.
 */
function lastReadAtByEntryId(
  db: AppDrizzleDb,
  rows: readonly (typeof libraryEntries.$inferSelect)[],
): Map<string, string> {
  const readAtByMangaId = new Map(
    readIdChunks(
      rows.map((row) => row.mangaId),
      (chunk) =>
        db
          .select({
            mangaId: chapterReadState.mangaId,
            lastReadAt: sql<string | null>`max(${chapterReadState.updatedAt})`,
          })
          .from(chapterReadState)
          .where(inArray(chapterReadState.mangaId, chunk))
          .groupBy(chapterReadState.mangaId)
          .all(),
    ).map((row) => [row.mangaId, row.lastReadAt ?? '']),
  );

  return new Map(
    rows.map((row) => {
      const readAt = readAtByMangaId.get(row.mangaId) ?? '';
      const hasResumeMetadata = row.lastReadChapterId !== null && row.lastReadChapterId !== '';
      const fallback = hasResumeMetadata ? (row.updatedAt ?? '') : '';
      return [row.id, readAt === '' ? fallback : readAt];
    }),
  );
}

function sortLibraryRows(
  db: AppDrizzleDb,
  rows: (typeof libraryEntries.$inferSelect)[],
  sort?: LibrarySort,
): LibraryEntry[] {
  const key: LibrarySortKey = sort?.key ?? 'date_added';
  const direction = sort?.direction ?? 'desc';
  const titles = key === 'title' ? canonicalTitlesByMangaId(db, rows) : new Map<string, string>();
  const providerKeys =
    key === 'provider' ? providerKeysByEntryId(db, rows) : new Map<string, string>();
  const lastReadAt =
    key === 'last_read' ? lastReadAtByEntryId(db, rows) : new Map<string, string>();

  const sorted = [...rows].sort((a, b) => {
    const byId = a.id.localeCompare(b.id);
    switch (key) {
      case 'title':
        return (
          compareSortValues(titles.get(a.mangaId) ?? '', titles.get(b.mangaId) ?? '', direction) ||
          byId
        );
      case 'date_added':
        return compareSortValues(a.addedAt ?? '', b.addedAt ?? '', direction) || byId;
      case 'last_updated':
        return compareSortValues(a.updatedAt ?? '', b.updatedAt ?? '', direction) || byId;
      case 'last_read':
        return (
          compareSortValues(lastReadAt.get(a.id) ?? '', lastReadAt.get(b.id) ?? '', direction) ||
          byId
        );
      case 'unread':
        return compareSortNumbers(a.unreadCount, b.unreadCount, direction) || byId;
      case 'progress':
        return compareOptionalSortNumbers(a.progressPercent, b.progressPercent, direction) || byId;
      case 'provider':
        return (
          compareSortValues(
            providerKeys.get(a.id) ?? '',
            providerKeys.get(b.id) ?? '',
            direction,
          ) || byId
        );
    }
    return 0;
  });

  const categoriesByEntry = categoryIdsByEntry(
    db,
    sorted.map((row) => toLibraryEntryId(row.id)),
  );
  return sorted.map((row) => mapLibraryEntry(row, categoriesByEntry.get(row.id) ?? []));
}

export async function listLibraryCategories(db: AppDrizzleDb): Promise<LibraryCategory[]> {
  const rows = db.select().from(categories).all();
  return rows
    .map((row) => ({
      id: toCategoryId(row.id),
      name: row.name,
      ...(row.color !== null && row.color !== undefined && row.color !== ''
        ? { color: row.color }
        : {}),
      ...(row.pinned ? { pinned: true } : {}),
      ...(row.sortIndex !== null && row.sortIndex !== undefined
        ? { sortIndex: row.sortIndex }
        : {}),
      ...(row.createdAt !== null && row.createdAt !== undefined && row.createdAt !== ''
        ? { createdAt: row.createdAt }
        : {}),
      ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
        ? { updatedAt: row.updatedAt }
        : {}),
    }))
    .sort(compareLibraryCategories);
}

function entriesInCategories(db: AppDrizzleDb, categoryIds: readonly CategoryId[]): Set<string> {
  const rows = readIdChunks(categoryIds, (chunk) =>
    db
      .select({ libraryEntryId: libraryCategoryMemberships.libraryEntryId })
      .from(libraryCategoryMemberships)
      .where(inArray(libraryCategoryMemberships.categoryId, chunk))
      .all(),
  );
  return new Set(rows.map((row) => row.libraryEntryId));
}

function mangaIdsForProviders(db: AppDrizzleDb, providerIds: readonly ProviderId[]): Set<string> {
  const rows = readIdChunks(providerIds, (chunk) =>
    db
      .select({ mangaId: mangaProviderMappings.mangaId })
      .from(mangaProviderMappings)
      .where(inArray(mangaProviderMappings.providerId, chunk))
      .all(),
  );
  return new Set(rows.map((row) => row.mangaId));
}

export async function listLibraryEntries(
  db: AppDrizzleDb,
  options?: { readonly filter?: LibraryFilter; readonly sort?: LibrarySort },
): Promise<LibraryEntry[]> {
  const filter = options?.filter;
  let rows: (typeof libraryEntries.$inferSelect)[] = db.select().from(libraryEntries).all();

  // Every filter narrows the same row set; they must combine instead of
  // replacing each other, which the old exclusive branches did.
  if (filter?.favoritesOnly === true) {
    rows = rows.filter((row) => row.favorite);
  }
  if (filter?.statuses !== undefined && filter.statuses.length > 0) {
    const statuses = filter.statuses;
    rows = rows.filter((row) => statuses.includes(row.status as LibraryStatus));
  }
  if (filter?.categoryIds !== undefined && filter.categoryIds.length > 0) {
    const entryIds = entriesInCategories(db, filter.categoryIds);
    rows = rows.filter((row) => entryIds.has(row.id));
  }
  if (filter?.providerIds !== undefined && filter.providerIds.length > 0) {
    const mangaIds = mangaIdsForProviders(db, filter.providerIds);
    rows = rows.filter((row) => mangaIds.has(row.mangaId));
  }

  return sortLibraryRows(db, rows, options?.sort);
}

/**
 * Recently read entries for resume surfaces, newest reading progress first.
 * `chapter_read_state.updated_at` is the progress event timestamp, so favorite,
 * status and mapping writes that bump `library_entries.updated_at` do not move
 * the list; entries without a read-state row fall back to the library timestamp.
 */
export async function listRecentlyReadLibraryEntries(
  db: AppDrizzleDb,
  limit: number,
): Promise<LibraryEntry[]> {
  if (limit <= 0) return [];

  const rows = db
    .select({ entry: libraryEntries })
    .from(libraryEntries)
    .leftJoin(chapterReadState, eq(chapterReadState.chapterId, libraryEntries.lastReadChapterId))
    .where(
      sql`${libraryEntries.lastReadChapterId} IS NOT NULL AND ${libraryEntries.lastReadChapterId} != ''`,
    )
    .orderBy(
      sql`COALESCE(NULLIF(${chapterReadState.updatedAt}, ''), NULLIF(${libraryEntries.updatedAt}, '')) DESC`,
    )
    .limit(limit)
    .all();

  const categoriesByEntry = categoryIdsByEntry(
    db,
    rows.map((row) => toLibraryEntryId(row.entry.id)),
  );
  return rows.map((row) => mapLibraryEntry(row.entry, categoriesByEntry.get(row.entry.id) ?? []));
}

export async function listLibraryProviderIds(db: AppDrizzleDb): Promise<ProviderId[]> {
  const rows = db
    .select({ providerId: mangaProviderMappings.providerId })
    .from(mangaProviderMappings)
    .innerJoin(libraryEntries, eq(libraryEntries.mangaId, mangaProviderMappings.mangaId))
    .all();
  return [...new Set(rows.map((row) => row.providerId))]
    .sort((a, b) => a.localeCompare(b))
    .map(toProviderId);
}

export async function addLibraryEntry(
  db: AppDrizzleDb,
  input: {
    readonly mangaId: MangaId;
    readonly status: LibraryEntry['status'];
    readonly id?: LibraryEntryId;
  },
): Promise<AppResult<LibraryEntryId>> {
  const manga = db
    .select({ id: mangaIdentities.id })
    .from(mangaIdentities)
    .where(eq(mangaIdentities.id, input.mangaId))
    .get();
  if (manga === undefined) {
    return err(
      createAppError({
        code: 'db.library.manga_missing',
        message: 'Manga identity does not exist.',
      }),
    );
  }

  const existing = db
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(eq(libraryEntries.mangaId, input.mangaId))
    .get();
  if (existing !== undefined) {
    return err(
      createAppError({ code: 'db.library.duplicate', message: 'Manga is already in the library.' }),
    );
  }

  const id = input.id ?? toLibraryEntryId(newId());
  const now = new Date().toISOString();
  try {
    await db.insert(libraryEntries).values({
      id,
      mangaId: input.mangaId,
      favorite: false,
      status: input.status,
      unreadCount: 0,
      addedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    // Another tab can win the pre-check above; the unique index rejects the
    // losing insert here. Map it to the same error as the pre-check.
    if (isUniqueMangaViolation(error)) {
      return err(
        createAppError({
          code: 'db.library.duplicate',
          message: 'Manga is already in the library.',
        }),
      );
    }
    throw error;
  }

  return ok(id);
}

function isUniqueMangaViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: library_entries.manga_id')
  );
}

export async function removeLibraryEntry(db: AppDrizzleDb, entryId: LibraryEntryId): Promise<void> {
  await db
    .delete(libraryCategoryMemberships)
    .where(eq(libraryCategoryMemberships.libraryEntryId, entryId));
  await db.delete(libraryEntries).where(eq(libraryEntries.id, entryId));
}

export async function setLibraryEntryFavorite(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
  favorite: boolean,
): Promise<AppResult<void>> {
  const entry = db
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(eq(libraryEntries.id, entryId))
    .get();
  if (entry === undefined) {
    return err(
      createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
    );
  }

  await db
    .update(libraryEntries)
    .set({ favorite, updatedAt: new Date().toISOString() })
    .where(eq(libraryEntries.id, entryId));

  return ok(undefined);
}

export async function setLibraryEntryCategories(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  const entry = db
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(eq(libraryEntries.id, entryId))
    .get();
  if (entry === undefined) {
    return err(
      createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
    );
  }

  if (categoryIds.length > 0) {
    const found = readIdChunks(categoryIds, (chunk) =>
      db.select({ id: categories.id }).from(categories).where(inArray(categories.id, chunk)).all(),
    );
    if (found.length !== categoryIds.length) {
      return err(
        createAppError({
          code: 'db.library.category_missing',
          message: 'One or more categories do not exist.',
        }),
      );
    }
  }

  await db
    .delete(libraryCategoryMemberships)
    .where(eq(libraryCategoryMemberships.libraryEntryId, entryId));
  if (categoryIds.length > 0) {
    readIdChunks(categoryIds, (chunk) => {
      db.insert(libraryCategoryMemberships)
        .values(chunk.map((categoryId) => ({ libraryEntryId: entryId, categoryId })))
        .run();
      return [];
    });
  }

  await db
    .update(libraryEntries)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(libraryEntries.id, entryId));
  return ok(undefined);
}

export async function setLibraryEntryActiveProviderMapping(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
  mappingId: ProviderMappingId | undefined,
): Promise<AppResult<void>> {
  const entry = db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId)).get();
  if (entry === undefined) {
    return err(
      createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
    );
  }

  if (mappingId !== undefined) {
    const mapping = db
      .select({ mangaId: mangaProviderMappings.mangaId })
      .from(mangaProviderMappings)
      .where(eq(mangaProviderMappings.id, mappingId))
      .get();
    if (mapping === undefined) {
      return err(
        createAppError({
          code: 'db.library.mapping_not_found',
          message: 'Provider mapping not found.',
        }),
      );
    }
    if (mapping.mangaId !== entry.mangaId) {
      return err(
        createAppError({
          code: 'db.library.mapping_wrong_manga',
          message: 'Provider mapping does not belong to this manga.',
        }),
      );
    }
  }

  await db
    .update(libraryEntries)
    .set({
      activeProviderMappingId: mappingId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(libraryEntries.id, entryId));

  return ok(undefined);
}

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function categoryNameConflict(db: AppDrizzleDb, name: string, exemptId?: CategoryId): boolean {
  const key = name.toLowerCase();
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .all()
    .some((row) => row.id !== exemptId && row.name.trim().toLowerCase() === key);
}

function categoryNameError(db: AppDrizzleDb, name: string, exemptId?: CategoryId) {
  if (name.length === 0) {
    return createAppError({
      code: 'db.library.category_name_empty',
      message: 'Category name cannot be empty.',
    });
  }
  if (categoryNameConflict(db, name, exemptId)) {
    return createAppError({
      code: 'db.library.category_name_duplicate',
      message: 'A category with this name already exists.',
    });
  }
  return undefined;
}

export async function createLibraryCategory(
  db: AppDrizzleDb,
  input: { readonly name: string; readonly color?: string },
): Promise<AppResult<CategoryId>> {
  const name = normalizeCategoryName(input.name);
  const nameError = categoryNameError(db, name);
  if (nameError !== undefined) return err(nameError);

  const rows = db.select({ sortIndex: categories.sortIndex }).from(categories).all();
  const nextIndex = rows.reduce((max, row) => Math.max(max, row.sortIndex ?? -1), -1) + 1;
  const id = toCategoryId(newId());
  const now = new Date().toISOString();
  await db.insert(categories).values({
    id,
    name,
    ...(input.color !== undefined && input.color.trim().length > 0
      ? { color: input.color.trim() }
      : {}),
    pinned: false,
    sortIndex: nextIndex,
    createdAt: now,
    updatedAt: now,
  });
  return ok(id);
}

export async function updateLibraryCategory(
  db: AppDrizzleDb,
  id: CategoryId,
  input: { readonly name: string; readonly color?: string },
): Promise<AppResult<void>> {
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (existing === undefined) {
    return err(
      createAppError({ code: 'db.library.category_missing', message: 'Category not found.' }),
    );
  }

  const name = normalizeCategoryName(input.name);
  const nameError = categoryNameError(db, name, id);
  if (nameError !== undefined) return err(nameError);

  await db
    .update(categories)
    .set({
      name,
      color: input.color !== undefined && input.color.trim().length > 0 ? input.color.trim() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(categories.id, id));
  return ok(undefined);
}

export async function deleteLibraryCategory(
  db: AppDrizzleDb,
  id: CategoryId,
): Promise<AppResult<void>> {
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (existing === undefined) {
    return err(
      createAppError({ code: 'db.library.category_missing', message: 'Category not found.' }),
    );
  }

  // Memberships cascade; the titles themselves stay in the library.
  await db.delete(categories).where(eq(categories.id, id));
  return ok(undefined);
}

export async function setLibraryCategoryPinned(
  db: AppDrizzleDb,
  id: CategoryId,
  pinned: boolean,
): Promise<AppResult<void>> {
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (existing === undefined) {
    return err(
      createAppError({ code: 'db.library.category_missing', message: 'Category not found.' }),
    );
  }

  await db
    .update(categories)
    .set({ pinned, updatedAt: new Date().toISOString() })
    .where(eq(categories.id, id));
  return ok(undefined);
}

export async function reorderLibraryCategories(
  db: AppDrizzleDb,
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  const existingIds = db
    .select({ id: categories.id })
    .from(categories)
    .all()
    .map((row) => row.id);
  const given = new Set(categoryIds);
  if (given.size !== categoryIds.length || given.size !== existingIds.length) {
    return err(
      createAppError({
        code: 'db.library.category_order_invalid',
        message: 'The category order must contain every category exactly once.',
      }),
    );
  }

  const now = new Date().toISOString();
  withTransaction(db, (tx) => {
    for (const [index, id] of categoryIds.entries()) {
      tx.update(categories)
        .set({ sortIndex: index, updatedAt: now })
        .where(eq(categories.id, id))
        .run();
    }
  });
  return ok(undefined);
}

function validateEntryIds(db: AppDrizzleDb, entryIds: readonly LibraryEntryId[]): boolean {
  const found = new Set(
    readIdChunks(entryIds, (chunk) =>
      db
        .select({ id: libraryEntries.id })
        .from(libraryEntries)
        .where(inArray(libraryEntries.id, chunk))
        .all(),
    ).map((row) => row.id),
  );
  return entryIds.every((id) => found.has(id));
}

function chunkIds<T extends string>(ids: readonly T[], size = 500): T[][] {
  const unique = [...new Set(ids)];
  const chunks: T[][] = [];
  for (let offset = 0; offset < unique.length; offset += size) {
    chunks.push(unique.slice(offset, offset + size));
  }
  return chunks;
}

function validateCategoryIds(db: AppDrizzleDb, categoryIds: readonly CategoryId[]): boolean {
  const found = new Set(
    readIdChunks(categoryIds, (chunk) =>
      db.select({ id: categories.id }).from(categories).where(inArray(categories.id, chunk)).all(),
    ).map((row) => row.id),
  );
  return categoryIds.every((id) => found.has(id));
}

export async function addLibraryEntriesToCategories(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  if (assignmentIdsInvalid(db, entryIds, categoryIds)) {
    return err(
      createAppError({
        code: 'db.library.category_assignment_invalid',
        message: 'The selected titles or categories no longer exist.',
      }),
    );
  }
  const now = new Date().toISOString();
  withTransaction(db, (tx) => {
    for (const entryChunk of chunkIds(entryIds)) {
      for (const categoryChunk of chunkIds(categoryIds)) {
        tx.insert(libraryCategoryMemberships)
          .values(
            entryChunk.flatMap((libraryEntryId) =>
              categoryChunk.map((categoryId) => ({ libraryEntryId, categoryId })),
            ),
          )
          .onConflictDoNothing()
          .run();
      }
    }
    for (const entryChunk of chunkIds(entryIds)) {
      tx.update(libraryEntries)
        .set({ updatedAt: now })
        .where(inArray(libraryEntries.id, entryChunk))
        .run();
    }
  });
  return ok(undefined);
}

export async function removeLibraryEntriesFromCategories(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  if (assignmentIdsInvalid(db, entryIds, categoryIds)) {
    return err(
      createAppError({
        code: 'db.library.category_assignment_invalid',
        message: 'The selected titles or categories no longer exist.',
      }),
    );
  }
  const now = new Date().toISOString();
  withTransaction(db, (tx) => {
    for (const entryChunk of chunkIds(entryIds)) {
      for (const categoryChunk of chunkIds(categoryIds)) {
        tx.delete(libraryCategoryMemberships)
          .where(
            and(
              inArray(libraryCategoryMemberships.libraryEntryId, entryChunk),
              inArray(libraryCategoryMemberships.categoryId, categoryChunk),
            ),
          )
          .run();
      }
      tx.update(libraryEntries)
        .set({ updatedAt: now })
        .where(inArray(libraryEntries.id, entryChunk))
        .run();
    }
  });
  return ok(undefined);
}

function assignmentIdsInvalid(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  categoryIds: readonly CategoryId[],
): boolean {
  return !validateEntryIds(db, entryIds) || !validateCategoryIds(db, categoryIds);
}

export async function setLibraryEntriesStatus(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  status: LibraryStatus,
): Promise<AppResult<void>> {
  if (!validateEntryIds(db, entryIds)) {
    return err(
      createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
    );
  }
  const now = new Date().toISOString();
  withTransaction(db, (tx) => {
    for (const chunk of chunkIds(entryIds)) {
      tx.update(libraryEntries)
        .set({ status, updatedAt: now })
        .where(inArray(libraryEntries.id, chunk))
        .run();
    }
  });
  return ok(undefined);
}

export async function setLibraryEntriesFavorite(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  favorite: boolean,
): Promise<AppResult<void>> {
  if (!validateEntryIds(db, entryIds)) {
    return err(
      createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
    );
  }
  const now = new Date().toISOString();
  withTransaction(db, (tx) => {
    for (const chunk of chunkIds(entryIds)) {
      tx.update(libraryEntries)
        .set({ favorite, updatedAt: now })
        .where(inArray(libraryEntries.id, chunk))
        .run();
    }
  });
  return ok(undefined);
}

export async function getLibraryEntry(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
): Promise<LibraryEntry | undefined> {
  const row = db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId)).get();
  if (row === undefined) return undefined;
  return toLibraryEntry(db, row);
}

export async function getLibraryEntryForManga(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<LibraryEntry | undefined> {
  const row = db.select().from(libraryEntries).where(eq(libraryEntries.mangaId, mangaId)).get();
  if (row === undefined) return undefined;
  return toLibraryEntry(db, row);
}

export async function updateLibraryEntryReadingProgress(
  db: AppDrizzleDb,
  input: {
    readonly mangaId: MangaId;
    readonly chapterId: ChapterId;
    readonly progressPercent: number;
    /**
     * Event timestamp of the progress write. Resume metadata is ordered by it,
     * so a wall-clock `now` would let a stale event overwrite newer metadata.
     */
    readonly updatedAt?: string;
  },
): Promise<void> {
  const now = input.updatedAt ?? new Date().toISOString();
  await db
    .update(libraryEntries)
    .set({
      lastReadChapterId: input.chapterId,
      progressPercent: input.progressPercent,
      updatedAt: now,
    })
    // Same atomic ordering as chapter read state: a stale event cannot move
    // "continue reading" backwards across tabs.
    .where(
      sql`${libraryEntries.mangaId} = ${input.mangaId} AND (
        ${libraryEntries.lastReadChapterId} IS NULL
        OR ${libraryEntries.lastReadChapterId} = ''
        OR ${libraryEntries.updatedAt} IS NULL
        OR ${libraryEntries.updatedAt} = ''
        OR ${libraryEntries.updatedAt} < ${now}
        OR (
          ${libraryEntries.updatedAt} = ${now}
          AND COALESCE(${libraryEntries.progressPercent}, -1) < ${input.progressPercent}
        )
      )`,
    );
}
