import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'role'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, onClick, disabled, ...props }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      onCheckedChange?.(!checked);
      onClick?.(event);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        ref={ref}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-badge border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          // `--muted-foreground` is derived to clear body-text contrast on every
          // theme, so the off track keeps the 3:1 non-text floor (WCAG 1.4.11).
          checked ? 'bg-primary' : 'bg-muted-foreground',
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md ring-0 transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
