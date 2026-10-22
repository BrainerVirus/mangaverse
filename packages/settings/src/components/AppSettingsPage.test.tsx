/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getDefaultAppSettings, type AppSettings } from '@app/shared';

import { AppSettingsPage } from './AppSettingsPage.js';

afterEach(() => {
  cleanup();
});

function renderPage(settings: AppSettings = getDefaultAppSettings()) {
  const onChange = vi.fn<(next: AppSettings) => void>();
  const onInteractionEnd = vi.fn<() => void>();
  render(
    <AppSettingsPage
      settings={settings}
      isLoading={false}
      isError={false}
      onChange={onChange}
      onInteractionEnd={onInteractionEnd}
    />,
  );
  return {
    onChange,
    onInteractionEnd,
    input: screen.getByLabelText('Preferred languages') as HTMLInputElement,
  };
}

describe('AppSettingsPage preferred languages', () => {
  it('keeps a comma and partial tag as a draft instead of parsing every keystroke', () => {
    const { input, onChange } = renderPage();

    fireEvent.change(input, { target: { value: ',' } });
    fireEvent.change(input, { target: { value: ', ja' } });

    expect(input.value).toBe(', ja');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits the parsed list on Enter and drops the invalid leading fragment', () => {
    const { input, onChange, onInteractionEnd } = renderPage();

    input.focus();
    fireEvent.change(input, { target: { value: ', ja' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preferredLanguages: ['ja'] }));
    expect(input.value).toBe('ja');
    expect(onInteractionEnd).toHaveBeenCalled();
  });

  it('lets the field be cleared while editing and restores the saved list on blur', () => {
    const { input, onChange } = renderPage();

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');

    fireEvent.blur(input);

    expect(input.value).toBe('en');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits a pasted comma-separated list on blur', () => {
    const { input, onChange } = renderPage();

    fireEvent.change(input, { target: { value: 'en, ja' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLanguages: ['en', 'ja'] }),
    );
  });

  it('does not save when the committed list is unchanged', () => {
    const { input, onChange, onInteractionEnd } = renderPage();

    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(onInteractionEnd).toHaveBeenCalled();
  });
});
