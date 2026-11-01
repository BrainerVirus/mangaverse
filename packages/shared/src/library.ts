import type { ChapterId } from './chapter.js';
import {
  getPrimaryProviderMapping,
  providerDisplayName,
  type MangaId,
  type MangaIdentity,
  type ProviderId,
  type ProviderMappingId,
} from './manga.js';

declare const libraryEntryIdBrand: unique symbol;
export type LibraryEntryId = string & {
  readonly [libraryEntryIdBrand]: typeof libraryEntryIdBrand;
};

declare const categoryIdBrand: unique symbol;
export type CategoryId = string & { readonly [categoryIdBrand]: typeof categoryIdBrand };

export function toLibraryEntryId(id: string): LibraryEntryId {
  return id as LibraryEntryId;
}

export function toCategoryId(id: string): CategoryId {
  return id as CategoryId;
}

export type LibraryStatus = 'reading' | 'completed' | 'on_hold' | 'dropped' | 'planned';

export const LIBRARY_STATUS_OPTIONS: readonly {
  readonly value: LibraryStatus;
  readonly label: string;
}[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'planned', label: 'Planned' },
];

export function libraryStatusLabel(status: LibraryStatus): string {
  return LIBRARY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

/**
 * The source line a library card may show: the default provider's registered
 * display name. Library rows carry no provider name, so a card that has no
 * lookup renders no source line at all instead of a raw id.
 */
export function librarySourceLabel(
  manga: MangaIdentity,
  providerLabels: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const mapping = getPrimaryProviderMapping(manga);
  return mapping === undefined
    ? undefined
    : providerDisplayName(mapping.providerId, providerLabels);
}

export type LibraryLayoutMode = 'grid' | 'list' | 'compact';

export type LibrarySortKey =
  | 'title'
  | 'last_read'
  | 'last_updated'
  | 'date_added'
  | 'unread'
  | 'provider'
  | 'progress';

export type LibrarySortDirection = 'asc' | 'desc';

export interface LibrarySort {
  readonly key: LibrarySortKey;
  readonly direction: LibrarySortDirection;
}

export interface LibraryFilter {
  readonly query?: string;
  readonly categoryIds?: readonly CategoryId[];
  readonly statuses?: readonly LibraryStatus[];
  readonly favoritesOnly?: boolean;
  readonly providerIds?: readonly ProviderId[];
}

export interface LibraryCategory {
  readonly id: CategoryId;
  readonly name: string;
  readonly color?: string;
  readonly pinned?: boolean;
  readonly sortIndex?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** Pinned categories first, then the stored order, then the name. */
export function compareLibraryCategories(a: LibraryCategory, b: LibraryCategory): number {
  if (a.pinned !== b.pinned) return a.pinned === true ? -1 : 1;
  const order = (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
  if (order !== 0) return order;
  return a.name.localeCompare(b.name);
}

export interface LibraryEntry {
  readonly id: LibraryEntryId;
  readonly mangaId: MangaId;
  readonly favorite: boolean;
  readonly categoryIds: readonly CategoryId[];
  readonly status: LibraryStatus;
  readonly unreadCount: number;
  readonly lastReadChapterId?: ChapterId;
  readonly activeProviderMappingId?: ProviderMappingId;
  readonly progressPercent?: number;
  readonly notes?: string;
  readonly addedAt?: string;
  readonly updatedAt?: string;
}

export interface LibraryViewState {
  readonly layout: LibraryLayoutMode;
  readonly sort: LibrarySort;
  readonly filter: LibraryFilter;
}
