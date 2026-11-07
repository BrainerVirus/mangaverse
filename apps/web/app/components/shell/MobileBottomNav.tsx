import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  GlassSurface,
  cn,
} from '@app/design-system';
import { isNavActive, mobileMoreItems, mobileTabs, type NavItem } from './nav-items.js';

function SheetLinks({
  items,
  currentPath,
  onNavigate,
}: {
  items: readonly NavItem[];
  currentPath: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const { label, to, icon: Icon } = item;
        const isActive = isNavActive(currentPath, item);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-control px-2 py-3 type-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-foreground hover:bg-sidebar-accent/60',
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function MobileBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>Navigate to secondary MangaVerse tools.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <SheetLinks
              items={mobileMoreItems}
              currentPath={currentPath}
              onNavigate={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <GlassSurface level="thick" className="fixed bottom-0 left-0 right-0 z-50 min-h-14 md:hidden">
        <nav aria-label="Primary" className="h-full safe-area-bottom">
          {/* Equal-width tabs: five `flex-1 basis-0` items share the bar, so the
              longest label truncates instead of pushing the row past 320px. */}
          <div className="safe-area-x flex h-14 items-stretch">
            {mobileTabs.map((item) => {
              const { label, to, icon: Icon } = item;
              const isActive = isNavActive(currentPath, item);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 type-micro transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              aria-label="Open navigation menu"
              className="flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 type-micro text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="size-5" />
              <span className="max-w-full truncate">More</span>
            </button>
          </div>
        </nav>
      </GlassSurface>
    </>
  );
}
