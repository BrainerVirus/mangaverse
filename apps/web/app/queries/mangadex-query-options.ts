import type { AppDrizzleDb } from '@app/db/browser';
import { getChapter } from '@app/db/browser';
import type { ProviderContext, ProviderContract } from '@app/extensions-sdk';
import type { MangaDetailData } from '@app/library';
import type { ChapterId, MangaId, MangaIdentity } from '@app/shared';
import { toChapterPageId, toProviderMangaId } from '@app/shared';

import { parseMangadexAppChapterId, parseMangadexAppMangaId } from '../lib/mangadex-ids.js';
import {
  buildMangaDetailData,
  providerItemToMangaIdentity,
} from '../lib/mangadex-identity-mapping.js';
import {
  mergeMangaDetailWithLibrary,
  persistChapterPagesToDb,
  persistMangaDetailToDb,
  shouldRefreshMangaDetail,
} from '../lib/mangadex-persist.js';
import { resolveInstalledProvider } from '../lib/provider-registry.js';

const MANGADEX_PROVIDER_ID = 'mangadex';

async function mangadexContext(
  db: AppDrizzleDb,
  signal?: AbortSignal,
): Promise<{ ctx: ProviderContext; provider: ProviderContract } | null> {
  const provider = await resolveInstalledProvider(db, MANGADEX_PROVIDER_ID);
  if (provider === null) {
    return null;
  }
  const ctx: ProviderContext = {
    manifest: provider.manifest,
    providerId: MANGADEX_PROVIDER_ID,
    ...(signal !== undefined ? { signal } : {}),
  };
  return { ctx, provider };
}

/** Provider-backed search results as canonical identities (never persisted here). */
export async function fetchMangadexSearchIdentities(
  db: AppDrizzleDb,
  query: string,
  signal?: AbortSignal,
): Promise<readonly MangaIdentity[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const context = await mangadexContext(db, signal);
  if (context === null || context.provider.search === undefined) return [];

  const result = await context.provider.search(context.ctx, { query: trimmed, limit: 24 });
  return result.items.map(providerItemToMangaIdentity);
}

/**
 * Resolves a MangaDex manga through the installed provider and persists it,
 * then returns the refreshed local detail so library state stays authoritative.
 */
export async function fetchMangadexMangaDetail(
  db: AppDrizzleDb,
  mangaId: MangaId,
  local: MangaDetailData | null,
  signal?: AbortSignal,
): Promise<MangaDetailData | null> {
  const mangadexMangaId = parseMangadexAppMangaId(mangaId);
  if (mangadexMangaId === null) return null;

  const context = await mangadexContext(db, signal);
  if (context === null || context.provider.getDetails === undefined) return null;
  if (!shouldRefreshMangaDetail(local)) return null;

  const providerMangaId = toProviderMangaId(mangadexMangaId);
  const details = await context.provider.getDetails(context.ctx, providerMangaId);
  const chapters =
    context.provider.getChapters !== undefined
      ? await context.provider.getChapters(context.ctx, providerMangaId)
      : [];

  const remote = buildMangaDetailData(mangadexMangaId, details, chapters);
  await persistMangaDetailToDb(db, remote);

  const { fetchMangaDetail } = await import('@app/library');
  const refreshed = await fetchMangaDetail(db, mangaId);
  return mergeMangaDetailWithLibrary(refreshed ?? remote, local);
}

/** Fetches and persists page URLs for a chapter that has none yet. */
export async function ensureMangadexChapterPages(
  db: AppDrizzleDb,
  chapterId: ChapterId,
  signal?: AbortSignal,
): Promise<void> {
  const mangadexChapterId = parseMangadexAppChapterId(chapterId);
  if (mangadexChapterId === null) return;

  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined || chapter.pages.length > 0) return;

  const mangadexMangaId = parseMangadexAppMangaId(chapter.mangaId);
  if (mangadexMangaId === null) return;

  const context = await mangadexContext(db, signal);
  if (context === null || context.provider.getPages === undefined) return;

  const pages = await context.provider.getPages(
    context.ctx,
    toProviderMangaId(mangadexMangaId),
    mangadexChapterId,
  );

  await persistChapterPagesToDb(
    db,
    chapter,
    pages.map((page, index) => ({
      id: toChapterPageId(`dev-md-page-${mangadexChapterId}-${index}`),
      index: page.index,
      image: { url: page.imageUrl },
    })),
  );
}
