import { EmptyState, ErrorState, LoadingState, MangaCard } from '@app/design-system';
import type { LibraryViewState, MangaId } from '@app/shared';
import type { LibraryPageData } from '../types.js';
import { LibraryToolbar } from './LibraryToolbar.js';

export interface LibraryPageProps {
  data: LibraryPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  viewState: LibraryViewState;
  onViewStateChange: (next: LibraryViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowse?: () => void;
}

export function LibraryPage({
  data,
  isLoading,
  isError,
  viewState,
  onViewStateChange,
  onOpenManga,
  onBrowse,
}: LibraryPageProps) {
  const items = data?.items ?? [];
  const itemCount = items.length;

  return (
    <main className="flex flex-col gap-6 p-6">
      <LibraryToolbar
        viewState={viewState}
        itemCount={itemCount}
        onViewStateChange={onViewStateChange}
      />

      {isLoading ? (
        <LoadingState type="grid" />
      ) : null}

      {isError ? (
        <ErrorState
          title="Could not load library"
          message="Local data failed to load. Try again in a moment."
        />
      ) : null}

      {!isLoading && !isError && itemCount === 0 ? (
        <EmptyState
          type="no-library"
          {...(onBrowse !== undefined
            ? { action: { label: 'Browse providers', onClick: onBrowse } }
            : {})}
        />
      ) : null}

      {!isLoading && !isError && itemCount > 0 ? (
        <section
          aria-label="Library titles"
          className={
            viewState.layout === 'grid'
              ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : viewState.layout === 'list'
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
          }
        >
          {items.map(({ entry, manga }) => (
            <MangaCard
              key={entry.id}
              manga={manga}
              variant={viewState.layout}
              onClick={() => onOpenManga(manga.id)}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}
