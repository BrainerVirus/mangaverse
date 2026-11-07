import type { ReactNode } from 'react';
import { Card, CardContent, LoadingState, Skeleton } from '@app/design-system';
import type { LibraryLayoutMode } from '@app/shared';
import { SelectTitlesButton } from './BulkEditBar.js';
import { LibraryUpdatePanel, ShelfHeading, type LibraryUpdatesControl } from './LibrarySections.js';

/** A line of text as a bar: the box is the line's own height, the bar sits inside it. */
function TextLine({
  height,
  children,
}: {
  readonly height: 'h-5' | 'h-6';
  readonly children: ReactNode;
}) {
  return (
    <div className={height === 'h-6' ? 'flex h-6 items-center' : 'flex h-5 items-center'}>
      {children}
    </div>
  );
}

/** One "Continue reading" card: the cover thumbnail beside three lines, in the card's own box. */
function ContinueReadingCardSkeleton({ className }: { readonly className?: string }) {
  return (
    <li className={className}>
      <Card>
        <CardContent className="flex items-center gap-3 p-3">
          <Skeleton className="h-20 w-14 shrink-0" />
          <span className="flex min-w-0 flex-col gap-1">
            <TextLine height="h-6">
              <Skeleton className="h-3 w-40" />
            </TextLine>
            <TextLine height="h-5">
              <Skeleton className="h-3 w-28" />
            </TextLine>
            <TextLine height="h-5">
              <Skeleton className="h-3 w-20" />
            </TextLine>
          </span>
        </CardContent>
      </Card>
    </li>
  );
}

/** The shelves' headings are static; only the rows under them wait for the database. */
function OverviewSkeleton() {
  return (
    <>
      <section aria-label="Continue reading" className="flex flex-col gap-3">
        <ShelfHeading>Continue reading</ShelfHeading>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ContinueReadingCardSkeleton />
          <ContinueReadingCardSkeleton className="hidden md:block" />
          <ContinueReadingCardSkeleton className="hidden xl:block" />
        </ul>
      </section>
      <section aria-label="Recently updated" className="flex flex-col gap-3">
        <ShelfHeading>Recently updated</ShelfHeading>
        <Card>
          <CardContent className="px-4 py-3">
            <TextLine height="h-6">
              <Skeleton className="h-3 w-48" />
            </TextLine>
            <TextLine height="h-5">
              <Skeleton className="h-3 w-32" />
            </TextLine>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

/** A "list" or "compact" row: the card's box plus the status line the library puts under it. */
function RowSkeleton({ layout }: { readonly layout: 'list' | 'compact' }) {
  const compact = layout === 'compact';
  return (
    <div>
      <Card>
        <CardContent className={compact ? 'flex gap-3 p-2' : 'flex gap-4 p-3'}>
          {compact ? (
            <Skeleton className="h-16 w-12 shrink-0" />
          ) : (
            <Skeleton className="h-20 w-14 shrink-0" />
          )}
          <div className="flex flex-1 flex-col justify-center gap-2 py-1">
            <Skeleton className="h-4 w-48 max-w-full" />
            {compact ? null : <Skeleton className="h-3 w-24" />}
          </div>
        </CardContent>
      </Card>
      <div className="mt-1 px-1">
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function TitlesSkeleton({ layout }: { readonly layout: LibraryLayoutMode }) {
  if (layout === 'grid') return <LoadingState type="grid" caption />;
  if (layout === 'list') {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((row) => (
          <RowSkeleton key={row} layout="list" />
        ))}
      </div>
    );
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-2 @min-[640px]:grid-cols-2 @min-[1024px]:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <RowSkeleton key={row} layout="compact" />
        ))}
      </div>
    </div>
  );
}

export interface LibraryLoadingRegionProps {
  readonly layout: LibraryLayoutMode;
  readonly updates: LibraryUpdatesControl | undefined;
}

/**
 * Everything under the toolbar while the library's rows load, in the order and at the sizes the
 * loaded page uses. Static chrome (the update panel, the "Select titles" button, the shelf
 * headings) is the real thing, disabled where it needs the database; only the rows are
 * placeholders. The grid placeholder follows the loaded grid's columns and card ratio.
 */
export function LibraryLoadingRegion({ layout, updates }: LibraryLoadingRegionProps) {
  return (
    <div aria-busy="true" data-library-loading className="flex flex-col gap-6">
      {updates === undefined ? null : <LibraryUpdatePanel updates={updates} disabled />}
      <OverviewSkeleton />
      <SelectTitlesButton disabled />
      <TitlesSkeleton layout={layout} />
    </div>
  );
}
