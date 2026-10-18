import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { DiscoverPage, discoverQueryKeys } from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';
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

export const Route = createFileRoute('/discover')({
  validateSearch: (search: Record<string, unknown>): DiscoverSearch => ({
    ...(typeof search.provider === 'string' ? { provider: search.provider } : {}),
    ...(typeof search.section === 'string' ? { section: search.section } : {}),
  }),
  component: DiscoverRoute,
});

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

  const providers = data?.providers ?? [];
  const showProviderHint = dbStatus === 'ready' && !isLoading && providers.length === 0;
  const expandedSection =
    search.provider !== undefined && search.section !== undefined
      ? { providerId: search.provider, sectionId: search.section }
      : null;

  const expandedSectionMeta = useMemo(() => {
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
  }, [expandedSection, providers]);

  const sectionInfiniteQuery = useInfiniteQuery({
    queryKey:
      expandedSection !== null
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
    () => sectionInfiniteQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [sectionInfiniteQuery.data?.pages],
  );

  const handleLoadMoreSection = useCallback(() => {
    if (sectionInfiniteQuery.hasNextPage && !sectionInfiniteQuery.isFetchingNextPage) {
      void sectionInfiniteQuery.fetchNextPage();
    }
  }, [sectionInfiniteQuery]);

  const expandedSectionState =
    expandedSection !== null && expandedSectionMeta !== null
      ? {
          title: expandedSectionMeta.title,
          results: expandedResults,
          isLoading: sectionInfiniteQuery.isLoading,
          isFetchingNextPage: sectionInfiniteQuery.isFetchingNextPage,
          hasNextPage: sectionInfiniteQuery.hasNextPage ?? false,
        }
      : undefined;

  return (
    <DiscoverPage
      data={data}
      selectedProviderId={selectedProviderId}
      expandedSection={expandedSection}
      {...(expandedSectionState !== undefined ? { expandedSectionState } : {})}
      isLoading={dbStatus === 'loading' || isLoading || appSettingsQuery.isLoading}
      isError={dbStatus === 'error' || isError || sectionInfiniteQuery.isError}
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
      onLoadMoreSection={handleLoadMoreSection}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
