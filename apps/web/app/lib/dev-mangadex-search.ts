import type { AppDrizzleDb } from '@app/db/browser';
import type { MangaIdentity } from '@app/shared';
import {
  toMangaId,
  toProviderId,
  toProviderMappingId,
  toProviderMangaId,
} from '@app/shared';

const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_PROVIDER_ID = toProviderId('mangadex');

interface MangaDexTitleMap {
  readonly [locale: string]: string;
}

interface MangaDexMangaAttributes {
  readonly title: MangaDexTitleMap;
}

interface MangaDexEntity {
  readonly id: string;
  readonly attributes: MangaDexMangaAttributes;
  readonly relationships?: readonly { readonly type: string; readonly id: string }[];
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

function resolveCoverUrl(payload: MangaDexSearchResponse, manga: MangaDexEntity): string | undefined {
  const coverRel = manga.relationships?.find((rel) => rel.type === 'cover_art');
  if (!coverRel) return undefined;
  const fileName = payload.included?.find((item) => item.id === coverRel.id)?.attributes?.fileName;
  if (!fileName) return undefined;
  return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
}

function toDevMangaIdentity(payload: MangaDexSearchResponse, manga: MangaDexEntity): MangaIdentity {
  const mappingId = toProviderMappingId(`dev-md-map-${manga.id}`);
  const title = pickTitle(manga.attributes.title);
  const coverImageUrl = resolveCoverUrl(payload, manga);

  return {
    id: toMangaId(`dev-md-${manga.id}`),
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'unknown',
    contentRating: 'unknown',
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

export async function isMangaDexInstalled(db: AppDrizzleDb): Promise<boolean> {
  const { listInstalledExtensions } = await import('@app/db/browser');
  const installed = await listInstalledExtensions(db);
  return installed.some((entry) => String(entry.manifest.id) === 'mangadex' && entry.enabled);
}

export async function fetchDevMangaDexSearchResults(query: string): Promise<readonly MangaIdentity[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const params = new URLSearchParams();
  params.set('title', trimmed);
  params.set('limit', '24');
  params.append('includes[]', 'cover_art');
  for (const rating of ['safe', 'suggestive', 'erotica', 'pornographic']) {
    params.append('contentRating[]', rating);
  }

  const response = await fetch(`${MANGADEX_API}/manga?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`MangaDex search failed (${response.status})`);
  }

  const payload = (await response.json()) as MangaDexSearchResponse;
  return (payload.data ?? []).map((entry) => toDevMangaIdentity(payload, entry));
}
