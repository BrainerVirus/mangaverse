import * as React from 'react';
import { cn } from '../../lib/cn.js';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        {
          'border-[var(--border)] bg-primary text-primary-foreground': variant === 'default',
          'border-[var(--border)]': variant === 'outline',
          'bg-secondary text-secondary-foreground': variant === 'secondary',
          'border-destructive bg-destructive text-destructive-foreground': variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';

export { Badge };