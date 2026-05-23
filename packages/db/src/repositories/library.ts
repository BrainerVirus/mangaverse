import { eq, inArray } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  toCategoryId,
  toChapterId,
  toLibraryEntryId,
  toMangaId,
  toProviderMappingId,
  type CategoryId,
  type LibraryEntry,
  type LibraryEntryId,
  type LibraryFilter,
  type LibrarySort,
  type LibrarySortKey,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  categories,
  libraryCategoryMemberships,
  libraryEntries,
  mangaIdentities,
  mangaProviderMappings,
} from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

async function categoryIdsForEntry(db: AppDrizzleDb, entryId: LibraryEntryId): Promise<CategoryId[]> {
  const rows = await db
    .select({ categoryId: libraryCategoryMemberships.categoryId })
    .from(libraryCategoryMemberships)
    .where(eq(libraryCategoryMemberships.libraryEntryId, entryId))
    .all();
  return rows.map((r) => toCategoryId(r.categoryId));
}

export async function toLibraryEntry(db: AppDrizzleDb, row: typeof libraryEntries.$inferSelect): Promise<LibraryEntry> {
  const categoryIds = await categoryIdsForEntry(db, toLibraryEntryId(row.id));
  return {
    id: toLibraryEntryId(row.id),
    mangaId: toMangaId(row.mangaId),
    favorite: row.favorite,
    categoryIds,
    status: row.status as LibraryEntry['status'],
    unreadCount: row.unreadCount,
    ...(row.lastReadChapterId !== null && row.lastReadChapterId !== undefined && row.lastReadChapterId !== ''
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
    ...(row.notes !== null && row.notes !== undefined && row.notes !== '' ? { notes: row.notes } : {}),
    ...(row.addedAt !== null && row.addedAt !== undefined && row.addedAt !== '' ? { addedAt: row.addedAt } : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== '' ? { updatedAt: row.updatedAt } : {}),
  };
}

function sortLibraryRows(
  db: AppDrizzleDb,
  rows: (typeof libraryEntries.$inferSelect)[],
  sort?: LibrarySort,
): Promise<LibraryEntry[]> {
  const key: LibrarySortKey = sort?.key ?? 'date_added';
  const dir = sort?.direction ?? 'desc';
  const mul = dir === 'asc' ? 1 : -1;

  const sorted = [...rows].sort((a, b) => {
    if (key === 'title') {
      return mul * String(a.mangaId).localeCompare(String(b.mangaId));
    }
    if (key === 'date_added') {
      return mul * String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? ''));
    }
    return mul * String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? ''));
  });

  return Promise.all(sorted.map((r) => toLibraryEntry(db, r)));
}

export async function listLibraryEntries(
  db: AppDrizzleDb,
  options?: { readonly filter?: LibraryFilter; readonly sort?: LibrarySort },
): Promise<LibraryEntry[]> {
  const query = db.select().from(libraryEntries);

  const filter = options?.filter;
  if (filter?.categoryIds !== undefined && filter.categoryIds.length > 0) {
    const entryIds = await db
      .select({ libraryEntryId: libraryCategoryMemberships.libraryEntryId })
      .from(libraryCategoryMemberships)
      .where(inArray(libraryCategoryMemberships.categoryId, [...filter.categoryIds]))
      .all();
    const idSet = new Set(entryIds.map((e) => e.libraryEntryId));
    const rows = await query.all();
    const filtered = rows.filter((r) => idSet.has(r.id));
    return sortLibraryRows(db, filtered, options?.sort);
  }

  if (filter?.statuses !== undefined && filter.statuses.length > 0) {
    const rows = await query.all();
    const filtered = rows.filter((r) => filter.statuses!.includes(r.status as LibraryEntry['status']));
    return sortLibraryRows(db, filtered, options?.sort);
  }

  if (filter?.favoritesOnly === true) {
    const rows = await query.all();
    const filtered = rows.filter((r) => r.favorite);
    return sortLibraryRows(db, filtered, options?.sort);
  }

  const rows = await query.all();
  return sortLibraryRows(db, rows, options?.sort);
}

