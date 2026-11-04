import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from '@app/design-system';
import { ArrowRightLeft, CheckSquare, Heart, HeartOff, ListChecks, Tags } from 'lucide-react';
import type { CategoryId, LibraryCategory, LibraryEntryId, LibraryStatus } from '@app/shared';
import { compareLibraryCategories } from '@app/shared';
import type { LibraryOrganizationAction } from '../types.js';

const STATUS_OPTIONS: { value: LibraryStatus; label: string }[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'planned', label: 'Planned' },
];

export interface BulkEditBarProps {
  readonly selectionMode: boolean;
  readonly selectedEntryIds: readonly LibraryEntryId[];
  readonly visibleCount: number;
  /** Matching titles already on screen; "select all" applies to these, not the whole match. */
  readonly loadedCount: number;
  readonly allVisibleSelected: boolean;
  readonly categories: readonly LibraryCategory[];
  onToggleSelectionMode: () => void;
  onSelectAllLoaded: () => void;
  onClearSelection: () => void;
  onOrganize: (action: LibraryOrganizationAction) => Promise<void>;
  onMigrateSelected?: () => void;
}

export function BulkEditBar({
  selectionMode,
  selectedEntryIds,
  visibleCount,
  loadedCount,
  allVisibleSelected,
  categories,
  onToggleSelectionMode,
  onSelectAllLoaded,
  onClearSelection,
  onOrganize,
  onMigrateSelected,
}: BulkEditBarProps) {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryIds, setCategoryIds] = useState<readonly CategoryId[]>([]);

  const selectedCount = selectedEntryIds.length;
  const orderedCategories = [...categories].sort(compareLibraryCategories);
  const selectedCategoryIds = new Set(categoryIds);

  /**
   * A bulk edit is a user's save: the library's mutation reports a failure with
   * its toast, so a rejection only resolves `false` and shows nothing here.
   */
  function run(action: LibraryOrganizationAction): Promise<boolean> {
    return onOrganize(action).then(
      () => true,
      () => false,
    );
  }

  function toggleCategory(categoryId: CategoryId): void {
    setCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  function closeCategoryDialog(open: boolean): void {
    setCategoryDialogOpen(open);
    if (!open) {
      setCategoryIds([]);
      setCategoryFilter('');
    }
  }

  if (!selectionMode) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleSelectionMode}
          disabled={visibleCount === 0}
        >
          <CheckSquare aria-hidden className="size-4" />
          Select titles
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="Bulk edit"
      className="flex flex-col gap-3 rounded-box border border-accent/40 bg-accent/5 p-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          aria-label={`Select all loaded titles (${loadedCount} of ${visibleCount} matching)`}
          className="size-4 accent-foreground"
          checked={allVisibleSelected}
          onChange={onSelectAllLoaded}
        />
        Select all loaded
      </label>

      <Badge variant="secondary">{selectedCount} selected</Badge>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedCount === 0}
          onClick={() =>
            void run({
              type: 'set_entries_favorite',
              entryIds: selectedEntryIds,
              favorite: true,
            })
          }
        >
          <Heart aria-hidden className="size-4" />
          Favorite selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedCount === 0}
          onClick={() =>
            void run({
              type: 'set_entries_favorite',
              entryIds: selectedEntryIds,
              favorite: false,
            })
          }
        >
          <HeartOff aria-hidden className="size-4" />
          Unfavorite selected
        </Button>

        <Select
          value={null}
          onValueChange={(value) => {
            if (selectedCount === 0) return;
            const status = STATUS_OPTIONS.find((option) => option.value === value);
            if (status === undefined) return;
            void run({
              type: 'set_entries_status',
              entryIds: selectedEntryIds,
              status: status.value,
            });
          }}
        >
          <SelectTrigger className="h-8 w-40" aria-label="Set status for selected">
            <SelectValue placeholder="Set status…" />
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
          variant="outline"
          aria-label="Bulk categories"
          disabled={selectedCount === 0 || categories.length === 0}
          onClick={() => setCategoryDialogOpen(true)}
        >
          <Tags aria-hidden className="size-4" />
          Categories
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={selectedCount === 0}
          onClick={onClearSelection}
        >
          Clear selection
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onToggleSelectionMode}>
          <ListChecks aria-hidden className="size-4" />
          Done selecting
        </Button>
      </div>

      {onMigrateSelected !== undefined ? (
        <SettingsSection title="Advanced" collapsed>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedCount === 0}
            onClick={onMigrateSelected}
          >
            <ArrowRightLeft aria-hidden className="size-4" />
            Migrate selected
          </Button>
        </SettingsSection>
      ) : null}

      <Dialog open={categoryDialogOpen} onOpenChange={closeCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk categories</DialogTitle>
            <DialogDescription>
              Add or remove categories for {selectedCount}{' '}
              {selectedCount === 1 ? 'title' : 'titles'}.
            </DialogDescription>
          </DialogHeader>

          {orderedCategories.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Create a category first.</p>
          ) : (
            <>
              <Input
                type="search"
                aria-label="Find category"
                placeholder="Find category…"
                className="mt-4"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              />
              <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
                {orderedCategories
                  .filter((category) =>
                    category.name.toLowerCase().includes(categoryFilter.trim().toLowerCase()),
                  )
                  .map((category) => (
                    <label
                      key={category.id}
                      className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={selectedCategoryIds.has(category.id)}
                        onChange={() => toggleCategory(category.id)}
                      />
                      {category.name}
                    </label>
                  ))}
              </div>
            </>
          )}

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => closeCategoryDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={categoryIds.length === 0}
              onClick={() => {
                void run({
                  type: 'remove_entry_categories',
                  entryIds: selectedEntryIds,
                  categoryIds,
                }).then((saved) => {
                  if (saved) closeCategoryDialog(false);
                });
              }}
            >
              Remove from selected
            </Button>
            <Button
              type="button"
              disabled={categoryIds.length === 0}
              onClick={() => {
                void run({
                  type: 'add_entry_categories',
                  entryIds: selectedEntryIds,
                  categoryIds,
                }).then((saved) => {
                  if (saved) closeCategoryDialog(false);
                });
              }}
            >
              Add to selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
