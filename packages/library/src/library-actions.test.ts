import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toProviderId } from '@app/shared';
import {
  addMangaToLibrary,
  removeMangaFromLibrary,
  setMangaFavorite,
} from './library-actions.js';

describe('library-actions', () => {
  it('adds a manga to the library', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Action Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'action-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await addMangaToLibrary(db, created.value.mangaId, 'reading');
    expect(result.ok).toBe(true);

    const entry = await getLibraryEntryForManga(db, created.value.mangaId);
    expect(entry?.status).toBe('reading');
  });

  it('returns duplicate error when manga is already in the library', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Duplicate Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'dup-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    const result = await addMangaToLibrary(db, created.value.mangaId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('db.library.duplicate');
  });

  it('removes a manga from the library', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Remove Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'remove-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    const result = await removeMangaFromLibrary(db, created.value.mangaId);
    expect(result.ok).toBe(true);

    const entry = await getLibraryEntryForManga(db, created.value.mangaId);
    expect(entry).toBeUndefined();
  });

  it('toggles favorite state for a library entry', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Favorite Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'fav-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });

    const favoriteResult = await setMangaFavorite(db, created.value.mangaId, true);
    expect(favoriteResult.ok).toBe(true);

    let entry = await getLibraryEntryForManga(db, created.value.mangaId);
    expect(entry?.favorite).toBe(true);

    const unfavoriteResult = await setMangaFavorite(db, created.value.mangaId, false);
    expect(unfavoriteResult.ok).toBe(true);

    entry = await getLibraryEntryForManga(db, created.value.mangaId);
    expect(entry?.favorite).toBe(false);
  });
});
