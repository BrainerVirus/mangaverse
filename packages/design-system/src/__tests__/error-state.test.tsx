import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '../components/error-state.js';

describe('ErrorState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title correctly', () => {
    render(<ErrorState title="Error Title" message="Error message" />);

    expect(screen.getByText('Error Title')).toBeInTheDocument();
  });

  it('renders message correctly', () => {
    render(<ErrorState title="Error Title" message="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays provider name when provided', () => {
    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        providerName="MangaProvider"
      />
    );

    expect(screen.getByText(/MangaProvider/)).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('renders back button when onBack is provided', () => {
    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        onRetry={onRetry}
      />
    );

    await user.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole('button', { name: /Go Back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows both buttons when both callbacks are provided', () => {
    render(
      <ErrorState
        title="Error"
        message="Failed to load"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
  });

  it('does not render buttons when callbacks not provided', () => {
    render(<ErrorState title="Error" message="Failed" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});