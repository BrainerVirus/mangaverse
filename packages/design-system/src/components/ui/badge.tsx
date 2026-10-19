import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
  size?: 'default' | 'meta';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, size = 'default', variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-0.5 transition-colors',
        size === 'meta' ? 'type-meta' : 'text-xs font-semibold',
        {
          'border-[var(--border)] bg-primary text-primary-foreground': variant === 'default',
          'border-[var(--border)]': variant === 'outline',
          'bg-secondary text-secondary-foreground': variant === 'secondary',
          'border-destructive bg-destructive text-destructive-foreground':
            variant === 'destructive',
        },
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

export { Badge };
