import type { AppDrizzleDb } from '@app/db/browser';
import { getChapter, refreshLibraryUnreadCount, upsertChapterWithPages } from '@app/db/browser';
import { applyExplicitContentGate, loadProviderSettings } from '@app/extensions';
import type { ProviderContext, ProviderContract } from '@app/extensions-sdk';
import { normalizeProviderError } from '@app/extensions-sdk';
import type { MangaDetailData } from '@app/library';
import type {
  ChapterId,
  MangaId,
  MangaIdentity,
  MangaProviderMapping,
  ProviderCapabilityKey,
} from '@app/shared';
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

export type ProviderRelatedKind = 'recommendations' | 'relatedTitles';

const RELATED_CAPABILITY: Readonly<Record<ProviderRelatedKind, ProviderCapabilityKey>> = {
  recommendations: 'metadata.recommendations',
  relatedTitles: 'metadata.relatedTitles',
};

/**
 * Provider recommendations/related titles for one attached mapping. Returns
 * empty without a call when the provider lacks the capability, so the detail
 * page can hide the section instead of inventing one.
 */
export async function fetchProviderRelatedTitles(
  db: AppDrizzleDb,
  mapping: MangaProviderMapping,
  kind: ProviderRelatedKind,
  signal?: AbortSignal,
): Promise<readonly MangaIdentity[]> {
  const binding = getProviderBinding(String(mapping.providerId));
  if (binding === null) return [];

  const context = await providerContext(db, binding.providerId, signal);
  if (context === null) return [];
  if (!hasProviderCapability(context.provider.manifest, RELATED_CAPABILITY[kind])) return [];

  const method =
    kind === 'recommendations'
      ? context.provider.getRecommendations
      : context.provider.getRelatedTitles;
  if (method === undefined) return [];

  try {
    const result = await method.call(context.provider, context.ctx, mapping.providerMangaId);
    return binding.toSearchIdentities(result.items);
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new Error(
      normalizeProviderError(error, { providerId: binding.providerId, operation: kind }).message,
      { cause: error },
    );
  }
}

/**
 * Hydrates the chapter list for one attached mapping. Only runs when the
 * provider declares `metadata.chapters`; the caller polls the local detail
 * query afterwards instead of trusting the provider response.
 */
export async function ensureProviderChaptersForMapping(
  db: AppDrizzleDb,
  mangaId: MangaId,
  mapping: MangaProviderMapping,
  signal?: AbortSignal,
): Promise<number> {
  const binding = getProviderBinding(String(mapping.providerId));
  if (binding === null) return 0;

  const context = await providerContext(db, binding.providerId, signal);
  if (context === null || context.provider.getChapters === undefined) return 0;
  if (!hasProviderCapability(context.provider.manifest, 'metadata.chapters')) return 0;

  try {
    const chapters = await context.provider.getChapters(context.ctx, mapping.providerMangaId);
    for (const chapter of chapters) {
      const mapped = binding.toChapter(String(mapping.providerMangaId), chapter);
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- one row per chapter against the browser-SQLite runtime; parallel writes would contend for the same write lock
      const written = await upsertChapterWithPages(db, {
        chapterId: mapped.id,
        mangaId,
        providerMappingId: mapping.id,
        providerId: String(mapping.providerId),
        ...(mapped.providerChapterId !== undefined
          ? { providerChapterId: mapped.providerChapterId }
          : {}),
        title: mapped.title,
        index: mapped.index,
        ...(mapped.volume !== undefined ? { volume: mapped.volume } : {}),
        ...(mapped.publishedAt !== undefined ? { publishedAt: mapped.publishedAt } : {}),
        pages: [],
      });
      if (!written.ok) throw new Error(written.error.message);
    }
    return chapters.length;
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new Error(
      normalizeProviderError(error, {
        providerId: binding.providerId,
        operation: 'chapters',
      }).message,
      { cause: error },
    );
  }
}

/**
 * Hydrates one mapping's chapters, then recomputes the badge that mapping
 * drives. The switch handler can only see pre-hydration chapters, so without
 * this second refresh the card would keep the zero it wrote for an empty
 * mapping. Runs even when hydration is skipped for an unsupported provider so
 * the stored count always matches the mapping now being viewed.
 */
export async function hydrateProviderChaptersForMapping(
  db: AppDrizzleDb,
  mangaId: MangaId,
  mapping: MangaProviderMapping,
  signal?: AbortSignal,
): Promise<number> {
  const written = await ensureProviderChaptersForMapping(db, mangaId, mapping, signal);
  await refreshLibraryUnreadCount(db, mangaId, mapping.id);
  return written;
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
