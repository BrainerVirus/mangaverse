import { MangaCard, type MangaCardProps } from '@app/design-system';
import { cn } from '@app/design-system';

import { CachedMangaCardCover } from './CachedCoverImage.js';
import { useCoverCacheContext } from './CoverCacheProvider.js';

export function CachedMangaCard(props: MangaCardProps) {
  const context = useCoverCacheContext();
  const { manga, variant = 'grid' } = props;
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';

  if (context === null || manga.coverImageUrl === undefined) {
    return <MangaCard {...props} />;
  }

  return (
    <MangaCard
      {...props}
      coverSlot={
        <div
          className={cn(
            'overflow-hidden rounded-[var(--radius-control)] bg-muted',
            isGrid ? 'min-h-0 w-full flex-1' : 'h-20 w-14 shrink-0',
            isCompact && 'h-16 w-12',
          )}
        >
          <CachedMangaCardCover
            manga={manga}
            className="h-full w-full object-cover"
          />
        </div>
      }
    />
  );
}
