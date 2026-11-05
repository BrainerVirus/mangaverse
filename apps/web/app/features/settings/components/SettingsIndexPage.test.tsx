/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SETTINGS_NAV_SECTIONS } from '../nav-sections.js';
import { SettingsIndexPage } from './SettingsIndexPage.js';

describe('SettingsIndexPage', () => {
  // The shell owns the main landmark, so the page is a named section.
  it('renders a named section instead of a second main landmark', () => {
    const { container } = render(<SettingsIndexPage sections={[]} onNavigate={() => {}} />);

    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument();
  });

  it('groups each section into one bordered list with a row per link', () => {
    render(<SettingsIndexPage sections={SETTINGS_NAV_SECTIONS} onNavigate={() => {}} />);

    expect(screen.getAllByRole('list')).toHaveLength(SETTINGS_NAV_SECTIONS.length);
    for (const section of SETTINGS_NAV_SECTIONS) {
      const group = screen.getByRole('region', { name: section.title });
      expect(within(group).getAllByRole('button')).toHaveLength(section.items.length);
    }
    for (const list of screen.getAllByRole('list')) {
      expect(list.querySelectorAll('li > button svg').length).toBeGreaterThanOrEqual(2);
      expect(list.className).toContain('border');
    }
  });

  it('navigates to the exact route of the clicked row', async () => {
    const onNavigate = vi.fn<(to: string) => void>();
    render(<SettingsIndexPage sections={SETTINGS_NAV_SECTIONS} onNavigate={onNavigate} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Backup & restore/ }));

    expect(onNavigate).toHaveBeenCalledWith('/backup');
  });
});
