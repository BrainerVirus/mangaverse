import type { ContentRating, MangaTitle } from '@app/shared';
import { toProviderMangaId } from '@app/shared';
import type {
  ProviderChapter,
  ProviderDetails,
  ProviderPage,
  ProviderSearchResultItem,
  ProviderTag,
} from '@app/extensions-sdk';

import type { MdAtHome, MdChapterEntity, MdMangaEntity } from './schemas.js';

const COVER_BASE = 'https://uploads.mangadex.org/covers';

function pickFirst(map: Readonly<Record<string, string>>): string {
  return map['en'] ?? map['ja-ro'] ?? map['ja'] ?? Object.values(map)[0] ?? '';
}

function pickLocalized(map: Readonly<Record<string, string>>): string {
  return pickFirst(map) || 'Untitled';
}

function pickLocalizedOptional(
  value: Readonly<Record<string, string>> | string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  const picked = pickFirst(value);
  return picked.length > 0 ? picked : undefined;
}

function resolveCoverUrl(manga: MdMangaEntity): string | undefined {
  const relation = manga.relationships?.find((rel) => rel.type === 'cover_art');
  const fileName = relation?.attributes?.fileName;
  if (fileName === undefined) return undefined;
  return `${COVER_BASE}/${manga.id}/${fileName}.256.jpg`;
}

function mapContentRating(raw: string | undefined): ContentRating {
  switch (raw) {
    case 'safe':
      return 'safe';
    case 'suggestive':
      return 'suggestive';
    case 'erotica':
    case 'pornographic':
      return 'explicit';
    default:
      return 'unknown';
  }
}

export function toSearchItem(manga: MdMangaEntity): ProviderSearchResultItem {
  const coverUrl = resolveCoverUrl(manga);
  return {
    providerMangaId: toProviderMangaId(manga.id),
    title: pickLocalized(manga.attributes.title),
    ...(coverUrl !== undefined ? { coverUrl } : {}),
  };
}

function toTitles(manga: MdMangaEntity): readonly MangaTitle[] {
  const titles: MangaTitle[] = [];
  const seen = new Set<string>();
  const push = (locale: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) return;
    seen.add(trimmed);
    titles.push({ value: trimmed, locale });
  };

  for (const [locale, value] of Object.entries(manga.attributes.title)) {
    push(locale, value);
  }
  for (const alt of manga.attributes.altTitles ?? []) {
    for (const [locale, value] of Object.entries(alt)) {
      push(locale, value);
    }
  }
  return titles;
}

function toProviderTags(manga: MdMangaEntity): readonly ProviderTag[] {
  const tags: ProviderTag[] = [];
  for (const tag of manga.attributes.tags ?? []) {
    const name = tag.attributes?.name;
    if (name === undefined) continue;
    const label = pickLocalizedOptional(name);
    if (label === undefined) continue;
    tags.push({ id: label.toLowerCase(), label });
  }
  return tags;
}

export function toDetails(manga: MdMangaEntity): ProviderDetails {
  const description = pickLocalizedOptional(manga.attributes.description);
  const coverUrl = resolveCoverUrl(manga);
  const tags = toProviderTags(manga);
  return {
    providerMangaId: toProviderMangaId(manga.id),
    titles: toTitles(manga),
    ...(description !== undefined ? { description } : {}),
    ...(coverUrl !== undefined ? { coverUrl } : {}),
    contentRating: mapContentRating(manga.attributes.contentRating),
    ...(tags.length > 0 ? { tags } : {}),
  };
}

function formatChapterTitle(attributes: MdChapterEntity['attributes']): string {
  const chapterNumber = attributes.chapter?.trim();
  const chapterTitle = attributes.title?.trim();
  if (
    chapterNumber !== undefined &&
    chapterNumber.length > 0 &&
    chapterTitle !== undefined &&
    chapterTitle.length > 0
  ) {
    return `Ch. ${chapterNumber} - ${chapterTitle}`;
  }
  if (chapterTitle !== undefined && chapterTitle.length > 0) {
    return chapterTitle;
  }
  if (chapterNumber !== undefined && chapterNumber.length > 0) {
    return `Chapter ${chapterNumber}`;
  }
  return 'Chapter';
}

/**
 * Maps feed entities to chapters. Unreadable entries (`pages: 0`) are dropped —
 * they cannot be opened — and duplicate chapter indices are collapsed because
 * the app stores one chapter per (provider mapping, index).
 */
export function toChapters(
  entities: readonly MdChapterEntity[],
  fallbackStart = 1,
): readonly ProviderChapter[] {
  const sorted = entities
    .filter((entity) => (entity.attributes.pages ?? 1) > 0)
    .map((entity, offset) => {
      const parsed = Number.parseFloat(entity.attributes.chapter ?? '');
      const publishedAt = entity.attributes.publishAt;
      return {
        id: entity.id,
        title: formatChapterTitle(entity.attributes),
        index: Number.isFinite(parsed) ? parsed : fallbackStart + offset,
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      } satisfies ProviderChapter;
    })
    .sort((a, b) => a.index - b.index);

  const seenIndices = new Set<number>();
  return sorted.filter((chapter) => {
    if (seenIndices.has(chapter.index)) return false;
    seenIndices.add(chapter.index);
    return true;
  });
}

/**
 * Builds page URLs. When the requested quality is `data-saver` but the chapter
 * has no saver renditions, both the folder and the filenames fall back to the
 * original data rendition together — mixing a saver folder with data filenames
 * would produce broken URLs.
 */
export function toPages(atHome: MdAtHome, quality: 'data' | 'data-saver'): readonly ProviderPage[] {
  const useSaver = quality === 'data-saver' && atHome.dataSaver.length > 0;
  const folder = useSaver ? 'data-saver' : 'data';
  const files = useSaver ? atHome.dataSaver : atHome.data;
  return files.map((file, index) => ({
    index,
    imageUrl: `${atHome.baseUrl}/${folder}/${atHome.hash}/${file}`,
  }));
}
