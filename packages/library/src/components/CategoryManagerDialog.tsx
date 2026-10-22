import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@app/design-system';
import { ArrowDown, ArrowUp, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import type { CategoryId, LibraryCategory } from '@app/shared';
import { compareLibraryCategories } from '@app/shared';
import type { LibraryOrganizationAction } from '../types.js';

export interface CategoryManagerDialogProps {
  readonly open: boolean;
  readonly categories: readonly LibraryCategory[];
  onOpenChange: (open: boolean) => void;
  onOrganize: (action: LibraryOrganizationAction) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save the category.';
}

export function CategoryManagerDialog({
  open,
  categories,
  onOpenChange,
  onOrganize,
}: CategoryManagerDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [formError, setFormError] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<CategoryId | undefined>();
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [deletingId, setDeletingId] = useState<CategoryId | undefined>();

  const ordered = [...categories].sort(compareLibraryCategories);

  function resetAndClose(next: boolean): void {
    if (!next) {
      setName('');
      setColor('');
      setFormError(undefined);
      setEditingId(undefined);
      setDeletingId(undefined);
    }
    onOpenChange(next);
  }

  function run(action: LibraryOrganizationAction): Promise<void> {
    setFormError(undefined);
    return onOrganize(action).catch((error: unknown) => {
      setFormError(errorMessage(error));
    });
  }

  async function createCategory(): Promise<void> {
    if (name.trim().length === 0) {
      setFormError('Category name cannot be empty.');
      return;
    }
    try {
      await onOrganize({
        type: 'create_category',
        name: name.trim(),
        ...(color.trim().length > 0 ? { color: color.trim() } : {}),
      });
      setName('');
      setColor('');
      setFormError(undefined);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function saveRename(categoryId: CategoryId): Promise<void> {
    if (editingName.trim().length === 0) {
      setFormError('Category name cannot be empty.');
      return;
    }
    try {
      await onOrganize({
        type: 'rename_category',
        categoryId,
        name: editingName.trim(),
        color: editingColor.trim(),
      });
      setEditingId(undefined);
      setFormError(undefined);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  function move(categoryId: CategoryId, offset: -1 | 1): void {
    const index = ordered.findIndex((category) => category.id === categoryId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const reordered = [...ordered];
    const [moved] = reordered.splice(index, 1);
    if (moved === undefined) return;
    reordered.splice(target, 0, moved);
    void run({ type: 'reorder_categories', categoryIds: reordered.map((item) => item.id) });
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>
            Categories are local to this device. Pinned categories stay at the front of the library
            filters.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-category-name">New category</Label>
            <Input
              id="new-category-name"
              value={name}
              placeholder="Favorites, To read…"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createCategory();
                }
              }}
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="new-category-color">Color</Label>
            <Input
              id="new-category-color"
              value={color}
              placeholder="#e879f9"
              onChange={(event) => setColor(event.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void createCategory()}>
            <Plus aria-hidden className="size-4" />
            Add
          </Button>
        </div>

        {formError !== undefined ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        {ordered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border rounded-box border border-border">
            {ordered.map((category, index) => (
              <li key={category.id} className="flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${category.pinned === true ? 'Unpin' : 'Pin'} ${category.name}`}
                    aria-pressed={category.pinned === true}
                    onClick={() =>
                      void run({
                        type: 'set_category_pinned',
                        categoryId: category.id,
                        pinned: category.pinned !== true,
                      })
                    }
                  >
                    {category.pinned === true ? (
                      <Pin aria-hidden className="size-4 fill-current" />
                    ) : (
                      <PinOff aria-hidden className="size-4" />
                    )}
                  </Button>

                  {editingId === category.id ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        aria-label={`Rename ${category.name}`}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveRename(category.id);
                          }
                          if (event.key === 'Escape') setEditingId(undefined);
                        }}
                      />
                      <Input
                        aria-label={`Color for ${category.name}`}
                        value={editingColor}
                        placeholder="#e879f9"
                        className="w-full sm:w-28"
                        onChange={(event) => setEditingColor(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveRename(category.id)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(undefined)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{category.name}</span>
                        {category.pinned === true ? (
                          <Badge size="meta" variant="secondary">
                            Pinned
                          </Badge>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${category.name} up`}
                          disabled={index === 0}
                          onClick={() => move(category.id, -1)}
                        >
                          <ArrowUp aria-hidden className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${category.name} down`}
                          disabled={index === ordered.length - 1}
                          onClick={() => move(category.id, 1)}
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Rename ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditingName(category.name);
                            setEditingColor(category.color ?? '');
                          }}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${category.name}`}
                          onClick={() => setDeletingId(category.id)}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {deletingId === category.id ? (
                  <div className="flex flex-col gap-2 rounded-control bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                      Delete “{category.name}”? Titles stay in your library.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDeletingId(undefined)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        aria-label={`Confirm delete ${category.name}`}
                        onClick={() => {
                          void run({ type: 'delete_category', categoryId: category.id }).then(() =>
                            setDeletingId(undefined),
                          );
                        }}
                      >
                        Delete category
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={() => resetAndClose(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
