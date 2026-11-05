// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV_SECTIONS } from './nav-sections.js';

describe('SETTINGS_NAV_SECTIONS', () => {
  it('gives every item an icon and keeps the route targets', () => {
    const items = SETTINGS_NAV_SECTIONS.flatMap((section) => section.items);

    for (const item of items) expect(item.icon).toBeDefined();
    expect(items.map((item) => item.to)).toEqual([
      '/settings/app',
      '/settings/reader',
      '/theme',
      '/extensions',
      '/backup',
      '/storage',
      '/onboarding',
      '/advanced',
      '/advanced/theme',
      '/advanced/diagnostics',
      '/advanced/migration',
    ]);
  });
});
