import { MangaCard, type MangaCardProps } from '@app/design-system';
import { cn } from '@app/design-system';
import { getMangaCoverUrl } from '@app/shared';

import { CachedMangaCardCover } from './CachedCoverImage.js';
import { useCoverCacheContext } from './CoverCacheProvider.js';

export function CachedMangaCard(props: MangaCardProps) {
  const context = useCoverCacheContext();
  const { manga, variant = 'grid' } = props;
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';

  const coverSlot = (
    <div
      className={cn(
        'overflow-hidden rounded-control bg-muted',
        isGrid ? 'min-h-0 w-full flex-1' : 'h-20 w-14 shrink-0',
        isCompact && 'h-16 w-12',
      )}
    >
      {context !== null ? (
        <CachedMangaCardCover manga={manga} className="h-full w-full object-cover" />
      ) : getMangaCoverUrl(manga) !== undefined ? (
        <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
      ) : (
        <div className="h-full w-full bg-muted" aria-hidden />
      )}
    </div>
  );

  return <MangaCard {...props} coverSlot={coverSlot} />;
}
