import { describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '@/features/library';
import type { InstalledProviderSummary } from '@app/extensions';
import { toChapterId, toLibraryEntryId, toMangaId, toProviderMappingId } from '@app/shared';
import { buildProviderCommands, buildRecentCommands } from '../useLocalCommands';

function recentItem(title: string, chapterId?: string): LibraryItem {
  const mangaId = toMangaId(`manga-${title.toLowerCase().replaceAll(' ', '-')}`);
  return {
    manga: {
      id: mangaId,
      canonicalTitle: title,
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      providerMappings: [],
      defaultProviderMappingId: toProviderMappingId('mapping-1'),
      merged: false,
    },
    entry: {
      id: toLibraryEntryId(`entry-${title}`),
      mangaId,
      favorite: false,
      categoryIds: [],
      status: 'reading',
      unreadCount: 0,
      ...(chapterId === undefined ? {} : { lastReadChapterId: toChapterId(chapterId) }),
    },
  };
}

describe('buildRecentCommands', () => {
  it('returns nothing when the recent list is empty', () => {
    expect(buildRecentCommands([], vi.fn<() => void>(), vi.fn<() => void>())).toEqual([]);
  });

  it('continues the newest title and opens the rest as details', () => {
    const openManga = vi.fn<() => void>();
    const openChapter = vi.fn<() => void>();
    const commands = buildRecentCommands(
      [recentItem('Dorohedoro', 'chapter-7'), recentItem('Blame', 'chapter-2')],
      openManga,
      openChapter,
    );

    expect(commands.map((command) => command.label)).toEqual([
      'Continue reading Dorohedoro',
      'Open Dorohedoro',
      'Open Blame',
    ]);
    expect(commands.every((command) => command.section === 'Recent')).toBe(true);

    commands[0]?.handler();
    expect(openChapter).toHaveBeenCalledWith('chapter-7');
    commands[2]?.handler();
    expect(openManga).toHaveBeenCalledWith('manga-blame');
  });
});

function provider(index: number): InstalledProviderSummary {
  return {
    id: `provider-${index}`,
    name: `Provider ${index}`,
    version: '1.0.0',
    enabled: true,
    health: 'ok',
    sourceUrl: `https://example.com/provider-${index}`,
    languages: ['en'],
    capabilityCount: 1,
  };
}

describe('buildProviderCommands', () => {
  it('lists installed providers and opens their detail page', () => {
    const openProvider = vi.fn<() => void>();
    const commands = buildProviderCommands([provider(1), provider(2)], openProvider);

    expect(commands.map((command) => command.label)).toEqual([
      'Open Provider 1',
      'Open Provider 2',
    ]);
    expect(commands.every((command) => command.section === 'Extensions')).toBe(true);

    commands[0]?.handler();
    expect(openProvider).toHaveBeenCalledWith('provider-1');
  });

  it('caps the group so the palette stays a shortcut list', () => {
    const commands = buildProviderCommands(
      Array.from({ length: 8 }, (_, index) => provider(index)),
      vi.fn<() => void>(),
    );
    expect(commands).toHaveLength(5);
  });
});
