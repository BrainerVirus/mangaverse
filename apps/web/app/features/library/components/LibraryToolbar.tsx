import type {
  LibraryCategory,
  LibraryFilter,
  LibrarySort,
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatus,
  LibraryViewState,
  ProviderId,
} from '@app/shared';
import { compareLibraryCategories } from '@app/shared';
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useStateReducer,
} from '@app/design-system';
import { Grid3x3, List, Pin, Rows3, SlidersHorizontal, Tags, X } from 'lucide-react';
import type { LibraryLayoutMode } from '@app/shared';
import { DEFAULT_LIBRARY_VIEW_STATE, hasLibraryFilters } from '../view-state.js';
import type { LibraryOrganizationAction } from '../types.js';
import { CategoryManagerDialog } from './CategoryManagerDialog.js';

export interface LibraryToolbarProps {
  viewState: LibraryViewState;
  categories: readonly LibraryCategory[];
  providers: readonly ProviderId[];
  onViewStateChange: (next: LibraryViewState) => void;
  onFilterChange: (filter: LibraryFilter) => void;
  onOrganize?: (action: LibraryOrganizationAction) => Promise<void>;
}

const layoutOptions: { mode: LibraryLayoutMode; label: string; icon: typeof Grid3x3 }[] = [
  { mode: 'grid', label: 'Grid', icon: Grid3x3 },
  { mode: 'list', label: 'List', icon: List },
  { mode: 'compact', label: 'Compact', icon: Rows3 },
];

const STATUS_OPTIONS: { value: LibraryStatus; label: string }[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'planned', label: 'Planned' },
];

const SORT_OPTIONS: {
  value: string;
  label: string;
  key: LibrarySortKey;
  direction: LibrarySortDirection;
}[] = [
  { value: 'date_added:desc', label: 'Date added · newest', key: 'date_added', direction: 'desc' },
  { value: 'date_added:asc', label: 'Date added · oldest', key: 'date_added', direction: 'asc' },
  { value: 'title:asc', label: 'Title · A–Z', key: 'title', direction: 'asc' },
  { value: 'title:desc', label: 'Title · Z–A', key: 'title', direction: 'desc' },
  {
    value: 'last_updated:desc',
    label: 'Last updated · newest',
    key: 'last_updated',
    direction: 'desc',
  },
  {
    value: 'last_updated:asc',
    label: 'Last updated · oldest',
    key: 'last_updated',
    direction: 'asc',
  },
  { value: 'last_read:desc', label: 'Last read · recent', key: 'last_read', direction: 'desc' },
  { value: 'unread:desc', label: 'Unread · most', key: 'unread', direction: 'desc' },
  { value: 'progress:desc', label: 'Progress · furthest', key: 'progress', direction: 'desc' },
  { value: 'provider:asc', label: 'Provider · A–Z', key: 'provider', direction: 'asc' },
];

/** Select sentinel for "no filter"; provider ids and statuses never use it. */
const ALL_OPTION = '__all__';

function sortValue(sort: LibrarySort): string {
  const match = SORT_OPTIONS.find(
    (option) => option.key === sort.key && option.direction === sort.direction,
  );
  return match?.value ?? 'date_added:desc';
}

/** Partial that also accepts explicit `undefined`, which means "clear this filter". */
type LibraryFilterPatch = {
  [K in keyof LibraryFilter]?: LibraryFilter[K] | undefined;
};

interface OverlayState {
  filtersOpen: boolean;
  categoryManagerOpen: boolean;
}

const overlayReducer = (state: OverlayState, patch: Partial<OverlayState>): OverlayState => ({
  ...state,
  ...patch,
});

/** Filters the sheet owns; the query and category are already visible in the row. */
function countActiveFilters(viewState: LibraryViewState): number {
  const { filter, sort } = viewState;
  const defaultSort = DEFAULT_LIBRARY_VIEW_STATE.sort;
  return [
    (filter.statuses?.length ?? 0) > 0,
    (filter.providerIds?.length ?? 0) > 0,
    filter.favoritesOnly === true,
    sort.key !== defaultSort.key || sort.direction !== defaultSort.direction,
  ].filter(Boolean).length;
}

