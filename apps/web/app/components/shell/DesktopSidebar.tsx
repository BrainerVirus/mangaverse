import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Sun, Moon, ChevronLeft } from 'lucide-react';
import { Button, Tooltip, cn, buttonVariants } from '@app/design-system';
import { useLayoutStore } from '@/stores/useLayoutStore.js';
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore.js';
import { useTheme } from '@/providers/theme-provider.js';
import { isNavActive, sidebarNavGroups, type NavItem } from './nav-items.js';

const EXPAND_DELAY = 200;

function SidebarNavLink({
  label,
  to,
  icon: Icon,
  active,
  expanded,
}: NavItem & {
  active: boolean;
  expanded: boolean;
}) {
  const content = (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        buttonVariants.ghost,
        'h-10 w-full justify-start px-2.5 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
        !expanded && 'justify-center px-0',
      )}
    >
      <Icon />
      {expanded ? <span className="truncate">{label}</span> : null}
    </Link>
  );

  if (!expanded) {
    return <Tooltip content={label}>{content}</Tooltip>;
  }

  return content;
}

export function DesktopSidebar() {
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const toggleSidebarExpand = useLayoutStore((s) => s.toggleSidebarExpand);
  const openCommandPalette = useCommandPaletteStore((s) => s.open);
  const { theme, setTheme } = useTheme();
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const expandTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hoverExpanded, setHoverExpanded] = useState(false);

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

  // Rail labels are hidden, so only the collapsed state needs a tooltip.
  const withTooltip = (node: ReactNode, content: string) =>
    visuallyExpanded ? node : <Tooltip content={content}>{node}</Tooltip>;

  // One shape for every bottom action: full-width row when expanded, centred square on the rail.
  const actionClass = cn(
    'h-9 w-full justify-start px-2.5 text-muted-foreground',
    !visuallyExpanded && 'justify-center px-0',
  );

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  if (!sidebarOpen) return null;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover is a pointer-only shortcut for the expand toggle below; keyboard and touch users get the same state through the "Toggle Sidebar" button, so no interaction semantics are lost
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative z-40 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out max-md:hidden',
        visuallyExpanded ? 'w-55' : 'w-13',
      )}
    >
      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 px-2 py-3">
        {sidebarNavGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            {visuallyExpanded ? (
              <p
                aria-hidden="true"
                className="px-2.5 pb-1 type-micro uppercase text-muted-foreground"
              >
                {group.label}
              </p>
            ) : null}
            <ul aria-label={group.label} className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarNavLink
                    {...item}
                    active={isNavActive(currentPath, item)}
                    expanded={visuallyExpanded}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-sidebar-border px-2 py-3">
        {withTooltip(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSidebarExpand}
            aria-label="Collapse sidebar"
            className={actionClass}
          >
            <ChevronLeft
              className={cn('transition-transform duration-200', !visuallyExpanded && 'rotate-180')}
            />
            {visuallyExpanded ? <span className="truncate">Collapse</span> : null}
          </Button>,
          'Toggle Sidebar',
        )}

        {withTooltip(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className={actionClass}
          >
            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-sidebar-border bg-sidebar-accent px-1 font-mono type-micro">
              ⌘K
            </kbd>
            {visuallyExpanded ? <span className="truncate">Commands</span> : null}
          </Button>,
          'Command palette (⌘K)',
        )}

        {withTooltip(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            suppressHydrationWarning
            className={actionClass}
          >
            <span suppressHydrationWarning className="inline-flex shrink-0">
              {theme === 'light' ? <Moon /> : <Sun />}
            </span>
            {visuallyExpanded ? <span className="truncate">Theme</span> : null}
          </Button>,
          theme === 'light' ? 'Dark Mode' : 'Light Mode',
        )}
      </div>
    </aside>
  );
}
