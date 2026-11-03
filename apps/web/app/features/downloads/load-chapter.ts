import { getChapter, type AppDrizzleDb } from '@app/db';
import type { ChapterId } from '@app/shared';

import { getBindingForChapterId } from '../../lib/provider-registry.js';
import { ensureProviderChapterPages } from '../../queries/provider-query-options.js';
import type { DownloadChapterSource } from './download-engine.js';

/**
 * Queueing reads only SQLite. The provider call that supplies page URLs happens when
 * the download actually starts, so tapping Download does not block on the network.
 */
export async function readDownloadChapter(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<DownloadChapterSource | undefined> {
  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined) return undefined;
  const providerId = chapter.providerId ?? getBindingForChapterId(chapterId)?.providerId;
  return providerId === undefined ? undefined : { chapter, providerId: String(providerId) };
}

/**
 * Loads the page list through `getPages` (which runs behind the provider transport and
 * its request gate) and returns the chapter with its pages persisted.
 */
export async function loadDownloadChapter(
  db: AppDrizzleDb,
  chapterId: ChapterId,
  signal?: AbortSignal,
): Promise<DownloadChapterSource | undefined> {
  await ensureProviderChapterPages(db, chapterId, signal);
  return readDownloadChapter(db, chapterId);
}
