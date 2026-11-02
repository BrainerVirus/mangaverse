import type { AppDrizzleDb, ChapterRow } from '@app/db';
import { CHAPTER_WINDOW_MAX, getChapterRows, listChapterWindow } from '@app/db';
import { toChapterId, toMangaId } from '@app/shared';
import { createWindowedCollection, type ChangeFeed } from '../../lib/host-collections.js';

/**
 * A title's chapters, loaded on demand: a live query filtered to one title with a limit loads
 * that window and no more (#210, on-demand sync). No surface reads it yet; the chapter list
 * moves to it with the per-surface migration.
 */
export function createChapterWindowCollection(db: AppDrizzleDb, subscribe: ChangeFeed, id: string) {
  return createWindowedCollection<ChapterRow>({
    id,
    orderField: 'index',
    parentField: 'mangaId',
    maxWindow: CHAPTER_WINDOW_MAX,
    keyOf: (row) => row.id,
    loadWindow: ({ parent, limit, after, exact }) =>
      listChapterWindow(db, {
        mangaId: toMangaId(parent),
        limit,
        ...(after === undefined ? {} : { afterIndex: after }),
        ...(exact === undefined ? {} : { exactIndex: exact }),
      }),
    loadKeys: (keys) => getChapterRows(db, keys.map(toChapterId)),
    table: 'chapters',
    subscribe,
  });
}
