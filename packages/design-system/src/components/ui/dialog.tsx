import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from '@design-system/lib/cn.js';
import { GlassSurface } from '../glass-surface.js';

/** Base UI root; control visibility with `open` and `onOpenChange`. */
const Dialog = DialogPrimitive.Root;

/** Base UI trigger; use `render` to compose it with the design-system Button. */
const DialogTrigger = DialogPrimitive.Trigger;

/** Portaled modal popup with the shared scrim and thick-glass surface. */
const DialogContent = React.forwardRef<
  HTMLDivElement,
  Omit<DialogPrimitive.Popup.Props, 'className'> & { className?: string }
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop className="fixed inset-0 z-50 glass-scrim" />
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <DialogPrimitive.Popup
        {...props}
        ref={ref}
        className="pointer-events-auto outline-none"
        aria-modal="true"
      >
        <GlassSurface level="thick" className={cn('w-full max-w-lg p-6', className)}>
          {children}
        </GlassSurface>
      </DialogPrimitive.Popup>
    </div>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  ),
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  ),
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, DialogPrimitive.Title.Props>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('type-title', className)} {...props} />
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, DialogPrimitive.Description.Props>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('type-body text-muted-foreground', className)}
      {...props}
    />
  ),
);
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
