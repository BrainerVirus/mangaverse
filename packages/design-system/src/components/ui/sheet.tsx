import * as React from 'react';
import { cn } from '../../lib/cn.js';

interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ className, open, onOpenChange, children, ...props }, ref) => {
    const innerRef = React.useRef<HTMLDivElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref !== null && ref !== undefined) {
          ref.current = node;
        }
      },
      [ref],
    );

    const onOpenChangeRef = React.useRef(onOpenChange);
    onOpenChangeRef.current = onOpenChange;

    // Focus management per the reader/settings accessibility rules: focus moves
    // into the sheet on open, Tab wraps inside it, Escape closes it from
    // anywhere, and focus returns to the trigger on close. The callback is read
    // through a ref so this effect's cleanup (which restores focus) only runs
    // when `open` changes — an inline callback identity would otherwise restore
    // focus on every parent render and fight the user's interaction.
    React.useEffect(() => {
      if (!open) return;

      const previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const node = innerRef.current;

      const focusables = () => {
        if (!node) return [];
        return Array.from(
          node.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.hasAttribute('disabled'));
      };

      const focusTimer = window.setTimeout(() => {
        focusables()[0]?.focus();
      }, 0);

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onOpenChangeRef.current?.(false);
          return;
        }
        if (event.key !== 'Tab') return;

        const elements = focusables();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (first === undefined || last === undefined) return;
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      window.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => {
        window.clearTimeout(focusTimer);
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
        previouslyFocused?.focus();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref-stabilized callback
    }, [open]);

    if (!open) return null;
    return (
      <div
        ref={setRefs}
        className={cn('fixed inset-0 z-50', className)}
        onClick={() => onOpenChange?.(false)}
        onKeyDown={(e) => e.key === 'Escape' && onOpenChange?.(false)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Sheet.displayName = 'Sheet';

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'right', children, ...props }, ref) => {
    const sideClasses = {
      top: 'inset-x-0 top-0 rounded-b-2xl',
      bottom: 'inset-x-0 bottom-0 rounded-t-2xl',
      left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r',
      right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l',
    };
    return (
      <div
        ref={ref}
        className={cn(
          'fixed bg-popover p-6 shadow-lg',
          sideClasses[side],
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5', className)} {...props} />
  )
);
SheetHeader.displayName = 'SheetHeader';

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props}>
      {children}
    </h3>
  )
);
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
SheetDescription.displayName = 'SheetDescription';

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription };