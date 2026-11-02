import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // The icon owns its own grid column instead of floating over the copy:
        // the old absolutely positioned icon overlapped the title on narrow
        // alerts. Alerts without an icon keep one full-width column.
        'group/alert relative grid w-full gap-y-1 rounded-box border p-4 text-foreground',
        'has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3',
        '[&>svg]:size-4 [&>svg]:translate-y-0.5',
        variant === 'destructive'
          ? // `--destructive-glass` is the status colour DESIGN §3.4 pins above
            // 4.5:1 on the alert's own tinted fill; `--destructive` stays on the
            // solid badge and the 40% border.
            'border-destructive/40 bg-destructive/10 [&>svg]:text-destructive-glass [&_[data-alert-title]]:text-destructive-glass'
          : '[&>svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      data-alert-title=""
      // A level-3 heading keeps alerts valid inside a page (h1/h2 above) and a
      // dialog (Base UI's title is an h2); the old h5 skipped levels.
      className={cn('mb-1 type-body-lg font-medium group-has-[>svg]/alert:col-start-2', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    // A div, not a paragraph: alerts carry lists and other block content, and a
    // <ul> inside a <p> is invalid nesting the browser silently reparents.
    <div
      ref={ref}
      data-alert-description=""
      className={cn(
        'type-body text-muted-foreground group-has-[>svg]/alert:col-start-2',
        '[&>p]:m-0 [&>ul]:m-0',
        className,
      )}
      {...props}
    />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
