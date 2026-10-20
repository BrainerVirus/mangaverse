import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@design-system/lib/cn.js';

type SelectItemLabel = { value: unknown; label: React.ReactNode };

/**
 * Base UI's `Select.Value` renders the raw value unless the root knows the
 * items, while Radix rendered the selected item's text. Derive the labels from
 * the composed items so the public API keeps Radix's behaviour without a
 * consumer change; an item whose label is not plain text falls back to the raw
 * value.
 */
function collectItemLabels(node: React.ReactNode, labels: SelectItemLabel[]): void {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown }>(child)) return;
    const { children, value } = child.props;
    if (child.type === SelectItem) {
      if (value != null && (typeof children === 'string' || typeof children === 'number')) {
        labels.push({ value, label: children });
      }
      return;
    }
    collectItemLabels(children, labels);
  });
}

type SelectProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> & {
  /** Radix's single-argument signature, kept for the public API. */
  onValueChange?: (value: string) => void;
};

function Select({ children, items, onValueChange, ...props }: SelectProps) {
  const labels = React.useMemo(() => {
    if (items !== undefined) return items;
    const collected: SelectItemLabel[] = [];
    collectItemLabels(children, collected);
    return collected.length > 0 ? collected : undefined;
  }, [children, items]);

  return (
    <SelectPrimitive.Root
      items={labels}
      {...props}
      // Radix never handed `null` to this callback, so keep the narrower contract.
      onValueChange={
        onValueChange
          ? (value) => {
              if (typeof value === 'string') onValueChange(value);
            }
          : undefined
      }
    >
      {children}
    </SelectPrimitive.Root>
  );
}

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectPrimitive.Trigger.Props>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-control border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDown className="h-4 w-4 opacity-50" />} />
    </SelectPrimitive.Trigger>
  ),
);
SelectTrigger.displayName = 'SelectTrigger';

interface SelectContentProps
  extends
    SelectPrimitive.Popup.Props,
    Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> {
  /** Radix's placement mode: `popper` (Base UI's `alignItemWithTrigger={false}`) or `item-aligned`. */
  position?: 'item-aligned' | 'popper';
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  (
    {
      className,
      children,
      position = 'popper',
      side = 'bottom',
      sideOffset = 0,
      align = 'center',
      alignOffset = 0,
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={position === 'item-aligned'}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          ref={ref}
          className={cn(
            'relative z-50 max-h-96 min-w-32 overflow-hidden rounded-control border border-border bg-popover text-popover-foreground shadow-md data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            position === 'popper' &&
              'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List
            className={cn('p-1', position === 'popper' && 'select-anchor-size w-full')}
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<HTMLDivElement, SelectPrimitive.Item.Props>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-control py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = 'SelectItem';

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
