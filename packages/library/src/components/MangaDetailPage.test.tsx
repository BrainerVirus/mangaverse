/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { toLibraryEntryId, toMangaId, toProviderMappingId } from '@app/shared';
import type * as MotionModule from '@app/motion';

vi.mock('@app/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionModule>();
  return { ...actual, fadeIn: vi.fn<(...args: unknown[]) => unknown>() };
});

vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => {
    callback();
  },
}));

import { MangaDetailPage } from './MangaDetailPage.js';
import type { MangaDetailData } from '../types.js';

const MANGA_ID = toMangaId('dev-md-dc332d04-d3b0-413c-a767-70f5e451b031');

const SEEDED_DESCRIPTION =
  'A battle junkie world.\n___\n**Character Designer:** [Kurogin (DIGS)](https://mangadex.org/author/1)\n\n**Additional Links:**  \n- [Official Raw Web Novel](https://ncode.syosetu.com/n1222ci/)\n- [Official English Light Novel](https://j-novel.club/series/black-summoner)';

function makeDetail(overrides: Partial<MangaDetailData> = {}): MangaDetailData {
  return {
    manga: {
      id: MANGA_ID,
      canonicalTitle: 'Kuro no Shoukanshi',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      providerMappings: [],
      defaultProviderMappingId: toProviderMappingId('map-1'),
      merged: false,
      description: SEEDED_DESCRIPTION,
    },
    chapters: [],
    libraryEntry: undefined,
    continueChapterId: undefined,
    ...overrides,
  };
}

const inLibrary: MangaDetailData['libraryEntry'] = {
  id: toLibraryEntryId('entry-1'),
  mangaId: MANGA_ID,
  favorite: false,
  categoryIds: [],
  status: 'planned',
  unreadCount: 0,
};

describe('MangaDetailPage', () => {
  it('Given an unknown id, Then it names the missing title instead of showing a search empty state', () => {
    const onBack = vi.fn<() => void>();

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={null}
        isLoading={false}
        isError={false}
        onBack={onBack}
        onOpenChapter={() => {}}
      />,
    );

    expect(screen.getByText('Manga not found')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Given the seeded Markdown description, Then the page shows readable prose only', () => {
    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail()}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
      />,
    );

    const description = screen.getByText(/Character Designer/);
    expect(description.textContent).not.toContain('**');
    expect(description.textContent).not.toContain('___');
    expect(description.textContent).not.toContain('](');
    expect(description.textContent).toContain('Character Designer: Kurogin (DIGS)');
    expect(description.textContent).toContain('• Official English Light Novel');
  });

  it('Given a library entry, When Remove is cancelled, Then the title stays in the library', () => {
    const onRemove = vi.fn<() => void>();

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({ libraryEntry: inLibrary })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onRemoveFromLibrary={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
    expect(screen.getByText('Remove “Kuro no Shoukanshi” from your library?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep in library' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove from library' })).toBeInTheDocument();
  });

  it('Given a library entry, When removal is confirmed, Then the removal callback runs', () => {
    const onRemove = vi.fn<() => void>();

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({ libraryEntry: inLibrary })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onRemoveFromLibrary={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove title' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
