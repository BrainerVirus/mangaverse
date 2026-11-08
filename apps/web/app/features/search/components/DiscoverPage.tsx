import { useRef } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  Skeleton,
} from '@app/design-system';
import { CachedMangaCard } from '@app/cache';
import type { MangaId, MangaIdentity } from '@app/shared';
import { useInfiniteScrollSentinel } from '../hooks/use-infinite-scroll-sentinel.js';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

export type DiscoverSectionStatus = 'ok' | 'empty' | 'error' | 'loading';

/** A user-safe, classified explanation for one section (or one loaded section's next page). */
export interface DiscoverSectionFailure {
  /** An `AppErrorKind`: `rate-limited`, `offline`, `provider-unavailable`, … */
  readonly kind: string;
  readonly message: string;
  /** Remaining rate-limit wait, so the row can say how long instead of "a moment". */
  readonly retryAfterMs?: number;
}

export interface DiscoverSection {
  readonly id: string;
  readonly title: string;
  readonly capability: string;
  readonly results: readonly MangaIdentity[];
  /** Omitted by callers that only have results: `ok` when non-empty, else `empty`. */
  readonly status?: DiscoverSectionStatus;
  readonly error?: DiscoverSectionFailure;
}

export interface DiscoverProviderFeed {
  readonly providerId: string;
  readonly providerName: string;
  readonly sections: readonly DiscoverSection[];
}

export interface DiscoverPageData {
  readonly providers: readonly DiscoverProviderFeed[];
}

/** Page-level failure, typed so a local-DB failure never reads as a provider failure. */
export interface DiscoverPageFailure {
  readonly kind: 'database' | 'provider' | 'settings';
  readonly title: string;
  readonly message: string;
}

export interface DiscoverExpandedSectionState {
  readonly title: string;
  readonly results: readonly MangaIdentity[];
  readonly isLoading: boolean;
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  /** The first page failed and there is nothing to show. */
  readonly error?: DiscoverSectionFailure;
  /** A later page failed; the already-loaded results stay. */
  readonly nextPageError?: DiscoverSectionFailure;
}

export interface DiscoverPageProps {
  readonly data: DiscoverPageData | undefined;
  readonly selectedProviderId: string | null;
  readonly expandedSection: { providerId: string; sectionId: string } | null;
  readonly expandedSectionState?: DiscoverExpandedSectionState;
  readonly isLoading: boolean;
  /** The page cannot be drawn: the library, the descriptor read or settings failed. */
  readonly failure?: DiscoverPageFailure;
  /** Non-blocking: settings could not be read, so Discover runs with safe defaults. */
  readonly settingsFailure?: DiscoverPageFailure;
  readonly showProviderHint?: boolean;
  onSelectProvider: (providerId: string) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAllSection: (providerId: string, sectionId: string) => void;
  onBackFromSection: () => void;
  onLoadMoreSection?: () => void;
  onRetrySection?: (sectionId: string) => void;
  onRetryExpandedSection?: () => void;
  onRetrySettings?: () => void;
  onBrowseProviders?: () => void;
  onRetry?: () => void;
}

