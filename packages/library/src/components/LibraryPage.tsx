import { EmptyState, ErrorState, LoadingState } from '@app/design-system';
import type { LibraryViewState, MangaId } from '@app/shared';
import type { LibraryPageData } from '../types.js';
import { LibraryToolbar } from './LibraryToolbar.js';
import { VirtualLibraryGrid } from './VirtualLibraryGrid.js';

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
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 md:p-8">
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
        <VirtualLibraryGrid
          items={items}
          layout={viewState.layout}
          onOpenManga={onOpenManga}
        />
      ) : null}
    </main>
  );
}
