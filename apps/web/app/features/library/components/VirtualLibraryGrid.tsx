import { memo, useMemo, useRef } from 'react';
import { useGridStaggerReveal } from '@app/motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CachedMangaCard } from '@app/cache';
import type {
  LibraryEntry,
  LibraryEntryId,
  LibraryLayoutMode,
  MangaId,
  MangaIdentity,
} from '@app/shared';
import { librarySourceLabel, libraryStatusLabel } from '@app/shared';
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
  /** Registered provider names keyed by provider id; omitted labels print nothing. */
  sourceLabels?: Readonly<Record<string, string>>;
}

interface LibraryCardProps {
  entry: LibraryEntry;
  manga: MangaIdentity;
  variant: LibraryLayoutMode;
  selectionMode: boolean;
  selected: boolean;
  sourceLabel: string | undefined;
  onOpenManga: (mangaId: MangaId) => void;
  onToggleSelected: ((entryId: LibraryEntryId) => void) | undefined;
}

function cardProgress(entry: LibraryEntry): string | undefined {
  if (entry.progressPercent === undefined) return undefined;
  return `${Math.round(Math.min(100, Math.max(0, entry.progressPercent)))}% read`;
}

/** Cards read the entry's display fields; the entry id only keys the list. */
const LibraryCard = memo(function LibraryCard({
  entry,
  manga,
  variant,
  selectionMode,
  selected,
  sourceLabel,
  onOpenManga,
  onToggleSelected,
}: LibraryCardProps) {
  const entryId = entry.id;
  const toggle = () => onToggleSelected?.(entryId);
  const progress = cardProgress(entry);
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
        {...(sourceLabel === undefined ? {} : { sourceLabel })}
        // The unread badge shares the top-left corner with the selection
        // checkbox; in selection mode the checkbox owns it.
        {...(selectionMode ? {} : { unreadCount: entry.unreadCount })}
        onClick={selectionMode ? toggle : () => onOpenManga(manga.id)}
      />
      <div
        data-library-card-meta
        className="mt-1 flex flex-wrap items-center gap-x-2 px-1 text-xs text-muted-foreground"
      >
        <span>{libraryStatusLabel(entry.status)}</span>
        {progress !== undefined ? <span>{progress}</span> : null}
      </div>
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
  sourceLabels,
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

  // oxlint-disable-next-line react/incompatible-library, react-hooks-js/incompatible-library -- TanStack Virtual returns imperative measure/getVirtualItems closures; skipping compiler memoization of this grid is the intended, documented behaviour (ruling recorded)
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
            entry={entry}
            manga={manga}
            variant={layout}
            selectionMode={selectionMode}
            selected={selectedIds?.has(entry.id) ?? false}
            sourceLabel={librarySourceLabel(manga, sourceLabels)}
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
                  entry={entry}
                  manga={manga}
                  variant={layout}
                  selectionMode={selectionMode}
                  selected={selectedIds?.has(entry.id) ?? false}
                  sourceLabel={librarySourceLabel(manga, sourceLabels)}
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