function DiscoverSectionPreview({
  section,
  onOpenManga,
  onSeeAll,
  onRetry,
}: {
  section: DiscoverSection;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAll: () => void;
  onRetry: (() => void) | undefined;
}) {
  const status = section.status ?? (section.results.length > 0 ? 'ok' : 'empty');

  return (
    <section aria-labelledby={`discover-section-${section.id}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`discover-section-${section.id}`} className="type-heading text-foreground">
          {section.title}
        </h2>
        {status === 'ok' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid={`discover-section-${section.id}-see-all`}
            onClick={onSeeAll}
          >
            See all
          </Button>
        ) : null}
      </div>

      {status === 'loading' ? <LoadingState type="grid" count={6} /> : null}

      {status === 'error' ? (
        <Alert
          variant="destructive"
          data-testid={`discover-section-${section.id}-error`}
          aria-live="polite"
        >
          <AlertTitle>{section.title} couldn’t load</AlertTitle>
          <AlertDescription>
            <p>{section.error?.message ?? 'This section could not load. Try again in a moment.'}</p>
            {onRetry !== undefined ? (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {status === 'empty' ? (
        <p
          className="type-body text-muted-foreground"
          data-testid={`discover-section-${section.id}-empty`}
        >
          Nothing here yet.
        </p>
      ) : null}

      {status === 'ok' ? (
        <div data-testid={`discover-section-${section.id}`} className={SECTION_GRID_CLASSES}>
          {section.results.slice(0, 6).map((manga) => (
            <CachedMangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DiscoverExpandedSectionView({
  state,
  onOpenManga,
  onBackFromSection,
  onLoadMoreSection,
  onRetry,
}: {
  state: DiscoverExpandedSectionState;
  onOpenManga: (mangaId: MangaId) => void;
  onBackFromSection: () => void;
  onLoadMoreSection?: () => void;
  onRetry: () => void;
}) {
  const hasInitialFailure = state.error !== undefined && state.results.length === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="discover-expanded-section">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBackFromSection}>
          Back to discover
        </Button>
        <h2 className="type-heading text-foreground">{state.title}</h2>
      </div>
      {hasInitialFailure ? (
        <ExpandedFailure state={state} onRetry={onRetry} onBack={onBackFromSection} />
      ) : (
        <ExpandedResults
          state={state}
          onOpenManga={onOpenManga}
          onLoadMoreSection={onLoadMoreSection}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}

function ExpandedFailure({
  state,
  onRetry,
  onBack,
}: {
  state: DiscoverExpandedSectionState;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <ErrorState
      title={`${state.title} couldn’t load`}
      message={state.error?.message ?? 'This section could not load. Try again in a moment.'}
      onRetry={onRetry}
      onBack={onBack}
    />
  );
}

function ExpandedResults({
  state,
  onOpenManga,
  onLoadMoreSection,
  onRetry,
}: {
  state: DiscoverExpandedSectionState;
  onOpenManga: (mangaId: MangaId) => void;
  onLoadMoreSection: (() => void) | undefined;
  onRetry: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore =
    state.hasNextPage &&
    !state.isFetchingNextPage &&
    state.nextPageError === undefined &&
    state.results.length > 0;

  useInfiniteScrollSentinel(
    sentinelRef,
    onLoadMoreSection,
    canLoadMore && onLoadMoreSection !== undefined,
  );

  if (state.results.length === 0) {
    return state.isLoading ? (
      <LoadingState type="grid" count={12} />
    ) : (
      <EmptyState type="no-results" />
    );
  }

  return (
    <>
      <VirtualSearchGrid results={state.results} onOpenManga={onOpenManga} />
      {state.isFetchingNextPage ? <LoadingState type="grid" count={6} /> : null}
      {state.nextPageError !== undefined ? (
        <LoadMoreFailure message={state.nextPageError.message} onRetry={onRetry} />
      ) : null}
      {canLoadMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
    </>
  );
}

function LoadMoreFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" data-testid="discover-section-load-more-error" aria-live="polite">
      <AlertTitle>Couldn’t load more</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

const SECTION_GRID_CLASSES = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

/** The provider tab strip and the first section: a heading row over one row of six covers. */
function DiscoverLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" data-discover-loading>
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-4">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-6 w-40" />
        </div>
        <LoadingState type="grid" count={6} columns="viewport-6" />
      </div>
    </div>
  );
}

export function DiscoverPage({
  data,
  selectedProviderId,
  expandedSection,
  expandedSectionState,
  isLoading,
  failure,
  settingsFailure,
  showProviderHint = false,
  onSelectProvider,
  onOpenManga,
  onSeeAllSection,
  onBackFromSection,
  onLoadMoreSection,
  onRetrySection,
  onRetryExpandedSection,
  onRetrySettings,
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
      count +
      provider.sections.reduce((sectionCount, section) => sectionCount + section.results.length, 0),
    0,
  );

  const showCount = !isExpandedView && failure === undefined && totalTitles > 0;

  return (
    <PageContainer>
      <section aria-label="Discover" className="flex flex-col gap-6">
        <PageHeader
          title="Discover"
          description="Browse popular and latest manga from your enabled providers."
          {...(showCount ? { count: totalTitles, countLabel: 'titles' } : {})}
        />
        <DiscoverLoadingSurface
          isLoading={isLoading}
          isExpandedView={isExpandedView}
          failure={failure}
        />
        <DiscoverFailureSurface
          failure={failure}
          hasExpandedSection={expandedSection !== null}
          onRetry={onRetry}
          onBackFromSection={onBackFromSection}
        />
        <DiscoverSettingsSurface
          settingsFailure={settingsFailure}
          onRetrySettings={onRetrySettings}
        />
        <DiscoverHintSurface
          failure={failure}
          showProviderHint={showProviderHint}
          onBrowseProviders={onBrowseProviders}
        />
        <DiscoverBrowserSurface
          failure={failure}
          providers={providers}
          activeProvider={activeProvider}
          isExpandedView={isExpandedView}
          expandedSectionState={expandedSectionState}
          onSelectProvider={onSelectProvider}
          onOpenManga={onOpenManga}
          onSeeAllSection={onSeeAllSection}
          onBackFromSection={onBackFromSection}
          onLoadMoreSection={onLoadMoreSection}
          onRetrySection={onRetrySection}
          onRetryExpandedSection={onRetryExpandedSection}
        />
      </section>
    </PageContainer>
  );
}

function DiscoverLoadingSurface({
  isLoading,
  isExpandedView,
  failure,
}: {
  isLoading: boolean;
  isExpandedView: boolean;
  failure: DiscoverPageFailure | undefined;
}) {
  if (!isLoading || isExpandedView || failure !== undefined) return null;
  return <DiscoverLoading />;
}

function DiscoverFailureSurface({
  failure,
  hasExpandedSection,
  onRetry,
  onBackFromSection,
}: {
  failure: DiscoverPageFailure | undefined;
  hasExpandedSection: boolean;
  onRetry: (() => void) | undefined;
  onBackFromSection: () => void;
}) {
  if (failure === undefined) return null;
  return (
    <ErrorState
      title={failure.title}
      message={failure.message}
      {...(onRetry !== undefined ? { onRetry } : {})}
      {...(hasExpandedSection ? { onBack: onBackFromSection } : {})}
    />
  );
}

function DiscoverSettingsSurface({
  settingsFailure,
  onRetrySettings,
}: {
  settingsFailure: DiscoverPageFailure | undefined;
  onRetrySettings: (() => void) | undefined;
}) {
  if (settingsFailure === undefined) return null;
  return (
    <Alert data-testid="discover-settings-error" aria-live="polite">
      <AlertTitle>{settingsFailure.title}</AlertTitle>
      <AlertDescription>
        <p>{settingsFailure.message}</p>
        {onRetrySettings !== undefined ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetrySettings}
          >
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function DiscoverHintSurface({
  failure,
  showProviderHint,
  onBrowseProviders,
}: {
  failure: DiscoverPageFailure | undefined;
  showProviderHint: boolean;
  onBrowseProviders: (() => void) | undefined;
}) {
  if (failure !== undefined || !showProviderHint) return null;
  return (
    <EmptyState
      type="no-results"
      {...(onBrowseProviders !== undefined
        ? { action: { label: 'Browse providers', onClick: onBrowseProviders } }
        : {})}
    />
  );
}

function DiscoverBrowserSurface({
  failure,
  providers,
  activeProvider,
  isExpandedView,
  expandedSectionState,
  onSelectProvider,
  onOpenManga,
  onSeeAllSection,
  onBackFromSection,
  onLoadMoreSection,
  onRetrySection,
  onRetryExpandedSection,
}: {
  failure: DiscoverPageFailure | undefined;
  providers: readonly DiscoverProviderFeed[];
  activeProvider: DiscoverProviderFeed | undefined;
  isExpandedView: boolean;
  expandedSectionState: DiscoverExpandedSectionState | undefined;
  onSelectProvider: (providerId: string) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAllSection: (providerId: string, sectionId: string) => void;
  onBackFromSection: () => void;
  onLoadMoreSection: (() => void) | undefined;
  onRetrySection: ((sectionId: string) => void) | undefined;
  onRetryExpandedSection: (() => void) | undefined;
}) {
  if (failure !== undefined) return null;
  return (
    <DiscoverProviderBrowser
      providers={providers}
      activeProvider={activeProvider}
      isExpandedView={isExpandedView}
      expandedSectionState={expandedSectionState}
      onSelectProvider={onSelectProvider}
      onOpenManga={onOpenManga}
      onSeeAllSection={onSeeAllSection}
      onBackFromSection={onBackFromSection}
      onLoadMoreSection={onLoadMoreSection}
      onRetrySection={onRetrySection}
      onRetryExpandedSection={onRetryExpandedSection}
    />
  );
}

/**
 * The provider tabs and the panel they select. A provider-less install has
 * nothing to browse, so the whole region steps aside; a failed section keeps
 * its row and the rest of the page instead.
 */
function DiscoverProviderBrowser({
  providers,
  activeProvider,
  isExpandedView,
  expandedSectionState,
  onSelectProvider,
  onOpenManga,
  onSeeAllSection,
  onBackFromSection,
  onLoadMoreSection,
  onRetrySection,
  onRetryExpandedSection,
}: {
  providers: readonly DiscoverProviderFeed[];
  activeProvider: DiscoverProviderFeed | undefined;
  isExpandedView: boolean;
  expandedSectionState: DiscoverExpandedSectionState | undefined;
  onSelectProvider: (providerId: string) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAllSection: (providerId: string, sectionId: string) => void;
  onBackFromSection: () => void;
  onLoadMoreSection: (() => void) | undefined;
  onRetrySection: ((sectionId: string) => void) | undefined;
  onRetryExpandedSection: (() => void) | undefined;
}) {
  if (providers.length === 0 || activeProvider === undefined) return null;

  return (
    <div className="flex flex-col gap-6">
      <ListRow
        role="tablist"
        aria-label="Discover providers"
        tone="muted"
        padding="tight"
        className="inline-flex h-10 w-full items-center justify-start gap-1 overflow-x-auto"
      >
        {providers.map((provider) => {
          const isActive = provider.providerId === activeProvider.providerId;
          return (
            <button
              key={provider.providerId}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectProvider(provider.providerId)}
              className={
                isActive
                  ? 'inline-flex items-center justify-center whitespace-nowrap rounded-control bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  : 'inline-flex items-center justify-center whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              }
            >
              {provider.providerName}
            </button>
          );
        })}
      </ListRow>

      <div role="tabpanel" className="flex flex-col gap-8">
        {isExpandedView && expandedSectionState !== undefined ? (
          <DiscoverExpandedSectionView
            state={expandedSectionState}
            onOpenManga={onOpenManga}
            onBackFromSection={onBackFromSection}
            onRetry={() => onRetryExpandedSection?.()}
            {...(onLoadMoreSection !== undefined ? { onLoadMoreSection } : {})}
          />
        ) : (
          activeProvider.sections.map((section) => (
            <DiscoverSectionPreview
              key={section.id}
              section={section}
              onOpenManga={onOpenManga}
              onSeeAll={() => onSeeAllSection(activeProvider.providerId, section.id)}
              onRetry={onRetrySection === undefined ? undefined : () => onRetrySection(section.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
