import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MangaCard } from '@app/design-system';
import type { LibraryLayoutMode, MangaId } from '@app/shared';
import type { LibraryItem } from '../types.js';
import {
  estimateRowHeight,
  getColumnCount,
  getLibraryRowCount,
  getRowGap,
} from '../library-layout-metrics.js';
import { useContainerWidth } from '../hooks/use-container-width.js';
import { useScrollParent } from '../hooks/use-scroll-parent.js';

export interface VirtualLibraryGridProps {
  items: readonly LibraryItem[];
  layout: LibraryLayoutMode;
  onOpenManga: (mangaId: MangaId) => void;
}

export function VirtualLibraryGrid({ items, layout, onOpenManga }: VirtualLibraryGridProps) {
  const containerRef = useRef<HTMLElement>(null);
  const scrollParent = useScrollParent(containerRef);
  const containerWidth = useContainerWidth(containerRef);

  const columnCount = getColumnCount(layout, containerWidth);
  const rowGap = getRowGap(layout);
  const rowCount = getLibraryRowCount(items.length, columnCount);
  const estimateRowSize = useMemo(
    () => estimateRowHeight(layout, containerWidth, columnCount, rowGap),
    [layout, containerWidth, columnCount, rowGap],
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimateRowSize,
    gap: rowGap,
    overscan: 3,
    enabled: rowCount > 0 && scrollParent !== null && containerWidth > 0,
  });

  const isVirtualized = scrollParent !== null && containerWidth > 0;

  if (!isVirtualized) {
    return (
      <section
        ref={containerRef}
        aria-label="Library titles"
        className={
          layout === 'grid'
            ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
            : layout === 'list'
              ? 'flex flex-col gap-3'
              : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {items.map(({ entry, manga }) => (
          <MangaCard
            key={entry.id}
            manga={manga}
            variant={layout}
            onClick={() => onOpenManga(manga.id)}
          />
        ))}
      </section>
    );
  }

  return (
    <section ref={containerRef} aria-label="Library titles">
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
                <MangaCard
                  key={entry.id}
                  manga={manga}
                  variant={layout}
                  onClick={() => onOpenManga(manga.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
