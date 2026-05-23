import type { LibraryCategory, LibraryEntry, LibraryViewState, MangaIdentity } from '@app/shared';

export interface LibraryItem {
  readonly entry: LibraryEntry;
  readonly manga: MangaIdentity;
}

export interface LibraryPageData {
  readonly items: readonly LibraryItem[];
  readonly categories: readonly LibraryCategory[];
  readonly viewState: LibraryViewState;
}
