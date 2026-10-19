import * as React from 'react';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@design-system/lib/cn.js';
import { GlassPanel } from '../glass-panel.js';

/**
 * shadcn-style sheet built on Base UI Dialog: focus trap, Escape and focus return
 * come from the primitive, and open/close are animated (slide from the side with
 * a fading overlay) through tw-animate-css classes.
 */
const Sheet = SheetPrimitive.Root;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<HTMLDivElement, SheetPrimitive.Backdrop.Props>(
  ({ className, ...props }, ref) => (
    <SheetPrimitive.Backdrop
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        'data-open:animate-in data-open:fade-in-0',
        'data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  ),
);
SheetOverlay.displayName = 'SheetOverlay';

const sideClasses = {
  top: 'inset-x-0 top-0 h-auto rounded-b-2xl border-b data-open:slide-in-from-top data-closed:slide-out-to-top',
  bottom:
    'inset-x-0 bottom-0 h-auto rounded-t-2xl border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-open:slide-in-from-left data-closed:slide-out-to-left',
  right:
    'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-open:slide-in-from-right data-closed:slide-out-to-right',
} as const;

interface SheetContentProps extends Omit<SheetPrimitive.Popup.Props, 'finalFocus'> {
  side?: keyof typeof sideClasses;
  surface?: 'default' | 'glass';
  /**
   * Radix's close-focus hook, kept for the public API. Base UI restores focus
   * through `finalFocus`, so `preventDefault` means "leave focus where it is".
   */
  onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
  /** Radix's Escape hook, kept for the public API; Base UI still closes the popup. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  (
    {
      className,
      children,
      side = 'right',
      surface = 'default',
      onCloseAutoFocus,
      onEscapeKeyDown,
      ...props
    },
    ref,
  ) => {
    const finalFocus = onCloseAutoFocus
      ? () => {
          let prevented = false;
          onCloseAutoFocus({
            preventDefault: () => {
              prevented = true;
            },
          });
          return !prevented;
        }
      : undefined;

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Popup
          ref={ref}
          className={cn(
            'fixed z-50 flex flex-col gap-4 bg-popover p-6 shadow-lg',
            'data-open:animate-in data-closed:animate-out',
            'data-open:duration-300 data-closed:duration-200',
            sideClasses[side],
            surface === 'glass' &&
              'border-0 bg-transparent p-0 shadow-none data-open:animate-none data-closed:animate-none',
            className,
          )}
          // Base UI hides the rest of the page instead of marking the popup, so
          // the modal attribute Radix emitted is kept here (override it for a
          // non-modal sheet).
          aria-modal="true"
          finalFocus={finalFocus}
          {...props}
          // The reader layout also listens for Escape (chrome toggle) on window:
          // Base UI's dismissal stops the event before it reaches that listener,
          // and the caller's handler still runs.
          onKeyDown={(event) => {
            if (event.key === 'Escape') onEscapeKeyDown?.(event.nativeEvent);
            props.onKeyDown?.(event);
          }}
        >
          {surface === 'glass' ? (
            <GlassPanel level="thick" padding="md" className="h-full w-full rounded-none">
              {children}
            </GlassPanel>
          ) : (
            children
          )}
          <SheetPrimitive.Close
            className={cn(
              'absolute top-4 right-4 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none',
              surface === 'glass' && 'text-foreground opacity-100',
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </SheetPrimitive.Close>
        </SheetPrimitive.Popup>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5', className)} {...props} />
  ),
);
SheetHeader.displayName = 'SheetHeader';

const SheetTitle = React.forwardRef<HTMLHeadingElement, SheetPrimitive.Title.Props>(
  ({ className, ...props }, ref) => (
    <SheetPrimitive.Title ref={ref} className={cn('type-title', className)} {...props} />
  ),
);
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<HTMLParagraphElement, SheetPrimitive.Description.Props>(
  ({ className, ...props }, ref) => (
    <SheetPrimitive.Description
      ref={ref}
      className={cn('type-body text-muted-foreground', className)}
      {...props}
    />
  ),
);
SheetDescription.displayName = 'SheetDescription';

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription };
