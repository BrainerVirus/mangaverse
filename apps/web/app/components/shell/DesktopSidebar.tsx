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
} from "lucide-react";
import { Tooltip, Separator, cn } from "@app/design-system";
import { useLayoutStore } from "../../stores/useLayoutStore.js";
import { useCommandPaletteStore } from "../../stores/useCommandPaletteStore.js";
import { useTheme } from "../../providers/theme-provider.js";

const EXPAND_DELAY = 200;

const primaryNavItems = [
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
        "relative z-40 flex h-full shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 ease-out",
        visuallyExpanded ? "w-[240px]" : "w-[52px]"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          MV
        </div>
        {visuallyExpanded ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">MangaVerse</p>
            <p className="truncate text-xs text-muted-foreground">Reading room</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2 py-3">
        {primaryNavItems.map(({ label, to, icon: Icon }) => {
          const active = isActive(to);
          const content = (
            <Link
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                visuallyExpanded ? "justify-start" : "justify-center",
                active
                  ? "bg-muted text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {visuallyExpanded && <span className="truncate">{label}</span>}
            </Link>
          );

          if (!visuallyExpanded) {
            return (
              <Tooltip key={to} content={label}>
                {content}
              </Tooltip>
            );
          }

          return <div key={to}>{content}</div>;
        })}

        <Separator className="my-2" />

        {secondaryNavItems.map(({ label, to, icon: Icon }) => {
          const active = isActive(to);
          const content = (
            <Link
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                visuallyExpanded ? "justify-start" : "justify-center",
                active
                  ? "bg-muted text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {visuallyExpanded && <span className="truncate">{label}</span>}
            </Link>
          );

          if (!visuallyExpanded) {
            return (
              <Tooltip key={to} content={label}>
                {content}
              </Tooltip>
            );
          }

          return <div key={to}>{content}</div>;
        })}
      </div>

      <div className="flex flex-col border-t border-border px-2 py-3">
        <Tooltip content="Toggle Sidebar">
          <button
            onClick={toggleSidebarExpand}
            aria-label="Collapse sidebar"
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              visuallyExpanded ? "justify-start" : "justify-center"
            )}
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 shrink-0 transition-transform duration-200",
                sidebarExpanded && "rotate-180"
              )}
            />
            {visuallyExpanded && <span className="truncate">Collapse</span>}
          </button>
        </Tooltip>

        <div
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-2 text-xs text-muted-foreground",
            visuallyExpanded ? "justify-start" : "justify-center"
          )}
        >
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span>⌘</span>
            <span>K</span>
          </kbd>
          {visuallyExpanded && (
<button
                onClick={openCommandPalette}
                aria-label="Open command palette"
                className="truncate hover:text-foreground"
              >
              Search
            </button>
          )}
        </div>

        <Tooltip content={theme === "light" ? "Dark Mode" : "Light Mode"}>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              visuallyExpanded ? "justify-start" : "justify-center"
            )}
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5 shrink-0" />
            ) : (
              <Sun className="h-5 w-5 shrink-0" />
            )}
            {visuallyExpanded && <span className="truncate">Theme</span>}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
