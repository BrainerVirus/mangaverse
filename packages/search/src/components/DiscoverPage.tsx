import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@app/design-system';
import type { MangaId, MangaIdentity } from '@app/shared';
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

export interface DiscoverPageProps {
  readonly data: DiscoverPageData | undefined;
  readonly selectedProviderId: string | null;
  readonly expandedSection: { providerId: string; sectionId: string } | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly showProviderHint?: boolean;
  onSelectProvider: (providerId: string) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onSeeAllSection: (providerId: string, sectionId: string) => void;
  onBackFromSection: () => void;
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
        <Button type="button" variant="ghost" size="sm" onClick={onSeeAll}>
          See all
        </Button>
      </div>
      <div
        data-testid={`discover-section-${section.id}`}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {section.results.slice(0, 6).map((manga) => (
          <MangaCardPreview key={manga.id} manga={manga} onOpen={() => onOpenManga(manga.id)} />
        ))}
      </div>
    </section>
  );
}

function MangaCardPreview({
  manga,
  onOpen,
}: {
  manga: MangaIdentity;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`manga-card-${manga.id}`}
      onClick={onOpen}
      className="group flex cursor-pointer flex-col gap-2 rounded-[var(--radius-box)] border border-[var(--border)] bg-card p-2 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-control)] bg-muted">
        {manga.coverImageUrl ? (
          <img
            src={manga.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </div>
      <span className="line-clamp-2 text-sm font-medium text-card-foreground">{manga.canonicalTitle}</span>
    </button>
  );
}

export function DiscoverPage({
  data,
  selectedProviderId,
  expandedSection,
  isLoading,
  isError,
  showProviderHint = false,
  onSelectProvider,
  onOpenManga,
  onSeeAllSection,
  onBackFromSection,
  onBrowseProviders,
  onRetry,
}: DiscoverPageProps) {
  const providers = data?.providers ?? [];
  const activeProviderId = selectedProviderId ?? providers[0]?.providerId ?? null;
  const activeProvider = providers.find((provider) => provider.providerId === activeProviderId);
  const expandedSectionData =
    expandedSection !== null && activeProvider !== undefined
      ? activeProvider.sections.find((section) => section.id === expandedSection.sectionId)
      : undefined;

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
        {...(totalTitles > 0 && expandedSectionData === undefined
          ? { count: totalTitles, countLabel: 'titles' }
          : {})}
      />

      {isLoading ? <LoadingState type="grid" /> : null}

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

      {!isLoading && !isError && providers.length > 0 && activeProvider !== undefined ? (
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
            {expandedSectionData !== undefined &&
            expandedSection?.providerId === activeProvider.providerId ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="ghost" size="sm" onClick={onBackFromSection}>
                    Back to discover
                  </Button>
                  <h2 className="text-lg font-semibold text-foreground">{expandedSectionData.title}</h2>
                </div>
                <VirtualSearchGrid results={expandedSectionData.results} onOpenManga={onOpenManga} />
              </div>
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
