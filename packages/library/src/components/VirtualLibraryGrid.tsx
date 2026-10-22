import { memo, useMemo, useRef } from 'react';
import { useGridStaggerReveal } from '@app/motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CachedMangaCard } from '@app/cache';
import type { LibraryEntryId, LibraryLayoutMode, MangaId, MangaIdentity } from '@app/shared';
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
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<LibraryEntryId>;
  onToggleSelected?: (entryId: LibraryEntryId) => void;
}

interface LibraryCardProps {
  entryId: LibraryEntryId;
  manga: MangaIdentity;
  unreadCount: number;
  variant: LibraryLayoutMode;
  selectionMode: boolean;
  selected: boolean;
  onOpenManga: (mangaId: MangaId) => void;
  onToggleSelected: ((entryId: LibraryEntryId) => void) | undefined;
}

/** Cards read the title identity plus its unread count; entry ids only key the list. */
const LibraryCard = memo(function LibraryCard({
  entryId,
  manga,
  unreadCount,
  variant,
  selectionMode,
  selected,
  onOpenManga,
  onToggleSelected,
}: LibraryCardProps) {
  const toggle = () => onToggleSelected?.(entryId);
  return (
    <div data-library-card className="relative">
      {selectionMode ? (
        <label className="absolute top-2 left-2 z-20 flex size-7 cursor-pointer items-center justify-center rounded-control border border-border bg-background/90 shadow-sm">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            aria-label={`Select ${manga.canonicalTitle}`}
            checked={selected}
            onChange={toggle}
          />
        </label>
      ) : null}
      <CachedMangaCard
        manga={manga}
        variant={variant}
        unreadCount={unreadCount}
        onClick={selectionMode ? toggle : () => onOpenManga(manga.id)}
      />
    </div>
  );
});

export function VirtualLibraryGrid({
  items,
  layout,
  onOpenManga,
  selectionMode = false,
  selectedIds,
  onToggleSelected,
}: VirtualLibraryGridProps) {
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
          <LibraryCard
            key={entry.id}
            entryId={entry.id}
            manga={manga}
            unreadCount={entry.unreadCount}
            variant={layout}
            selectionMode={selectionMode}
            selected={selectedIds?.has(entry.id) ?? false}
            onOpenManga={onOpenManga}
            onToggleSelected={onToggleSelected}
          />
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
                  entryId={entry.id}
                  manga={manga}
                  unreadCount={entry.unreadCount}
                  variant={layout}
                  selectionMode={selectionMode}
                  selected={selectedIds?.has(entry.id) ?? false}
                  onOpenManga={onOpenManga}
                  onToggleSelected={onToggleSelected}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
