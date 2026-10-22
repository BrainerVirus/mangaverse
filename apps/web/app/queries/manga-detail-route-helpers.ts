import type { AppDrizzleDb } from '@app/db';
import type { QueryClient } from '@tanstack/react-query';
import {
  libraryQueryKeys,
  markPreviousChaptersRead,
  setChapterRead,
  type LibraryOrganizationAction,
  type MangaDetailData,
  type MangaDetailRelatedState,
} from '@app/library';
import type { ProviderUiInfo } from '@app/extensions';
import {
  refreshLibraryUnreadCount,
  setDefaultProviderMapping,
  setLibraryEntryActiveProviderMapping,
  setMangaCoverOverride,
  setPreferredChapterSource,
} from '@app/db';
import type {
  CategoryId,
  ChapterId,
  MangaId,
  MangaIdentity,
  MangaProviderMapping,
  ProviderMappingId,
} from '@app/shared';
import type { ProviderRelatedKind } from './provider-query-options.js';

export type ProviderAction =
  | { readonly type: 'select'; readonly mappingId: ProviderMappingId }
  | { readonly type: 'default'; readonly mappingId: ProviderMappingId }
  | { readonly type: 'preferred'; readonly mappingId: ProviderMappingId };

export type ChapterAction =
  | { readonly type: 'set'; readonly chapterId: ChapterId; readonly read: boolean }
  | { readonly type: 'previous'; readonly chapterId: ChapterId };

export function isDbReady(db: AppDrizzleDb | null, status: string): boolean {
  return status === 'ready' && db !== null;
}

export function isPageLoading(status: string, queryLoading: boolean): boolean {
  return status === 'loading' || queryLoading;
}

export function isPageError(status: string, queryError: boolean): boolean {
  return status === 'error' || queryError;
}

export function detailOrNull(data: MangaDetailData | null | undefined): MangaDetailData | null {
  return data ?? null;
}

export function invalidateMangaCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
}

function requireDb(db: AppDrizzleDb | null): AppDrizzleDb {
  if (db === null) throw new Error('Local database is not ready.');
  return db;
}

/** The card badge follows the mapping the user asked to read from. */
async function refreshUnreadForMapping(
  db: AppDrizzleDb,
  mangaId: MangaId,
  data: MangaDetailData | null | undefined,
  mappingId: ProviderMappingId,
): Promise<void> {
  const mapping = data?.manga.providerMappings.find((item) => item.id === mappingId);
  if (mapping === undefined) return;
  await refreshLibraryUnreadCount(db, mangaId, String(mapping.providerId));
}

export async function runProviderAction(
  db: AppDrizzleDb | null,
  mangaId: MangaId,
  data: MangaDetailData | null | undefined,
  action: ProviderAction,
): Promise<void> {
  const ready = requireDb(db);
  if (action.type === 'select') {
    if (data?.libraryEntry !== undefined) {
      const result = await setLibraryEntryActiveProviderMapping(
        ready,
        data.libraryEntry.id,
        action.mappingId,
      );
      if (!result.ok) throw new Error(result.error.message);
      await refreshUnreadForMapping(ready, mangaId, data, action.mappingId);
    }
    return;
  }

  if (action.type === 'default') {
    const result = await setDefaultProviderMapping(ready, mangaId, action.mappingId);
    if (!result.ok) throw new Error(result.error.message);
    return;
  }

  const result = await setPreferredChapterSource(ready, mangaId, action.mappingId);
  if (!result.ok) throw new Error(result.error.message);
  // Choosing a chapter source means the user wants to read from it now.
  if (data?.libraryEntry !== undefined) {
    const active = await setLibraryEntryActiveProviderMapping(
      ready,
      data.libraryEntry.id,
      action.mappingId,
    );
    if (!active.ok) throw new Error(active.error.message);
  }
  await refreshUnreadForMapping(ready, mangaId, data, action.mappingId);
}

