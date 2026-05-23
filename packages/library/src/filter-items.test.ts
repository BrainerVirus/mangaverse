import { describe, expect, it } from 'vitest';
import {
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
  toProviderMangaId,
  type LibraryEntry,
  type MangaIdentity,
} from '@app/shared';
import { filterLibraryItemsByQuery } from './filter-items.js';
import type { LibraryItem } from './types.js';

function item(title: string, alt?: string): LibraryItem {
  const mangaId = toMangaId(crypto.randomUUID());
  const entry: LibraryEntry = {
    id: toLibraryEntryId(crypto.randomUUID()),
    mangaId,
    favorite: false,
    categoryIds: [],
    status: 'reading',
    unreadCount: 0,
  };
  const mappingId = toProviderMappingId(crypto.randomUUID());
  const manga: MangaIdentity = {
    id: mangaId,
    canonicalTitle: title,
    alternativeTitles: alt !== undefined ? [{ value: alt }] : [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [
      {
        id: mappingId,
        providerId: toProviderId('prov-test'),
        providerMangaId: toProviderMangaId('remote-test'),
      },
    ],
    defaultProviderMappingId: mappingId,
    merged: false,
  };
  return { entry, manga };
}

describe('filterLibraryItemsByQuery', () => {
  it('returns all items when query is blank', () => {
    const items = [item('One'), item('Two')];
    expect(filterLibraryItemsByQuery(items, '   ')).toHaveLength(2);
  });

  it('matches canonical and alternative titles case-insensitively', () => {
    const items = [item('Visible', 'Hidden Alias'), item('Other')];
    expect(filterLibraryItemsByQuery(items, 'hidden')).toHaveLength(1);
    expect(filterLibraryItemsByQuery(items, 'visible')[0]?.manga.canonicalTitle).toBe('Visible');
  });
});
