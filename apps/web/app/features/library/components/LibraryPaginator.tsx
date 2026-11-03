import { Button, useStateReducer } from '@app/design-system';
import { LIBRARY_PAGE_MAX } from '@app/shared';

export interface LibraryPaginatorProps {
  /** Rows already on screen. */
  readonly loaded: number;
  /** Every title the filter matches. */
  readonly total: number;
  /** Loads the next page; resolves once its rows are in. Absent keeps the control hidden. */
  readonly onLoadMore?: (() => Promise<void>) | undefined;
  /** The most rows one view will load; the grid cannot page past it. */
  readonly cap?: number;
}

const count = new Intl.NumberFormat('en-US');
const formatCount = (value: number) => count.format(value);

/**
 * The explicit "load more" control under the grid. The page is bounded, so the count
 * says how much of the library is on screen and the button asks for the next page.
 * At the cap the control stays visible with the loaded and matching counts, so a large
 * library says "5,000 of 8,000" instead of silently hiding the paginator.
 */
export function LibraryPaginator({
  loaded,
  total,
  onLoadMore,
  cap = LIBRARY_PAGE_MAX,
}: LibraryPaginatorProps) {
  const [isLoading, dispatchLoading] = useStateReducer(
    (_state: boolean, event: 'start' | 'stop') => event === 'start',
    false,
  );
  if (onLoadMore === undefined || loaded >= total) return null;

  const capped = loaded >= cap;
  const load = () => {
    dispatchLoading('start');
    void onLoadMore().finally(() => dispatchLoading('stop'));
  };

  return (
    <div data-library-paginator className="flex flex-col items-center gap-2 py-4">
      <output className="block text-sm text-muted-foreground">
        Showing {formatCount(loaded)} of {formatCount(total)} titles
      </output>
      {capped ? (
        <p className="text-sm text-muted-foreground">
          This view is limited to the first {formatCount(cap)} titles.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={load}
          disabled={isLoading}
          aria-label="Load more titles"
        >
          {isLoading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
