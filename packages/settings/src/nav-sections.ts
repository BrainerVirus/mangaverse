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
      },
      {
        label: 'Reader',
        description: 'Default reading mode, layout, and gestures.',
        to: '/settings/reader',
      },
      {
        label: 'Theme',
        description: 'Presets, colors, and appearance.',
        to: '/theme',
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
      },
      {
        label: 'Backup & restore',
        description: 'Export or import your local library and settings.',
        to: '/backup',
      },
      {
        label: 'Storage',
        description: 'Review usage and clear safe local cache data.',
        to: '/storage',
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
      },
      {
        label: 'Theme editor',
        description: 'Build and edit custom themes.',
        to: '/advanced/theme',
      },
      {
        label: 'Diagnostics',
        description: 'Storage usage, cache health, and troubleshooting.',
        to: '/advanced/diagnostics',
      },
      {
        label: 'Migration',
        description: 'Move titles between providers.',
        to: '/advanced/migration',
      },
    ],
  },
] as const;
