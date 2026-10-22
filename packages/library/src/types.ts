import type {
  CategoryId,
  Chapter,
  ChapterId,
  LibraryCategory,
  LibraryEntry,
  LibraryEntryId,
  LibraryStatus,
  LibraryViewState,
  MangaIdentity,
  ProviderId,
} from '@app/shared';

export interface LibraryItem {
  readonly entry: LibraryEntry;
  readonly manga: MangaIdentity;
}

export interface LibraryPageData {
  readonly items: readonly LibraryItem[];
  readonly categories: readonly LibraryCategory[];
  /** Providers present in the library, independent of the active filter. */
  readonly providers?: readonly ProviderId[];
  readonly viewState: LibraryViewState;
}

export interface MangaDetailData {
  readonly manga: MangaIdentity;
  readonly chapters: readonly Chapter[];
  readonly libraryEntry: LibraryEntry | undefined;
  readonly continueChapterId: ChapterId | undefined;
  readonly categories?: readonly LibraryCategory[];
}

/** Every write the library page can trigger, applied by `applyLibraryOrganizationAction`. */
export type LibraryOrganizationAction =
  | { readonly type: 'create_category'; readonly name: string; readonly color?: string }
  | {
      readonly type: 'rename_category';
      readonly categoryId: CategoryId;
      readonly name: string;
      readonly color?: string;
    }
  | { readonly type: 'delete_category'; readonly categoryId: CategoryId }
  | {
      readonly type: 'set_category_pinned';
      readonly categoryId: CategoryId;
      readonly pinned: boolean;
    }
  | { readonly type: 'reorder_categories'; readonly categoryIds: readonly CategoryId[] }
  | {
      readonly type: 'set_entry_categories';
      readonly entryIds: readonly LibraryEntryId[];
      readonly categoryIds: readonly CategoryId[];
    }
  | {
      readonly type: 'add_entry_categories';
      readonly entryIds: readonly LibraryEntryId[];
      readonly categoryIds: readonly CategoryId[];
    }
  | {
      readonly type: 'remove_entry_categories';
      readonly entryIds: readonly LibraryEntryId[];
      readonly categoryIds: readonly CategoryId[];
    }
  | {
      readonly type: 'set_entries_status';
      readonly entryIds: readonly LibraryEntryId[];
      readonly status: LibraryStatus;
    }
  | {
      readonly type: 'set_entries_favorite';
      readonly entryIds: readonly LibraryEntryId[];
      readonly favorite: boolean;
    };
