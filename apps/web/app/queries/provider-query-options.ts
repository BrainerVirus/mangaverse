import type { AppDrizzleDb } from '@app/db/browser';
import { getChapter } from '@app/db/browser';
import { applyExplicitContentGate, loadProviderSettings } from '@app/extensions';
import type { ProviderContext, ProviderContract } from '@app/extensions-sdk';
import { normalizeProviderError } from '@app/extensions-sdk';
import type { MangaDetailData } from '@app/library';
import type { ChapterId, MangaId, MangaIdentity } from '@app/shared';
import { hasProviderCapability, toProviderMangaId } from '@app/shared';

import {
  mergeMangaDetailWithLibrary,
  persistChapterPagesToDb,
  persistMangaDetailToDb,
  shouldRefreshMangaDetail,
} from '../lib/manga-detail-persist.js';
import {
  getBindingForChapterId,
  getProviderBinding,
  listProviderBindings,
  readInstalledExtensions,
  resolveInstalledProvider,
  type ProviderAppBinding,
} from '../lib/provider-registry.js';

/** App search page size for remote results, kept in step with the discover grid. */
const REMOTE_SEARCH_LIMIT = 24;

async function providerContext(
  db: AppDrizzleDb,
  providerId: string,
  signal?: AbortSignal,
  explicitContent = false,
): Promise<{ ctx: ProviderContext; provider: ProviderContract } | null> {
  const provider = await resolveInstalledProvider(db, providerId);
  if (provider === null) {
    return null;
  }
  const settings = applyExplicitContentGate(
    await loadProviderSettings(db, providerId),
    explicitContent,
  );
  const ctx: ProviderContext = {
    manifest: provider.manifest,
    providerId,
    settings,
    ...(signal !== undefined ? { signal } : {}),
  };
  return { ctx, provider };
}

export interface SearchProviderInfo {
  readonly providerId: string;
  readonly label: string;
}

/**
 * Installed, enabled providers that declare `discovery.search`. Disabled or
 * non-search providers never enter the search fan-out.
 */
export async function listSearchProviders(db: AppDrizzleDb): Promise<SearchProviderInfo[]> {
  const installed = await readInstalledExtensions(db);
  return listProviderBindings()
    .filter((binding) => {
      const entry = installed.find(
        (item) => String(item.manifest.id) === binding.providerId && item.enabled,
      );
      return entry !== undefined && hasProviderCapability(entry.manifest, 'discovery.search');
    })
    .map((binding) => {
      const entry = installed.find((item) => String(item.manifest.id) === binding.providerId);
      return { providerId: binding.providerId, label: entry?.manifest.name ?? binding.providerId };
    });
}

/** One provider's search results as canonical identities (never persisted here). */
export async function fetchProviderSearchIdentities(
  db: AppDrizzleDb,
  providerId: string,
  query: string,
  signal?: AbortSignal,
  explicitContent = false,
): Promise<readonly MangaIdentity[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const context = await providerContext(db, providerId, signal, explicitContent);
  const binding = getProviderBinding(providerId);
  if (context === null || binding === null || context.provider.search === undefined) return [];

  try {
    const result = await context.provider.search(context.ctx, {
      query: trimmed,
      limit: REMOTE_SEARCH_LIMIT,
    });
    return binding.toSearchIdentities(result.items);
  } catch (error) {
    // A cancelled query is not a provider failure; React Query drops it.
    if (signal?.aborted === true) throw error;
    throw new Error(normalizeProviderError(error, { providerId, operation: 'search' }).message, {
      cause: error,
    });
  }
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
