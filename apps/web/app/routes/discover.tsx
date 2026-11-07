import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import { classifyAppError } from '@app/shared';
import type { AppDrizzleDb } from '@app/db';
import type { MangaIdentity } from '@app/shared';
import {
  DiscoverPage,
  discoverQueryKeys,
  type DiscoverExpandedSectionState,
  type DiscoverPageData,
  type DiscoverPageFailure,
  type DiscoverSectionFailure,
} from '@/features/search';
import { fetchAppSettings, settingsQueryKeys } from '@/features/settings';
import {
  useLocalDb,
  useLocalDbError,
  useLocalDbRetry,
  useLocalDbStatus,
} from '../providers/local-db-provider.js';
import type { LocalDbStatus } from '../providers/local-db-provider.js';
import {
  fetchDiscoverProviders,
  fetchProviderSectionPage,
  fetchProviderSectionPreview,
  getSectionTitle,
  PROVIDER_SECTION_PAGE_SIZE,
} from '../queries/provider-discover.js';
import type { DiscoverProviderDescriptor } from '../queries/provider-discover.js';
import { getProviderBinding } from '../lib/provider-registry.js';
import { goBackIfMarked } from '../lib/navigation-history.js';

const discoverSearchSchema = z.object({
  provider: z.string().optional().catch(undefined),
  section: z.string().optional().catch(undefined),
});

type DiscoverSearch = z.infer<typeof discoverSearchSchema>;

type ExpandedSection = { providerId: string; sectionId: string };

type ExpandedSectionMeta = {
  binding: NonNullable<ReturnType<typeof getProviderBinding>>;
  title: string;
  sectionId: string;
};

export const Route = createFileRoute('/discover')({
  validateSearch: (search: Record<string, unknown>): DiscoverSearch =>
    discoverSearchSchema.parse(search),
  component: DiscoverRoute,
});

function toExpandedSection(
  provider: string | undefined,
  section: string | undefined,
): ExpandedSection | null {
  if (provider === undefined || section === undefined) {
    return null;
  }
  return { providerId: provider, sectionId: section };
}

/**
 * The provider package declares the section title, so a deep link or a history
 * navigation renders its header before any preview resolves.
 */
function resolveExpandedSectionMeta(
  expandedSection: ExpandedSection | null,
): ExpandedSectionMeta | null {
  if (expandedSection === null) {
    return null;
  }

  const binding = getProviderBinding(expandedSection.providerId);
  if (binding === null) {
    return null;
  }

  const title = getSectionTitle(binding, expandedSection.sectionId);
  return title === null ? null : { binding, title, sectionId: expandedSection.sectionId };
}

