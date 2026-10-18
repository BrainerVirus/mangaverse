import { describe, expect, it } from 'vitest';
import { SettingsIndexPage } from './SettingsIndexPage.js';

describe('SettingsIndexPage', () => {
  // This package's vitest runs in node with no testing-library, so the page is
  // asserted through the element it returns: the shell owns the main landmark.
  it('renders a named section instead of a second main landmark', () => {
    const page = SettingsIndexPage({ sections: [], onNavigate: () => {} });

    expect(page.type).toBe('section');
    expect(page.props['aria-label']).toBe('Settings');
  });
});
