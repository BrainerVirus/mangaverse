import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { AppDrizzleDb } from '@app/db/browser';
import {
  DiscoverPage,
  type DiscoverPageData,
  type DiscoverSection,
  discoverQueryKeys,
} from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';
import {
  DEV_MANGADEX_SECTION_DEFINITIONS,
  DEV_MANGADEX_SECTION_PREVIEW_SIZE,
  DEV_MANGADEX_SECTION_PAGE_SIZE,
  fetchDevMangaDexSectionPage,
  getEnabledMangaDexSections,
  getInstalledMangaDexManifest,
  type DevMangaDexSectionId,
} from '../lib/dev-mangadex-search.js';

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

async function buildDiscoverPageData(
  db: AppDrizzleDb,
  explicitContent: boolean,
): Promise<DiscoverPageData> {
  const manifest = await getInstalledMangaDexManifest(db);
  if (manifest === null) {
    return { providers: [] };
  }

  const sectionDefinitions = getEnabledMangaDexSections(manifest);
  const sectionResults = await Promise.all(
    sectionDefinitions.map(async (definition) => {
      const page = await fetchDevMangaDexSectionPage(
        definition.id,
        0,
        DEV_MANGADEX_SECTION_PREVIEW_SIZE,
        explicitContent,
      );
      return {
        id: definition.id,
        title: definition.title,
        capability: definition.capability,
        results: page.results,
      } satisfies DiscoverSection;
    }),
  );

  return {
    providers: [
      {
        providerId: 'mangadex',
        providerName: manifest.name,
        sections: sectionResults.filter((section) => section.results.length > 0),
      },
    ],
  };
}

function DiscoverRoute() {
  const navigate = useNavigate({ from: '/discover' });
  const search = Route.useSearch();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(search.provider ?? null);

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const explicitContent = appSettingsQuery.data?.settings.explicitContent ?? false;

  const { data, isLoading, isError } = useQuery({
    queryKey: discoverQueryKeys.providers(explicitContent),
    queryFn: async () => {
      if (!import.meta.env.DEV || db === null) {
        return { providers: [] } satisfies DiscoverPageData;
      }
      const manifest = await getInstalledMangaDexManifest(db);
      if (manifest === null) {
        return { providers: [] } satisfies DiscoverPageData;
      }
      return buildDiscoverPageData(db, explicitContent);
    },
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

    const provider = providers.find((entry) => entry.providerId === expandedSection.providerId);
    const section = provider?.sections.find((entry) => entry.id === expandedSection.sectionId);
    if (section !== undefined) {
      return { title: section.title, sectionId: section.id as DevMangaDexSectionId };
    }

    const fallback = DEV_MANGADEX_SECTION_DEFINITIONS.find(
      (entry) => entry.id === expandedSection.sectionId,
    );
    if (fallback !== undefined && expandedSection.providerId === 'mangadex') {
      return { title: fallback.title, sectionId: fallback.id };
    }

    return null;
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
    queryFn: ({ pageParam }) =>
      fetchDevMangaDexSectionPage(
        expandedSectionMeta!.sectionId,
        pageParam,
        DEV_MANGADEX_SECTION_PAGE_SIZE,
        explicitContent,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + DEV_MANGADEX_SECTION_PAGE_SIZE : undefined,
    enabled:
      dbStatus === 'ready' &&
      expandedSection !== null &&
      expandedSectionMeta !== null &&
      import.meta.env.DEV,
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
