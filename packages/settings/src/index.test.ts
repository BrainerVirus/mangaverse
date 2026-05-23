import { describe, expect, it } from 'vitest';

describe('@app/settings', () => {
  it('exports the settings feature surface', async () => {
    const module = await import('./index.js');
    expect(module.fetchAppSettings).toBeTypeOf('function');
    expect(module.saveAppSettings).toBeTypeOf('function');
    expect(module.SettingsIndexPage).toBeTypeOf('function');
    expect(module.AppSettingsPage).toBeTypeOf('function');
    expect(module.SETTINGS_NAV_SECTIONS.length).toBeGreaterThan(0);
  });
});
