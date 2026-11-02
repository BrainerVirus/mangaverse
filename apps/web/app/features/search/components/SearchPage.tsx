import {
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/design-system';
import type { SavedSearchEntry } from '@app/db';
import type { ContentRating, MangaId } from '@app/shared';
import { useMemo, useState } from 'react';
import { parseTagList } from '../search-filters.js';
import type { SearchFilters, SearchPageData, SearchSort, SearchViewState } from '../types.js';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

interface SearchProviderOption {
  readonly providerId: string;
  readonly label: string;
}

export interface SearchProviderStatus {
  readonly providerId: string;
  readonly label: string;
  readonly pending: boolean;
  readonly error?: string;
}

export interface SearchPageProps {
  data: SearchPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Aggregate flags kept for callers that do not report per provider. */
  isProviderPending?: boolean;
  isProviderError?: boolean;
  providers?: readonly SearchProviderOption[];
  providerStatuses?: readonly SearchProviderStatus[];
  savedSearches?: readonly SavedSearchEntry[];
  /** When false, provider failures stay quiet; results are unaffected. */
  showProviderErrors?: boolean;
  explicitContent?: boolean;
  /** Refetches only the named provider, so one failure never re-runs the rest. */
  onRetryProvider?: (providerId: string) => void;
  onSaveSearch?: (name: string) => void | Promise<void>;
  onApplySavedSearch?: (entry: SavedSearchEntry) => void;
  onDeleteSavedSearch?: (id: string) => void;
  viewState: SearchViewState;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders?: () => void;
  onRetry?: () => void;
}

const SORT_OPTIONS: readonly { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'title', label: 'Title' },
  { value: 'latest', label: 'Latest' },
];

function toSort(value: string): SearchSort {
  return value === 'title' || value === 'latest' ? value : 'relevance';
}

function toContentRating(value: string): ContentRating | undefined {
  switch (value) {
    case 'safe':
    case 'suggestive':
    case 'mature':
    case 'explicit':
      return value;
    default:
      return undefined;
  }
}

const NO_PROVIDERS: readonly SearchProviderOption[] = [];
const NO_STATUSES: readonly SearchProviderStatus[] = [];
const NO_SAVED_SEARCHES: readonly SavedSearchEntry[] = [];

const RATING_OPTIONS: readonly { value: ContentRating; label: string }[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'mature', label: 'Mature' },
  { value: 'explicit', label: 'Explicit' },
];

function hasActiveFilters(filters: SearchFilters | undefined): boolean {
  if (filters === undefined) return false;
  return (
    filters.providerId !== undefined ||
    filters.language !== undefined ||
    filters.contentRating !== undefined ||
    (filters.includedTags?.length ?? 0) > 0 ||
    (filters.excludedTags?.length ?? 0) > 0 ||
    (filters.sort !== undefined && filters.sort !== 'relevance')
  );
}

function ProviderFilter({
  providers,
  selectedProviderId,
  onSelect,
}: {
  providers: readonly SearchProviderOption[];
  selectedProviderId: string | undefined;
  onSelect: (providerId: string | undefined) => void;
}) {
  return (
    <section aria-label="Providers" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Providers</span>
      <Button
        type="button"
        size="sm"
        variant={selectedProviderId === undefined ? 'default' : 'outline'}
        aria-pressed={selectedProviderId === undefined}
        onClick={() => onSelect(undefined)}
      >
        All providers
      </Button>
      {providers.map((provider) => (
        <Button
          key={provider.providerId}
          type="button"
          size="sm"
          variant={selectedProviderId === provider.providerId ? 'default' : 'outline'}
          aria-pressed={selectedProviderId === provider.providerId}
          onClick={() => onSelect(provider.providerId)}
        >
          {provider.label}
        </Button>
      ))}
    </section>
  );
}

/**
 * Uncontrolled on purpose: the field is the draft. Parsing every keystroke made
 * commas and partial tags vanish while typing. Commit on blur or Enter, the same
 * contract as the preferred-languages field.
 */
