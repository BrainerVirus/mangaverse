import type { ProviderManifest } from '@app/shared';
import { getRequiredMethodsForCapabilities } from './capabilities.js';
import type {
  ProviderAuthState,
  ProviderContext,
  ProviderContract,
  ProviderDownloadInfo,
  ProviderMethodName,
  ProviderPage,
  ProviderSearchInput,
  ProviderSearchResult,
  ProviderTag,
} from './contract-types.js';
import { defineProvider } from './define-provider.js';

export interface CreateMockProviderOptions {
  readonly manifest: ProviderManifest;
  /** Declares which methods exist as no-op stubs (defaults to all required by manifest). */
  readonly methods?: ReadonlySet<ProviderMethodName>;
}

const stubSearch = async (_ctx: ProviderContext, _input: ProviderSearchInput): Promise<ProviderSearchResult> => ({
  items: [],
  hasMore: false,
});

const stubPages = async (_ctx: ProviderContext, _mangaId: unknown, _chapterId: string): Promise<readonly ProviderPage[]> => [];

const stubDownload = async (
  _ctx: ProviderContext,
  _mangaId: unknown,
  chapterId: string,
): Promise<ProviderDownloadInfo> => ({
  chapterId,
  urls: [],
});

const stubTags = async (_ctx: ProviderContext): Promise<readonly ProviderTag[]> => [];

const stubAuth = async (): Promise<ProviderAuthState> => ({ kind: 'anonymous' });

export function createMockProvider(options: CreateMockProviderOptions): ProviderContract {
  const methodSet =
    options.methods ?? new Set<ProviderMethodName>(getRequiredMethodsForCapabilities(options.manifest));

  const m = options.manifest;

  const has = (name: ProviderMethodName) => methodSet.has(name);

  const provider: ProviderContract = {
    manifest: m,
    ...(has('search') ? { search: stubSearch } : {}),
    ...(has('advancedSearch') ? { advancedSearch: stubSearch } : {}),
    ...(has('browseLatest') ? { browseLatest: async (ctx) => stubSearch(ctx, { query: '' }) } : {}),
    ...(has('browsePopular') ? { browsePopular: async (ctx) => stubSearch(ctx, { query: '' }) } : {}),
    ...(has('getDetails')
      ? {
          getDetails: async (_ctx, mangaId) => ({
            providerMangaId: mangaId,
            titles: [{ value: 'Mock', locale: 'en' }],
          }),
        }
      : {}),
    ...(has('getChapters')
      ? {
          getChapters: async () => [],
        }
      : {}),
    ...(has('getPages') ? { getPages: stubPages } : {}),
    ...(has('getRecommendations') ? { getRecommendations: async (ctx) => stubSearch(ctx, { query: '' }) } : {}),
    ...(has('getRelatedTitles') ? { getRelatedTitles: async (ctx) => stubSearch(ctx, { query: '' }) } : {}),
    ...(has('getTags') ? { getTags: stubTags } : {}),
    ...(has('login') ? { login: stubAuth } : {}),
    ...(has('logout') ? { logout: stubAuth } : {}),
    ...(has('getDownloadInfo') ? { getDownloadInfo: stubDownload } : {}),
  };

  return defineProvider(provider);
}
