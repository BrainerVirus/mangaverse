import { EmptyState, ErrorState, Input, LoadingState, MangaCard } from '@app/design-system';
import type { MangaId } from '@app/shared';
import type { SearchPageData, SearchViewState } from '../types.js';

export interface SearchPageProps {
  data: SearchPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  viewState: SearchViewState;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders?: () => void;
}

export function SearchPage({
  data,
  isLoading,
  isError,
  viewState,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
}: SearchPageProps) {
  const results = data?.results ?? [];
  const recentSearches = data?.recentSearches ?? [];
  const trimmedQuery = viewState.query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const resultCount = results.length;

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Search</h1>
          <p className="text-sm text-muted-foreground">
            {hasQuery
              ? resultCount === 1
                ? '1 local result'
                : `${resultCount} local results`
              : 'Search local manga and recent queries'}
          </p>
        </div>
        <Input
          type="search"
          placeholder="Search manga…"
          aria-label="Search manga"
          value={viewState.query}
          onChange={(event) => onViewStateChange({ query: event.target.value })}
          className="w-full sm:w-80"
        />
      </div>

      {isLoading ? <LoadingState type="grid" /> : null}

      {isError ? (
        <ErrorState
          title="Could not load search"
          message="Local data failed to load. Try again in a moment."
        />
      ) : null}

      {!isLoading && !isError && !hasQuery && recentSearches.length > 0 ? (
        <section aria-label="Recent searches" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Recent searches</h2>
          <ul className="flex flex-wrap gap-2">
            {recentSearches.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="rounded-[var(--radius-control)] border border-[var(--border)] bg-card px-3 py-1.5 text-sm transition-colors hover:border-accent hover:bg-accent/5"
                  onClick={() => onViewStateChange({ query: entry.query })}
                >
                  {entry.query}
                </button>
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
        <section
          aria-label="Search results"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          {results.map((manga) => (
            <MangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
