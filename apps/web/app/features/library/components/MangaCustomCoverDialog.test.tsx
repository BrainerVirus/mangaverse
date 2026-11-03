/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MangaCustomCoverDialog } from './MangaCustomCoverDialog.js';

function renderDialog(overrides: Partial<Parameters<typeof MangaCustomCoverDialog>[0]> = {}) {
  const props = {
    open: true,
    hasCustomCover: false,
    onOpenChange: vi.fn<(open: boolean) => void>(),
    onSave: vi.fn<(url: string) => Promise<void>>(async () => {}),
    onReset: vi.fn<() => Promise<void>>(async () => {}),
    ...overrides,
  };
  render(<MangaCustomCoverDialog {...props} />);
  return props;
}

describe('MangaCustomCoverDialog', () => {
  it('Given a pending save, Then the button keeps its label so a fast save cannot flash', () => {
    renderDialog({ isSaving: true });

    expect(screen.getByRole('button', { name: 'Save cover' })).toBeDisabled();
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it('rejects an invalid URL without calling the write', () => {
    const props = renderDialog();

    fireEvent.change(screen.getByLabelText('Cover image URL'), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cover' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid cover image URL.');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('rejects a non-http protocol', () => {
    const props = renderDialog();

    fireEvent.change(screen.getByLabelText('Cover image URL'), {
      target: { value: 'ftp://example.com/cover.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cover' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Cover image URL must start with http:// or https://.',
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('Given a failing save, Then the dialog stays open with no inline error, so the toast is the only surface', async () => {
    const props = renderDialog({
      onSave: vi.fn<(url: string) => Promise<void>>(async () => {
        throw new Error('INTERNAL_SECRET at handle.run');
      }),
    });

    fireEvent.change(screen.getByLabelText('Cover image URL'), {
      target: { value: 'https://example.com/new.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cover' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(props.onSave).toHaveBeenCalledWith('https://example.com/new.jpg');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/INTERNAL_SECRET|Could not/)).toBeNull();
    expect(screen.getByLabelText('Cover image URL')).toHaveValue('https://example.com/new.jpg');
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('Given a failing reset, Then no inline error shows either', async () => {
    const props = renderDialog({
      hasCustomCover: true,
      onReset: vi.fn<() => Promise<void>>(async () => {
        throw new Error('INTERNAL_SECRET at handle.run');
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to provider cover' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/INTERNAL_SECRET/)).toBeNull();
  });

  it('saves a valid URL and resets an existing override', async () => {
    const props = renderDialog({
      hasCustomCover: true,
      initialUrl: 'https://example.com/old.jpg',
    });

    fireEvent.change(screen.getByLabelText('Cover image URL'), {
      target: { value: 'https://example.com/new.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cover' }));

    expect(props.onSave).toHaveBeenCalledWith('https://example.com/new.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to provider cover' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
