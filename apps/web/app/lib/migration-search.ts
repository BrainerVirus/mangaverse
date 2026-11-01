import { z } from 'zod';
import { MIGRATION_BATCH_LIMIT, type MigrationHandoffError } from '@/features/migration/index.js';

const MIGRATION_SOURCES_LIMIT = 50;

export interface MigrationSearch {
  readonly ids?: readonly string[];
  readonly sources?: readonly string[];
  /** Manga-detail prefill (`/migration?source=<provider>`). */
  readonly source?: string;
  readonly handoffError?: MigrationHandoffError;
  /** Titles in an over-limit link; shown in the rejection message. */
  readonly handoffIdCount?: number;
}

type ParsedIds =
  | { readonly status: 'absent' }
  | { readonly status: 'ok'; readonly ids: readonly string[] }
  | { readonly status: 'invalid' }
  | { readonly status: 'too-many'; readonly count: number };
/**
 * Reads one repeatable id list. Unlike the old lenient parser, anything that is
 * not a list of non-empty strings is reported instead of silently widening the
 * batch, and an over-limit list is never truncated.
 */
function parseIds(value: unknown, limit: number): ParsedIds {
  if (value === undefined) return { status: 'absent' };
  if (!Array.isArray(value)) return { status: 'invalid' };

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') return { status: 'invalid' };
    const id = entry.trim();
    if (id.length === 0) return { status: 'invalid' };
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  if (ids.length === 0) return { status: 'invalid' };
  if (ids.length > limit) return { status: 'too-many', count: ids.length };
  return { status: 'ok', ids };
}

/** Parses the library hand-off, flagging bad or oversized links as errors. */
export function parseMigrationSearch(search: Record<string, unknown>): MigrationSearch {
  const ids = parseIds(search['ids'], MIGRATION_BATCH_LIMIT);
  const sources = parseIds(search['sources'], MIGRATION_SOURCES_LIMIT);

  if (ids.status === 'too-many') {
    return { handoffError: 'too-many', handoffIdCount: ids.count };
  }
  if (ids.status === 'invalid' || sources.status === 'invalid' || sources.status === 'too-many') {
    return { handoffError: 'invalid' };
  }

  // A repeated `?source=` arrives as an array; reject it instead of letting Zod
  // fail the route and hide the friendly handoff notice.
  const rawSource = search['source'];
  if (rawSource !== undefined && typeof rawSource !== 'string') {
    return { handoffError: 'invalid' };
  }
  const source = rawSource?.trim() ?? '';

  return {
    ...(ids.status === 'ok' ? { ids: ids.ids } : {}),
    ...(sources.status === 'ok' ? { sources: sources.ids } : {}),
    ...(source.length > 0 ? { source } : {}),
  };
}

export const migrationSearchSchema = z
  .object({
    ids: z.unknown().optional(),
    sources: z.unknown().optional(),
    // Parsed by `parseMigrationSearch`: a repeated `?source=` is an array, not a string.
    source: z.unknown().optional(),
  })
  .transform((search) => parseMigrationSearch(search));