function TagFilterField({
  id,
  label,
  ariaLabel,
  placeholder,
  tags,
  onChange,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  placeholder: string;
  tags: readonly string[];
  onChange: (next: readonly string[]) => void;
}) {
  const committed = tags.join(', ');
  const commit = (input: HTMLInputElement) => {
    const next = parseTagList(input.value);
    input.value = next.join(', ');
    const unchanged =
      next.length === tags.length && next.every((tag, index) => tag === tags[index]);
    if (!unchanged) onChange(next);
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        key={committed}
        defaultValue={committed}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function FilterBar({
  filters,
  explicitContent,
  onChange,
}: {
  filters: SearchFilters;
  explicitContent: boolean;
  onChange: (next: SearchFilters) => void;
}) {
  const patch = (next: Partial<SearchFilters>) => onChange({ ...filters, ...next });

  return (
    <section aria-label="Search filters" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="grid gap-1.5">
        <Label htmlFor="search-sort">Sort</Label>
        <Select
          value={filters.sort ?? 'relevance'}
          onValueChange={(value) => patch({ sort: toSort(value) })}
        >
          <SelectTrigger id="search-sort" aria-label="Sort results">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="search-language">Language</Label>
        <Input
          id="search-language"
          aria-label="Language filter"
          placeholder="e.g. en"
          value={filters.language ?? ''}
          onChange={(event) => {
            const value = event.target.value.trim();
            patch({ language: value.length === 0 ? undefined : value });
          }}
        />
      </div>

      <TagFilterField
        id="search-included-tags"
        label="Included tags"
        ariaLabel="Included tags"
        placeholder="action, comedy"
        tags={filters.includedTags ?? []}
        onChange={(includedTags) => patch({ includedTags })}
      />

      <TagFilterField
        id="search-excluded-tags"
        label="Excluded tags"
        ariaLabel="Excluded tags"
        placeholder="drama"
        tags={filters.excludedTags ?? []}
        onChange={(excludedTags) => patch({ excludedTags })}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="search-rating">Content rating</Label>
        <Select
          value={filters.contentRating ?? 'any'}
          onValueChange={(value) => patch({ contentRating: toContentRating(value) })}
        >
          <SelectTrigger id="search-rating" aria-label="Content rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {RATING_OPTIONS.filter(
              (option) =>
                explicitContent || (option.value !== 'mature' && option.value !== 'explicit'),
            ).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters(filters) ? (
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
            Reset filters
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function SaveSearchDialog({
  canSave,
  onSave,
}: {
  canSave: boolean;
  onSave: ((name: string) => void | Promise<void>) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  if (onSave === undefined) return null;

  const trimmed = name.trim();
  const commit = () => {
    if (trimmed.length === 0) return;
    void onSave(trimmed);
    setName('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canSave}
        onClick={() => setOpen(true)}
      >
        Save search
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this search</DialogTitle>
          <DialogDescription>
            The query and filters are stored on this device and can be replayed later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="saved-search-name">Name</Label>
          <Input
            id="saved-search-name"
            aria-label="Saved search name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
        </div>
        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={trimmed.length === 0} onClick={commit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SavedSearches({
  savedSearches,
  canSave,
  onSave,
  onApply,
  onDelete,
}: {
  savedSearches: readonly SavedSearchEntry[];
  canSave: boolean;
  onSave: ((name: string) => void | Promise<void>) | undefined;
  onApply: ((entry: SavedSearchEntry) => void) | undefined;
  onDelete: ((id: string) => void) | undefined;
}) {
  if (savedSearches.length === 0 && onSave === undefined) return null;

  return (
    <section aria-label="Saved searches" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Saved searches</h2>
        {savedSearches.length > 0 ? <Badge variant="outline">{savedSearches.length}</Badge> : null}
        <SaveSearchDialog canSave={canSave} onSave={onSave} />
      </div>
      {savedSearches.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {savedSearches.map((entry) => (
            <li key={entry.id} className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onApply?.(entry)}
                disabled={onApply === undefined}
              >
                {entry.name}
              </Button>
              {onDelete !== undefined ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete saved search ${entry.name}`}
                  onClick={() => onDelete(entry.id)}
                >
                  Delete
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface SettledSearchProps {
  readonly providers: readonly SearchProviderOption[];
  readonly filters: SearchFilters;
  readonly explicitContent: boolean;
  readonly hasQuery: boolean;
  readonly pendingStatuses: readonly SearchProviderStatus[];
  readonly failedStatuses: readonly SearchProviderStatus[];
  readonly onViewStateChange: (next: SearchViewState) => void;
  readonly onOpenManga: (mangaId: MangaId) => void;
  readonly onBrowseProviders: (() => void) | undefined;
  readonly onRetryProvider: ((providerId: string) => void) | undefined;
  readonly viewState: SearchViewState;
  readonly data: SearchPageData | undefined;
}

function SettledSearch({
  providers,
  filters,
  explicitContent,
  hasQuery,
  pendingStatuses,
  failedStatuses,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
  onRetryProvider,
  viewState,
  data,
}: SettledSearchProps) {
  const setFilters = (next: SearchFilters) => onViewStateChange({ ...viewState, filters: next });
  const sourceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const provider of providers) labels[provider.providerId] = provider.label;
    return labels;
  }, [providers]);

  return (
    <>
      {providers.length > 0 ? (
        <ProviderFilter
          providers={providers}
          selectedProviderId={filters.providerId}
          onSelect={(providerId) => setFilters({ ...filters, providerId })}
        />
      ) : null}

      {hasQuery ? (
        <FilterBar filters={filters} explicitContent={explicitContent} onChange={setFilters} />
      ) : null}

      <SearchResults
        hasQuery={hasQuery}
        results={data?.results ?? []}
        recentSearches={data?.recentSearches ?? []}
        pendingStatuses={pendingStatuses}
        failedStatuses={failedStatuses}
        filtersActive={hasActiveFilters(filters)}
        onViewStateChange={onViewStateChange}
        onOpenManga={onOpenManga}
        onBrowseProviders={onBrowseProviders}
        onRetryProvider={onRetryProvider}
        onResetFilters={() => setFilters({})}
        sourceLabels={sourceLabels}
      />
    </>
  );
}

function statusesFor(
  providerStatuses: readonly SearchProviderStatus[] | undefined,
  isPending: boolean,
  isError: boolean,
): readonly SearchProviderStatus[] {
  if (providerStatuses !== undefined) return providerStatuses;
  if (isError) {
    return [{ providerId: 'provider', label: 'Provider', pending: false, error: 'unavailable' }];
  }
  return isPending ? [{ providerId: 'provider', label: 'Provider', pending: true }] : [];
}

function resultDescription(hasQuery: boolean, count: number): string {
  if (!hasQuery) return 'Search local manga and recent queries';
  return count === 1 ? '1 result' : `${count} results`;
}

export function SearchPage({
  data,
  isLoading,
  isError,
  isProviderPending = false,
  isProviderError = false,
  providers = NO_PROVIDERS,
  providerStatuses,
  savedSearches = NO_SAVED_SEARCHES,
  showProviderErrors = true,
  explicitContent = false,
  onRetryProvider,
  onSaveSearch,
  onApplySavedSearch,
  onDeleteSavedSearch,
  viewState,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
  onRetry,
}: SearchPageProps) {
  const results = data?.results ?? [];
  const filters = viewState.filters ?? {};
  const hasQuery = viewState.query.trim().length > 0;
  const resultCount = results.length;

  const statuses = statusesFor(providerStatuses, isProviderPending, isProviderError);
  const pendingStatuses = statuses.filter((status) => status.pending);
  const failedStatuses = statuses.filter((status) => !status.pending && status.error !== undefined);

  return (
    <section
      aria-label="Search"
      className="mx-auto flex w-full max-w-400 flex-col gap-6 p-6 md:p-8"
    >
      <PageHeader
        title="Search"
        description={resultDescription(hasQuery, resultCount)}
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
            onChange={(event) => onViewStateChange({ ...viewState, query: event.target.value })}
            className="w-full sm:w-80"
          />
        }
      />

      <SavedSearches
        savedSearches={savedSearches}
        canSave={hasQuery}
        onSave={onSaveSearch}
        onApply={onApplySavedSearch}
        onDelete={onDeleteSavedSearch}
      />

      {isLoading ? <LoadingState type="grid" /> : null}

      {isError ? (
        <ErrorState
          title="Could not load search"
          message="Local data failed to load. Try again in a moment."
          {...(onRetry !== undefined ? { onRetry } : {})}
        />
      ) : null}

      {!isLoading && !isError ? (
        <SettledSearch
          providers={providers}
          filters={filters}
          explicitContent={explicitContent}
          hasQuery={hasQuery}
          pendingStatuses={pendingStatuses}
          failedStatuses={showProviderErrors ? failedStatuses : NO_STATUSES}
          onViewStateChange={onViewStateChange}
          onOpenManga={onOpenManga}
          onBrowseProviders={onBrowseProviders}
          onRetryProvider={onRetryProvider}
          viewState={viewState}
          data={data}
        />
      ) : null}
    </section>
  );
}

const PROVIDER_ERROR_TITLE = 'Provider search unavailable';

function ProviderPending() {
  return <output className="text-sm text-muted-foreground">Searching providers…</output>;
}

function ProviderErrorNotice({
  failedStatuses,
  onRetryProvider,
}: {
  failedStatuses: readonly SearchProviderStatus[];
  onRetryProvider: ((providerId: string) => void) | undefined;
}) {
  return (
    <output className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{PROVIDER_ERROR_TITLE}. Showing available results only.</span>
      {failedStatuses.map((status) => (
        <span key={status.providerId} className="flex items-center gap-2">
          {failedStatuses.length > 1 ? <span>{status.label}</span> : null}
          {onRetryProvider !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetryProvider(status.providerId)}
            >
              {failedStatuses.length > 1 ? `Retry ${status.label}` : 'Retry'}
            </Button>
          ) : null}
        </span>
      ))}
    </output>
  );
}

function ProviderUnavailable({
  failedStatuses,
  onRetryProvider,
}: {
  failedStatuses: readonly SearchProviderStatus[];
  onRetryProvider: ((providerId: string) => void) | undefined;
}) {
  const retry = (providerId: string) => () => onRetryProvider?.(providerId);
  const soleFailure = failedStatuses.length === 1 ? failedStatuses[0] : undefined;

  return (
    <div role="alert">
      <ErrorState
        title={PROVIDER_ERROR_TITLE}
        message={
          failedStatuses.length > 1
            ? `Local results found no match and ${failedStatuses.length} providers failed. Try again in a moment.`
            : 'Local results found no match and the provider search failed. Try again in a moment.'
        }
        {...(onRetryProvider !== undefined && soleFailure !== undefined
          ? { onRetry: retry(soleFailure.providerId) }
          : {})}
      />
      {failedStatuses.length > 1 && onRetryProvider !== undefined ? (
        <div className="flex flex-wrap justify-center gap-2">
          {failedStatuses.map((status) => (
            <Button
              key={status.providerId}
              type="button"
              variant="outline"
              size="sm"
              onClick={retry(status.providerId)}
            >
              Retry {status.label}
            </Button>
          ))}
        </div>
      ) : null}
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
  pendingStatuses,
  failedStatuses,
  onRetryProvider,
  onOpenManga,
  sourceLabels,
}: {
  results: SearchPageData['results'];
  pendingStatuses: readonly SearchProviderStatus[];
  failedStatuses: readonly SearchProviderStatus[];
  onRetryProvider: ((providerId: string) => void) | undefined;
  onOpenManga: (mangaId: MangaId) => void;
  sourceLabels: Readonly<Record<string, string>>;
}) {
  return (
    <>
      {pendingStatuses.length > 0 ? <ProviderPending /> : null}
      {failedStatuses.length > 0 && pendingStatuses.length === 0 ? (
        <ProviderErrorNotice failedStatuses={failedStatuses} onRetryProvider={onRetryProvider} />
      ) : null}
      <VirtualSearchGrid results={results} onOpenManga={onOpenManga} sourceLabels={sourceLabels} />
    </>
  );
}

function QueryResults({
  results,
  pendingStatuses,
  failedStatuses,
  onRetryProvider,
  onOpenManga,
  onResetFilters,
  filtersActive,
  sourceLabels,
}: {
  results: SearchPageData['results'];
  pendingStatuses: readonly SearchProviderStatus[];
  failedStatuses: readonly SearchProviderStatus[];
  onRetryProvider: ((providerId: string) => void) | undefined;
  onOpenManga: (mangaId: MangaId) => void;
  onResetFilters: () => void;
  filtersActive: boolean;
  sourceLabels: Readonly<Record<string, string>>;
}) {
  if (results.length > 0) {
    return (
      <ResultGrid
        results={results}
        pendingStatuses={pendingStatuses}
        failedStatuses={failedStatuses}
        onRetryProvider={onRetryProvider}
        onOpenManga={onOpenManga}
        sourceLabels={sourceLabels}
      />
    );
  }

  // A provider outage must not read as a genuine zero-result search, and the
  // empty state must wait until the provider settles.
  if (pendingStatuses.length > 0) {
    return <ProviderPending />;
  }
  if (failedStatuses.length > 0) {
    return (
      <ProviderUnavailable failedStatuses={failedStatuses} onRetryProvider={onRetryProvider} />
    );
  }
  return (
    <EmptyState
      type="no-results"
      {...(filtersActive ? { action: { label: 'Reset filters', onClick: onResetFilters } } : {})}
    />
  );
}

/** The settled search page states, chosen by the query, the cache and provider health. */
function SearchResults({
  hasQuery,
  results,
  recentSearches,
  pendingStatuses,
  failedStatuses,
  filtersActive,
  onViewStateChange,
  onOpenManga,
  onBrowseProviders,
  onRetryProvider,
  onResetFilters,
  sourceLabels,
}: {
  hasQuery: boolean;
  results: SearchPageData['results'];
  recentSearches: SearchPageData['recentSearches'];
  pendingStatuses: readonly SearchProviderStatus[];
  failedStatuses: readonly SearchProviderStatus[];
  filtersActive: boolean;
  onViewStateChange: (next: SearchViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowseProviders: (() => void) | undefined;
  onRetryProvider: ((providerId: string) => void) | undefined;
  onResetFilters: () => void;
  sourceLabels: Readonly<Record<string, string>>;
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
      pendingStatuses={pendingStatuses}
      failedStatuses={failedStatuses}
      onRetryProvider={onRetryProvider}
      onOpenManga={onOpenManga}
      onResetFilters={onResetFilters}
      filtersActive={filtersActive}
      sourceLabels={sourceLabels}
    />
  );
}
