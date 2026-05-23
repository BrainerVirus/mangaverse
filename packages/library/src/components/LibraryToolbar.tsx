import type { LibraryLayoutMode, LibraryViewState } from '@app/shared';
import { Button, Input } from '@app/design-system';
import { Grid3x3, List, Rows3 } from 'lucide-react';

export interface LibraryToolbarProps {
  viewState: LibraryViewState;
  itemCount: number;
  onViewStateChange: (next: LibraryViewState) => void;
}

const layoutOptions: { mode: LibraryLayoutMode; label: string; icon: typeof Grid3x3 }[] = [
  { mode: 'grid', label: 'Grid', icon: Grid3x3 },
  { mode: 'list', label: 'List', icon: List },
  { mode: 'compact', label: 'Compact', icon: Rows3 },
];

export function LibraryToolbar({ viewState, itemCount, onViewStateChange }: LibraryToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          {itemCount === 1 ? '1 title' : `${itemCount} titles`}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search library…"
          aria-label="Search library"
          value={viewState.filter.query ?? ''}
          onChange={(event) =>
            onViewStateChange({
              ...viewState,
              filter: { ...viewState.filter, query: event.target.value },
            })
          }
          className="w-full sm:w-64"
        />
        <div
          className="inline-flex rounded-[var(--radius-control)] border border-[var(--border)] p-0.5"
          role="group"
          aria-label="Library layout"
        >
          {layoutOptions.map(({ mode, label, icon: Icon }) => (
            <Button
              key={mode}
              type="button"
              variant={viewState.layout === mode ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={viewState.layout === mode}
              onClick={() => onViewStateChange({ ...viewState, layout: mode })}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
