import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { getMangaCoverUrl, type MangaIdentity } from '@app/shared';
import { useReducedMotion } from '@app/motion';
import { cn } from '../lib/cn.js';
import { Badge } from './ui/badge.js';

export interface MangaCardProps {
  manga: MangaIdentity;
  onClick?: () => void;
  variant?: 'grid' | 'list' | 'compact';
  coverSlot?: React.ReactNode;
  /** Unread chapter count shown as a badge; omitted or zero renders nothing. */
  unreadCount?: number;
}

interface CoverProps {
  manga: MangaIdentity;
  variant: 'grid' | 'list' | 'compact';
  coverSlot?: React.ReactNode;
}

function CardCover({ manga, variant, coverSlot }: CoverProps) {
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';

  // `??` semantics: a null coverSlot falls through to the built-in cover.
  if (coverSlot !== undefined && coverSlot !== null) return <>{coverSlot}</>;

  const coverImageUrl = getMangaCoverUrl(manga);
  if (coverImageUrl) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-control bg-muted',
          isGrid ? 'min-h-0 w-full flex-1' : 'h-20 w-14 shrink-0',
          isCompact && 'h-16 w-12',
        )}
      >
        <img
          src={coverImageUrl}
          alt={manga.canonicalTitle}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  if (isGrid) {
    return <div className="min-h-0 w-full flex-1 rounded-control bg-muted" aria-hidden />;
  }

  return null;
}

interface MetaProps {
  manga: MangaIdentity;
  variant: 'grid' | 'list' | 'compact';
}

function CardMeta({ manga, variant }: MetaProps) {
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';

  return (
    <div
      // DESIGN.md §3.5: text over cover art needs a protected ground. The card's own `--card`
      // token keeps the plate correct in light, dark and AMOLED instead of a fixed scrim.
      data-card-plate={isGrid ? '' : undefined}
      className={cn(
        'flex flex-col justify-between',
        isGrid
          ? 'absolute bottom-0 left-0 right-0 z-10 rounded-b-box bg-gradient-to-t from-card via-card to-transparent px-3 pb-3 pt-8'
          : 'flex-1 py-1',
        isCompact && 'min-w-0 py-0.5',
      )}
    >
      <div>
        <h3
          className={cn(
            'font-semibold leading-tight text-card-foreground',
            isGrid ? 'text-sm line-clamp-2' : 'text-base',
            isCompact && 'text-sm line-clamp-1',
          )}
        >
          {manga.canonicalTitle}
        </h3>

        {manga.providerMappings.length > 0 && !isCompact && (
          <p className="type-code mt-1 text-muted-foreground">
            {manga.providerMappings[0]!.providerId}
          </p>
        )}
      </div>

      {manga.tags.length > 0 && !isCompact && (
        <div className="mt-2 flex flex-wrap gap-1">
          {manga.tags.slice(0, 3).map((tag) => (
            <Badge key={tag.label} variant="outline" className="keycap-text px-1.5 py-0">
              {tag.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentRatingBadge({ manga, variant }: MetaProps) {
  const { contentRating } = manga;
  if (contentRating === 'safe' || contentRating === 'unknown') return null;

  return (
    <Badge
      variant="destructive"
      className={cn(
        'absolute',
        variant === 'grid' ? 'top-2 right-2' : 'top-1 right-1',
        variant === 'compact' && '!type-rating-compact',
      )}
    >
      {contentRating}
    </Badge>
  );
}

function UnreadBadge({
  unreadCount,
  variant,
}: {
  readonly unreadCount: number | undefined;
  readonly variant: 'grid' | 'list' | 'compact';
}) {
  if (unreadCount === undefined || unreadCount <= 0) return null;

  return (
    <Badge
      variant="secondary"
      className={cn(
        'absolute z-20',
        variant === 'grid' ? 'top-2 left-2' : 'top-1 left-1',
        variant === 'compact' && '!type-rating-compact',
      )}
    >
      {unreadCount} unread
    </Badge>
  );
}

export function MangaCard({
  manga,
  onClick,
  variant = 'grid',
  coverSlot,
  unreadCount,
}: MangaCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  useGSAP(
    () => {
      if (!buttonRef.current || reducedMotion) return;
      const el = buttonRef.current;

      const onEnter = () => {
        gsap.to(el, { y: -2, scale: 1.02, duration: 0.2, ease: 'power2.out' });
      };
      const onLeave = () => {
        gsap.to(el, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
      };

      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('focus', onEnter);
      el.addEventListener('blur', onLeave);

      return () => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
        el.removeEventListener('focus', onEnter);
        el.removeEventListener('blur', onLeave);
      };
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          'group relative w-full cursor-pointer overflow-hidden rounded-box border border-border bg-card transition-all',
          'hover:border-accent hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          {
            'relative flex flex-col aspect-3/4': variant === 'grid',
            'flex gap-4 p-3': variant === 'list',
            'flex-row gap-3 p-2': variant === 'compact',
          },
        )}
      >
        <CardCover manga={manga} variant={variant} coverSlot={coverSlot} />

        <CardMeta manga={manga} variant={variant} />

        <ContentRatingBadge manga={manga} variant={variant} />

        <UnreadBadge unreadCount={unreadCount} variant={variant} />
      </button>
    </div>
  );
}
