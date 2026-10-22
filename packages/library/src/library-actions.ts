import type { AppDrizzleDb } from '@app/db';
import type { AppResult, CategoryId, LibraryEntryId, LibraryStatus, MangaId } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type { LibraryOrganizationAction } from './types.js';

export async function addMangaToLibrary(
  db: AppDrizzleDb,
  mangaId: MangaId,
  status: LibraryStatus = 'planned',
  entryId?: LibraryEntryId,
): Promise<AppResult<LibraryEntryId>> {
  const { addLibraryEntry } = await import('@app/db');
  return addLibraryEntry(db, {
    mangaId,
    status,
    ...(entryId === undefined ? {} : { id: entryId }),
  });
}

export async function removeMangaFromLibrary(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<AppResult<void>> {
  const { getLibraryEntryForManga, removeLibraryEntry } = await import('@app/db');
  const entry = await getLibraryEntryForManga(db, mangaId);
  if (entry === undefined) {
    return err(
      createAppError({ code: 'library.entry_missing', message: 'Manga is not in the library.' }),
    );
  }

  await removeLibraryEntry(db, entry.id);
  return ok(undefined);
}

export async function setMangaFavorite(
  db: AppDrizzleDb,
  mangaId: MangaId,
  favorite: boolean,
): Promise<AppResult<void>> {
  const { getLibraryEntryForManga, setLibraryEntryFavorite } = await import('@app/db');
  const entry = await getLibraryEntryForManga(db, mangaId);
  if (entry === undefined) {
    return err(
      createAppError({ code: 'library.entry_missing', message: 'Manga is not in the library.' }),
    );
  }

  return setLibraryEntryFavorite(db, entry.id, favorite);
}

/** Runs one library organization write and maps every DB guard to an AppResult. */
export async function applyLibraryOrganizationAction(
  db: AppDrizzleDb,
  action: LibraryOrganizationAction,
): Promise<AppResult<void>> {
  const repository = await import('@app/db');
  switch (action.type) {
    case 'create_category': {
      const created = await repository.createLibraryCategory(db, {
        name: action.name,
        ...(action.color === undefined ? {} : { color: action.color }),
      });
      return created.ok ? ok(undefined) : created;
    }
    case 'rename_category':
      return repository.updateLibraryCategory(db, action.categoryId, {
        name: action.name,
        ...(action.color === undefined ? {} : { color: action.color }),
      });
    case 'delete_category':
      return repository.deleteLibraryCategory(db, action.categoryId);
    case 'set_category_pinned':
      return repository.setLibraryCategoryPinned(db, action.categoryId, action.pinned);
    case 'reorder_categories':
      return repository.reorderLibraryCategories(db, action.categoryIds);
    case 'set_entry_categories':
      return setEntryCategories(db, action.entryIds, action.categoryIds);
    case 'add_entry_categories':
      return repository.addLibraryEntriesToCategories(db, action.entryIds, action.categoryIds);
    case 'remove_entry_categories':
      return repository.removeLibraryEntriesFromCategories(db, action.entryIds, action.categoryIds);
    case 'set_entries_status':
      return repository.setLibraryEntriesStatus(db, action.entryIds, action.status);
    case 'set_entries_favorite':
      return repository.setLibraryEntriesFavorite(db, action.entryIds, action.favorite);
  }
}

async function setEntryCategories(
  db: AppDrizzleDb,
  entryIds: readonly LibraryEntryId[],
  categoryIds: readonly CategoryId[],
): Promise<AppResult<void>> {
  const { setLibraryEntryCategories } = await import('@app/db');
  for (const entryId of entryIds) {
    const result = await setLibraryEntryCategories(db, entryId, categoryIds);
    if (!result.ok) return result;
  }
  return ok(undefined);
}
