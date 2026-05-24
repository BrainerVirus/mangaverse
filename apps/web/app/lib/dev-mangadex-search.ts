import type { AppDrizzleDb } from '@app/db/browser';
import type { MangaDetailData } from '@app/library';
import type { MangaIdentity, MangaId, ProviderCapabilityKey, ProviderManifest } from '@app/shared';
import {
  toMangaId,
  toProviderId,
  toProviderMappingId,
  toProviderMangaId,
} from '@app/shared';

const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_PROVIDER_ID = toProviderId('mangadex');

export const DEV_MANGADEX_SECTION_PAGE_SIZE = 24;
export const DEV_MANGADEX_SECTION_PREVIEW_SIZE = 6;

export type DevMangaDexSectionId = 'popular' | 'latest' | 'recent';

export interface DevMangaDexSectionDefinition {
  readonly id: DevMangaDexSectionId;
  readonly title: string;
  readonly capability: ProviderCapabilityKey;
}

export const DEV_MANGADEX_SECTION_DEFINITIONS: readonly DevMangaDexSectionDefinition[] = [
  { id: 'popular', title: 'Popular', capability: 'discovery.popular' },
  { id: 'latest', title: 'Latest updates', capability: 'discovery.latest' },
  { id: 'recent', title: 'Recently added', capability: 'discovery.browse' },
];

export interface DevMangaDexSectionPage {
  readonly results: readonly MangaIdentity[];
  readonly hasMore: boolean;
  readonly offset: number;
}

interface MangaDexTitleMap {
  readonly [locale: string]: string;
}

interface MangaDexMangaAttributes {
  readonly title: MangaDexTitleMap;
  readonly description?: MangaDexTitleMap | string;
  readonly status?: string;
  readonly contentRating?: string;
  readonly tags?: readonly { readonly attributes?: { readonly name?: MangaDexTitleMap } }[];
}

interface MangaDexRelationship {
  readonly type: string;
  readonly id: string;
  readonly attributes?: { readonly fileName?: string };
}

interface MangaDexEntity {
  readonly id: string;
  readonly attributes: MangaDexMangaAttributes;
  readonly relationships?: readonly MangaDexRelationship[];
}

interface MangaDexSearchResponse {
  readonly data?: readonly MangaDexEntity[];
  readonly included?: readonly {
    readonly id: string;
    readonly attributes?: { readonly fileName?: string };
  }[];
}

function pickTitle(titleMap: MangaDexTitleMap): string {
  return titleMap.en ?? titleMap['ja-ro'] ?? titleMap.ja ?? Object.values(titleMap)[0] ?? 'Untitled';
}

/** MangaDex embeds cover filenames on relationships; included[] is often empty. */
export function resolveMangaDexCoverUrl(
  payload: MangaDexSearchResponse,
  manga: MangaDexEntity,
): string | undefined {
  const coverRel = manga.relationships?.find((rel) => rel.type === 'cover_art');
  if (!coverRel) return undefined;

  const fileName =
    coverRel.attributes?.fileName ??
    payload.included?.find((item) => item.id === coverRel.id)?.attributes?.fileName;
  if (!fileName) return undefined;

  return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
}

function mapContentRating(rating: string | undefined): MangaIdentity['contentRating'] {
  switch (rating) {
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

function mapStatus(status: string | undefined): MangaIdentity['status'] {
  switch (status) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function pickLocalizedText(value: MangaDexTitleMap | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return value.en ?? value['ja-ro'] ?? value.ja ?? Object.values(value)[0];
}

function buildMangaDexParams(
  includes: readonly string[],
  explicitContent: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const include of includes) {
    params.append('includes[]', include);
  }
  const ratings = explicitContent
    ? (['safe', 'suggestive', 'erotica', 'pornographic'] as const)
    : (['safe', 'suggestive'] as const);
  for (const rating of ratings) {
    params.append('contentRating[]', rating);
  }
  return params;
}

function applySectionOrdering(params: URLSearchParams, sectionId: DevMangaDexSectionId): void {
  switch (sectionId) {
    case 'popular':
      params.set('order[followedCount]', 'desc');
      break;
    case 'latest':
      params.set('order[latestUploadedChapter]', 'desc');
      break;
    case 'recent':
      params.set('order[createdAt]', 'desc');
      break;
  }
}

function toDevMangaIdentity(payload: MangaDexSearchResponse, manga: MangaDexEntity): MangaIdentity {
  const mappingId = toProviderMappingId(`dev-md-map-${manga.id}`);
  const title = pickTitle(manga.attributes.title);
  const coverImageUrl = resolveMangaDexCoverUrl(payload, manga);

  return {
    id: toMangaId(`dev-md-${manga.id}`),
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: mapStatus(manga.attributes.status),
    contentRating: mapContentRating(manga.attributes.contentRating),
    ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
    providerMappings: [
      {
        id: mappingId,
        providerId: MANGADEX_PROVIDER_ID,
        providerMangaId: toProviderMangaId(manga.id),
        providerTitle: title,
        providerUrl: `https://mangadex.org/title/${manga.id}`,
      },
    ],
    defaultProviderMappingId: mappingId,
    merged: false,
  };
}

export function getEnabledMangaDexSections(
  manifest: ProviderManifest,
): readonly DevMangaDexSectionDefinition[] {
  return DEV_MANGADEX_SECTION_DEFINITIONS.filter(
    (section) => manifest.capabilities[section.capability] === true,
  );
}

export function parseDevMangaDexId(mangaId: MangaId): string | null {
  const raw = String(mangaId);
  if (!raw.startsWith('dev-md-')) {
    return null;
  }
  return raw.slice('dev-md-'.length);
}

export function isDevMangaDexId(mangaId: MangaId): boolean {
  return parseDevMangaDexId(mangaId) !== null;
}

async function fetchMangaDexCollection(
  params: URLSearchParams,
  explicitContent: boolean,
): Promise<readonly MangaIdentity[]> {
  const response = await fetch(`${MANGADEX_API}/manga?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`MangaDex request failed (${response.status})`);
  }

  const payload = (await response.json()) as MangaDexSearchResponse;
  const results = (payload.data ?? []).map((entry) => toDevMangaIdentity(payload, entry));
  if (explicitContent) {
    return results;
  }
  return results.filter(
    (item) => item.contentRating !== 'explicit' && item.contentRating !== 'unknown',
  );
}

export async function fetchDevMangaDexSectionPage(
  sectionId: DevMangaDexSectionId,
  offset: number,
  limit: number,
  explicitContent = true,
): Promise<DevMangaDexSectionPage> {
  const params = buildMangaDexParams(['cover_art'], explicitContent);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  applySectionOrdering(params, sectionId);

  const results = await fetchMangaDexCollection(params, explicitContent);
  return {
    results,
    hasMore: results.length >= limit,
    offset,
  };
}

export async function fetchDevMangaDexSearchResults(
  query: string,
  explicitContent = true,
): Promise<readonly MangaIdentity[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const params = buildMangaDexParams(['cover_art'], explicitContent);
  params.set('title', trimmed);
  params.set('limit', '24');

  return fetchMangaDexCollection(params, explicitContent);
}

export async function fetchDevMangaDexDiscoverResults(
  explicitContent = true,
): Promise<readonly MangaIdentity[]> {
  const page = await fetchDevMangaDexSectionPage(
    'popular',
    0,
    DEV_MANGADEX_SECTION_PAGE_SIZE,
    explicitContent,
  );
  return page.results;
}

export async function fetchDevMangaDexPopularResults(
  limit = 12,
  explicitContent = true,
): Promise<readonly MangaIdentity[]> {
  const page = await fetchDevMangaDexSectionPage('popular', 0, limit, explicitContent);
  return page.results;
}

export async function fetchDevMangaDexLatestResults(
  limit = 12,
  explicitContent = true,
): Promise<readonly MangaIdentity[]> {
  const page = await fetchDevMangaDexSectionPage('latest', 0, limit, explicitContent);
  return page.results;
}

interface MangaDexDetailResponse {
  readonly data?: MangaDexEntity;
  readonly included?: readonly {
    readonly id: string;
    readonly attributes?: { readonly fileName?: string };
  }[];
}

export async function fetchDevMangaDetail(mangaId: MangaId): Promise<MangaDetailData | null> {
  const mangadexId = parseDevMangaDexId(mangaId);
  if (mangadexId === null) {
    return null;
  }

  const params = buildMangaDexParams(['cover_art', 'author', 'artist'], true);
  const response = await fetch(`${MANGADEX_API}/manga/${mangadexId}?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as MangaDexDetailResponse;
  const entity = payload.data;
  if (entity === undefined) {
    return null;
  }

  const listPayload: MangaDexSearchResponse = {
    data: [entity],
    ...(payload.included !== undefined ? { included: payload.included } : {}),
  };

  const identity = toDevMangaIdentity(listPayload, entity);
  const description = pickLocalizedText(entity.attributes.description);

  return {
    manga: {
      ...identity,
      ...(description !== undefined ? { description } : {}),
    },
    chapters: [],
    libraryEntry: undefined,
    continueChapterId: undefined,
  };
}

export async function isMangaDexInstalled(db: AppDrizzleDb): Promise<boolean> {
  const { listInstalledExtensions } = await import('@app/db/browser');
  const installed = await listInstalledExtensions(db);
  return installed.some((entry) => String(entry.manifest.id) === 'mangadex' && entry.enabled);
}

export async function getInstalledMangaDexManifest(
  db: AppDrizzleDb,
): Promise<ProviderManifest | null> {
  const { listInstalledExtensions } = await import('@app/db/browser');
  const installed = await listInstalledExtensions(db);
  const entry = installed.find(
    (item) => String(item.manifest.id) === 'mangadex' && item.enabled,
  );
  return entry?.manifest ?? null;
}
