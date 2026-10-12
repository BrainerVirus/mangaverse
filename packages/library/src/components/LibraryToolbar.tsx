import type { LibraryLayoutMode, LibraryViewState } from '@app/shared';
import { Button, Input, PageHeader } from '@app/design-system';
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
            onChange={(event) =>
              onViewStateChange({
                ...viewState,
                filter: { ...viewState.filter, query: event.target.value },
              })
            }
            className="w-full sm:w-64"
          />
          <div
            className="inline-flex gap-0.5 rounded-[var(--radius-control)] border border-border bg-muted/40 p-0.5"
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
                aria-label={label}
                onClick={() => onViewStateChange({ ...viewState, layout: mode })}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </Button>
            ))}
          </div>
        </>
      }
    />
  );
}
