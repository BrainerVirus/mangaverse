import { useCallback, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Search,
  Settings,
  Puzzle,
  Sun,
  Moon,
  ChevronLeft,
  Archive,
  ArrowRightLeft,
  Zap,
  Play,
  Compass,
} from "lucide-react";
import { Button, Tooltip, Separator, cn, buttonVariants } from "@app/design-system";
import { useLayoutStore } from "../../stores/useLayoutStore.js";
import { useCommandPaletteStore } from "../../stores/useCommandPaletteStore.js";
import { useTheme } from "../../providers/theme-provider.js";

const EXPAND_DELAY = 200;

const primaryNavItems = [
  { label: "Discover", to: "/discover", icon: Compass },
  { label: "Library", to: "/library", icon: BookOpen },
  { label: "Search", to: "/search", icon: Search },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Extensions", to: "/extensions", icon: Puzzle },
] as const;

const secondaryNavItems = [
  { label: "Backup", to: "/backup", icon: Archive },
  { label: "Migration", to: "/migration", icon: ArrowRightLeft },
  { label: "Diagnostics", to: "/diagnostics", icon: Zap },
  { label: "Onboarding", to: "/onboarding", icon: Play },
] as const;

function SidebarNavLink({
  label,
  to,
  icon: Icon,
  active,
  expanded,
}: {
  label: string;
  to: string;
  icon: typeof BookOpen;
  active: boolean;
  expanded: boolean;
}) {
  const content = (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        buttonVariants[active ? "secondary" : "ghost"],
        "h-9 w-full justify-start gap-3 px-2.5",
        !expanded && "justify-center px-0",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {expanded ? <span className="truncate">{label}</span> : null}
    </Link>
  );

  if (!expanded) {
    return (
      <Tooltip content={label}>
        {content}
      </Tooltip>
    );
  }

  return content;
}

export function DesktopSidebar() {
  const { sidebarOpen, sidebarExpanded, toggleSidebarExpand } = useLayoutStore();
  const openCommandPalette = useCommandPaletteStore((s) => s.open);
  const { theme, setTheme } = useTheme();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const expandTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const isActive = (to: string) =>
    currentPath === to || currentPath.startsWith(to + "/");

  const handleMouseEnter = useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    expandTimer.current = setTimeout(() => {
      if (!sidebarExpanded) {
        setHoverExpanded(true);
      }
    }, EXPAND_DELAY);
  }, [sidebarExpanded]);

  const handleMouseLeave = useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    setHoverExpanded(false);
  }, []);

  const visuallyExpanded = sidebarExpanded || hoverExpanded;

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  if (!sidebarOpen) return null;

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative z-40 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out",
        visuallyExpanded ? "w-[220px]" : "w-[52px]"
      )}
    >
      <div className="flex flex-1 flex-col gap-1 px-2 py-3">
        {primaryNavItems.map((item) => (
          <SidebarNavLink
            key={item.to}
            {...item}
            active={isActive(item.to)}
            expanded={visuallyExpanded}
          />
        ))}

        <Separator className="my-2 bg-sidebar-border" />

        {secondaryNavItems.map((item) => (
          <SidebarNavLink
            key={item.to}
            {...item}
            active={isActive(item.to)}
            expanded={visuallyExpanded}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-sidebar-border px-2 py-3">
        <Tooltip content="Toggle Sidebar">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSidebarExpand}
            aria-label="Collapse sidebar"
            className={cn(
              "h-9 w-full justify-start gap-3 px-2.5 text-muted-foreground",
              !visuallyExpanded && "justify-center px-0",
            )}
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 shrink-0 transition-transform duration-200",
                sidebarExpanded && "rotate-180"
              )}
            />
            {visuallyExpanded ? <span className="truncate">Collapse</span> : null}
          </Button>
        </Tooltip>

        {visuallyExpanded ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className="h-9 w-full justify-start gap-3 px-2.5 text-muted-foreground"
          >
            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-sidebar-border bg-sidebar-accent px-1 font-mono text-[10px] font-medium">
              ⌘K
            </kbd>
            <span className="truncate">Commands</span>
          </Button>
        ) : (
          <Tooltip content="Command palette (⌘K)">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openCommandPalette}
              aria-label="Open command palette"
              className="mx-auto text-muted-foreground"
            >
              <Search className="h-5 w-5" />
            </Button>
          </Tooltip>
        )}

        <Tooltip content={theme === "light" ? "Dark Mode" : "Light Mode"}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            suppressHydrationWarning
            className={cn(
              "h-9 w-full justify-start gap-3 px-2.5 text-muted-foreground",
              !visuallyExpanded && "justify-center px-0",
            )}
          >
            <span suppressHydrationWarning className="inline-flex shrink-0">
              {theme === "light" ? (
                <Moon className="h-5 w-5 shrink-0" />
              ) : (
                <Sun className="h-5 w-5 shrink-0" />
              )}
            </span>
            {visuallyExpanded ? <span className="truncate">Theme</span> : null}
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}
