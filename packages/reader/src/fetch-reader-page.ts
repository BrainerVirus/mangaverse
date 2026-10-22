import type { AppDrizzleDb } from '@app/db';
import type { ChapterId } from '@app/shared';
import { mapChapterToReaderChapter } from './map-chapter.js';
import type { ReaderPageData } from './reader-page-data.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

export async function fetchReaderPage(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<ReaderPageData | undefined> {
  const { getChapter, getChapterReadState, getTitleReaderSettings, listChaptersForManga } =
    await import('@app/db');

  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined) {
    return undefined;
  }

  const [readState, settings, chapters] = await Promise.all([
    getChapterReadState(db, chapterId),
    getTitleReaderSettings(db, chapter.mangaId),
    listChaptersForManga(db, chapter.mangaId),
  ]);

  const initialPageIndex =
    readState?.progress.lastPageIndex !== undefined
      ? Math.max(
          0,
          Math.min(readState.progress.lastPageIndex, Math.max(chapter.pages.length - 1, 0)),
        )
      : 0;

  const engineSettings = toReaderEngineSettings(settings);
  const sourceChapters = chapters.filter((item) => item.providerId === chapter.providerId);
  const position = sourceChapters.findIndex((item) => item.id === chapter.id);

  return {
    chapter: mapChapterToReaderChapter(chapter),
    mangaId: chapter.mangaId,
    chapterId: chapter.id,
    providerId: String(chapter.providerId ?? 'unknown'),
    initialPageIndex,
    settings,
    engineSettings,
    previousChapterId: sourceChapters[position - 1]?.id,
    nextChapterId: sourceChapters[position + 1]?.id,
  };
}
