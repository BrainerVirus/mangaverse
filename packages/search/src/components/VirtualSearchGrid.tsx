import { useMemo, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MangaCard } from '@app/design-system';
import type { MangaId, MangaIdentity } from '@app/shared';
import { useContainerWidth } from '../hooks/use-container-width.js';
import { useScrollMargin } from '../hooks/use-scroll-margin.js';
import { useScrollParent } from '../hooks/use-scroll-parent.js';
import {
  estimateSearchRowHeight,
  getSearchColumnCount,
  getSearchRowCount,
  getSearchRowGap,
} from '../search-layout-metrics.js';

/** Virtualize only large result sets; smaller grids use plain CSS for reliability. */
export const VIRTUALIZE_MIN_ITEMS = 48;

export interface VirtualSearchGridProps {
  results: readonly MangaIdentity[];
  onOpenManga: (mangaId: MangaId) => void;
}

function StaticSearchGrid({
  results,
  onOpenManga,
  containerRef,
}: VirtualSearchGridProps & { containerRef: RefObject<HTMLElement | null> }) {
  return (
    <section
      ref={containerRef}
      aria-label="Search results"
      data-testid="search-results-grid"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {results.map((manga) => (
        <MangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
      ))}
    </section>
  );
}

export function VirtualSearchGrid({ results, onOpenManga }: VirtualSearchGridProps) {
  const containerRef = useRef<HTMLElement>(null);
  const scrollParent = useScrollParent(containerRef);
  const containerWidth = useContainerWidth(containerRef);
  const scrollMargin = useScrollMargin(containerRef, scrollParent);

  const columnCount = getSearchColumnCount(containerWidth);
  const rowGap = getSearchRowGap();
  const rowCount = getSearchRowCount(results.length, columnCount);
  const estimateRowSize = useMemo(
    () => estimateSearchRowHeight(containerWidth, columnCount, rowGap),
    [containerWidth, columnCount, rowGap],
  );

  const shouldVirtualize =
    results.length >= VIRTUALIZE_MIN_ITEMS && scrollParent !== null && containerWidth > 0;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimateRowSize,
    gap: rowGap,
    overscan: 3,
    scrollMargin,
    enabled: shouldVirtualize && rowCount > 0,
  });

  const isVirtualized = shouldVirtualize;

  if (!isVirtualized) {
    return <StaticSearchGrid results={results} onOpenManga={onOpenManga} containerRef={containerRef} />;
  }

  return (
    <section ref={containerRef} aria-label="Search results" data-testid="search-results-grid">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = results.slice(startIndex, startIndex + columnCount);

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
              {rowItems.map((manga) => (
                <MangaCard key={manga.id} manga={manga} onClick={() => onOpenManga(manga.id)} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
