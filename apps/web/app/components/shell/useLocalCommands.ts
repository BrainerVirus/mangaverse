import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  extensionsQueryKeys,
  fetchExtensionsPage,
  type InstalledProviderSummary,
} from '@app/extensions';
import type { LibraryItem } from '@app/library';
import type { ChapterId, MangaId } from '@app/shared';
import { recentLibraryQueryOptions } from '../../queries/library-query-options.js';
import { useLocalDb, useLocalDbStatus } from '../../providers/local-db-provider.js';
import type { Command } from './CommandRegistry.js';

/** A palette group longer than the palette itself stops being a shortcut. */
const PROVIDER_COMMAND_LIMIT = 5;

export function buildRecentCommands(
  items: readonly LibraryItem[],
  openManga: (mangaId: MangaId) => void,
  openChapter: (chapterId: ChapterId) => void,
): Command[] {
  const latest = items[0];
  const latestChapterId = latest?.entry.lastReadChapterId;
  const continueReading: Command[] =
    latest === undefined || latestChapterId === undefined
      ? []
      : [
          {
            id: 'recent-continue',
            label: `Continue reading ${latest.manga.canonicalTitle}`,
            section: 'Recent',
            keywords: ['continue', 'reading', 'resume', 'last', 'recent'],
            handler: () => openChapter(latestChapterId),
          },
        ];

  return [
    ...continueReading,
    ...items.map((item): Command => ({
      id: `recent-manga:${item.manga.id}`,
      label: `Open ${item.manga.canonicalTitle}`,
      section: 'Recent',
      keywords: ['recent', 'read', 'library', 'manga', 'open'],
      handler: () => openManga(item.manga.id),
    })),
  ];
}

export function buildProviderCommands(
  providers: readonly InstalledProviderSummary[],
  openProvider: (providerId: string) => void,
): Command[] {
  return providers.slice(0, PROVIDER_COMMAND_LIMIT).map((provider): Command => ({
    id: `provider:${provider.id}`,
    label: `Open ${provider.name}`,
    section: 'Extensions',
    keywords: ['provider', 'extension', 'source', 'open'],
    handler: () => openProvider(provider.id),
  }));
}

/**
 * Commands derived from local data: recently read library titles and installed
 * providers. Both read the local database through TanStack Query, so opening
 * the palette never calls a provider. `enabled` keeps mobile sessions and the
 * closed palette from reading at all.
 */
export function useLocalCommands(enabled: boolean): Command[] {
  const navigate = useNavigate();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const canQuery = enabled && dbStatus === 'ready' && db !== null;

  const recentQuery = useQuery({ ...recentLibraryQueryOptions(db!), enabled: canQuery });
  const providersQuery = useQuery({
    queryKey: extensionsQueryKeys.page(),
    queryFn: () => fetchExtensionsPage(db!),
    enabled: canQuery,
  });

  return [
    ...buildRecentCommands(
      recentQuery.data ?? [],
      (mangaId) => void navigate({ to: '/manga/$id', params: { id: mangaId } }),
      (chapterId) => void navigate({ to: '/reader/$chapterId', params: { chapterId } }),
    ),
    ...buildProviderCommands(providersQuery.data?.providers ?? [], (providerId) => {
      void navigate({ to: '/extensions/$providerId', params: { providerId } });
    }),
  ];
}
