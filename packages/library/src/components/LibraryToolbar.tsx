import { useState } from 'react';
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
  Button,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/design-system';
import { Grid3x3, List, Pin, Rows3, Tags, X } from 'lucide-react';
import type { LibraryLayoutMode } from '@app/shared';
import { hasLibraryFilters } from '../view-state.js';
import type { LibraryOrganizationAction } from '../types.js';
import { CategoryManagerDialog } from './CategoryManagerDialog.js';

export interface LibraryToolbarProps {
  viewState: LibraryViewState;
  itemCount: number;
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
];

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

export function LibraryToolbar({
  viewState,
  itemCount,
  categories,
  providers,
  onViewStateChange,
  onFilterChange,
  onOrganize,
}: LibraryToolbarProps) {
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const orderedCategories = [...categories].sort(compareLibraryCategories);
  const activeCategoryId = viewState.filter.categoryIds?.[0];
  const activeStatus = viewState.filter.statuses?.[0];
  const activeProvider = viewState.filter.providerIds?.[0];
  const filtersActive = hasLibraryFilters(viewState.filter);

  function changeFilter(patch: LibraryFilterPatch): void {
    const merged = { ...viewState.filter, ...patch };
    // Empty selections are removed so the query key and the "clear" state stay identical.
    const next: LibraryFilter = {
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
    onFilterChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Library"
        description="Your saved manga, comics, and webtoons"
        count={itemCount}
        countLabel={itemCount === 1 ? 'title' : 'titles'}
        actions={
          <>
            <Input
              type="search"
              placeholder="Search library…"
              aria-label="Search library"
              value={viewState.filter.query ?? ''}
              onChange={(event) => changeFilter({ query: event.target.value })}
              className="w-full sm:w-64"
            />
            <fieldset
              className="inline-flex gap-0.5 rounded-control border border-border bg-muted/40 p-0.5"
              aria-label="Library layout"
            >
              {layoutOptions.map(({ mode, label, icon: Icon }) => (
                <Button
                  key={mode}
                  type="button"
                  variant={viewState.layout === mode ? 'default' : 'ghost'}
                  size="sm"
                  aria-pressed={viewState.layout === mode}
                  aria-label={label}
                  onClick={() => onViewStateChange({ ...viewState, layout: mode })}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </Button>
              ))}
            </fieldset>
          </>
        }
      />

      <section
        aria-label="Library filters"
        className="flex flex-col gap-3 rounded-box border border-border bg-card/60 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeCategoryId === undefined ? 'default' : 'outline'}
            aria-pressed={activeCategoryId === undefined}
            onClick={() => changeFilter({ categoryIds: undefined })}
          >
            All titles
          </Button>
          {orderedCategories.map((category) => (
            <Button
              key={category.id}
              type="button"
              size="sm"
              variant={activeCategoryId === category.id ? 'default' : 'outline'}
              aria-pressed={activeCategoryId === category.id}
              onClick={() =>
                changeFilter({
                  categoryIds: activeCategoryId === category.id ? undefined : [category.id],
                })
              }
            >
              {category.pinned === true ? (
                <Pin aria-hidden className="size-3 fill-current" />
              ) : null}
              {category.name}
            </Button>
          ))}
          {onOrganize !== undefined ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Manage categories"
              onClick={() => setCategoryManagerOpen(true)}
            >
              <Tags aria-hidden className="size-4" />
              Categories
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activeStatus ?? null}
            onValueChange={(value) => {
              const status = STATUS_OPTIONS.find((option) => option.value === value);
              changeFilter({ statuses: status === undefined ? undefined : [status.value] });
            }}
          >
            <SelectTrigger className="h-9 w-40" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            variant={viewState.filter.favoritesOnly === true ? 'default' : 'outline'}
            aria-pressed={viewState.filter.favoritesOnly === true}
            onClick={() =>
              changeFilter({
                favoritesOnly: viewState.filter.favoritesOnly === true ? undefined : true,
              })
            }
          >
            Favorites
          </Button>

          {providers.length > 0 ? (
            <Select
              value={activeProvider ?? null}
              onValueChange={(value) =>
                changeFilter({ providerIds: value.length > 0 ? [value as ProviderId] : undefined })
              }
            >
              <SelectTrigger className="h-9 w-44" aria-label="Filter by provider">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((providerId) => (
                  <SelectItem key={providerId} value={providerId}>
                    {providerId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

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
            <SelectTrigger className="h-9 w-52" aria-label="Sort library">
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

          {filtersActive ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onFilterChange({})}>
              <X aria-hidden className="size-4" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </section>

      {onOrganize !== undefined ? (
        <CategoryManagerDialog
          open={categoryManagerOpen}
          categories={categories}
          onOpenChange={setCategoryManagerOpen}
          onOrganize={onOrganize}
        />
      ) : null}
    </div>
  );
}
