import { payloadError } from './errors.js';

/** Narrow validators for the MangaDex endpoints this provider consumes. */

export interface MdRelationship {
  readonly type: string;
  readonly id: string;
  readonly attributes?: { readonly fileName?: string };
}

export interface MdMangaEntity {
  readonly id: string;
  readonly attributes: {
    readonly title: Readonly<Record<string, string>>;
    readonly altTitles?: readonly Readonly<Record<string, string>>[];
    readonly description?: Readonly<Record<string, string>> | string;
    readonly status?: string;
    readonly contentRating?: string;
    readonly tags?: readonly {
      readonly attributes?: { readonly name?: Readonly<Record<string, string>> };
    }[];
  };
  readonly relationships?: readonly MdRelationship[];
}

export interface MdChapterEntity {
  readonly id: string;
  readonly attributes: {
    readonly chapter?: string | null;
    readonly title?: string | null;
    readonly volume?: string | null;
    readonly translatedLanguage?: string;
    readonly publishAt?: string;
  };
}

export interface MdAtHome {
  readonly baseUrl: string;
  readonly hash: string;
  readonly data: readonly string[];
  readonly dataSaver: readonly string[];
}

function asRecord(value: unknown, endpoint: string, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw payloadError(endpoint, `"${field}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, endpoint: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw payloadError(endpoint, `"${field}" must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asArray(value: unknown, endpoint: string, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw payloadError(endpoint, `"${field}" must be an array`);
  }
  return value;
}

function asStringMap(value: unknown, endpoint: string, field: string): Readonly<Record<string, string>> {
  const record = asRecord(value, endpoint, field);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') {
      out[key] = entry;
    }
  }
  if (Object.keys(out).length === 0) {
    throw payloadError(endpoint, `"${field}" must contain at least one string entry`);
  }
  return out;
}

function parseRelationship(value: unknown, endpoint: string): MdRelationship {
  const record = asRecord(value, endpoint, 'relationship');
  const attributes = record['attributes'];
  const fileName =
    attributes === undefined ? undefined : asOptionalString(asRecord(attributes, endpoint, 'relationship.attributes')['fileName']);
  return {
    type: asString(record['type'], endpoint, 'relationship.type'),
    id: asString(record['id'], endpoint, 'relationship.id'),
    ...(fileName !== undefined ? { attributes: { fileName } } : {}),
  };
}

export function parseMangaEntity(value: unknown, endpoint: string): MdMangaEntity {
  const record = asRecord(value, endpoint, 'manga');
  const attributes = asRecord(record['attributes'], endpoint, 'manga.attributes');
  const title = asStringMap(attributes['title'], endpoint, 'manga.attributes.title');

  const altTitlesRaw = attributes['altTitles'];
  const altTitles =
    altTitlesRaw === undefined
      ? undefined
      : asArray(altTitlesRaw, endpoint, 'manga.attributes.altTitles').map((entry) =>
          asStringMap(entry, endpoint, 'manga.attributes.altTitles[]'),
        );

  const descriptionRaw = attributes['description'];
  let description: Readonly<Record<string, string>> | string | undefined;
  if (typeof descriptionRaw === 'string') {
    description = descriptionRaw;
  } else if (descriptionRaw !== undefined && descriptionRaw !== null) {
    description = asStringMap(descriptionRaw, endpoint, 'manga.attributes.description');
  }

  const relationshipsRaw = record['relationships'];
  const relationships =
    relationshipsRaw === undefined
      ? undefined
      : asArray(relationshipsRaw, endpoint, 'manga.relationships').map((entry) => parseRelationship(entry, endpoint));

  const tagsRaw = attributes['tags'];
  const tags =
    tagsRaw === undefined
      ? undefined
      : asArray(tagsRaw, endpoint, 'manga.attributes.tags').map((entry) => {
          const tag = asRecord(entry, endpoint, 'tag');
          const tagAttributes = tag['attributes'];
          if (tagAttributes === undefined) return {};
          const nameRaw = asRecord(tagAttributes, endpoint, 'tag.attributes')['name'];
          return nameRaw === undefined
            ? {}
            : { attributes: { name: asStringMap(nameRaw, endpoint, 'tag.attributes.name') } };
        });

  const status = asOptionalString(attributes['status']);
  const contentRating = asOptionalString(attributes['contentRating']);

  return {
    id: asString(record['id'], endpoint, 'manga.id'),
    attributes: {
      title,
      ...(altTitles !== undefined ? { altTitles } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(contentRating !== undefined ? { contentRating } : {}),
      ...(tags !== undefined ? { tags } : {}),
    },
    ...(relationships !== undefined ? { relationships } : {}),
  };
}

export interface MdCollection {
  readonly entities: readonly MdMangaEntity[];
  readonly total?: number;
}

export function parseCollectionResponse(json: unknown, endpoint: string): MdCollection {
  const record = asRecord(json, endpoint, 'response');
  const entities = asArray(record['data'], endpoint, 'data').map((entry) => parseMangaEntity(entry, endpoint));
  const total = record['total'];
  return {
    entities,
    ...(typeof total === 'number' ? { total } : {}),
  };
}

export function parseDetailResponse(json: unknown, endpoint: string): MdMangaEntity {
  const record = asRecord(json, endpoint, 'response');
  return parseMangaEntity(record['data'], endpoint);
}

export interface MdFeed {
  readonly chapters: readonly MdChapterEntity[];
}

export function parseFeedResponse(json: unknown, endpoint: string): MdFeed {
  const record = asRecord(json, endpoint, 'response');
  const chapters = asArray(record['data'], endpoint, 'data').map((entry) => {
    const chapter = asRecord(entry, endpoint, 'chapter');
    const attributes = asRecord(chapter['attributes'], endpoint, 'chapter.attributes');
    const translatedLanguage = asOptionalString(attributes['translatedLanguage']);
    const publishAt = asOptionalString(attributes['publishAt']);
    return {
      id: asString(chapter['id'], endpoint, 'chapter.id'),
      attributes: {
        chapter: typeof attributes['chapter'] === 'string' ? attributes['chapter'] : null,
        title: typeof attributes['title'] === 'string' ? attributes['title'] : null,
        volume: typeof attributes['volume'] === 'string' ? attributes['volume'] : null,
        ...(translatedLanguage !== undefined ? { translatedLanguage } : {}),
        ...(publishAt !== undefined ? { publishAt } : {}),
      },
    };
  });
  return { chapters };
}

export function parseAtHomeResponse(json: unknown, endpoint: string): MdAtHome {
  const record = asRecord(json, endpoint, 'response');
  const chapter = asRecord(record['chapter'], endpoint, 'chapter');
  const data = asArray(chapter['data'], endpoint, 'chapter.data').map((file, index) =>
    asString(file, endpoint, `chapter.data[${index}]`),
  );
  const dataSaverRaw = chapter['dataSaver'];
  const dataSaver =
    dataSaverRaw === undefined
      ? []
      : asArray(dataSaverRaw, endpoint, 'chapter.dataSaver').map((file, index) =>
          asString(file, endpoint, `chapter.dataSaver[${index}]`),
        );
  return {
    baseUrl: asString(record['baseUrl'], endpoint, 'baseUrl'),
    hash: asString(chapter['hash'], endpoint, 'chapter.hash'),
    data,
    dataSaver,
  };
}
