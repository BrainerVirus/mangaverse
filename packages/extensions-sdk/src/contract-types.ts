import type { ContentRating, MangaTitle, ProviderManifest, ProviderMangaId } from '@app/shared';

export type ProviderMethodName =
  | 'search'
  | 'advancedSearch'
  | 'browseLatest'
  | 'browsePopular'
  | 'getDetails'
  | 'getChapters'
  | 'getPages'
  | 'getRecommendations'
  | 'getRelatedTitles'
  | 'getTags'
  | 'login'
  | 'logout'
  | 'getDownloadInfo';

export interface ProviderRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit | null;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface ProviderContext {
  readonly manifest: ProviderManifest;
  readonly providerId: string;
  readonly signal?: AbortSignal;
}

export interface ProviderSearchInput {
  readonly query: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface ProviderSearchResult {
  readonly items: readonly ProviderSearchResultItem[];
  readonly hasMore?: boolean;
}

export interface ProviderSearchResultItem {
  readonly providerMangaId: ProviderMangaId;
  readonly title: string;
  readonly coverUrl?: string;
}

export interface ProviderTag {
  readonly id: string;
  readonly label: string;
}

export interface ProviderDetails {
  readonly providerMangaId: ProviderMangaId;
  readonly titles: readonly MangaTitle[];
  readonly description?: string;
  readonly coverUrl?: string;
  readonly contentRating?: ContentRating;
  readonly tags?: readonly ProviderTag[];
}

export interface ProviderChapter {
  readonly id: string;
  readonly title: string;
  readonly index: number;
  readonly publishedAt?: string;
}

export interface ProviderPage {
  readonly index: number;
  readonly imageUrl: string;
}

export type ProviderAuthState =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'session'; readonly label?: string }
  | { readonly kind: 'unknown' };

export interface ProviderDownloadInfo {
  readonly chapterId: string;
  readonly urls: readonly string[];
}

/**
 * Optional provider surface; methods must match manifest capabilities.
 */
export interface ProviderContract {
  readonly manifest: ProviderManifest;
  readonly search?: (ctx: ProviderContext, input: ProviderSearchInput) => Promise<ProviderSearchResult>;
  readonly advancedSearch?: (
    ctx: ProviderContext,
    input: ProviderSearchInput & Readonly<Record<string, string | number | boolean | undefined>>,
  ) => Promise<ProviderSearchResult>;
  readonly browseLatest?: (ctx: ProviderContext, input: { readonly page?: number }) => Promise<ProviderSearchResult>;
  readonly browsePopular?: (ctx: ProviderContext, input: { readonly page?: number }) => Promise<ProviderSearchResult>;
  readonly getDetails?: (ctx: ProviderContext, mangaId: ProviderMangaId) => Promise<ProviderDetails>;
  readonly getChapters?: (ctx: ProviderContext, mangaId: ProviderMangaId) => Promise<readonly ProviderChapter[]>;
  readonly getPages?: (
    ctx: ProviderContext,
    mangaId: ProviderMangaId,
    chapterId: string,
  ) => Promise<readonly ProviderPage[]>;
  readonly getRecommendations?: (ctx: ProviderContext, mangaId: ProviderMangaId) => Promise<ProviderSearchResult>;
  readonly getRelatedTitles?: (ctx: ProviderContext, mangaId: ProviderMangaId) => Promise<ProviderSearchResult>;
  readonly getTags?: (ctx: ProviderContext) => Promise<readonly ProviderTag[]>;
  readonly login?: (ctx: ProviderContext, input: Readonly<Record<string, string>>) => Promise<ProviderAuthState>;
  readonly logout?: (ctx: ProviderContext) => Promise<ProviderAuthState>;
  readonly getDownloadInfo?: (
    ctx: ProviderContext,
    mangaId: ProviderMangaId,
    chapterId: string,
  ) => Promise<ProviderDownloadInfo>;
}
