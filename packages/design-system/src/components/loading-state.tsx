import { useId } from 'react';
import { StateFrame } from './state-frame.js';
import { Skeleton } from './ui/skeleton.js';
import { Card, CardContent, CardHeader } from './ui/card.js';
import { CONTENT_GRID_CLASSES, contentRowCellClass, VIEWPORT_4_CLASSES } from './loading-grid.js';
const COLUMN_CLASSES = CONTENT_GRID_CLASSES;

type LoadingStateType = 'grid' | 'list' | 'detail' | 'sections';

export interface LoadingStateProps {
  type: LoadingStateType;
  count?: number;
  /**
   * `grid` only, with `count`: the columns of the grid that replaces the placeholder. `content`
   * follows the content column's width (the library and search grids); `row` is one row of that
   * same grid (the discover rows: as many covers as the columns); `viewport-4` follows the
   * viewport, as the related-titles CSS grid does.
   */
  columns?: 'content' | 'row' | 'viewport-4';
  /** `grid` only: reserve the one-line caption a library card carries under its cover. */
  caption?: boolean;
  /** `sections` only: placeholder rows inside each card. */
  rows?: number;
}

/**
 * Two complete rows at every column count: a cell is shown only from the width at which the
 * second row still needs it (2 columns: 4 cells ... 6 columns: 12 cells).
 */
const CELL_VISIBILITY = [
  '',
  '',
  '',
  '',
  'hidden @min-[640px]:block',
  'hidden @min-[640px]:block',
  'hidden @min-[768px]:block',
  'hidden @min-[768px]:block',
  'hidden @min-[1024px]:block',
  'hidden @min-[1024px]:block',
  'hidden @min-[1280px]:block',
  'hidden @min-[1280px]:block',
] as const;

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="shrink-0">
        <Skeleton className="h-80 w-56 rounded-box" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-control" />
        <Skeleton className="h-4 w-48 rounded-control" />
        <Skeleton className="h-4 w-32 rounded-control" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-10 w-24 rounded-btn" />
          <Skeleton className="h-10 w-24 rounded-btn" />
        </div>
        <Skeleton className="mt-4 h-24 w-full rounded-box" />
      </div>
    </div>
  );
}

/** A cover-shaped cell: the card's own aspect ratio, plus its caption line when it has one. */
function GridCell({ caption, className }: { caption: boolean; className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="aspect-3/4 w-full rounded-box" />
      {caption ? (
        <div className="mt-1 px-1">
          <Skeleton className="h-4 w-16 rounded-control" />
        </div>
      ) : null}
    </div>
  );
}

function GridSkeleton({
  count,
  columns,
  caption,
  baseId,
}: {
  count: number | undefined;
  columns: 'content' | 'row' | 'viewport-4';
  caption: boolean;
  baseId: string;
}) {
  const explicit = count !== undefined && count > 0;
  const cells = explicit ? count : CELL_VISIBILITY.length;
  const gridClass = explicit && columns === 'viewport-4' ? VIEWPORT_4_CLASSES : COLUMN_CLASSES;
  const cellClass = (i: number): string | undefined => {
    if (!explicit) return CELL_VISIBILITY[i];
    return columns === 'row' ? contentRowCellClass(i) : undefined;
  };
  return (
    <div className={gridClass}>
      {Array.from({ length: cells }).map((_, i) => {
        const className = cellClass(i);
        return (
          <GridCell
            key={`${baseId}-${i}`}
            caption={caption}
            {...(className === undefined ? {} : { className })}
          />
        );
      })}
    </div>
  );
}

/**
 * Settings-style cards built from the real card chrome and the real line boxes: a heading line
 * and a description line (1lh of their type styles), then `rows` 44px control rows (a label over a
 * description, as the settings toggles are) and the closing separator gap. A section whose rows
 * are taller or shorter still lines up to the pixel for the first rows.
 */
function SectionsSkeleton({
  count,
  rows,
  baseId,
}: {
  count: number;
  rows: number;
  baseId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={`${baseId}-section-${i}`} className="w-full">
          <CardHeader className="pb-4">
            <div className="type-heading flex h-lh items-center">
              <Skeleton className="h-4 w-40 rounded-control" />
            </div>
            <div className="type-body flex h-lh items-center">
              <Skeleton className="h-3.5 w-72 max-w-full rounded-control" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-4">
              {Array.from({ length: rows }).map((_row, r) => (
                <Skeleton
                  key={`${baseId}-section-${i}-row-${r}`}
                  className="h-11 w-full rounded-control"
                />
              ))}
            </div>
            <div className="mt-4 h-px" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LoadingState({
  type,
  count,
  columns = 'content',
  caption = false,
  rows = 2,
}: LoadingStateProps) {
  const itemCount = type === 'list' ? 8 : type === 'sections' ? 3 : 1;
  const actualCount = count !== undefined && count > 0 ? count : itemCount;
  const baseId = useId();
  return (
    <StateFrame padding="none" align="stretch" className="@container w-full">
      {type === 'grid' && (
        <GridSkeleton count={count} columns={columns} caption={caption} baseId={baseId} />
      )}
      {type === 'list' && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: actualCount }).map((_, i) => (
            <div
              key={`${baseId}-list-${i}`}
              className="flex gap-4 rounded-box border border-border p-3"
            >
              <Skeleton className="h-20 w-14 shrink-0 rounded-control" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-48 rounded-control" />
                <Skeleton className="h-4 w-32 rounded-control" />
                <Skeleton className="h-3 w-24 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      )}
      {type === 'sections' && <SectionsSkeleton count={actualCount} rows={rows} baseId={baseId} />}
      {type === 'detail' && <DetailSkeleton />}
    </StateFrame>
  );
}
