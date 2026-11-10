import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '@design-system/lib/cn.js';
import { GlassSurface } from '../glass-surface.js';

/** Base UI root; control visibility with `open` and `onOpenChange`. Non-modal: the page stays live. */
const Popover = PopoverPrimitive.Root;

/** Base UI trigger; use `render` to compose it with an existing button (it adds `aria-expanded`). */
const PopoverTrigger = PopoverPrimitive.Trigger;

interface PopoverContentProps
  extends
    Omit<PopoverPrimitive.Popup.Props, 'className'>,
    Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> {
  className?: string;
}

/**
 * The portaled panel: a thick-glass layer at the lift step (DESIGN.md §2.1, §2.4). Thick, not
 * regular, because its secondary text can sit over cover art (§3.5 rule 3). It fades and settles
 * in from its edge with `tw-animate-css`, and appears at once for reduced motion. It opts out of
 * the Electron drag region, so a panel that reaches the title bar still takes clicks.
 */
const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    { className, align = 'center', alignOffset = 0, side = 'bottom', sideOffset = 8, ...props },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50 app-region-no-drag"
      >
        <PopoverPrimitive.Popup
          ref={ref}
          render={<GlassSurface level="thick" elevation={3} />}
          className={cn(
            'flex w-80 origin-(--transform-origin) flex-col gap-3 p-4 text-sm text-popover-foreground outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';

const PopoverTitle = React.forwardRef<HTMLHeadingElement, PopoverPrimitive.Title.Props>(
  ({ className, ...props }, ref) => (
    <PopoverPrimitive.Title ref={ref} className={cn('type-label', className)} {...props} />
  ),
);
PopoverTitle.displayName = 'PopoverTitle';

const PopoverDescription = React.forwardRef<
  HTMLParagraphElement,
  PopoverPrimitive.Description.Props
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Description
    ref={ref}
    className={cn('type-body text-glass-muted-foreground', className)}
    {...props}
  />
));
PopoverDescription.displayName = 'PopoverDescription';

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription };
