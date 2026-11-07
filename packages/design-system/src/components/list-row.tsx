import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * The shared matte row for list items, info tiles and inline panels. It owns the radius,
 * fill/border and padding so copies cannot drift (`p-2`/`p-3`/`px-3 py-2`, `bg-muted/30|40|50`)
 * and so the alpha ladder stays inside the glass tiers (docs/Design.md "Cards",
 * DESIGN.md §2.5).
 */
const TONES = {
  plain: '',
  muted: 'bg-muted',
  outline: 'border border-border',
  warning: 'border border-warning bg-warning/10',
  accent: 'border border-accent/40 bg-accent/5',
} as const;

const PADDINGS = {
  none: '',
  sm: 'p-2',
  md: 'p-3',
  row: 'px-3 py-2',
} as const;

export interface ListRowProps extends React.HTMLAttributes<HTMLElement> {
  /** `li` inside a list; `div` for a standalone panel or tile. */
  as?: 'div' | 'li' | 'section' | 'dl';
  tone?: keyof typeof TONES;
  padding?: keyof typeof PADDINGS;
}

export function ListRow({
  as: Component = 'div',
  tone = 'muted',
  padding = 'md',
  className,
  ...props
}: ListRowProps) {
  return React.createElement(Component, {
    className: cn('rounded-control', TONES[tone], PADDINGS[padding], className),
    ...props,
  });
}
