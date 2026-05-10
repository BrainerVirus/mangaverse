import type { MangaId, ProviderId, ProviderMappingId } from './manga.js';

declare const chapterIdBrand: unique symbol;
export type ChapterId = string & { readonly [chapterIdBrand]: typeof chapterIdBrand };

declare const chapterPageIdBrand: unique symbol;
export type ChapterPageId = string & {
  readonly [chapterPageIdBrand]: typeof chapterPageIdBrand;
};

export function toChapterId(id: string): ChapterId {
  return id as ChapterId;
}

export function toChapterPageId(id: string): ChapterPageId {
  return id as ChapterPageId;
}

export interface ChapterPageImageMeta {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
  readonly mimeType?: string;
}

export interface ChapterPage {
  readonly id: ChapterPageId;
  readonly index: number;
  readonly image: ChapterPageImageMeta;
  readonly loadFailed?: boolean;
  readonly retryCount?: number;
  readonly lastErrorCode?: string;
}

export interface Chapter {
  readonly id: ChapterId;
  readonly mangaId: MangaId;
  readonly providerId?: ProviderId;
  readonly providerChapterId?: string;
  readonly title: string;
  readonly index: number;
  readonly volume?: string;
  readonly publishedAt?: string;
  readonly pages: readonly ChapterPage[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ReadingProgress {
  readonly readPercent: number;
  readonly lastPageIndex: number;
  readonly completed: boolean;
  readonly startedAt?: string;
  readonly updatedAt?: string;
}

export interface ChapterReadState {
  readonly chapterId: ChapterId;
  readonly mangaId: MangaId;
  readonly providerMappingId?: ProviderMappingId;
  readonly progress: ReadingProgress;
}
