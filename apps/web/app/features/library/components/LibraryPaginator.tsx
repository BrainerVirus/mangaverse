import { Button, useStateReducer } from '@app/design-system';

export interface LibraryPaginatorProps {
  /** Rows already on screen. */
  readonly loaded: number;
  /** Every title the filter matches. */
  readonly total: number;
  /** Loads the next page; resolves once its rows are in. Absent keeps the control hidden. */
  readonly onLoadMore?: (() => Promise<void>) | undefined;
}

/**
 * The explicit "load more" control under the grid. The page is bounded, so the count
 * says how much of the library is on screen and the button asks for the next page.
 */
export function LibraryPaginator({ loaded, total, onLoadMore }: LibraryPaginatorProps) {
  const [isLoading, dispatchLoading] = useStateReducer(
    (_state: boolean, event: 'start' | 'stop') => event === 'start',
    false,
  );
  if (onLoadMore === undefined || loaded >= total) return null;

  const load = () => {
    dispatchLoading('start');
    void onLoadMore().finally(() => dispatchLoading('stop'));
  };

  return (
    <div data-library-paginator className="flex flex-col items-center gap-2 py-4">
      <output className="block text-sm text-muted-foreground">
        Showing {loaded} of {total} titles
      </output>
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
    </div>
  );
}
