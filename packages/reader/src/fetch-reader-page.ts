import type { AppDrizzleDb } from '@app/db';
import type { ChapterId } from '@app/shared';
import { mapChapterToReaderChapter } from './map-chapter.js';
import type { ReaderPageData } from './reader-page-data.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

export async function fetchReaderPage(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<ReaderPageData | undefined> {
  const { getChapter, getChapterReadState, getReaderSettings } = await import('@app/db');

  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined) {
    return undefined;
  }

  const [readState, settings] = await Promise.all([
    getChapterReadState(db, chapterId),
    getReaderSettings(db),
  ]);

  const initialPageIndex =
    readState?.progress.lastPageIndex !== undefined
      ? Math.max(0, Math.min(readState.progress.lastPageIndex, Math.max(chapter.pages.length - 1, 0)))
      : 0;

  const engineSettings = toReaderEngineSettings(settings);

  return {
    chapter: mapChapterToReaderChapter(chapter),
    mangaId: chapter.mangaId,
    chapterId: chapter.id,
    initialPageIndex,
    settings,
    engineSettings,
  };
}
