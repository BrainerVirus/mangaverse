import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MangaCard } from '../components/manga-card.js';
import type { MangaId, ProviderMappingId, ProviderId, ProviderMangaId, MangaIdentity } from '@app/shared';

vi.mock('@app/motion', async () => {
  const actual = await vi.importActual('@app/motion');
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn((callback, config) => {
    if (config?.scope?.current) {
      callback();
    }
    return () => {};
  }),
}));

const createMockManga = (overrides: Partial<MangaIdentity> = {}): MangaIdentity => ({
  id: 'test-id' as MangaId,
  canonicalTitle: 'Test Manga',
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing' as const,
  contentRating: 'safe' as const,
  providerMappings: [
    {
      id: 'provider-map-1' as ProviderMappingId,
      providerId: 'test-provider' as ProviderId,
      providerMangaId: 'external-123' as ProviderMangaId,
      providerUrl: 'https://example.com/manga/123',
    },
  ],
  defaultProviderMappingId: 'provider-map-1' as ProviderMappingId,
  merged: false,
  ...overrides,
});

describe('MangaCard', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders with manga prop', () => {
    const manga = createMockManga({ canonicalTitle: 'One Piece' });
    render(<MangaCard manga={manga} />);

    expect(screen.getByText('One Piece')).toBeInTheDocument();
  });

  it('displays cover image when provided', () => {
    const manga = createMockManga({
      coverImageUrl: 'https://example.com/cover.jpg',
    });
    render(<MangaCard manga={manga} />);

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/cover.jpg');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const manga = createMockManga();

    render(<MangaCard manga={manga} onClick={onClick} />);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter key is pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const manga = createMockManga();

    render(<MangaCard manga={manga} onClick={onClick} />);

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const manga = createMockManga();

    render(<MangaCard manga={manga} onClick={onClick} />);

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders grid variant correctly', () => {
    const manga = createMockManga();
    const { container } = render(<MangaCard manga={manga} variant="grid" />);

    const button = container.querySelector('button');
    expect(button).toHaveClass('aspect-[3/4]');
  });

  it('renders list variant correctly', () => {
    const manga = createMockManga();
    const { container } = render(<MangaCard manga={manga} variant="list" />);

    const button = container.querySelector('button');
    expect(button).toHaveClass('flex');
    expect(button).toHaveClass('gap-4');
  });

  it('renders compact variant correctly', () => {
    const manga = createMockManga();
    const { container } = render(<MangaCard manga={manga} variant="compact" />);

    const button = container.querySelector('button');
    expect(button).toHaveClass('flex-row');
  });

  it('displays provider name when in list variant', () => {
    const manga = createMockManga({
      canonicalTitle: 'Test Manga',
      providerMappings: [
        {
          id: 'provider-map-1' as ProviderMappingId,
          providerId: 'manga-provider' as ProviderId,
          providerMangaId: 'external-123' as ProviderMangaId,
          providerUrl: 'https://example.com',
        },
      ],
    });

    render(<MangaCard manga={manga} variant="list" />);

    expect(screen.getByText('manga-provider')).toBeInTheDocument();
  });

  it('displays tags when available and not compact', () => {
    const manga = createMockManga({
      tags: [
        { label: 'Action' },
        { label: 'Adventure' },
        { label: 'Comedy' },
      ],
    });

    render(<MangaCard manga={manga} variant="list" />);

    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Adventure')).toBeInTheDocument();
  });

  it('shows content rating badge for suggestive content', () => {
    const manga = createMockManga({ contentRating: 'suggestive' });

    render(<MangaCard manga={manga} />);

    expect(screen.getByText('suggestive')).toBeInTheDocument();
  });

  it('shows content rating badge for explicit content', () => {
    const manga = createMockManga({ contentRating: 'explicit' });

    render(<MangaCard manga={manga} />);

    expect(screen.getByText('explicit')).toBeInTheDocument();
  });

  it('does not show content rating badge for safe content', () => {
    const manga = createMockManga({ contentRating: 'safe' });

    render(<MangaCard manga={manga} />);

    expect(screen.queryByText('safe')).not.toBeInTheDocument();
  });

  it('is keyboard accessible with tabIndex', () => {
    const manga = createMockManga();
    const { container } = render(<MangaCard manga={manga} />);

    const element = container.querySelector('button');
    expect(element?.getAttribute('tabIndex')).toBe('0');
  });
});