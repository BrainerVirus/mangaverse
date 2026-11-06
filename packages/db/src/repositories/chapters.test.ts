import { describe, expect, it } from 'vitest';
import { toChapterId, toChapterPageId, toProviderId } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { getChapter, updateChapterPageDimensions, upsertChapterWithPages } from './chapters.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';

async function seed() {
  const { db, raw } = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Page shape fixture',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'page-shape',
  });
  if (!created.ok) throw new Error(created.error.message);
  const { mangaId, mappingId } = created.value;
  const ids = [toChapterId('ch-1'), toChapterId('ch-2')];
  for (const [index, chapterId] of ids.entries()) {
    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      providerId: 'prov-a',
      title: `Chapter ${index + 1}`,
      index: index + 1,
      pages: [0, 1].map((pageIndex) => ({
        id: toChapterPageId(`${chapterId}-${pageIndex}`),
        index: pageIndex,
        image: {
          url: `https://example.com/${chapterId}/${pageIndex}.png`,
          bytes: 1234,
          mimeType: 'image/png',
        },
      })),
    });
  }
  return { db, raw, ids };
}

describe('updateChapterPageDimensions', () => {
  it('Given decoded page sizes, When stored, Then only that chapter and page change, and only width and height', async () => {
    const { db, raw, ids } = await seed();
    const result = await updateChapterPageDimensions(db, ids[0]!, [
      { pageIndex: 1, width: 800, height: 6000 },
    ]);
    expect(result).toEqual({ ok: true, value: 1 });

    const chapter = await getChapter(db, ids[0]!);
    expect(chapter?.pages[1]?.image).toEqual({
      url: 'https://example.com/ch-1/1.png',
      width: 800,
      height: 6000,
      bytes: 1234,
      mimeType: 'image/png',
    });
    expect(chapter?.pages[0]?.image.width).toBeUndefined();
    const other = await getChapter(db, ids[1]!);
    expect(other?.pages.every((page) => page.image.width === undefined)).toBe(true);
    raw.close();
  });

  it('Given an index the chapter does not have, When stored, Then it is ignored and the rest still lands', async () => {
    const { db, raw, ids } = await seed();
    const result = await updateChapterPageDimensions(db, ids[0]!, [
      { pageIndex: 0, width: 800, height: 1200 },
      { pageIndex: 9, width: 800, height: 1200 },
    ]);
    expect(result).toEqual({ ok: true, value: 1 });
    raw.close();
  });

  it('Given sizes that already match, When stored again, Then no row changes', async () => {
    const { db, raw, ids } = await seed();
    const sizes = [{ pageIndex: 0, width: 800, height: 6000 }];
    expect(await updateChapterPageDimensions(db, ids[0]!, sizes)).toEqual({ ok: true, value: 1 });
    expect(await updateChapterPageDimensions(db, ids[0]!, sizes)).toEqual({ ok: true, value: 0 });
    raw.close();
  });

  it('Given a non-positive or fractional size, When stored, Then the whole call is refused', async () => {
    const { db, raw, ids } = await seed();
    for (const bad of [
      { pageIndex: 0, width: 0, height: 6000 },
      { pageIndex: 0, width: 800, height: -1 },
      { pageIndex: 0, width: 800.5, height: 6000 },
      { pageIndex: -1, width: 800, height: 6000 },
    ]) {
      // In process the repository returns an error; over the data host the
      // input schema rejects the call first. Either way nothing is written.
      const refused = await updateChapterPageDimensions(db, ids[0]!, [
        { pageIndex: 1, width: 800, height: 1200 },
        bad,
      ]).then(
        (result) => !result.ok,
        () => true,
      );
      expect(refused).toBe(true);
    }
    const chapter = await getChapter(db, ids[0]!);
    expect(chapter?.pages.every((page) => page.image.width === undefined)).toBe(true);
    raw.close();
  });
});
