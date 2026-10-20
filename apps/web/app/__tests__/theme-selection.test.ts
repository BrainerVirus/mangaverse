import { describe, expect, it } from 'vitest';
import { themeSettingsAfterDelete } from '../components/theme/theme-selection.js';

describe('theme selection after delete', () => {
  it('Given the deleted custom theme is selected, Then it falls back to the default built-in', () => {
    expect(themeSettingsAfterDelete({ themeId: 'custom:gone', dark: true }, 'custom:gone')).toEqual(
      {
        themeId: 'default',
        dark: true,
      },
    );
  });

  it('Given another theme is selected, Then the selection is untouched', () => {
    const settings = { themeId: 'custom:kept', dark: false };
    expect(themeSettingsAfterDelete(settings, 'custom:gone')).toBe(settings);
  });
});
