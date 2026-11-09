import * as React from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@design-system/lib/cn.js';

/** Base UI tabs root; supply `defaultValue` or controlled `value` as needed. */
const Tabs = TabsPrimitive.Root;

const INDICATOR =
  // oxlint-disable-next-line shadcn/no-arbitrary-values -- The indicator slides by transform and width only; there is no token for that property list.
  'pointer-events-none absolute inset-y-1 left-0 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-control bg-background shadow-sm transition-[translate,width] duration-200 ease-out motion-reduce:transition-none';

const TabsList = React.forwardRef<HTMLDivElement, TabsPrimitive.List.Props>(
  ({ className, activateOnFocus = true, children, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'relative inline-flex h-10 items-center justify-center rounded-control bg-muted p-1 text-muted-foreground',
        className,
      )}
      activateOnFocus={activateOnFocus}
      {...props}
    >
      {children}
      {/* The raised pill is one element that slides to the active tab (Base UI measures it into
          --active-tab-left/width); transform and width only, and no motion when reduced. */}
      <TabsPrimitive.Indicator aria-hidden className={INDICATOR} />
    </TabsPrimitive.List>
  ),
);
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsPrimitive.Tab.Props>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Tab
      ref={ref}
      className={cn(
        'relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-control px-3 py-1.5 type-label ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<HTMLDivElement, TabsPrimitive.Panel.Props>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Panel
      ref={ref}
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  ),
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
