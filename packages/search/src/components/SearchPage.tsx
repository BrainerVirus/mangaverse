import { EmptyState, ErrorState, Input, LoadingState, PageHeader, Button, Badge } from '@app/design-system';
import type { MangaId } from '@app/shared';
import type { SearchPageData, SearchViewState } from '../types.js';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

export interface SearchPageProps {
  data: SearchPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  viewState: SearchViewState;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders?: () => void;
  onRetry?: () => void;
}

export function SearchPage({
  data,
  isLoading,
  isError,
  viewState,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
  onRetry,
}: SearchPageProps) {
  const results = data?.results ?? [];
  const recentSearches = data?.recentSearches ?? [];
  const trimmedQuery = viewState.query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const resultCount = results.length;

  const description = hasQuery
    ? resultCount === 1
      ? '1 result'
      : `${resultCount} results`
    : 'Search local manga and recent queries';

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 md:p-8">
      <PageHeader
        title="Search"
        description={description}
        {...(hasQuery ? { count: resultCount, countLabel: resultCount === 1 ? 'result' : 'results' } : {})}
        actions={
          <Input
            type="search"
            placeholder="Search manga…"
            aria-label="Search manga"
            data-testid="search-input"
            value={viewState.query}
            onChange={(event) => onViewStateChange({ query: event.target.value })}
            className="w-full sm:w-80"
          />
        }
      />

      {isLoading ? <LoadingState type="grid" /> : null}

      {isError ? (
        <ErrorState
          title="Could not load search"
          message="Local data failed to load. Try again in a moment."
          {...(onRetry !== undefined ? { onRetry } : {})}
        />
      ) : null}

      {!isLoading && !isError && !hasQuery && recentSearches.length > 0 ? (
        <section aria-label="Recent searches" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Recent searches</h2>
            <Badge variant="outline">{recentSearches.length}</Badge>
          </div>
          <ul className="flex flex-wrap gap-2">
            {recentSearches.map((entry) => (
              <li key={entry.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onViewStateChange({ query: entry.query })}
                >
                  {entry.query}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isLoading && !isError && !hasQuery && recentSearches.length === 0 ? (
        <EmptyState
          type="no-results"
          {...(onBrowseProviders !== undefined
            ? { action: { label: 'Browse providers', onClick: onBrowseProviders } }
            : {})}
        />
      ) : null}

      {!isLoading && !isError && hasQuery && resultCount === 0 ? (
        <EmptyState type="no-results" />
      ) : null}

      {!isLoading && !isError && hasQuery && resultCount > 0 ? (
        <VirtualSearchGrid results={results} onOpenManga={onOpenManga} />
      ) : null}
    </main>
  );
}
