/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  toCategoryId,
  toChapterId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMangaId,
  toProviderMappingId,
  type CategoryId,
  type Chapter,
  type LibraryStatus,
  type MangaProviderMapping,
} from '@app/shared';
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

function mapping(id: string, providerId: string, remoteId: string): MangaProviderMapping {
  return {
    id: toProviderMappingId(id),
    providerId: toProviderId(providerId),
    providerMangaId: toProviderMangaId(remoteId),
  };
}

function chapter(id: string, index: number, mappingId: string): Chapter {
  return {
    id: toChapterId(id),
    mangaId: MANGA_ID,
    providerMappingId: toProviderMappingId(mappingId),
    title: `Chapter ${index}`,
    index,
    pages: [],
  };
}

const MAP_A = 'map-a';
const MAP_B = 'map-b';

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

  it('Given a read title, Then unread, last read and last updated facts render from stored rows', () => {
    const chapters: Chapter[] = [
      {
        id: toChapterId('ch-1'),
        mangaId: MANGA_ID,
        title: 'Chapter 1',
        index: 1,
        pages: [],
        createdAt: '2026-03-04T10:00:00.000Z',
      },
      {
        id: toChapterId('ch-2'),
        mangaId: MANGA_ID,
        title: 'Chapter 2',
        index: 2,
        pages: [],
        createdAt: '2026-03-05T10:00:00.000Z',
      },
    ];

    const { container } = render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({
          chapters,
          libraryEntry: {
            ...inLibrary,
            status: 'reading',
            unreadCount: 1,
            lastReadChapterId: toChapterId('ch-1'),
          },
        })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
      />,
    );

    expect(screen.getByText('Unread', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('1 chapter')).toBeInTheDocument();
    expect(screen.getByText('Last read')).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
    // The updated stamp is the newest chapter's createdAt, never its sync time.
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-03-05T10:00:00.000Z',
    );
  });

  it('Given a library title, When a status is picked, Then the change is reported', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<(status: LibraryStatus) => void>();

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({ libraryEntry: { ...inLibrary, status: 'planned' } })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onStatusChange={onStatusChange}
      />,
    );

    const trigger = screen.getByLabelText('Reading status');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await user.click(screen.getByRole('option', { name: 'Completed' }));

    expect(onStatusChange).toHaveBeenCalledWith('completed');
  });

  it('Given a failing category write, Then the editor stays open and shows the error', async () => {
    const onCategoriesChange = vi.fn<(categoryIds: readonly CategoryId[]) => Promise<void>>(
      async () => {
        throw new Error('Could not update categories.');
      },
    );

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({
          libraryEntry: inLibrary,
          categories: [{ id: toCategoryId('fantasy'), name: 'Fantasy' }],
        })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onCategoriesChange={onCategoriesChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fantasy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update categories.');
    expect(screen.getByRole('button', { name: 'Fantasy' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('Given two providers, When the active mapping changes, Then the chapter list follows it', () => {
    const onSelectProvider = vi.fn<(mappingId: unknown) => void>();
    const entry = {
      ...inLibrary,
      favorite: true,
      categoryIds: [toCategoryId('fantasy')],
      activeProviderMappingId: toProviderMappingId(MAP_A),
      lastReadChapterId: toChapterId('a-1'),
    };
    const detail = makeDetail({
      manga: {
        ...makeDetail().manga,
        providerMappings: [
          mapping(MAP_A, 'prov-a', 'remote-a'),
          mapping(MAP_B, 'prov-b', 'remote-b'),
        ],
        defaultProviderMappingId: toProviderMappingId(MAP_A),
      },
      chapters: [chapter('a-1', 1, MAP_A), chapter('b-1', 1, MAP_B)],
      libraryEntry: entry,
      categories: [{ id: toCategoryId('fantasy'), name: 'Fantasy' }],
    });

    const view = render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={detail}
        isLoading={false}
        isError={false}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onOpenChapter={() => {}}
        onSelectProvider={onSelectProvider}
        onToggleFavorite={() => {}}
        onCategoriesChange={async () => {}}
      />,
    );

    // Provider A is viewed: only its chapter row exists.
    const chaptersRegion = screen.getByRole('region', { name: 'Chapters' });
    expect(within(chaptersRegion).getAllByText('Chapter 1')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'View chapters' }));
    expect(onSelectProvider).toHaveBeenCalledWith(toProviderMappingId(MAP_B));

    view.rerender(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={{
          ...detail,
          libraryEntry: { ...entry, activeProviderMappingId: toProviderMappingId(MAP_B) },
        }}
        isLoading={false}
        isError={false}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onOpenChapter={() => {}}
        onSelectProvider={onSelectProvider}
        onToggleFavorite={() => {}}
        onCategoriesChange={async () => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Favorited' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Fantasy' })).toHaveAttribute('aria-pressed', 'true');
    // The chapter row belongs to provider B now; the title is the same fixture text.
    const chapterButtons = screen.getAllByRole('button', { name: /Chapter 1/ });
    expect(chapterButtons).toHaveLength(1);
  });

  it('Given a viewed mapping, When a newer snapshot changes the active mapping, Then the persisted mapping wins', () => {
    const entry = {
      ...inLibrary,
      activeProviderMappingId: toProviderMappingId(MAP_A),
    };
    const detail = makeDetail({
      manga: {
        ...makeDetail().manga,
        providerMappings: [
          mapping(MAP_A, 'prov-a', 'remote-a'),
          mapping(MAP_B, 'prov-b', 'remote-b'),
        ],
        defaultProviderMappingId: toProviderMappingId(MAP_A),
      },
      chapters: [
        { ...chapter('a-1', 1, MAP_A), title: 'Alpha chapter' },
        { ...chapter('b-1', 1, MAP_B), title: 'Beta chapter' },
      ],
      libraryEntry: entry,
    });

    const view = render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={detail}
        isLoading={false}
        isError={false}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onOpenChapter={() => {}}
        onSelectProvider={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View chapters' }));
    expect(screen.getByText('Beta chapter')).toBeInTheDocument();

    view.rerender(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={{ ...detail, libraryEntry: { ...entry } }}
        isLoading={false}
        isError={false}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onOpenChapter={() => {}}
        onSelectProvider={async () => {}}
      />,
    );

    expect(screen.getByText('Alpha chapter')).toBeInTheDocument();
    expect(screen.queryByText('Beta chapter')).toBeNull();
  });

  it('shows tracking links only when the title carries them', () => {
    const withTracking = makeDetail({
      manga: {
        ...makeDetail().manga,
        trackingLinks: [
          {
            service: 'AniList',
            externalId: 'anilist-1',
            externalUrl: 'https://anilist.co/manga/1',
            lastSyncedAt: '2026-01-01T00:00:00Z',
          },
          {
            service: 'Imported',
            externalId: 'imported-1',
            externalUrl: 'javascript:alert(1)',
          },
        ],
      },
    });

    const view = render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={withTracking}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
      />,
    );
    expect(screen.getByText('AniList')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /anilist-1/ })).toHaveAttribute(
      'href',
      'https://anilist.co/manga/1',
    );
    expect(screen.getByText('synced 2026-01-01T00:00:00Z')).toBeInTheDocument();
    // An imported non-http URL renders as text, never as a link.
    expect(screen.getByText('imported-1').tagName).toBe('SPAN');
    expect(screen.queryByRole('link', { name: /imported-1/ })).toBeNull();

    view.rerender(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail()}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
      />,
    );
    expect(screen.queryByText('AniList')).toBeNull();
  });

  it('renders recommendation states without hiding the rest of the page', () => {
    const related = {
      id: toMangaId('related-1'),
      canonicalTitle: 'Related Title',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing' as const,
      contentRating: 'safe' as const,
      providerMappings: [mapping('related-map', 'prov-a', 'remote-related')],
      defaultProviderMappingId: toProviderMappingId('related-map'),
      merged: false,
    };
    const onRetry = vi.fn<() => void>();
    const onOpenRelatedManga = vi.fn<(mangaId: unknown) => void>();

    const view = render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({ libraryEntry: inLibrary })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        recommendations={{ items: [related], isLoading: false }}
        onOpenRelatedManga={onOpenRelatedManga}
      />,
    );

    expect(screen.getByRole('region', { name: 'Recommendations' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Related Title/ }));
    expect(onOpenRelatedManga).toHaveBeenCalledWith(toMangaId('related-1'));

    view.rerender(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({ libraryEntry: inLibrary })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        recommendations={{ error: 'Provider is down.', onRetry }}
      />,
    );
    expect(screen.getByText('Provider is down.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('exposes migration, provider settings and per-title reader settings shortcuts', () => {
    const onOpenMigration = vi.fn<() => void>();
    const onOpenProviderSettings = vi.fn<(providerId: string) => void>();
    const onOpenReaderSettings = vi.fn<() => void>();

    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail({
          manga: {
            ...makeDetail().manga,
            providerMappings: [mapping(MAP_A, 'prov-a', 'remote-a')],
            defaultProviderMappingId: toProviderMappingId(MAP_A),
          },
        })}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onOpenMigration={onOpenMigration}
        onOpenProviderSettings={onOpenProviderSettings}
        onOpenReaderSettings={onOpenReaderSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Migrate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Provider settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reader settings' }));

    expect(onOpenMigration).toHaveBeenCalledTimes(1);
    expect(onOpenProviderSettings).toHaveBeenCalledWith('prov-a');
    expect(onOpenReaderSettings).toHaveBeenCalledTimes(1);
  });

  it('opens the custom cover dialog from the title actions', () => {
    render(
      <MangaDetailPage
        mangaId={MANGA_ID}
        data={makeDetail()}
        isLoading={false}
        isError={false}
        onOpenChapter={() => {}}
        onSetCoverImageUrl={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom cover' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Cover image URL')).toHaveValue('');
  });
});