export async function addLibraryEntry(
  db: AppDrizzleDb,
  input: { readonly mangaId: MangaId; readonly status: LibraryEntry['status'] },
): Promise<AppResult<LibraryEntryId>> {
  const manga = await db.select({ id: mangaIdentities.id }).from(mangaIdentities).where(eq(mangaIdentities.id, input.mangaId)).get();
  if (manga === undefined) {
    return err(createAppError({ code: 'db.library.manga_missing', message: 'Manga identity does not exist.' }));
  }

  const existing = await db
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(eq(libraryEntries.mangaId, input.mangaId))
    .get();
  if (existing !== undefined) {
    return err(createAppError({ code: 'db.library.duplicate', message: 'Manga is already in the library.' }));
  }

  const id = toLibraryEntryId(newId());
  const now = new Date().toISOString();
  await db.insert(libraryEntries).values({
    id,
    mangaId: input.mangaId,
    favorite: false,
    status: input.status,
    unreadCount: 0,
    addedAt: now,
    updatedAt: now,
  });

  return ok(id);
}

export async function removeLibraryEntry(db: AppDrizzleDb, entryId: LibraryEntryId): Promise<void> {
  await db.delete(libraryCategoryMemberships).where(eq(libraryCategoryMemberships.libraryEntryId, entryId));
  await db.delete(libraryEntries).where(eq(libraryEntries.id, entryId));
}

export async function setLibraryEntryCategories(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  const entry = await db.select({ id: libraryEntries.id }).from(libraryEntries).where(eq(libraryEntries.id, entryId)).get();
  if (entry === undefined) {
    return err(createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }));
  }

  if (categoryIds.length > 0) {
    const found = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.id, [...categoryIds]))
      .all();
    if (found.length !== categoryIds.length) {
      return err(createAppError({ code: 'db.library.category_missing', message: 'One or more categories do not exist.' }));
    }
  }

  await db.delete(libraryCategoryMemberships).where(eq(libraryCategoryMemberships.libraryEntryId, entryId));
  if (categoryIds.length > 0) {
    await db.insert(libraryCategoryMemberships).values(
      categoryIds.map((categoryId) => ({ libraryEntryId: entryId, categoryId })),
    );
  }

  await db.update(libraryEntries).set({ updatedAt: new Date().toISOString() }).where(eq(libraryEntries.id, entryId));
  return ok(undefined);
}

export async function setLibraryEntryActiveProviderMapping(
  db: AppDrizzleDb,
  entryId: LibraryEntryId,
  mappingId: ProviderMappingId | undefined,
): Promise<AppResult<void>> {
  const entry = await db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId)).get();
  if (entry === undefined) {
    return err(createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }));
  }

  if (mappingId !== undefined) {
    const mapping = await db
      .select({ mangaId: mangaProviderMappings.mangaId })
      .from(mangaProviderMappings)
      .where(eq(mangaProviderMappings.id, mappingId))
      .get();
    if (mapping === undefined) {
      return err(createAppError({ code: 'db.library.mapping_not_found', message: 'Provider mapping not found.' }));
    }
    if (mapping.mangaId !== entry.mangaId) {
      return err(createAppError({ code: 'db.library.mapping_wrong_manga', message: 'Provider mapping does not belong to this manga.' }));
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

export async function upsertCategory(
  db: AppDrizzleDb,
  input: { readonly id?: CategoryId; readonly name: string; readonly color?: string; readonly sortIndex?: number },
): Promise<CategoryId> {
  const id = input.id ?? toCategoryId(newId());
  const now = new Date().toISOString();
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get();
  if (existing === undefined) {
    await db.insert(categories).values({
      id,
      name: input.name,
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.sortIndex !== undefined ? { sortIndex: input.sortIndex } : {}),
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(categories)
      .set({
        name: input.name,
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortIndex !== undefined ? { sortIndex: input.sortIndex } : {}),
        updatedAt: now,
      })
      .where(eq(categories.id, id));
  }
  return id;
}

export async function getLibraryEntry(db: AppDrizzleDb, entryId: LibraryEntryId): Promise<LibraryEntry | undefined> {
  const row = await db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId)).get();
  if (row === undefined) return undefined;
  return toLibraryEntry(db, row);
}
