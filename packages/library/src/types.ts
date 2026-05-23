import type {
  Chapter,
  ChapterId,
  LibraryCategory,
  LibraryEntry,
  LibraryViewState,
  MangaIdentity,
} from '@app/shared';

export interface LibraryItem {
  readonly entry: LibraryEntry;
  readonly manga: MangaIdentity;
}

export interface LibraryPageData {
  readonly items: readonly LibraryItem[];
  readonly categories: readonly LibraryCategory[];
  readonly viewState: LibraryViewState;
}

export interface MangaDetailData {
  readonly manga: MangaIdentity;
  readonly chapters: readonly Chapter[];
  readonly libraryEntry: LibraryEntry | undefined;
  readonly continueChapterId: ChapterId | undefined;
}