/** Empty selections are removed so the query key and the "clear" state stay identical. */
function mergeFilter(filter: LibraryFilter, patch: LibraryFilterPatch): LibraryFilter {
  const merged = { ...filter, ...patch };
  return {
    ...(merged.query !== undefined && merged.query.trim().length > 0
      ? { query: merged.query }
      : {}),
    ...(merged.categoryIds !== undefined && merged.categoryIds.length > 0
      ? { categoryIds: merged.categoryIds }
      : {}),
    ...(merged.statuses !== undefined && merged.statuses.length > 0
      ? { statuses: merged.statuses }
      : {}),
    ...(merged.favoritesOnly === true ? { favoritesOnly: true } : {}),
    ...(merged.providerIds !== undefined && merged.providerIds.length > 0
      ? { providerIds: merged.providerIds }
      : {}),
  };
}

interface CategoryTabsProps {
  categories: readonly LibraryCategory[];
  activeCategoryId: LibraryCategory['id'] | undefined;
  onSelect: (categoryId: LibraryCategory['id'] | undefined) => void;
  onManage?: (() => void) | undefined;
}

function CategoryTabs({ categories, activeCategoryId, onSelect, onManage }: CategoryTabsProps) {
  const ordered = [...categories].sort(compareLibraryCategories);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={activeCategoryId === undefined ? 'default' : 'outline'}
        aria-pressed={activeCategoryId === undefined}
        onClick={() => onSelect(undefined)}
      >
        All titles
      </Button>
      {ordered.map((category) => (
        <Button
          key={category.id}
          type="button"
          size="sm"
          variant={activeCategoryId === category.id ? 'default' : 'outline'}
          aria-pressed={activeCategoryId === category.id}
          onClick={() => onSelect(activeCategoryId === category.id ? undefined : category.id)}
        >
          {category.pinned === true ? <Pin aria-hidden className="size-3 fill-current" /> : null}
          {category.name}
        </Button>
      ))}
      {onManage !== undefined ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Manage categories"
          onClick={onManage}
        >
          <Tags aria-hidden className="size-4" />
          Categories
        </Button>
      ) : null}
    </div>
  );
}

interface FiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewState: LibraryViewState;
  providers: readonly ProviderId[];
  onViewStateChange: (next: LibraryViewState) => void;
  changeFilter: (patch: LibraryFilterPatch) => void;
  /** Offered only while no category exists, when the row has no Categories button. */
  onManageCategories?: (() => void) | undefined;
}

