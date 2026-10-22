import type { ChapterId, MangaId, ReaderSettings } from '@app/shared';
import type { ReaderChapter, ReaderEngineSettings } from './types.js';

export interface ReaderPageData {
  readonly chapter: ReaderChapter;
  readonly mangaId: MangaId;
  readonly chapterId: ChapterId;
  readonly providerId: string;
  /** Human-readable provider name for the reading surface, when one is installed. */
  readonly sourceName?: string | undefined;
  readonly initialPageIndex: number;
  /** True when the saved read state is completed; opening must not unmark it. */
  readonly initialCompleted?: boolean;
  readonly settings: ReaderSettings;
  readonly engineSettings: ReaderEngineSettings;
  readonly previousChapterId?: ChapterId | undefined;
  readonly nextChapterId?: ChapterId | undefined;
}
