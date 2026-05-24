import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@app/design-system';
import { VirtualSearchGrid } from '@app/search';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';
import {
  fetchDevMangaDexDiscoverResults,
  isMangaDexInstalled,
} from '../lib/dev-mangadex-search.js';

export const Route = createFileRoute('/discover')({
  component: DiscoverRoute,
});

const discoverQueryKey = ['discover', 'mangadex'] as const;

function DiscoverRoute() {
  const navigate = useNavigate();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();

  const { data, isLoading, isError } = useQuery({
    queryKey: discoverQueryKey,
    queryFn: async () => {
      if (!import.meta.env.DEV || db === null) {
        return [];
      }
      const installed = await isMangaDexInstalled(db);
      if (!installed) {
        return [];
      }
      return fetchDevMangaDexDiscoverResults();
    },
    enabled: dbStatus === 'ready' && db !== null,
  });

  const results = data ?? [];
  const showProviderHint = dbStatus === 'ready' && !isLoading && results.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 md:p-8">
      <PageHeader
        title="Discover"
        description="Browse popular manga from your enabled providers."
        {...(results.length > 0 ? { count: results.length, countLabel: 'titles' } : {})}
      />

      {dbStatus === 'loading' || isLoading ? <LoadingState type="grid" /> : null}

      {dbStatus === 'error' || isError ? (
        <ErrorState
          title="Could not load discover feed"
          message="Provider catalog failed to load. Try again in a moment."
          {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
        />
      ) : null}

      {showProviderHint ? (
        <EmptyState
          type="no-results"
          action={{
            label: 'Browse providers',
            onClick: () => void navigate({ to: '/extensions' }),
          }}
        />
      ) : null}

      {!isLoading && !isError && results.length > 0 ? (
        <VirtualSearchGrid
          results={results}
          onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
        />
      ) : null}
    </main>
  );
}