function FiltersSheet({
  open,
  onOpenChange,
  viewState,
  providers,
  onViewStateChange,
  changeFilter,
  onManageCategories,
}: FiltersSheetProps) {
  const activeStatus = viewState.filter.statuses?.[0];
  const activeProvider = viewState.filter.providerIds?.[0];
  const canClearAll = countActiveFilters(viewState) > 0 || hasLibraryFilters(viewState.filter);

  // One state change: a filter call followed by a sort call would overwrite each other.
  function clearAll(): void {
    onViewStateChange({ ...viewState, sort: DEFAULT_LIBRARY_VIEW_STATE.sort, filter: {} });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow and order the titles in your library.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="library-filter-status">Status</Label>
            <Select
              value={activeStatus ?? ALL_OPTION}
              onValueChange={(value) => {
                const status = STATUS_OPTIONS.find((option) => option.value === value);
                changeFilter({ statuses: status === undefined ? undefined : [status.value] });
              }}
            >
              <SelectTrigger
                id="library-filter-status"
                className="h-9 w-full"
                aria-label="Filter by status"
              >
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>All statuses</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {providers.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="library-filter-provider">Provider</Label>
              <Select
                value={activeProvider ?? ALL_OPTION}
                onValueChange={(value) =>
                  changeFilter({
                    providerIds: value === ALL_OPTION ? undefined : [value as ProviderId],
                  })
                }
              >
                <SelectTrigger
                  id="library-filter-provider"
                  className="h-9 w-full"
                  aria-label="Filter by provider"
                >
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>All providers</SelectItem>
                  {providers.map((providerId) => (
                    <SelectItem key={providerId} value={providerId}>
                      {providerId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="library-filter-sort">Sort</Label>
            <Select
              value={sortValue(viewState.sort)}
              onValueChange={(value) => {
                const option = SORT_OPTIONS.find((candidate) => candidate.value === value);
                if (option === undefined) return;
                onViewStateChange({
                  ...viewState,
                  sort: { key: option.key, direction: option.direction },
                });
              }}
            >
              <SelectTrigger
                id="library-filter-sort"
                className="h-9 w-full"
                aria-label="Sort library"
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="sm"
            variant={viewState.filter.favoritesOnly === true ? 'default' : 'outline'}
            aria-pressed={viewState.filter.favoritesOnly === true}
            className="self-start"
            onClick={() =>
              changeFilter({
                favoritesOnly: viewState.filter.favoritesOnly === true ? undefined : true,
              })
            }
          >
            Favorites
          </Button>
        </div>

        {onManageCategories !== undefined ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            aria-label="Manage categories"
            onClick={onManageCategories}
          >
            <Tags aria-hidden className="size-4" />
            Categories
          </Button>
        ) : null}

        {canClearAll ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-auto self-start"
            onClick={clearAll}
          >
            <X aria-hidden className="size-4" />
            Clear filters
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function LibraryToolbar({
  viewState,
  categories,
  providers,
  onViewStateChange,
  onFilterChange,
  onOrganize,
}: LibraryToolbarProps) {
  const [{ filtersOpen, categoryManagerOpen }, setOverlay] = useStateReducer(overlayReducer, {
    filtersOpen: false,
    categoryManagerOpen: false,
  });
  const activeFilterCount = countActiveFilters(viewState);
  const changeFilter = (patch: LibraryFilterPatch): void =>
    onFilterChange(mergeFilter(viewState.filter, patch));
  const manageCategories =
    onOrganize === undefined ? undefined : () => setOverlay({ categoryManagerOpen: true });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {categories.length > 0 ? (
          <CategoryTabs
            categories={categories}
            activeCategoryId={viewState.filter.categoryIds?.[0]}
            onSelect={(categoryId) =>
              changeFilter({ categoryIds: categoryId === undefined ? undefined : [categoryId] })
            }
            onManage={manageCategories}
          />
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search library…"
            aria-label="Search library"
            value={viewState.filter.query ?? ''}
            onChange={(event) => changeFilter({ query: event.target.value })}
            className="w-full sm:w-64"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOverlay({ filtersOpen: true })}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Filters
            {activeFilterCount > 0 ? (
              <Badge size="meta" variant="secondary" aria-label={`${activeFilterCount} active`}>
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
          <SegmentedControl
            label="Library layout"
            value={viewState.layout}
            options={layoutOptions.map(({ mode, label, icon: Icon }) => ({
              value: mode,
              label,
              icon: <Icon aria-hidden />,
            }))}
            onChange={(layout) => onViewStateChange({ ...viewState, layout })}
          />
        </div>
      </div>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={(open) => setOverlay({ filtersOpen: open })}
        viewState={viewState}
        providers={providers}
        onViewStateChange={onViewStateChange}
        changeFilter={changeFilter}
        onManageCategories={
          categories.length === 0 && manageCategories !== undefined
            ? () => setOverlay({ filtersOpen: false, categoryManagerOpen: true })
            : undefined
        }
      />

      {onOrganize !== undefined ? (
        <CategoryManagerDialog
          open={categoryManagerOpen}
          categories={categories}
          onOpenChange={(open) => setOverlay({ categoryManagerOpen: open })}
          onOrganize={onOrganize}
        />
      ) : null}
    </div>
  );
}
