import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * A flat list inside a surface: rows separated by one hairline, with no fill and no border of
 * their own. A settings card is already the surface, so a filled tile per row (the `ListRow`
 * `muted`/`outline` tones) stacks a second box inside it; this is the one-surface-per-level
 * shape instead (docs/Design.md "Cards", DESIGN.md "one border per visual grouping").
 */
export interface DividedListProps extends React.HTMLAttributes<HTMLElement> {
  /** `ul`/`ol` for lists of rows, `dl` for label and value pairs. */
  as?: 'ul' | 'ol' | 'dl';
}

export function DividedList({ as: Component = 'ul', className, ...props }: DividedListProps) {
  return React.createElement(Component, {
    className: cn('flex flex-col divide-y divide-border', className),
    ...props,
  });
}

const ROW_LAYOUTS = {
  /** Content on the left, a value or actions on the right, wrapping when narrow. */
  inline: 'flex flex-wrap items-center justify-between gap-3',
  /** Content stacked: a heading line over its message. */
  stacked: 'flex flex-col gap-1',
  /** A small form group: a label line, a field, its help text. */
  form: 'flex flex-col gap-2',
} as const;

export interface DividedRowProps extends React.HTMLAttributes<HTMLElement> {
  /** `li` inside a `ul`/`ol`; `div` inside a `dl`. */
  as?: 'li' | 'div';
  layout?: keyof typeof ROW_LAYOUTS;
}

/**
 * One row of a `DividedList` (inline by default, or `stacked`). The first row has no top padding
 * and the last none at the bottom, so the list sits flush with the surface's own padding.
 */
export function DividedRow({
  as: Component = 'li',
  layout = 'inline',
  className,
  ...props
}: DividedRowProps) {
  return React.createElement(Component, {
    className: cn(ROW_LAYOUTS[layout], 'py-3 text-sm first:pt-0 last:pb-0', className),
    ...props,
  });
}
