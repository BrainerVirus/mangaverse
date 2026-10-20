import { memo, useMemo, useRef } from 'react';
import { useGridStaggerReveal } from '@app/motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CachedMangaCard } from '@app/cache';
import type { LibraryLayoutMode, MangaId, MangaIdentity } from '@app/shared';
import type { LibraryItem } from '../types.js';
import {
  estimateRowHeight,
  getColumnCount,
  getLibraryRowCount,
  getRowGap,
} from '../library-layout-metrics.js';
import { useContainerWidth } from '../hooks/use-container-width.js';
import { useScrollParent } from '../hooks/use-scroll-parent.js';

/** Cap the pre-measurement fallback so a large library never mounts every card twice. */
const FALLBACK_CARD_LIMIT = 48;

export interface VirtualLibraryGridProps {
  items: readonly LibraryItem[];
  layout: LibraryLayoutMode;
  onOpenManga: (mangaId: MangaId) => void;
}

interface LibraryCardProps {
  manga: MangaIdentity;
  variant: LibraryLayoutMode;
  onOpenManga: (mangaId: MangaId) => void;
}

/** Cards only read these props; entry ids only key the list. */
const LibraryCard = memo(function LibraryCard({ manga, variant, onOpenManga }: LibraryCardProps) {
  return (
    <div data-library-card>
      <CachedMangaCard manga={manga} variant={variant} onClick={() => onOpenManga(manga.id)} />
    </div>
  );
});

export function VirtualLibraryGrid({ items, layout, onOpenManga }: VirtualLibraryGridProps) {
  const containerRef = useRef<HTMLElement>(null);
  const { scrollParent, isMeasured } = useScrollParent(containerRef);
  const containerWidth = useContainerWidth(containerRef);
  const itemsKey = useMemo(() => items.map((item) => item.entry.id).join(','), [items]);

  const columnCount = getColumnCount(layout, containerWidth);
  const rowGap = getRowGap(layout);
  const rowCount = getLibraryRowCount(items.length, columnCount);
  const estimateRowSize = useMemo(
    () => estimateRowHeight(layout, containerWidth, columnCount, rowGap),
    [layout, containerWidth, columnCount, rowGap],
  );

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns imperative measure/getVirtualItems closures; skipping compiler memoization of this grid is the intended, documented behaviour (ruling recorded)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimateRowSize,
    gap: rowGap,
    overscan: 3,
    enabled: rowCount > 0 && scrollParent !== null && containerWidth > 0,
  });

  const isVirtualized = scrollParent !== null && containerWidth > 0;
  const fallbackItems = isMeasured ? items : items.slice(0, FALLBACK_CARD_LIMIT);
  const revealRef = useGridStaggerReveal(itemsKey, items.length > 0);

  if (!isVirtualized) {
    return (
      <section
        ref={(node) => {
          containerRef.current = node;
          revealRef.current = node;
        }}
        aria-label="Library titles"
        className={
          layout === 'grid'
            ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
            : layout === 'list'
              ? 'flex flex-col gap-3'
              : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {fallbackItems.map(({ entry, manga }) => (
          <LibraryCard key={entry.id} manga={manga} variant={layout} onOpenManga={onOpenManga} />
        ))}
      </section>
    );
  }

  return (
    <section
      ref={(node) => {
        containerRef.current = node;
        revealRef.current = node;
      }}
      aria-label="Library titles"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${rowGap}px`,
              }}
            >
              {rowItems.map(({ entry, manga }) => (
                <LibraryCard
                  key={entry.id}
                  manga={manga}
                  variant={layout}
                  onOpenManga={onOpenManga}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
