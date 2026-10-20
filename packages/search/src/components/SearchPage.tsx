import {
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Button,
  Badge,
} from '@app/design-system';
import type { MangaId } from '@app/shared';
import type { SearchPageData, SearchViewState } from '../types.js';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

export interface SearchPageProps {
  data: SearchPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Provider identities are still in flight; local results must stay visible. */
  isProviderPending?: boolean;
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
  isProviderPending = false,
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
  const settled = !isLoading && !isError;

  const description = hasQuery
    ? resultCount === 1
      ? '1 result'
      : `${resultCount} results`
    : 'Search local manga and recent queries';

  return (
    <section
      aria-label="Search"
      className="mx-auto flex w-full max-w-400 flex-col gap-6 p-6 md:p-8"
    >
      <PageHeader
        title="Search"
        description={description}
        {...(hasQuery
          ? { count: resultCount, countLabel: resultCount === 1 ? 'result' : 'results' }
          : {})}
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

      {settled ? (
        <SearchResults
          hasQuery={hasQuery}
          results={results}
          recentSearches={recentSearches}
          isProviderPending={isProviderPending}
          onViewStateChange={onViewStateChange}
          onOpenManga={onOpenManga}
          onBrowseProviders={onBrowseProviders}
        />
      ) : null}
    </section>
  );
}

/** The four states the settled search page can show, chosen by the query and the cache. */
function SearchResults({
  hasQuery,
  results,
  recentSearches,
  isProviderPending,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
}: {
  hasQuery: boolean;
  results: SearchPageData['results'];
  recentSearches: SearchPageData['recentSearches'];
  isProviderPending: boolean;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders: (() => void) | undefined;
}) {
  if (hasQuery) {
    return (
      <>
        {isProviderPending ? (
          <output className="text-sm text-muted-foreground">Searching providers…</output>
        ) : null}
        {results.length > 0 ? (
          <VirtualSearchGrid results={results} onOpenManga={onOpenManga} />
        ) : isProviderPending ? null : (
          // The empty state waits for the provider to settle; while it is still
          // running the quiet status above is the only feedback.
          <EmptyState type="no-results" />
        )}
      </>
    );
  }

  if (recentSearches.length > 0) {
    return (
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
    );
  }

  return (
    <EmptyState
      type="no-results"
      {...(onBrowseProviders !== undefined
        ? { action: { label: 'Browse providers', onClick: onBrowseProviders } }
        : {})}
    />
  );
}
