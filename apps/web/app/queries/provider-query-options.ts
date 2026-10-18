import type { AppDrizzleDb } from '@app/db/browser';
import { getChapter } from '@app/db/browser';
import type { ProviderContext, ProviderContract } from '@app/extensions-sdk';
import type { MangaDetailData } from '@app/library';
import type { ChapterId, MangaId, MangaIdentity } from '@app/shared';
import { toProviderMangaId } from '@app/shared';

import {
  mergeMangaDetailWithLibrary,
  persistChapterPagesToDb,
  persistMangaDetailToDb,
  shouldRefreshMangaDetail,
} from '../lib/manga-detail-persist.js';
import {
  getBindingForChapterId,
  listProviderBindings,
  resolveInstalledProvider,
  type ProviderAppBinding,
} from '../lib/provider-registry.js';

/** App search page size for remote results, kept in step with the discover grid. */
const REMOTE_SEARCH_LIMIT = 24;

async function providerContext(
  db: AppDrizzleDb,
  providerId: string,
  signal?: AbortSignal,
): Promise<{ ctx: ProviderContext; provider: ProviderContract } | null> {
  const provider = await resolveInstalledProvider(db, providerId);
  if (provider === null) {
    return null;
  }
  const ctx: ProviderContext = {
    manifest: provider.manifest,
    providerId,
    ...(signal !== undefined ? { signal } : {}),
  };
  return { ctx, provider };
}

/** Provider-backed search results as canonical identities (never persisted here). */
export async function fetchProviderSearchIdentities(
  db: AppDrizzleDb,
  query: string,
  signal?: AbortSignal,
): Promise<readonly MangaIdentity[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const identities: MangaIdentity[] = [];
  for (const binding of listProviderBindings()) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- provider sessions share one db handle; resolving them sequentially is deliberate (one binding today, no fan-out)
    const context = await providerContext(db, binding.providerId, signal);
    if (context === null || context.provider.search === undefined) continue;

    const result = await context.provider.search(context.ctx, {
      query: trimmed,
      limit: REMOTE_SEARCH_LIMIT,
    });
    identities.push(...binding.toSearchIdentities(result.items));
  }
  return identities;
}

/**
 * Resolves a provider-sourced manga through the installed provider and persists
 * it, then returns the refreshed local detail so library state stays authoritative.
 */
export async function fetchProviderMangaDetail(
  db: AppDrizzleDb,
  binding: ProviderAppBinding,
  mangaId: MangaId,
  local: MangaDetailData | null,
  signal?: AbortSignal,
): Promise<MangaDetailData | null> {
  const providerMangaId = binding.parseAppMangaId(mangaId);
  if (providerMangaId === null) return null;

  const context = await providerContext(db, binding.providerId, signal);
  if (context === null || context.provider.getDetails === undefined) return null;
  if (!shouldRefreshMangaDetail(local)) return null;

  const providerId = toProviderMangaId(providerMangaId);
  const details = await context.provider.getDetails(context.ctx, providerId);
  const chapters =
    context.provider.getChapters !== undefined
      ? await context.provider.getChapters(context.ctx, providerId)
      : [];

  const remote = binding.toMangaDetailData(providerMangaId, details, chapters);
  await persistMangaDetailToDb(db, remote);

  const { fetchMangaDetail } = await import('@app/library');
  const refreshed = await fetchMangaDetail(db, mangaId);
  return mergeMangaDetailWithLibrary(refreshed ?? remote, local);
}

/**
 * Fetches and persists page URLs for a chapter that has none yet, through the
 * provider package that owns the chapter. A chapter no registered provider
 * claims is left alone — its own provider owns that path.
 */
export async function ensureProviderChapterPages(
  db: AppDrizzleDb,
  chapterId: ChapterId,
  signal?: AbortSignal,
): Promise<void> {
  // A chapter that is not provider-sourced is none of this function's business:
  // it returns without touching a provider, and its pages come from whatever
  // provider owns it (ruling s4-leftovers-mangadex-ids). Reaching the
  // provider-unavailable rejection below is what must not happen for a chapter
  // another provider can still fill.
  const binding = getBindingForChapterId(chapterId);
  const providerChapterId = binding === null ? null : binding.parseAppChapterId(chapterId);
  if (binding === null || providerChapterId === null) return;

  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined || chapter.pages.length > 0) return;

  // Same contract for a chapter whose manga identity belongs to no registered
  // provider: this function cannot resolve a provider manga id for it, so it
  // leaves the chapter untouched instead of reporting a failure it cannot fix.
  const providerMangaId = binding.parseAppMangaId(chapter.mangaId);
  if (providerMangaId === null) return;

  const context = await providerContext(db, binding.providerId, signal);
  // A chapter without pages must not fall through as 'No chapters' when the
  // provider that could supply the metadata cannot be resolved: the reader
  // shows a retryable error instead.
  if (context === null || context.provider.getPages === undefined) {
    throw new Error(`${binding.providerId} provider is not available to load this chapter`);
  }

  const pages = await context.provider.getPages(
    context.ctx,
    toProviderMangaId(providerMangaId),
    providerChapterId,
  );

  await persistChapterPagesToDb(db, chapter, binding.toChapterPages(providerChapterId, pages));
}
