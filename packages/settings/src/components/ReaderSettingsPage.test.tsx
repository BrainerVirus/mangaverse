/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getDefaultReaderSettings } from '@app/shared';
import { ReaderSettingsPage } from './ReaderSettingsPage.js';

describe('ReaderSettingsPage', () => {
  it('marks a title-scoped page and resets that title overrides', () => {
    const onReset = vi.fn<() => void>();

    render(
      <ReaderSettingsPage
        settings={getDefaultReaderSettings()}
        isLoading={false}
        isError={false}
        onChange={() => {}}
        titleScope={{ onReset }}
      />,
    );

    expect(
      screen.getByText('Reading mode, layout, gestures, and display preferences for this title.')
        .textContent,
    ).toContain('for this title');
    fireEvent.click(screen.getByRole('button', { name: 'Reset title settings' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
