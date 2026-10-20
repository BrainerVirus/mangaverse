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
  /** Provider search failed; local results must stay visible. */
  isProviderError?: boolean;
  /** Refetches only the provider query; local reads and recents are untouched. */
  onRetryProvider?: () => void;
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
  isProviderError = false,
  onRetryProvider,
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
          isProviderError={isProviderError}
          onViewStateChange={onViewStateChange}
          onOpenManga={onOpenManga}
          onBrowseProviders={onBrowseProviders}
          onRetryProvider={onRetryProvider}
        />
      ) : null}
    </section>
  );
}

const PROVIDER_ERROR_TITLE = 'Provider search unavailable';

interface ProviderRetry {
  onRetryProvider: (() => void) | undefined;
}

function ProviderPending() {
  return <output className="text-sm text-muted-foreground">Searching providers…</output>;
}

/** A failed provider refetch must not hide results that already rendered. */
function ProviderErrorNotice({ onRetryProvider }: ProviderRetry) {
  return (
    <output className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{PROVIDER_ERROR_TITLE}. Showing available results only.</span>
      {onRetryProvider !== undefined ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetryProvider}>
          Retry
        </Button>
      ) : null}
    </output>
  );
}

function ProviderUnavailable({ onRetryProvider }: ProviderRetry) {
  return (
    <div role="alert">
      <ErrorState
        title={PROVIDER_ERROR_TITLE}
        message="Local results found no match and the provider search failed. Try again in a moment."
        {...(onRetryProvider !== undefined ? { onRetry: onRetryProvider } : {})}
      />
    </div>
  );
}

function RecentSearches({
  recentSearches,
  onViewStateChange,
}: {
  recentSearches: SearchPageData['recentSearches'];
  onViewStateChange: (next: SearchViewState) => void;
}) {
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

/** Results that already exist stay visible whatever the provider is doing. */
function ResultGrid({
  results,
  isProviderPending,
  isProviderError,
  onRetryProvider,
  onOpenManga,
}: {
  results: SearchPageData['results'];
  isProviderPending: boolean;
  isProviderError: boolean;
  onRetryProvider: (() => void) | undefined;
  onOpenManga: (mangaId: MangaId) => void;
}) {
  return (
    <>
      {isProviderPending ? <ProviderPending /> : null}
      {isProviderError && !isProviderPending ? (
        <ProviderErrorNotice onRetryProvider={onRetryProvider} />
      ) : null}
      <VirtualSearchGrid results={results} onOpenManga={onOpenManga} />
    </>
  );
}

function QueryResults({
  results,
  isProviderPending,
  isProviderError,
  onOpenManga,
  onRetryProvider,
}: {
  results: SearchPageData['results'];
  isProviderPending: boolean;
  isProviderError: boolean;
  onOpenManga: (mangaId: MangaId) => void;
  onRetryProvider: (() => void) | undefined;
}) {
  if (results.length > 0) {
    return (
      <ResultGrid
        results={results}
        isProviderPending={isProviderPending}
        isProviderError={isProviderError}
        onRetryProvider={onRetryProvider}
        onOpenManga={onOpenManga}
      />
    );
  }

  // A provider outage must not read as a genuine zero-result search, and the
  // empty state must wait until the provider settles.
  if (isProviderPending) return <ProviderPending />;
  if (isProviderError) return <ProviderUnavailable onRetryProvider={onRetryProvider} />;
  return <EmptyState type="no-results" />;
}

/** The settled search page states, chosen by the query, the cache and provider health. */
function SearchResults({
  hasQuery,
  results,
  recentSearches,
  isProviderPending,
  isProviderError,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
  onRetryProvider,
}: {
  hasQuery: boolean;
  results: SearchPageData['results'];
  recentSearches: SearchPageData['recentSearches'];
  isProviderPending: boolean;
  isProviderError: boolean;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders: (() => void) | undefined;
  onRetryProvider: (() => void) | undefined;
}) {
  if (!hasQuery) {
    return recentSearches.length > 0 ? (
      <RecentSearches recentSearches={recentSearches} onViewStateChange={onViewStateChange} />
    ) : (
      <EmptyState
        type="no-results"
        {...(onBrowseProviders !== undefined
          ? { action: { label: 'Browse providers', onClick: onBrowseProviders } }
          : {})}
      />
    );
  }

  return (
    <QueryResults
      results={results}
      isProviderPending={isProviderPending}
      isProviderError={isProviderError}
      onOpenManga={onOpenManga}
      onRetryProvider={onRetryProvider}
    />
  );
}
