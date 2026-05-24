import type { ChapterId, MangaId, ReaderSettings } from '@app/shared';
import type { ReaderChapter, ReaderEngineSettings } from './types.js';

export interface ReaderPageData {
  readonly chapter: ReaderChapter;
  readonly mangaId: MangaId;
  readonly chapterId: ChapterId;
  readonly providerId: string;
  readonly initialPageIndex: number;
  readonly settings: ReaderSettings;
  readonly engineSettings: ReaderEngineSettings;
}
