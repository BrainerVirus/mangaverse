import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
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
} from "lucide-react";
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  cn,
} from "@app/design-system";

const primaryTabs = [
  { label: "Library", to: "/library", icon: BookOpen },
  { label: "Search", to: "/search", icon: Search },
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

const secondaryItems = [
  { label: "Extensions", to: "/extensions", icon: Puzzle },
  { label: "Backup", to: "/backup", icon: Archive },
  { label: "Migration", to: "/migration", icon: ArrowRightLeft },
  { label: "Diagnostics", to: "/diagnostics", icon: Zap },
  { label: "Onboarding", to: "/onboarding", icon: Play },
] as const;

export function MobileBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>Navigate to secondary MangaVerse tools.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-1 px-2">
            {secondaryItems.map(({ label, to, icon: Icon }) => {
              const isActive = currentPath === to || currentPath.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-2 py-3 text-sm font-medium transition-colors rounded-md",
                    isActive ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-1 px-2">
            {primaryTabs.map(({ label, to, icon: Icon }) => {
              const isActive = currentPath === to || currentPath.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-2 py-3 text-sm font-medium transition-colors rounded-md",
                    isActive ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 h-14 bg-background/95 backdrop-blur",
          "border-t border-border pb-[env(safe-area-inset-bottom)]"
        )}
      >
        <div className="flex h-full items-center justify-around px-4">
          {primaryTabs.map(({ label, to, icon: Icon }) => {
            const isActive = currentPath === to || currentPath.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            );
          })}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation menu"
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            onClick={() => setSheetOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </Button>
        </div>
      </nav>
    </>
  );
}