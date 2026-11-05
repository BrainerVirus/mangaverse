import {
  Archive,
  ArrowRightLeft,
  BookOpen,
  Compass,
  Palette,
  Play,
  Puzzle,
  Search,
  Settings,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  readonly label: string;
  readonly to: string;
  readonly icon: LucideIcon;
  /** Extra path prefixes that keep this item current, for pages reached through its hub. */
  readonly activeFor?: readonly string[];
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const discover = { label: 'Discover', to: '/discover', icon: Compass } as const;
const library = { label: 'Library', to: '/library', icon: BookOpen } as const;
const search = { label: 'Search', to: '/search', icon: Search } as const;
const extensions = { label: 'Extensions', to: '/extensions', icon: Puzzle } as const;
const settings = {
  label: 'Settings',
  to: '/settings',
  icon: Settings,
  activeFor: ['/backup', '/storage', '/theme', '/onboarding', '/advanced'],
} as const;

/**
 * Desktop sidebar. Backup, Onboarding and the Advanced tools are not listed: the Settings hub
 * links to each of them, and the mobile "More" sheet below keeps them one tap away.
 */
export const sidebarNavGroups: readonly NavGroup[] = [
  { label: 'Browse', items: [discover, library, search] },
  { label: 'Manage', items: [extensions, settings] },
];

/** Mobile bottom bar tabs. */
export const mobileTabs: readonly NavItem[] = [discover, library, search, settings];

/** Mobile "More" sheet: every route the bottom bar and the sidebar do not list. */
export const mobileMoreItems: readonly NavItem[] = [
  extensions,
  { label: 'Onboarding', to: '/onboarding', icon: Play },
  { label: 'Backup', to: '/backup', icon: Archive },
  { label: 'Advanced', to: '/advanced', icon: SlidersHorizontal },
  { label: 'Theme editor', to: '/advanced/theme', icon: Palette },
  { label: 'Diagnostics', to: '/advanced/diagnostics', icon: Zap },
  { label: 'Migration', to: '/advanced/migration', icon: ArrowRightLeft },
];

function matchesPrefix(currentPath: string, prefix: string): boolean {
  return currentPath === prefix || currentPath.startsWith(prefix + '/');
}

/**
 * The Advanced hub is only current on itself: each tool below it has its own entry. Items with
 * `activeFor` also stay current on the pages their hub links to.
 */
export function isNavActive(currentPath: string, item: Pick<NavItem, 'to' | 'activeFor'>): boolean {
  const { to, activeFor = [] } = item;
  return (
    currentPath === to ||
    (to !== '/advanced' && currentPath.startsWith(to + '/')) ||
    activeFor.some((prefix) => matchesPrefix(currentPath, prefix))
  );
}
