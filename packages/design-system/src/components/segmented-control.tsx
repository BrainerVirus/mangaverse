import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Button } from './ui/button.js';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** The group's accessible name, e.g. "Library layout". */
  label: string;
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A tonal single-select group: one trough, one pressed button per option. The old copies were a
 * bordered fieldset of Buttons with their own `bg-muted/40` and per-site padding.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <fieldset
      aria-label={label}
      className={cn('inline-flex gap-0.5 rounded-control bg-muted p-0.5', className)}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={value === option.value}
          aria-label={option.label}
          disabled={disabled}
          className="pointer-coarse:min-h-11"
          onClick={() => onChange(option.value)}
        >
          {option.icon ?? option.label}
        </Button>
      ))}
    </fieldset>
  );
}
