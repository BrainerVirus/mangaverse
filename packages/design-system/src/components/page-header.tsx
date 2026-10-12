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
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {count !== undefined ? (
            <Badge variant="secondary">
              {count} {countLabel ?? (count === 1 ? 'item' : 'items')}
            </Badge>
          ) : null}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center">{actions}</div> : null}
    </div>
  );
}
