import type { ProviderChapter, ProviderDetails, ProviderSearchResultItem } from '@app/extensions-sdk';
import type { MangaDetailData } from '@app/library';
import type { Chapter, MangaIdentity } from '@app/shared';
import { toProviderId, toProviderMangaId, toProviderMappingId } from '@app/shared';

import { toMangadexAppChapterId, toMangadexAppMangaId } from './mangadex-ids.js';

const MANGADEX_PROVIDER_ID = toProviderId('mangadex');

function buildMapping(mangadexMangaId: string, providerTitle: string) {
  return {
    id: toProviderMappingId(`dev-md-map-${mangadexMangaId}`),
    providerId: MANGADEX_PROVIDER_ID,
    providerMangaId: toProviderMangaId(mangadexMangaId),
    providerTitle,
    providerUrl: `https://mangadex.org/title/${mangadexMangaId}`,
  } as const;
}

/** Maps a provider search item to the app's canonical manga identity shape. */
export function providerItemToMangaIdentity(item: ProviderSearchResultItem): MangaIdentity {
  const mangadexMangaId = String(item.providerMangaId);
  const mapping = buildMapping(mangadexMangaId, item.title);
  return {
    id: toMangadexAppMangaId(mangadexMangaId),
    canonicalTitle: item.title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'unknown',
    contentRating: 'unknown',
    ...(item.coverUrl !== undefined ? { coverImageUrl: item.coverUrl } : {}),
    providerMappings: [mapping],
    defaultProviderMappingId: mapping.id,
    merged: false,
  };
}

export function providerDetailsToMangaIdentity(
  mangadexMangaId: string,
  details: ProviderDetails,
): MangaIdentity {
  const canonicalTitle = details.titles[0]?.value ?? 'Untitled';
  const mapping = buildMapping(mangadexMangaId, canonicalTitle);
  return {
    id: toMangadexAppMangaId(mangadexMangaId),
    canonicalTitle,
    alternativeTitles: details.titles.slice(1).map((title) => ({
      value: title.value,
      ...(title.locale !== undefined ? { locale: title.locale } : {}),
    })),
    authors: [],
    artists: [],
    tags: (details.tags ?? []).map((tag) => ({ id: tag.id, label: tag.label })),
    status: 'unknown',
    contentRating: details.contentRating ?? 'unknown',
    ...(details.description !== undefined ? { description: details.description } : {}),
    ...(details.coverUrl !== undefined ? { coverImageUrl: details.coverUrl } : {}),
    providerMappings: [mapping],
    defaultProviderMappingId: mapping.id,
    merged: false,
  };
}

export function providerChapterToChapter(
  mangadexMangaId: string,
  chapter: ProviderChapter,
): Chapter {
  return {
    id: toMangadexAppChapterId(chapter.id),
    mangaId: toMangadexAppMangaId(mangadexMangaId),
    providerId: MANGADEX_PROVIDER_ID,
    providerChapterId: chapter.id,
    title: chapter.title,
    index: chapter.index,
    ...(chapter.publishedAt !== undefined ? { publishedAt: chapter.publishedAt } : {}),
    pages: [],
  };
}

export function buildMangaDetailData(
  mangadexMangaId: string,
  details: ProviderDetails,
  chapters: readonly ProviderChapter[],
): MangaDetailData {
  const manga = providerDetailsToMangaIdentity(mangadexMangaId, details);
  const mappedChapters = chapters.map((chapter) => providerChapterToChapter(mangadexMangaId, chapter));
  return {
    manga,
    chapters: mappedChapters,
    libraryEntry: undefined,
    continueChapterId: mappedChapters[0]?.id,
  } satisfies MangaDetailData;
}
