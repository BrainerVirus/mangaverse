import type { AppDrizzleDb } from '@app/db';
import type { LibraryItem } from './types.js';

/** The command palette shows a short resume list, not a second library. */
export const RECENT_LIBRARY_LIMIT = 5;

/**
 * Recently read titles, newest read first. Titles never opened carry no
 * `lastReadChapterId`; leaving them out keeps the palette's Recent group about
 * resuming rather than duplicating the library.
 */
export async function fetchRecentLibrary(
  db: AppDrizzleDb,
  limit: number = RECENT_LIBRARY_LIMIT,
): Promise<LibraryItem[]> {
  const { getMangaIdentities, listLibraryEntries } = await import('@app/db');
  const entries = (await listLibraryEntries(db, { sort: { key: 'last_read', direction: 'desc' } }))
    .filter((entry) => entry.lastReadChapterId !== undefined)
    .slice(0, limit);

  const identities = await getMangaIdentities(
    db,
    entries.map((entry) => entry.mangaId),
  );
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));

  return entries.flatMap((entry): LibraryItem[] => {
    const manga = identityById.get(entry.mangaId);
    return manga === undefined ? [] : [{ entry, manga }];
  });
}
