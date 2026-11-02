import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../components/empty-state.js';

vi.mock('../motion/index.js', async () => {
  const actual = await vi.importActual('../motion/index.js');
  return {
    ...actual,
    useReducedMotion: () => false,
    fadeIn: vi.fn<(...args: unknown[]) => unknown>(),
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn<(callback: () => void, config?: { scope?: { current?: unknown } }) => () => void>(
    (callback, config) => {
      if (config?.scope?.current) {
        callback();
      }
      return () => {};
    },
  ),
}));

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders no-library type correctly', () => {
    render(<EmptyState type="no-library" />);

    expect(screen.getByText('Your library is empty')).toBeInTheDocument();
    expect(
      screen.getByText('Start by adding manga to your library from a provider.'),
    ).toBeInTheDocument();
  });

  it('renders no-provider type correctly', () => {
    render(<EmptyState type="no-provider" />);

    expect(screen.getByText('No provider installed')).toBeInTheDocument();
  });

  it('renders no-results type correctly', () => {
    render(<EmptyState type="no-results" />);

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders a specific missing-manga state instead of the search empty state', () => {
    render(<EmptyState type="manga-not-found" />);

    expect(screen.getByText('Manga not found')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).toBeNull();
  });

  it('renders a specific missing-provider state instead of the no-provider state', () => {
    render(<EmptyState type="provider-not-found" />);

    expect(screen.getByText('Provider not found')).toBeInTheDocument();
    expect(screen.queryByText('No provider installed')).toBeNull();
  });

  it('renders no-chapters type correctly', () => {
    render(<EmptyState type="no-chapters" />);

    expect(screen.getByText('No chapters available')).toBeInTheDocument();
  });

  it('renders no-backups type correctly', () => {
    render(<EmptyState type="no-backups" />);

    expect(screen.getByText('No backups found')).toBeInTheDocument();
  });

  it('does not show action button when action prop is not provided', () => {
    render(<EmptyState type="no-library" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows action button when action prop is provided', () => {
    render(
      <EmptyState
        type="no-library"
        action={{ label: 'Add Manga', onClick: vi.fn<() => void>() }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add Manga' })).toBeInTheDocument();
  });

  it('calls onClick when action button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn<() => void>();

    render(<EmptyState type="no-library" action={{ label: 'Add Manga', onClick }} />);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('displays correct description for each type', () => {
    const descriptions: Record<string, RegExp> = {
      'no-library': /Start by adding manga/,
      'no-provider': /Install a provider/,
      'no-results': /Try adjusting your search/,
      'no-chapters': /doesn't have any chapters/,
      'no-backups': /Create a backup/,
    };

    for (const [type, expectedDescription] of Object.entries(descriptions)) {
      const { unmount } = render(
        <EmptyState
          type={type as 'no-library' | 'no-provider' | 'no-results' | 'no-chapters' | 'no-backups'}
        />,
      );
      expect(screen.getByText(expectedDescription)).toBeInTheDocument();
      unmount();
    }
  });

  it('has proper semantic structure', () => {
    render(<EmptyState type="no-library" />);

    const container = screen.getByText('Your library is empty').parentElement;
    expect(container?.tagName).toBe('DIV');
  });
});
