import * as React from 'react';
import { cn } from '../../lib/cn.js';

const Command = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'overflow-hidden rounded-[var(--radius-box)] border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-border/60',
        className
      )}
      {...props}
    />
  )
);
Command.displayName = 'Command';

const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0',
        className
      )}
      {...props}
    />
  )
);
CommandInput.displayName = 'CommandInput';

const CommandList = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('max-h-80 overflow-y-auto p-2', className)} {...props} />
  )
);
CommandList.displayName = 'CommandList';

const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('py-8 text-center text-sm text-muted-foreground', className)} {...props} />
  )
);
CommandEmpty.displayName = 'CommandEmpty';

const CommandGroup = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('p-1', className)} {...props} />
  )
);
CommandGroup.displayName = 'CommandGroup';

const CommandItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement> & { 'data-selected'?: boolean }
>(({ className, 'data-selected': selected, ...props }, ref) => (
  <li
    ref={ref}
    data-selected={selected ? 'true' : undefined}
    className={cn(
      'flex cursor-pointer items-center rounded-[var(--radius-control)] px-2.5 py-2 text-sm outline-none transition-colors',
      'hover:bg-muted/70 hover:text-foreground',
      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-border/80',
      className
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