export async function runCoverAction(
  db: AppDrizzleDb | null,
  mangaId: MangaId,
  coverImageUrl: string | undefined,
): Promise<void> {
  const result = await setMangaCoverOverride(requireDb(db), mangaId, coverImageUrl);
  if (!result.ok) throw new Error(result.error.message);
}

export async function runChapterAction(
  db: AppDrizzleDb | null,
  mangaId: MangaId,
  action: ChapterAction,
): Promise<void> {
  const ready = requireDb(db);
  const result =
    action.type === 'previous'
      ? await markPreviousChaptersRead(ready, mangaId, action.chapterId)
      : await setChapterRead(ready, mangaId, action.chapterId, action.read);
  if (!result.ok) throw new Error(result.error.message);
}

export function anyActionPending(flags: readonly boolean[]): boolean {
  return flags.some(Boolean);
}

export function categoriesChangeHandler(
  data: MangaDetailData | null | undefined,
  mutateAsync: (
    action: Extract<LibraryOrganizationAction, { type: 'set_entry_categories' }>,
  ) => Promise<void>,
): (categoryIds: readonly CategoryId[]) => Promise<void> | undefined {
  return (categoryIds) => {
    const entryId = data?.libraryEntry?.id;
    if (entryId === undefined) return undefined;
    return mutateAsync({ type: 'set_entry_categories', entryIds: [entryId], categoryIds });
  };
}

export function providerCapability(
  provider: ProviderUiInfo | undefined,
  kind: ProviderRelatedKind,
): boolean {
  if (provider === undefined || !provider.enabled) return false;
  return (
    provider.capabilities[
      kind === 'recommendations' ? 'metadata.recommendations' : 'metadata.relatedTitles'
    ] === true
  );
}

export function canLoadRelated(
  provider: ProviderUiInfo | undefined,
  mapping: MangaProviderMapping | undefined,
  kind: ProviderRelatedKind,
  ready: boolean,
): boolean {
  return ready && mapping !== undefined && providerCapability(provider, kind);
}

export function relatedQueryKey(
  mangaId: MangaId,
  kind: 'recommendations' | 'related',
  mapping: MangaProviderMapping | undefined,
): readonly unknown[] {
  return [...libraryQueryKeys.detail(mangaId), kind, mapping?.id ?? 'none'];
}

export interface RelatedQueryState {
  readonly data: readonly MangaIdentity[] | undefined;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

function toRelatedState(query: RelatedQueryState): MangaDetailRelatedState {
  return {
    ...(query.data === undefined ? {} : { items: query.data }),
    isLoading: query.isLoading,
    ...(query.error === null || query.error === undefined
      ? {}
      : {
          error:
            query.error instanceof Error ? query.error.message : 'The provider request failed.',
        }),
    onRetry: () => {
      void query.refetch();
    },
  };
}

export function pickRelatedProps(input: {
  readonly canRecommend: boolean;
  readonly canRelate: boolean;
  readonly recommendations: RelatedQueryState;
  readonly relatedTitles: RelatedQueryState;
}): {
  readonly recommendations?: MangaDetailRelatedState;
  readonly relatedTitles?: MangaDetailRelatedState;
} {
  return {
    ...(input.canRecommend ? { recommendations: toRelatedState(input.recommendations) } : {}),
    ...(input.canRelate ? { relatedTitles: toRelatedState(input.relatedTitles) } : {}),
  };
}

export function goBackOrLibrary(options: {
  readonly canGoBack: () => boolean;
  readonly back: () => void;
  readonly openLibrary: () => void;
}): void {
  if (options.canGoBack()) {
    options.back();
    return;
  }
  options.openLibrary();
}

export function openMigration(
  open: (href: string) => void,
  mapping: MangaProviderMapping | undefined,
): void {
  if (mapping === undefined) return;
  open(`/migration?source=${encodeURIComponent(String(mapping.providerId))}`);
}
