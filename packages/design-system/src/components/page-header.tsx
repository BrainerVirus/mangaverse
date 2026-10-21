import * as React from 'react';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/cn.js';

export interface PageHeaderProps {
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  count,
  countLabel,
  actions,
  className,
}: PageHeaderProps) {
  return (
    // The header is its own container: the actions row reacts to the width of the content
    // column, not the viewport, so a narrow main column in a wide window still wraps.
    <div data-page-header className={cn('@container', className)}>
      <div className="flex flex-col gap-4 @xl:flex-row @xl:flex-wrap @xl:items-end @xl:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="type-display-lg min-w-0 break-words">{title}</h1>
            {count !== undefined ? (
              <Badge size="meta" variant="secondary">
                {count} {countLabel ?? (count === 1 ? 'item' : 'items')}
              </Badge>
            ) : null}
          </div>
          {description ? <p className="type-body text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-col gap-3 @xl:flex-row @xl:flex-wrap @xl:items-center">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
