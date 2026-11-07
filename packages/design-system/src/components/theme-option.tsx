import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface ThemeOptionProps {
  /** `aria-pressed` and the selection ring both follow this. */
  selected: boolean;
  disabled?: boolean | undefined;
  /** The accessible name, e.g. "Select Warm Paper theme". */
  label: string;
  onSelect: () => void;
  /** The preview and its name/description lines. */
  children: React.ReactNode;
  /** Buttons that act on the theme (duplicate, edit, delete), below the tile. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * One theme tile: the preview, its name and description, and the selection ring on the button
 * itself. The old copies wrapped only the preview in a ring div and carried a transparent border;
 * this owns the geometry once (docs/Design.md "Cards", DESIGN.md §6.2).
 */
export function ThemeOption({
  selected,
  disabled = false,
  label,
  onSelect,
  children,
  actions,
  className,
}: ThemeOptionProps) {
  return (
    <div className={cn('group flex h-full w-full flex-col gap-2', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        aria-label={label}
        data-selected={selected ? 'true' : 'false'}
        onClick={onSelect}
        className="flex h-full w-full flex-col items-stretch gap-2 rounded-box p-1 text-left transition-colors hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:ring-offset-2 data-[selected=true]:ring-offset-background"
      >
        {children}
      </button>
      {actions === undefined ? null : actions}
    </div>
  );
}
