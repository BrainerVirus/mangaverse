import { describe, expect, it } from 'vitest';
import {
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMangaId,
  toProviderMappingId,
  type LibraryEntry,
  type MangaIdentity,
  type MangaProviderMapping,
} from '@app/shared';

import {
  collectLibraryMigrationSelection,
  libraryMigrationSelectionError,
} from './migration-selection.js';
import type { LibraryItem } from './types.js';

function mapping(id: string, providerId: string): MangaProviderMapping {
  return {
    id: toProviderMappingId(id),
    providerId: toProviderId(providerId),
    providerMangaId: toProviderMangaId(providerId),
  };
}

function item(
  id: string,
  mappings: readonly MangaProviderMapping[],
  activeMappingId?: string,
): LibraryItem {
  const manga: MangaIdentity = {
    id: toMangaId(id),
    canonicalTitle: id,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: mappings,
    defaultProviderMappingId: mappings[0]?.id ?? toProviderMappingId(`missing-${id}`),
    merged: false,
  };
  const entry: LibraryEntry = {
    id: toLibraryEntryId(`entry-${id}`),
    mangaId: toMangaId(id),
    favorite: false,
    categoryIds: [],
    status: 'reading',
    unreadCount: 0,
    ...(activeMappingId === undefined
      ? {}
      : { activeProviderMappingId: toProviderMappingId(activeMappingId) }),
  };
  return { entry, manga };
}

describe('collectLibraryMigrationSelection', () => {
  it('keeps only selected titles and groups their unique reading providers', () => {
    const first = item(
      'one',
      [mapping('one-default', 'mangadex'), mapping('one-active', 'target')],
      'one-active',
    );
    const second = item('two', [mapping('two-default', 'mangadex')]);
    const unselected = item('three', [mapping('three-default', 'other')]);

    const selection = collectLibraryMigrationSelection(
      [first, unselected, second],
      [first.entry.id, second.entry.id],
    );

    expect(selection).toEqual({
      mangaIds: [toMangaId('one'), toMangaId('two')],
      sourceProviderIds: [toProviderId('mangadex'), toProviderId('target')],
    });
  });

  it('falls back to the first mapping when no mapping is active', () => {
    const only = item('one', [mapping('one-first', 'first'), mapping('one-second', 'second')]);

    expect(collectLibraryMigrationSelection([only], [only.entry.id])).toEqual({
      mangaIds: [toMangaId('one')],
      sourceProviderIds: [toProviderId('first')],
    });
  });

  it('accepts the batch limit and rejects one more with a split instruction', () => {
    const selected = (count: number) => ({
      mangaIds: Array.from({ length: count }, (_, index) => toMangaId(`m${index}`)),
      sourceProviderIds: [],
    });

    expect(libraryMigrationSelectionError(selected(200), 200)).toBeNull();
    expect(libraryMigrationSelectionError(selected(201), 200)).toContain(
      'Select at most 200 titles',
    );
    expect(libraryMigrationSelectionError(selected(201), 200)).toContain('201 are selected');
    expect(libraryMigrationSelectionError(selected(201), undefined)).toBeNull();
  });
});
