import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import type { MangaIdentity } from '@app/shared';
import { useReducedMotion } from '@app/motion';
import { cn } from '../lib/cn.js';
import { Badge } from './ui/badge.js';

export interface MangaCardProps {
  manga: MangaIdentity;
  onClick?: () => void;
  variant?: 'grid' | 'list' | 'compact';
}

export function MangaCard({ manga, onClick, variant = 'grid' }: MangaCardProps) {
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';
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
    { scope: containerRef }
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
        'group relative cursor-pointer overflow-hidden rounded-[var(--radius-box)] border border-[var(--border)] bg-card transition-all',
        'hover:border-accent hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        {
          'flex flex-col aspect-[3/4]': isGrid,
          'flex gap-4 p-3': variant === 'list',
          'flex-row gap-3 p-2': isCompact,
        }
      )}
    >
      {manga.coverImageUrl ? (
        <div
          className={cn(
            'overflow-hidden rounded-[var(--radius-control)] bg-muted',
            isGrid ? 'min-h-0 w-full flex-1' : 'h-20 w-14 shrink-0',
            isCompact && 'h-16 w-12'
          )}
        >
          <img
            src={manga.coverImageUrl}
            alt={manga.canonicalTitle}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : isGrid ? (
        <div className="min-h-0 w-full flex-1 rounded-[var(--radius-control)] bg-muted" aria-hidden />
      ) : null}

      <div
        className={cn(
          'flex flex-col justify-between',
          isGrid ? 'absolute bottom-0 left-0 right-0 p-3' : 'flex-1 py-1',
          isCompact && 'min-w-0 py-0.5'
        )}
      >
        <div>
          <h3
            className={cn(
              'font-semibold leading-tight text-card-foreground',
              isGrid ? 'text-sm line-clamp-2' : 'text-base',
              isCompact && 'text-sm line-clamp-1'
            )}
          >
            {manga.canonicalTitle}
          </h3>

          {manga.providerMappings.length > 0 && !isCompact && (
            <p className="mt-1 text-xs text-muted-foreground">
              {manga.providerMappings[0]!.providerId}
            </p>
          )}
        </div>

        {manga.tags.length > 0 && !isCompact && (
          <div className="mt-2 flex flex-wrap gap-1">
            {manga.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.label} variant="outline" className="text-[10px] px-1.5 py-0">
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {manga.contentRating !== 'safe' && manga.contentRating !== 'unknown' && (
        <Badge
          variant="destructive"
          className={cn(
            'absolute',
            isGrid ? 'top-2 right-2' : 'top-1 right-1',
            isCompact && '!text-[8px]'
          )}
        >
          {manga.contentRating}
        </Badge>
      )}
    </button>
    </div>
  );
}