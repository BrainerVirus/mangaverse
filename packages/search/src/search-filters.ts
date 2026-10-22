import type { ContentRating, MangaIdentity, MangaTag } from '@app/shared';
import { z } from 'zod';

import type { SearchFilters, SearchSort } from './types.js';

const EXPLICIT_RATINGS: ReadonlySet<ContentRating> = new Set(['mature', 'explicit']);

const CONTENT_RATINGS = [
  'unknown',
  'safe',
  'suggestive',
  'mature',
  'explicit',
] as const satisfies readonly ContentRating[];

const searchFiltersSchema = z.object({
  providerId: z.string().min(1).exactOptional(),
  language: z.string().min(1).exactOptional(),
  includedTags: z.array(z.string()).exactOptional(),
  excludedTags: z.array(z.string()).exactOptional(),
  contentRating: z.enum(CONTENT_RATINGS).exactOptional(),
  sort: z.enum(['relevance', 'title', 'latest'] satisfies SearchSort[]).exactOptional(),
});

/** Saved-search filters travel through JSON, so they are parsed rather than trusted. */
export function parseSearchFilters(value: unknown): SearchFilters {
  const parsed = searchFiltersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** Comma-separated tag input, the shape the filter bar edits. */
export function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function primaryLanguage(value: string): string {
  return normalize(value).split(/[-_]/)[0] ?? '';
}

function tagMatches(tag: MangaTag, needle: string): boolean {
  const value = normalize(needle);
  return normalize(tag.label) === value || (tag.id !== undefined && normalize(tag.id) === value);
}

/**
 * Local, attribute-level filters. A missing attribute is treated as unknown and
 * kept: provider search items carry no tags, language or rating, and filtering
 * them out would hide results the provider did return.
 */
export function matchesSearchFilters(
  identity: MangaIdentity,
  filters: SearchFilters = {},
  explicitContent = false,
): boolean {
  if (!explicitContent && EXPLICIT_RATINGS.has(identity.contentRating)) {
    return false;
  }

  if (
    filters.contentRating !== undefined &&
    identity.contentRating !== 'unknown' &&
    identity.contentRating !== filters.contentRating
  ) {
    return false;
  }

  if (
    filters.language !== undefined &&
    identity.language !== undefined &&
    primaryLanguage(identity.language) !== primaryLanguage(filters.language)
  ) {
    return false;
  }

  if (identity.tags.length === 0) {
    return true;
  }

  const included = filters.includedTags ?? [];
  if (
    included.length > 0 &&
    !included.some((tag) => identity.tags.some((t) => tagMatches(t, tag)))
  ) {
    return false;
  }

  const excluded = filters.excludedTags ?? [];
  return !excluded.some((tag) => identity.tags.some((t) => tagMatches(t, tag)));
}

function latestTimestamp(identity: MangaIdentity): number {
  const value = identity.updatedAt ?? identity.createdAt;
  if (value === undefined) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortSearchResults(
  results: readonly MangaIdentity[],
  sort: SearchSort = 'relevance',
): MangaIdentity[] {
  if (sort === 'relevance') {
    return [...results];
  }
  if (sort === 'title') {
    return [...results].sort((a, b) => a.canonicalTitle.localeCompare(b.canonicalTitle));
  }
  return [...results].sort((a, b) => latestTimestamp(b) - latestTimestamp(a));
}

export function applySearchFilters(
  identities: readonly MangaIdentity[],
  filters: SearchFilters = {},
  explicitContent = false,
): MangaIdentity[] {
  return sortSearchResults(
    identities.filter((identity) => matchesSearchFilters(identity, filters, explicitContent)),
    filters.sort,
  );
}
