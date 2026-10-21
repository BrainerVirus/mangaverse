import * as z from 'zod';

import { payloadError } from './errors.js';

/**
 * Zod schemas for the MangaDex endpoints this provider consumes. A mismatch is
 * payload drift: it throws `payloadError(endpoint, detail)`, never an empty result.
 *
 * Every schema rebuilds its output so absent optional fields stay absent
 * (`exactOptionalPropertyTypes`) and locale maps keep only their string entries,
 * exactly as the hand-rolled validators did.
 *
 * Ruling (2026-10-17): the standard runtime parser, not `z.compile()`. CSP does
 * not forbid AOT; under the Electron production CSP `z.compile()` silently
 * returns the schema uncompiled, so its ~7 KB bundle cost is paid with no
 * speedup. See the ledger ruling on `feat/mangadex-zod-schemas` before switching.
 */

interface MdRelationship {
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
    /** Page count; 0 marks an unreadable/external entry on MangaDex. */
    readonly pages?: number;
  };
}

export interface MdAtHome {
  readonly baseUrl: string;
  readonly hash: string;
  readonly data: readonly string[];
  readonly dataSaver: readonly string[];
}

export interface MdCollection {
  readonly entities: readonly MdMangaEntity[];
  readonly total?: number;
}

export interface MdFeed {
  readonly chapters: readonly MdChapterEntity[];
}

/** A locale map: a plain object with at least one string entry. */
function hasStringEntry(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).some((entry) => typeof entry === 'string')
  );
}

/** Keeps only the string entries; the check already proved there is one. */
function toStringMap(value: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

const nonEmptyStringMap = z.custom<Readonly<Record<string, string>>>(hasStringEntry, {
  error: 'must contain at least one string entry',
});

/** Optional text: absent, null, empty and non-string all collapse to "not there". */
const optionalString = z
  .unknown()
  .optional()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined));

const relationshipSchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
    attributes: z.object({ fileName: z.unknown().optional() }).optional(),
  })
  .transform((raw): MdRelationship => {
    const fileName = raw.attributes?.fileName;
    return {
      type: raw.type,
      id: raw.id,
      ...(typeof fileName === 'string' && fileName.length > 0 ? { attributes: { fileName } } : {}),
    };
  });

/** A plain-string tag name is malformed and must be rejected, not dropped. */
const tagSchema = z
  .object({
    attributes: z.object({ name: nonEmptyStringMap.optional() }).optional(),
  })
  .transform((raw): NonNullable<MdMangaEntity['attributes']['tags']>[number] => {
    const name = raw.attributes?.name;
    return name === undefined ? {} : { attributes: { name: toStringMap(name) } };
  });

/** Null means "no description"; a string and a non-empty locale map both count. */
const descriptionSchema = z.custom<Readonly<Record<string, string>> | string | null>(
  (value) => value === null || typeof value === 'string' || hasStringEntry(value),
  { error: 'must be a string or a locale map with at least one string entry' },
);

const mangaEntitySchema = z
  .object({
    id: z.string().min(1),
    attributes: z.object({
      title: nonEmptyStringMap,
      altTitles: z.array(nonEmptyStringMap).optional(),
      description: descriptionSchema.optional(),
      status: optionalString,
      contentRating: optionalString,
      tags: z.array(tagSchema).optional(),
    }),
    relationships: z.array(relationshipSchema).optional(),
  })
  .transform((raw): MdMangaEntity => {
    const { title, altTitles, description, status, contentRating, tags } = raw.attributes;
    return {
      id: raw.id,
      attributes: {
        title: toStringMap(title),
        ...(altTitles !== undefined ? { altTitles: altTitles.map(toStringMap) } : {}),
        ...(description !== undefined && description !== null
          ? {
              description: typeof description === 'string' ? description : toStringMap(description),
            }
          : {}),
        ...(status !== undefined ? { status } : {}),
        ...(contentRating !== undefined ? { contentRating } : {}),
        ...(tags !== undefined ? { tags } : {}),
      },
      ...(raw.relationships !== undefined ? { relationships: raw.relationships } : {}),
    };
  });

const chapterEntitySchema = z
  .object({
    id: z.string().min(1),
    attributes: z
      .object({
        // Chapter/title/volume coerce to null on any non-string; MangaDex sends nulls.
        chapter: z
          .unknown()
          .optional()
          .transform((value) => (typeof value === 'string' ? value : null)),
        title: z
          .unknown()
          .optional()
          .transform((value) => (typeof value === 'string' ? value : null)),
        volume: z
          .unknown()
          .optional()
          .transform((value) => (typeof value === 'string' ? value : null)),
        translatedLanguage: optionalString,
        publishAt: optionalString,
        // A non-number page count is dropped, not rejected — same as the old validator.
        pages: z
          .unknown()
          .optional()
          .transform((value) => (typeof value === 'number' ? value : undefined)),
      })
      .transform((raw): MdChapterEntity['attributes'] => {
        const { chapter, title, volume, translatedLanguage, publishAt, pages } = raw;
        return {
          chapter,
          title,
          volume,
          ...(translatedLanguage !== undefined ? { translatedLanguage } : {}),
          ...(publishAt !== undefined ? { publishAt } : {}),
          ...(pages !== undefined ? { pages } : {}),
        };
      }),
  })
  .transform((raw): MdChapterEntity => ({ id: raw.id, attributes: raw.attributes }));

const collectionSchema = z
  .object({
    data: z.array(mangaEntitySchema),
    // A non-number total is dropped, not rejected — same as the old validator.
    total: z
      .unknown()
      .optional()
      .transform((value) => (typeof value === 'number' ? value : undefined)),
  })
  .transform((raw): MdCollection => ({
    entities: raw.data,
    ...(raw.total !== undefined ? { total: raw.total } : {}),
  }));

const detailSchema = z
  .object({ data: mangaEntitySchema })
  .transform((raw): MdMangaEntity => raw.data);

const feedSchema = z
  .object({ data: z.array(chapterEntitySchema) })
  .transform((raw): MdFeed => ({ chapters: raw.data }));

const atHomeSchema = z
  .object({
    baseUrl: z.string().min(1),
    chapter: z.object({
      hash: z.string().min(1),
      data: z.array(z.string().min(1)),
      dataSaver: z.array(z.string().min(1)).default([]),
    }),
  })
  .transform((raw): MdAtHome => ({
    baseUrl: raw.baseUrl,
    hash: raw.chapter.hash,
    data: raw.chapter.data,
    dataSaver: raw.chapter.dataSaver,
  }));

/** Names the first failing field; message wording is not part of the contract. */
function detailOf(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'payload does not match the expected shape';
  const path = issue.path.join('.');
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

function parseWith<T extends z.ZodType>(schema: T, value: unknown, endpoint: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw payloadError(endpoint, detailOf(result.error));
  }
  return result.data;
}

export function parseCollectionResponse(json: unknown, endpoint: string): MdCollection {
  return parseWith(collectionSchema, json, endpoint);
}

export function parseDetailResponse(json: unknown, endpoint: string): MdMangaEntity {
  return parseWith(detailSchema, json, endpoint);
}

export function parseFeedResponse(json: unknown, endpoint: string): MdFeed {
  return parseWith(feedSchema, json, endpoint);
}

export function parseAtHomeResponse(json: unknown, endpoint: string): MdAtHome {
  return parseWith(atHomeSchema, json, endpoint);
}
