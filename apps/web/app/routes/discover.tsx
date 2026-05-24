import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DiscoverPage, type DiscoverPageData } from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';
import {
  fetchDevMangaDexLatestResults,
  fetchDevMangaDexPopularResults,
  isMangaDexInstalled,
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

const discoverQueryKey = ['discover', 'providers'] as const;

async function fetchDiscoverPageData(
  explicitContent: boolean,
): Promise<DiscoverPageData> {
  const [popular, latest] = await Promise.all([
    fetchDevMangaDexPopularResults(12, explicitContent),
    fetchDevMangaDexLatestResults(12, explicitContent),
  ]);

  return {
    providers: [
      {
        providerId: 'mangadex',
        providerName: 'MangaDex',
        sections: [
          {
            id: 'popular',
            title: 'Popular',
            capability: 'discovery.popular',
            results: popular,
          },
          {
            id: 'latest',
            title: 'Latest updates',
            capability: 'discovery.latest',
            results: latest,
          },
        ],
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
    queryKey: [...discoverQueryKey, explicitContent],
    queryFn: async () => {
      if (!import.meta.env.DEV || db === null) {
        return { providers: [] } satisfies DiscoverPageData;
      }
      const installed = await isMangaDexInstalled(db);
      if (!installed) {
        return { providers: [] } satisfies DiscoverPageData;
      }
      return fetchDiscoverPageData(explicitContent);
    },
    enabled: dbStatus === 'ready' && db !== null && appSettingsQuery.isSuccess,
  });

  const providers = data?.providers ?? [];
  const showProviderHint = dbStatus === 'ready' && !isLoading && providers.length === 0;
  const expandedSection =
    search.provider !== undefined && search.section !== undefined
      ? { providerId: search.provider, sectionId: search.section }
      : null;

  return (
    <DiscoverPage
      data={data}
      selectedProviderId={selectedProviderId}
      expandedSection={expandedSection}
      isLoading={dbStatus === 'loading' || isLoading || appSettingsQuery.isLoading}
      isError={dbStatus === 'error' || isError}
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
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
