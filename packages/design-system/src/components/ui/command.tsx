import * as React from 'react';
import { cn } from '../../lib/cn.js';

const Command = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--radius-box)] border border-[var(--border)] bg-popover text-popover-foreground shadow-md',
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
        'flex h-10 w-full rounded-[var(--radius-control)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
);
CommandInput.displayName = 'CommandInput';

const CommandList = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('max-h-96 overflow-y-auto p-2', className)} {...props} />
  )
);
CommandList.displayName = 'CommandList';

const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('py-6 text-center text-sm', className)} {...props} />
  )
);
CommandEmpty.displayName = 'CommandEmpty';

const CommandGroup = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('p-1', className)} {...props} />
  )
);
CommandGroup.displayName = 'CommandGroup';

const CommandItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      className={cn(
        'flex cursor-pointer items-center rounded-[var(--radius-control)] px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2',
        className
      )}
      {...props}
    />
  )
);
CommandItem.displayName = 'CommandItem';

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };