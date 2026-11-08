import * as React from 'react';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@design-system/lib/cn.js';
import { GlassPanel } from '../glass-panel.js';
import { buttonSizes, buttonVariants } from './button-variants.js';

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
        'fixed inset-0 z-50 glass-scrim',
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
  top: 'inset-x-0 top-0 h-auto max-h-dvh rounded-b-2xl data-open:slide-in-from-top data-closed:slide-out-to-top',
  bottom:
    'inset-x-0 bottom-0 h-auto max-h-dvh rounded-t-2xl data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm data-open:slide-in-from-left data-closed:slide-out-to-left',
  right:
    'inset-y-0 right-0 h-full w-3/4 max-w-sm data-open:slide-in-from-right data-closed:slide-out-to-right',
} as const;

const sideGlassRadii = {
  top: 'rounded-b-glass',
  bottom: 'rounded-t-glass',
  left: 'rounded-r-glass',
  right: 'rounded-l-glass',
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
            'fixed z-50 flex flex-col overflow-y-auto bg-transparent p-0 shadow-none',
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
            <GlassPanel
              level="thick"
              padding="md"
              className="min-h-full w-full shrink-0 rounded-none"
            >
              {children}
              <div aria-hidden="true" className="safe-area-bottom" />
            </GlassPanel>
          ) : (
            <GlassPanel
              level="thick"
              padding="md"
              className={cn('flex min-h-full w-full shrink-0 flex-col gap-4', sideGlassRadii[side])}
            >
              {children}
              <div aria-hidden="true" className="safe-area-bottom -mt-4" />
            </GlassPanel>
          )}
          <div className="sticky top-0 z-10 order-first h-0 w-full shrink-0">
            <SheetPrimitive.Close
              type="button"
              className={cn(
                buttonVariants.ghost,
                buttonSizes.icon,
                'absolute top-4 right-4 text-muted-foreground',
                surface === 'glass' && 'text-foreground',
              )}
              aria-label="Close"
            >
              <X />
            </SheetPrimitive.Close>
          </div>
        </SheetPrimitive.Popup>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props} />
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
