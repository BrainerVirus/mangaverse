import { CachedMangaCard } from '@app/cache';
import { EmptyNote, ErrorState, LoadingState } from '@app/design-system';
import type { MangaId, MangaIdentity } from '@app/shared';

const RELATED_GRID_CLASSES = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4';

export interface MangaRelatedTitlesProps {
  readonly heading: string;
  readonly items?: readonly MangaIdentity[];
  readonly isLoading?: boolean;
  readonly error?: string;
  onRetry?: () => void;
  onOpenManga: (mangaId: MangaId) => void;
}

export function MangaRelatedTitles({
  heading,
  items,
  isLoading = false,
  error,
  onRetry,
  onOpenManga,
}: MangaRelatedTitlesProps) {
  return (
    <section aria-label={heading} className="space-y-4">
      <h2 className="type-heading">{heading}</h2>

      {isLoading ? (
        <LoadingState type="grid" count={4} columns="viewport-4" />
      ) : error !== undefined ? (
        <ErrorState
          title={`Could not load ${heading.toLowerCase()}`}
          message={error}
          {...(onRetry !== undefined ? { onRetry } : {})}
        />
      ) : items === undefined ? null : items.length === 0 ? (
        <EmptyNote>No {heading.toLowerCase()} from this provider.</EmptyNote>
      ) : (
        <div className={RELATED_GRID_CLASSES}>
          {items.map((manga) => (
            <CachedMangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
