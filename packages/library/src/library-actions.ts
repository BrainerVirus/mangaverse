import type { AppDrizzleDb } from '@app/db';
import type { AppResult, LibraryEntryId, LibraryStatus, MangaId } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

export async function addMangaToLibrary(
  db: AppDrizzleDb,
  mangaId: MangaId,
  status: LibraryStatus = 'planned',
): Promise<AppResult<LibraryEntryId>> {
  const { addLibraryEntry } = await import('@app/db');
  return addLibraryEntry(db, { mangaId, status });
}

export async function removeMangaFromLibrary(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<AppResult<void>> {
  const { getLibraryEntryForManga, removeLibraryEntry } = await import('@app/db');
  const entry = await getLibraryEntryForManga(db, mangaId);
  if (entry === undefined) {
    return err(createAppError({ code: 'library.entry_missing', message: 'Manga is not in the library.' }));
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
    return err(createAppError({ code: 'library.entry_missing', message: 'Manga is not in the library.' }));
  }

  return setLibraryEntryFavorite(db, entry.id, favorite);
}
