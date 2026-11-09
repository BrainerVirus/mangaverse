import {
  Activity,
  Archive,
  ArrowRightLeft,
  BookOpen,
  Brush,
  HardDrive,
  Palette,
  Play,
  Puzzle,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import type { SettingsNavItem } from './components/SettingsIndexPage.js';

export const SETTINGS_NAV_SECTIONS: readonly {
  readonly title: string;
  readonly items: readonly SettingsNavItem[];
}[] = [
  {
    title: 'General',
    items: [
      {
        label: 'App',
        description: 'Content filters, performance, and localization.',
        to: '/settings/app',
        icon: Settings2,
      },
      {
        label: 'Reader',
        description: 'Default reading mode, layout, and gestures.',
        to: '/settings/reader',
        icon: BookOpen,
      },
      {
        label: 'Theme',
        description: 'Presets, colors, and appearance.',
        to: '/theme',
        icon: Palette,
      },
      {
        label: 'Updates',
        description: 'Check for a new version and restart into it.',
        to: '/settings/updates',
        icon: RefreshCw,
      },
    ],
  },
  {
    title: 'Data',
    items: [
      {
        label: 'Extensions',
        description: 'Installed providers and install sources.',
        to: '/extensions',
        icon: Puzzle,
      },
      {
        label: 'Backup & restore',
        description: 'Export or import your local library and settings.',
        to: '/backup',
        icon: Archive,
      },
      {
        label: 'Storage',
        description: 'Review usage and clear safe local cache data.',
        to: '/storage',
        icon: HardDrive,
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        label: 'Onboarding',
        description: 'Replay the first-run setup flow.',
        to: '/onboarding',
        icon: Play,
      },
    ],
  },
  {
    title: 'Advanced',
    items: [
      {
        label: 'Advanced',
        description: 'All advanced tools in one place.',
        to: '/advanced',
        icon: SlidersHorizontal,
      },
      {
        label: 'Theme editor',
        description: 'Build and edit custom themes.',
        to: '/advanced/theme',
        icon: Brush,
      },
      {
        label: 'Diagnostics',
        description: 'Storage usage, cache health, and troubleshooting.',
        to: '/advanced/diagnostics',
        icon: Activity,
      },
      {
        label: 'Migration',
        description: 'Move titles between providers.',
        to: '/advanced/migration',
        icon: ArrowRightLeft,
      },
    ],
  },
] as const;
