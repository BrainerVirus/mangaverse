import { useRef } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MangaCard,
  PageHeader,
} from '@app/design-system';
import type { MangaId, MangaIdentity } from '@app/shared';
import { useInfiniteScrollSentinel } from '../hooks/use-infinite-scroll-sentinel.js';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

export interface DiscoverSection {
  readonly id: string;
  readonly title: string;
  readonly capability: string;
  readonly results: readonly MangaIdentity[];
}

export interface DiscoverProviderFeed {
  readonly providerId: string;
  readonly providerName: string;
  readonly sections: readonly DiscoverSection[];
}

export interface DiscoverPageData {
  readonly providers: readonly DiscoverProviderFeed[];
}

export interface DiscoverExpandedSectionState {
  readonly title: string;
  readonly results: readonly MangaIdentity[];
  readonly isLoading: boolean;
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
}

export interface DiscoverPageProps {
  readonly data: DiscoverPageData | undefined;
  readonly selectedProviderId: string | null;
  readonly expandedSection: { providerId: string; sectionId: string } | null;
  readonly expandedSectionState?: DiscoverExpandedSectionState;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly showProviderHint?: boolean;
  onSelectProvider: (providerId: string) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAllSection: (providerId: string, sectionId: string) => void;
  onBackFromSection: () => void;
  onLoadMoreSection?: () => void;
  onBrowseProviders?: () => void;
  onRetry?: () => void;
}

function DiscoverSectionPreview({
  section,
  onOpenManga,
  onSeeAll,
}: {
  section: DiscoverSection;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAll: () => void;
}) {
  if (section.results.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={`discover-section-${section.id}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`discover-section-${section.id}`} className="text-lg font-semibold text-foreground">
          {section.title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`discover-section-${section.id}-see-all`}
          onClick={onSeeAll}
        >
          See all
        </Button>
      </div>
      <div
        data-testid={`discover-section-${section.id}`}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {section.results.slice(0, 6).map((manga) => (
          <MangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
        ))}
      </div>
    </section>
  );
}

function DiscoverExpandedSectionView({
  state,
  onOpenManga,
  onBackFromSection,
  onLoadMoreSection,
}: {
  state: DiscoverExpandedSectionState;
  onOpenManga: (mangaId: MangaId) => void;
  onBackFromSection: () => void;
  onLoadMoreSection?: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = state.hasNextPage && !state.isFetchingNextPage;

  useInfiniteScrollSentinel(
    sentinelRef,
    onLoadMoreSection,
    canLoadMore && onLoadMoreSection !== undefined,
  );

  return (
    <div className="flex flex-col gap-4" data-testid="discover-expanded-section">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBackFromSection}>
          Back to discover
        </Button>
        <h2 className="text-lg font-semibold text-foreground">{state.title}</h2>
      </div>

      {state.isLoading && state.results.length === 0 ? (
        <LoadingState type="grid" count={12} />
      ) : null}

      {!state.isLoading && state.results.length === 0 ? (
        <EmptyState type="no-results" />
      ) : null}

      {state.results.length > 0 ? (
        <>
          <VirtualSearchGrid results={state.results} onOpenManga={onOpenManga} />
          {state.isFetchingNextPage ? <LoadingState type="grid" count={6} /> : null}
          {canLoadMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
        </>
      ) : null}
    </div>
  );
}

export function DiscoverPage({
  data,
  selectedProviderId,
  expandedSection,
  expandedSectionState,
  isLoading,
  isError,
  showProviderHint = false,
  onSelectProvider,
  onOpenManga,
  onSeeAllSection,
  onBackFromSection,
  onLoadMoreSection,
  onBrowseProviders,
  onRetry,
}: DiscoverPageProps) {
  const providers = data?.providers ?? [];
  const activeProviderId = selectedProviderId ?? providers[0]?.providerId ?? null;
  const activeProvider = providers.find((provider) => provider.providerId === activeProviderId);
  const isExpandedView =
    expandedSection !== null &&
    expandedSectionState !== undefined &&
    expandedSection.providerId === activeProviderId;

  const totalTitles = providers.reduce(
    (count, provider) =>
      count + provider.sections.reduce((sectionCount, section) => sectionCount + section.results.length, 0),
    0,
  );

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 md:p-8">
      <PageHeader
        title="Discover"
        description="Browse popular and latest manga from your enabled providers."
        {...(!isExpandedView && totalTitles > 0
          ? { count: totalTitles, countLabel: 'titles' }
          : {})}
      />

      {isLoading && !isExpandedView ? <LoadingState type="grid" /> : null}

      {isError ? (
        <ErrorState
          title="Could not load discover feed"
          message="Provider catalog failed to load. Try again in a moment."
          {...(onRetry !== undefined ? { onRetry } : {})}
        />
      ) : null}

      {showProviderHint ? (
        <EmptyState
          type="no-results"
          {...(onBrowseProviders !== undefined
            ? { action: { label: 'Browse providers', onClick: onBrowseProviders } }
            : {})}
        />
      ) : null}

      {!isError && providers.length > 0 && activeProvider !== undefined ? (
        <div className="flex flex-col gap-6">
          <div
            role="tablist"
            aria-label="Discover providers"
            className="inline-flex h-10 w-full items-center justify-start gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-muted p-1 text-muted-foreground"
          >
            {providers.map((provider) => {
              const isActive = provider.providerId === activeProviderId;
              return (
                <button
                  key={provider.providerId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectProvider(provider.providerId)}
                  className={
                    isActive
                      ? 'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm'
                      : 'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition-colors hover:text-foreground'
                  }
                >
                  {provider.providerName}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="flex flex-col gap-8">
            {isExpandedView ? (
              <DiscoverExpandedSectionView
                state={expandedSectionState}
                onOpenManga={onOpenManga}
                onBackFromSection={onBackFromSection}
                {...(onLoadMoreSection !== undefined ? { onLoadMoreSection } : {})}
              />
            ) : (
              activeProvider.sections.map((section) => (
                <DiscoverSectionPreview
                  key={section.id}
                  section={section}
                  onOpenManga={onOpenManga}
                  onSeeAll={() => onSeeAllSection(activeProvider.providerId, section.id)}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
