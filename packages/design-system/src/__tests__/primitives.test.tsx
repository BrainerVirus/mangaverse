import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  MangaId,
  MangaIdentity,
  ProviderId,
  ProviderMangaId,
  ProviderMappingId,
} from '@app/shared';
import { cn } from '../lib/cn.js';
import { MangaCard } from '../components/manga-card.js';

describe('cn() utility', () => {
  it('merges duplicate classes with cn', () => {
    const result = cn('text-red-500', 'text-red-500');
    expect(result).toBe('text-red-500');
  });

  it('keeps non-conflicting classes', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toContain('text-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('merges padding utilities correctly', () => {
    const result = cn('px-2 py-1', 'p-2');
    expect(result).toContain('p-2');
  });

  it('handles multiple class inputs', () => {
    const result = cn('flex', 'items-center', 'gap-2');
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).toContain('gap-2');
  });

  it('handles conditional classes', () => {
    const result = cn('flex', { 'items-center': true, hidden: false });
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).not.toContain('hidden');
  });

  it('handles empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('resolves conflicting tailwind classes with cn', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).not.toContain('bg-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('handles string array input', () => {
    const result = cn(['flex', 'items-center']);
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
  });

  it('handles mixed inputs', () => {
    const result = cn('flex', ['items-center', 'gap-2'], { justify: true });
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).toContain('gap-2');
    expect(result).toContain('justify');
  });

  it('returns a string type', () => {
    const result = cn('text-red-500');
    expect(typeof result).toBe('string');
  });

  it('handles object input', () => {
    const result = cn({ 'bg-blue-500': true, 'bg-red-500': false });
    expect(result).toContain('bg-blue-500');
    expect(result).not.toContain('bg-red-500');
  });
});

const mappedManga: MangaIdentity = {
  id: 'manga-1' as MangaId,
  canonicalTitle: 'Manga',
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing',
  contentRating: 'safe',
  providerMappings: [
    {
      id: 'mapping-1' as ProviderMappingId,
      providerId: 'mangadex' as ProviderId,
      providerMangaId: 'remote-1' as ProviderMangaId,
    },
  ],
  defaultProviderMappingId: 'mapping-1' as ProviderMappingId,
  merged: false,
};

describe('MangaCard source label', () => {
  it('Given a provider display name, Then the card shows it instead of the raw id', () => {
    const html = renderToStaticMarkup(<MangaCard manga={mappedManga} sourceLabel="MangaDex" />);

    expect(html).toContain('MangaDex');
    expect(html).not.toContain('mangadex');
  });

  it('Given no registered provider name, Then the card prints no raw id', () => {
    const html = renderToStaticMarkup(<MangaCard manga={mappedManga} />);

    expect(html).not.toContain('mangadex');
  });
});