/** Reads the remaining rate-limit horizon out of the normalized failure chain. */
function retryAfterMsOf(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const details = (current as { readonly details?: unknown }).details;
    if (typeof details === 'object' && details !== null) {
      const value = (details as { readonly retryAfterMs?: unknown }).retryAfterMs;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    }
    current = (current as { readonly cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * A rate-limited source gets its real horizon in the copy; everything else uses
 * the shared classifier, so offline, database and provider failures never share
 * one static sentence.
 */
function describeSectionFailure(error: unknown, providerName: string): DiscoverSectionFailure {
  const online =
    typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator.onLine;
  const classified = classifyAppError(error, online === undefined ? {} : { online });
  const retryAfterMs = retryAfterMsOf(error);
  const message =
    classified.code === 'rate-limited' && retryAfterMs !== undefined
      ? `${providerName} is limiting requests. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`
      : classified.message;
  return {
    kind: classified.code,
    message,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

function describePageFailure(error: unknown): DiscoverPageFailure {
  const online =
    typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator.onLine;
  const classified = classifyAppError(error, online === undefined ? {} : { online });
  if (classified.code === 'database') {
    return {
      kind: 'database',
      title: 'Could not open your library',
      message: classified.message,
    };
  }
  if (classified.code === 'offline') {
    return { kind: 'provider', title: "You're offline", message: classified.message };
  }
  return {
    kind: 'provider',
    title: 'Could not load discover feed',
    message: classified.message,
  };
}

/** Owns the expanded-section drill-down: its header, its paged query and load-more. */
function useExpandedSection(
  db: AppDrizzleDb | null,
  dbStatus: LocalDbStatus,
  expandedSection: ExpandedSection | null,
  meta: ExpandedSectionMeta | null,
  activeProviderId: string | null,
  providerName: string,
  explicitContent: boolean,
) {
  const query = useInfiniteQuery({
    queryKey:
      expandedSection !== null
        ? discoverQueryKeys.section(
            expandedSection.providerId,
            expandedSection.sectionId,
            explicitContent,
          )
        : (['discover', 'section', 'idle', explicitContent] as const),
    queryFn: ({ pageParam, signal }) =>
      fetchProviderSectionPage(
        db!,
        meta!.binding,
        meta!.sectionId,
        pageParam,
        PROVIDER_SECTION_PAGE_SIZE,
        signal,
        explicitContent,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + PROVIDER_SECTION_PAGE_SIZE : undefined,
    meta: { feedback: { surface: 'inline' } },
    // Interactive: never queue a second request behind a parked gate or timeout.
    retry: false,
    enabled:
      dbStatus === 'ready' &&
      db !== null &&
      meta !== null &&
      expandedSection !== null &&
      expandedSection.providerId === activeProviderId,
  });

  const results = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data?.pages],
  );

  const error =
    query.isError && results.length === 0
      ? describeSectionFailure(query.error, providerName)
      : undefined;

  const nextPageError = query.isFetchNextPageError
    ? describeSectionFailure(query.error, providerName)
    : undefined;

  // A failed next page retries only that page; a failed first page starts over.
  const retry = useCallback(() => {
    if ((query.data?.pages.length ?? 0) > 0) {
      void query.fetchNextPage();
      return;
    }
    void query.refetch();
  }, [query]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [query]);

  const state: DiscoverExpandedSectionState | undefined =
    meta === null
      ? undefined
      : {
          title: meta.title,
          results,
          isLoading: query.isLoading,
          isFetchingNextPage: query.isFetchingNextPage,
          hasNextPage: query.hasNextPage ?? false,
          ...(error !== undefined ? { error } : {}),
          ...(nextPageError !== undefined ? { nextPageError } : {}),
        };

  return { expandedSection, state, retry, loadMore };
}

/** Only a ready, settled, error-free feed with nothing to show offers "Browse providers". */
function shouldShowProviderHint(
  dbStatus: LocalDbStatus,
  providersLoading: boolean,
  failure: DiscoverPageFailure | undefined,
  settingsFailure: DiscoverPageFailure | undefined,
  providerCount: number,
): boolean {
  return (
    dbStatus === 'ready' &&
    !providersLoading &&
    failure === undefined &&
    settingsFailure === undefined &&
    providerCount === 0
  );
}

type DiscoverSectionQuery = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: { readonly results: readonly MangaIdentity[] } | undefined;
};

/** Joins the descriptor list and each preview query into the page's data shape. */
function buildDiscoverData(
  providers: readonly DiscoverProviderDescriptor[] | undefined,
  activeProviderId: string | null,
  sectionQueries: readonly DiscoverSectionQuery[],
): DiscoverPageData | undefined {
  if (providers === undefined) return undefined;
  return {
    providers: providers.map((provider) => {
      if (provider.providerId !== activeProviderId) {
        return {
          providerId: provider.providerId,
          providerName: provider.providerName,
          sections: provider.sections.map((section) => ({ ...section, results: [] })),
        };
      }
      return {
        providerId: provider.providerId,
        providerName: provider.providerName,
        sections: provider.sections.map((section, index) =>
          toDiscoverSection(provider.providerName, section, sectionQueries[index]),
        ),
      };
    }),
  };
}

function toDiscoverSection(
  providerName: string,
  section: DiscoverProviderDescriptor['sections'][number],
  query: DiscoverSectionQuery | undefined,
): DiscoverPageData['providers'][number]['sections'][number] {
  if (query === undefined || query.isPending) {
    return { ...section, results: [], status: 'loading' };
  }
  if (query.isError) {
    return {
      ...section,
      results: [],
      status: 'error',
      error: describeSectionFailure(query.error, providerName),
    };
  }
  const results = query.data?.results ?? [];
  return {
    ...section,
    results,
    status: results.length > 0 ? 'ok' : 'empty',
  };
}

function resolveDiscoverFailure(
  dbStatus: LocalDbStatus,
  dbError: string | null,
  providersError: unknown,
): DiscoverPageFailure | undefined {
  if (dbStatus === 'error') {
    return {
      kind: 'database',
      title: 'Could not open your library',
      message: dbError ?? 'The local library could not be opened. Try again.',
    };
  }
  if (providersError !== undefined) return describePageFailure(providersError);
  return undefined;
}

function resolveSettingsFailure(isError: boolean): DiscoverPageFailure | undefined {
  if (!isError) return undefined;
  return {
    kind: 'settings',
    title: 'Settings could not be read',
    message: 'Discover is showing safe content only. Try again to load your content preferences.',
  };
}

function DiscoverRoute() {
  const navigate = useNavigate({ from: '/discover' });
  const router = useRouter();
  const search = Route.useSearch();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const dbError = useLocalDbError();
  const retryDb = useLocalDbRetry();

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
    retry: false,
  });

  // A failed settings read must not disable Discover: show safe content and an
  // inline Retry instead of looking like "no providers".
  const explicitContent = appSettingsQuery.data?.settings.explicitContent ?? false;

  const providersQuery = useQuery({
    queryKey: discoverQueryKeys.providers(),
    queryFn: () => fetchDiscoverProviders(db!),
    meta: { feedback: { surface: 'inline' } },
    retry: false,
    enabled: dbStatus === 'ready' && db !== null,
  });

  const providers = providersQuery.data ?? [];

  // The URL is the source of truth. A stale or unknown provider falls back to
  // the first tab, so history navigation can never desync tab and panel.
  const activeProvider =
    providers.find((provider) => provider.providerId === search.provider) ?? providers[0];
  const activeProviderId = activeProvider?.providerId ?? null;
  const activeSections = activeProvider?.sections ?? [];

  const sectionQueries = useQueries({
    queries: activeSections.map((section) => ({
      queryKey: discoverQueryKeys.preview(activeProviderId ?? '', section.id, explicitContent),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchProviderSectionPreview(
          db!,
          activeProviderId ?? '',
          section.id,
          signal,
          explicitContent,
        ),
      enabled: dbStatus === 'ready' && db !== null && activeProviderId !== null,
      retry: false,
      meta: { feedback: { surface: 'inline' } },
    })),
  });

  const data = buildDiscoverData(providersQuery.data, activeProviderId, sectionQueries);

  const expandedSection = useMemo(
    () => toExpandedSection(search.provider, search.section),
    [search.provider, search.section],
  );
  const expandedSectionMeta = useMemo(
    () => resolveExpandedSectionMeta(expandedSection),
    [expandedSection],
  );

  const {
    state: expandedSectionState,
    retry: retryExpandedSection,
    loadMore: loadMoreSection,
  } = useExpandedSection(
    db,
    dbStatus,
    expandedSection,
    expandedSectionMeta,
    activeProviderId,
    activeProvider?.providerName ?? 'This provider',
    explicitContent,
  );

  const failure = resolveDiscoverFailure(
    dbStatus,
    dbError,
    providersQuery.isError ? providersQuery.error : undefined,
  );
  const settingsFailure = resolveSettingsFailure(appSettingsQuery.isError);

  const showProviderHint = shouldShowProviderHint(
    dbStatus,
    providersQuery.isLoading,
    failure,
    settingsFailure,
    providers.length,
  );

  const retrySection = (sectionId: string) => {
    const index = activeSections.findIndex((section) => section.id === sectionId);
    if (index >= 0) void sectionQueries[index]?.refetch();
  };

  return (
    <DiscoverPage
      data={data}
      selectedProviderId={activeProviderId}
      expandedSection={expandedSection}
      {...(expandedSectionState !== undefined ? { expandedSectionState } : {})}
      isLoading={dbStatus === 'loading' || providersQuery.isLoading}
      {...(failure !== undefined ? { failure } : {})}
      {...(settingsFailure !== undefined ? { settingsFailure } : {})}
      showProviderHint={showProviderHint}
      onSelectProvider={(providerId) => {
        void navigate({ search: { provider: providerId } });
      }}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onSeeAllSection={(providerId, sectionId) => {
        const state =
          search.section === undefined ? { navigationOpener: 'discover-feed' as const } : {};
        void navigate({
          search: { provider: providerId, section: sectionId },
          state: (previous) => ({ ...previous, navigationOpener: state.navigationOpener }),
        });
      }}
      onBackFromSection={() => {
        if (goBackIfMarked(router.history, 'discover-feed')) return;
        if (search.provider !== undefined) {
          void navigate({ search: { provider: search.provider }, replace: true });
          return;
        }
        void navigate({ search: {}, replace: true });
      }}
      onLoadMoreSection={loadMoreSection}
      onRetryExpandedSection={retryExpandedSection}
      onRetrySection={retrySection}
      onRetrySettings={() => void appSettingsQuery.refetch()}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      onRetry={() => {
        if (dbStatus === 'error') {
          retryDb();
          return;
        }
        void providersQuery.refetch();
      }}
    />
  );
}
