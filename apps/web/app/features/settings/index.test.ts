import { describe, expect, it } from 'vitest';
import {
  AppSettingsPage,
  fetchAppSettings,
  fetchReaderSettings,
  ReaderSettingsPage,
  saveAppSettings,
  saveReaderSettings,
  SETTINGS_NAV_SECTIONS,
  SettingsIndexPage,
} from './index.js';

describe('@app/settings', () => {
  it('exports the settings feature surface', () => {
    expect(fetchAppSettings).toBeTypeOf('function');
    expect(saveAppSettings).toBeTypeOf('function');
    expect(fetchReaderSettings).toBeTypeOf('function');
    expect(saveReaderSettings).toBeTypeOf('function');
    expect(SettingsIndexPage).toBeTypeOf('function');
    expect(AppSettingsPage).toBeTypeOf('function');
    expect(ReaderSettingsPage).toBeTypeOf('function');
    expect(SETTINGS_NAV_SECTIONS.length).toBeGreaterThan(0);
  });
});
