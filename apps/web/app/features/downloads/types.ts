import type { DownloadStatus } from '@app/db';
import type { ChapterId } from '@app/shared';

/** One chapter's download state, as the chapter list and Storage render it. */
export interface ChapterDownloadState {
  readonly chapterId: ChapterId;
  readonly status: DownloadStatus;
  readonly pageCount: number;
  readonly completedPages: number;
  readonly failedPages: number;
}

/** The per-row action a chapter list offers for its download. */
export type DownloadCommand = 'download' | 'cancel' | 'retry' | 'remove';

/** The chapter currently downloading, for live per-row progress. */
export interface DownloadProgress {
  readonly chapterId: ChapterId;
  readonly completedPages: number;
  readonly pageCount: number;
}
