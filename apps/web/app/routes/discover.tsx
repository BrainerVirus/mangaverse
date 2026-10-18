import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { AppDrizzleDb } from '@app/db';
import {
  DiscoverPage,
  discoverQueryKeys,
  type DiscoverExpandedSectionState,
  type DiscoverProviderFeed,
} from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';
import type { LocalDbStatus } from '../providers/local-db-provider.js';
import {
  fetchProviderDiscoverData,
  fetchProviderSectionPage,
  getSectionTitle,
  PROVIDER_SECTION_PAGE_SIZE,
} from '../queries/provider-discover.js';
import { getProviderBinding } from '../lib/provider-registry.js';

type DiscoverSearch = {
  provider?: string;
  section?: string;
};

type ExpandedSection = { providerId: string; sectionId: string };

type ExpandedSectionMeta = {
  binding: NonNullable<ReturnType<typeof getProviderBinding>>;
  title: string;
  sectionId: string;
};

/** Stable empty list so `providers` keeps its identity before the query resolves. */
const NO_PROVIDERS: readonly DiscoverProviderFeed[] = [];

export const Route = createFileRoute('/discover')({
  validateSearch: (search: Record<string, unknown>): DiscoverSearch => ({
    ...(typeof search.provider === 'string' ? { provider: search.provider } : {}),
    ...(typeof search.section === 'string' ? { section: search.section } : {}),
  }),
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

/** Falls back to the provider package's declared title so a stale deep link still gets a header. */
function resolveExpandedSectionMeta(
  expandedSection: ExpandedSection | null,
  providers: readonly DiscoverProviderFeed[],
): ExpandedSectionMeta | null {
  if (expandedSection === null) {
    return null;
  }

  const binding = getProviderBinding(expandedSection.providerId);
  if (binding === null) {
    return null;
  }

  const provider = providers.find((entry) => entry.providerId === expandedSection.providerId);
  const section = provider?.sections.find((entry) => entry.id === expandedSection.sectionId);
  if (section !== undefined) {
    return { binding, title: section.title, sectionId: section.id };
  }

  // Not in the loaded preview (still fetching, or filtered out): fall back to
  // the title the provider package declares for that section.
  const title = getSectionTitle(binding, expandedSection.sectionId);
  return title === null ? null : { binding, title, sectionId: expandedSection.sectionId };
}

/** Owns the expanded-section drill-down: its header, its paged query and load-more. */
function useExpandedSection(
  db: AppDrizzleDb | null,
  dbStatus: LocalDbStatus,
  providers: readonly DiscoverProviderFeed[],
  search: DiscoverSearch,
  explicitContent: boolean,
) {
  const expandedSection = useMemo(
    () => toExpandedSection(search.provider, search.section),
    [search.provider, search.section],
  );

  const expandedSectionMeta = useMemo(
    () => resolveExpandedSectionMeta(expandedSection, providers),
    [expandedSection, providers],
  );

  const sectionQuery = useInfiniteQuery({
    queryKey:
      expandedSection !== null && expandedSectionMeta !== null
        ? discoverQueryKeys.section(
            expandedSection.providerId,
            expandedSection.sectionId,
            explicitContent,
          )
        : ['discover', 'section', 'idle'],
    queryFn: ({ pageParam, signal }) =>
      fetchProviderSectionPage(
        db!,
        expandedSectionMeta!.binding,
        expandedSectionMeta!.sectionId,
        pageParam,
        PROVIDER_SECTION_PAGE_SIZE,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + PROVIDER_SECTION_PAGE_SIZE : undefined,
    enabled:
      dbStatus === 'ready' &&
      db !== null &&
      expandedSection !== null &&
      expandedSectionMeta !== null,
  });

  const expandedResults = useMemo(
    () => sectionQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [sectionQuery.data?.pages],
  );

  const loadMoreSection = useCallback(() => {
    if (sectionQuery.hasNextPage && !sectionQuery.isFetchingNextPage) {
      void sectionQuery.fetchNextPage();
    }
  }, [sectionQuery]);

  const expandedSectionState: DiscoverExpandedSectionState | undefined =
    expandedSectionMeta === null
      ? undefined
      : {
          title: expandedSectionMeta.title,
          results: expandedResults,
          isLoading: sectionQuery.isLoading,
          isFetchingNextPage: sectionQuery.isFetchingNextPage,
          hasNextPage: sectionQuery.hasNextPage ?? false,
        };

  return { expandedSection, expandedSectionState, isError: sectionQuery.isError, loadMoreSection };
}

function DiscoverRoute() {
  const navigate = useNavigate({ from: '/discover' });
  const search = Route.useSearch();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    search.provider ?? null,
  );

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const explicitContent = appSettingsQuery.data?.settings.explicitContent ?? false;

  const { data, isLoading, isError } = useQuery({
    queryKey: discoverQueryKeys.providers(explicitContent),
    queryFn: ({ signal }) => fetchProviderDiscoverData(db!, signal),
    enabled: dbStatus === 'ready' && db !== null && appSettingsQuery.isSuccess,
  });

  const providers = data?.providers ?? NO_PROVIDERS;
  const showProviderHint = dbStatus === 'ready' && !isLoading && providers.length === 0;

  const {
    expandedSection,
    expandedSectionState,
    isError: isSectionError,
    loadMoreSection,
  } = useExpandedSection(db, dbStatus, providers, search, explicitContent);

  return (
    <DiscoverPage
      data={data}
      selectedProviderId={selectedProviderId}
      expandedSection={expandedSection}
      {...(expandedSectionState !== undefined ? { expandedSectionState } : {})}
      isLoading={dbStatus === 'loading' || isLoading || appSettingsQuery.isLoading}
      isError={dbStatus === 'error' || isError || isSectionError}
      showProviderHint={showProviderHint}
      onSelectProvider={(providerId) => {
        setSelectedProviderId(providerId);
        void navigate({ search: { provider: providerId } });
      }}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onSeeAllSection={(providerId, sectionId) => {
        void navigate({ search: { provider: providerId, section: sectionId } });
      }}
      onBackFromSection={() => {
        if (search.provider !== undefined) {
          void navigate({ search: { provider: search.provider } });
          return;
        }
        void navigate({ search: {} });
      }}
      onLoadMoreSection={loadMoreSection}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
