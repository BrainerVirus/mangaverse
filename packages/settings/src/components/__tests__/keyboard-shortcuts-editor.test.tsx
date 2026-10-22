// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getDefaultReaderSettings, type ReaderSettings } from '@app/shared';
import { KeyboardShortcutsEditor } from '../ReaderSettingsPage.js';

afterEach(cleanup);

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
  return { ...getDefaultReaderSettings(), ...overrides };
}

describe('KeyboardShortcutsEditor', () => {
  it('Given no saved bindings, Then the defaults are shown for every action', () => {
    render(<KeyboardShortcutsEditor settings={settings()} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Change shortcut for Next page' })).toHaveTextContent(
      '→',
    );
    expect(
      screen.getByRole('button', { name: 'Change shortcut for Show or hide controls' }),
    ).toHaveTextContent('H');
  });

  it('Given a captured key, When it is unused, Then the whole binding list is saved', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    render(<KeyboardShortcutsEditor settings={settings()} onChange={onChange} />);

    const next = screen.getByRole('button', { name: 'Change shortcut for Next page' });
    fireEvent.click(next);
    expect(next).toHaveTextContent('Press keys…');
    fireEvent.keyDown(next, { key: 'n' });

    const patch = onChange.mock.calls[0]?.[0];
    const bindings = patch?.keyboardShortcuts ?? [];
    expect(bindings.find((binding) => binding.action === 'nextPage')).toMatchObject({ key: 'n' });
    // The editor materializes every default so what is displayed is what is saved.
    expect(bindings).toHaveLength(8);
  });

  it('Given a key owned by another action, Then the editor refuses it and explains why', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    render(
      <KeyboardShortcutsEditor
        settings={settings({
          keyboardShortcuts: [
            { action: 'nextPage', key: 'n' },
            { action: 'prevPage', key: 'p' },
          ],
        })}
        onChange={onChange}
      />,
    );

    const prev = screen.getByRole('button', { name: 'Change shortcut for Previous page' });
    fireEvent.click(prev);
    fireEvent.keyDown(prev, { key: 'n' });

    expect(screen.getByRole('alert')).toHaveTextContent('already used for Next page');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Given the Tab key, Then it stays reserved for focus movement', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    render(<KeyboardShortcutsEditor settings={settings()} onChange={onChange} />);

    const next = screen.getByRole('button', { name: 'Change shortcut for Next page' });
    fireEvent.click(next);
    fireEvent.keyDown(next, { key: 'Tab' });

    expect(screen.getByRole('alert')).toHaveTextContent('Tab is reserved');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Given saved bindings, When reset, Then the empty list falls back to direction-aware defaults', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    render(
      <KeyboardShortcutsEditor
        settings={settings({ keyboardShortcuts: [{ action: 'nextPage', key: 'n' }] })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onChange).toHaveBeenCalledWith({ keyboardShortcuts: [] });
  });
});
