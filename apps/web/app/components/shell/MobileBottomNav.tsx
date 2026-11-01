import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  BookOpen,
  Search,
  Settings,
  Menu,
  Puzzle,
  Archive,
  ArrowRightLeft,
  Zap,
  Play,
  Compass,
  Palette,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  GlassSurface,
  cn,
} from '@app/design-system';

const primaryTabs = [
  { label: 'Discover', to: '/discover', icon: Compass },
  { label: 'Library', to: '/library', icon: BookOpen },
  { label: 'Search', to: '/search', icon: Search },
  { label: 'Settings', to: '/settings', icon: Settings },
] as const;

const secondaryItems = [
  { label: 'Extensions', to: '/extensions', icon: Puzzle },
  { label: 'Backup', to: '/backup', icon: Archive },
  { label: 'Onboarding', to: '/onboarding', icon: Play },
] as const;

const advancedItems = [
  { label: 'Advanced', to: '/advanced', icon: SlidersHorizontal },
  { label: 'Theme editor', to: '/advanced/theme', icon: Palette },
  { label: 'Diagnostics', to: '/advanced/diagnostics', icon: Zap },
  { label: 'Migration', to: '/advanced/migration', icon: ArrowRightLeft },
] as const;

function SheetLinks({
  items,
  currentPath,
  onNavigate,
}: {
  items: readonly { label: string; to: string; icon: typeof BookOpen }[];
  currentPath: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-2">
      {items.map(({ label, to, icon: Icon }) => {
        // The hub is only current on itself: each tool below it has its own entry.
        const isActive =
          currentPath === to || (to !== '/advanced' && currentPath.startsWith(to + '/'));
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-2 py-3 type-label transition-colors rounded-md',
              isActive ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-5 w-5" />
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
              items={secondaryItems}
              currentPath={currentPath}
              onNavigate={() => setSheetOpen(false)}
            />
          </div>
          <Separator className="my-4" />
          <SheetLinks
            items={advancedItems}
            currentPath={currentPath}
            onNavigate={() => setSheetOpen(false)}
          />
          <Separator className="my-4" />
          <SheetLinks
            items={primaryTabs}
            currentPath={currentPath}
            onNavigate={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <GlassSurface level="thick" className="fixed bottom-0 left-0 right-0 z-50 min-h-14 md:hidden">
        <nav className="h-full safe-area-bottom">
          {/* Equal-width tabs: five `flex-1 basis-0` items share the bar, so the
              longest label truncates instead of pushing the row past 320px. */}
          <div className="safe-area-x flex h-14 items-stretch">
            {primaryTabs.map(({ label, to, icon: Icon }) => {
              const isActive = currentPath === to || currentPath.startsWith(to + '/');
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
                  <Icon className="h-5 w-5" />
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
              <Menu className="h-5 w-5" />
              <span className="max-w-full truncate">More</span>
            </button>
          </div>
        </nav>
      </GlassSurface>
    </>
  );
}
