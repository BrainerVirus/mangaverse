import * as React from 'react';
import { cn } from '../lib/cn.js';
import { GlassSurface, type GlassSurfaceProps } from './glass-surface.js';

export type GlassPanelPadding = 'none' | 'sm' | 'md' | 'lg';

export const glassPanelPadding: Record<GlassPanelPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export interface GlassPanelProps extends GlassSurfaceProps {
  /** Interior padding. Defaults to `md` (the 24px card interior). */
  padding?: GlassPanelPadding;
}

/** The shell and feature replacement for the `.surface-panel` utility (DESIGN.md §7.1). */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ padding = 'md', className, ...props }, ref) => (
    <GlassSurface ref={ref} className={cn(glassPanelPadding[padding], className)} {...props} />
  ),
);
GlassPanel.displayName = 'GlassPanel';
