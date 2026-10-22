import type { LibraryEntryId, MangaId, ProviderId } from '@app/shared';

import type { LibraryItem } from './types.js';

/** The library hand-off to the migration page: titles plus the providers they read from. */
export interface LibraryMigrationSelection {
  readonly mangaIds: readonly MangaId[];
  readonly sourceProviderIds: readonly ProviderId[];
}

/**
 * Groups a selection by its reading provider, mirroring the update queue: the
 * active mapping wins, then the default mapping, then the first one.
 */
export function collectLibraryMigrationSelection(
  items: readonly LibraryItem[],
  entryIds: readonly LibraryEntryId[],
): LibraryMigrationSelection {
  const selected = new Set(entryIds);
  const mangaIds: MangaId[] = [];
  const sourceProviderIds = new Set<ProviderId>();

  for (const item of items) {
    if (!selected.has(item.entry.id)) continue;
    mangaIds.push(item.manga.id);

    const mapping =
      item.manga.providerMappings.find(
        (candidate) => candidate.id === item.entry.activeProviderMappingId,
      ) ??
      item.manga.providerMappings.find(
        (candidate) => candidate.id === item.manga.defaultProviderMappingId,
      ) ??
      item.manga.providerMappings[0];
    if (mapping !== undefined) sourceProviderIds.add(mapping.providerId);
  }

  return {
    mangaIds,
    sourceProviderIds: [...sourceProviderIds].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Rejects a hand-off that would overflow the migration URL. The batch travels in
 * the query string, so an oversized selection must be narrowed instead of
 * silently truncated.
 */
export function libraryMigrationSelectionError(
  selection: LibraryMigrationSelection,
  limit: number | undefined,
): string | null {
  if (limit === undefined || selection.mangaIds.length <= limit) return null;
  return `Select at most ${limit} ${limit === 1 ? 'title' : 'titles'} per migration batch; ${selection.mangaIds.length} are selected. Narrow the selection and try again.`;
}
