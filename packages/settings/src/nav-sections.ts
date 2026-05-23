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
        label: 'Migration',
        description: 'Move titles between providers.',
        to: '/migration',
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        label: 'Diagnostics',
        description: 'Storage usage, cache health, and troubleshooting.',
        to: '/diagnostics',
      },
      {
        label: 'Onboarding',
        description: 'Replay the first-run setup flow.',
        to: '/onboarding',
      },
    ],
  },
] as const;
