import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { LibraryFilter } from '@app/shared';
import { libraryEntries, mangaIdentities } from './schema.js';
import { foldTitleForSearch } from './title-fold.js';
import { TITLE_SEARCH_SQL_FUNCTION, TITLE_SORT_SQL_FUNCTION } from './sqlite-functions.js';

/** Below the engine's variable limit and the chunk size used by the read helpers. */
const ID_LIST_TUPLE_LIMIT = 500;

/**
 * A bound id list for `IN`. A short list stays a parameter tuple so SQLite can search the
 * index directly. A long one (a category or provider selection past the engine's variable
 * limit) is carried as one JSON parameter through `json_each`, so it cannot fail the
 * statement; only that rare path loses the index-search plan.
 */
function idList(ids: readonly string[]): SQL {
  if (ids.length <= ID_LIST_TUPLE_LIMIT) {
    return sql`(${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`;
  }
  return sql`(SELECT value FROM json_each(${JSON.stringify(ids)}))`;
}

/** Only the given titles; an empty list matches none. */
export function libraryEntryIdFilter(entryIds: readonly string[]): SQL {
  return entryIds.length === 0 ? sql`0` : sql`${libraryEntries.id} IN ${idList(entryIds)}`;
}

/** The search comparison text, computed by the lowercase function both drivers register. */
function foldedTitle(column: SQL): SQL {
  return sql`${sql.raw(TITLE_SEARCH_SQL_FUNCTION)}(${column})`;
}

/** The sort comparison text, accent-folded by the function both drivers register. */
export function sortableTitle(column: SQL): SQL {
  return sql`${sql.raw(TITLE_SORT_SQL_FUNCTION)}(${column})`;
}

/**
 * Every filter narrows the same row set and combines with the others. Category and
 * provider membership are id subqueries, so a title never repeats for two memberships
 * and the page stays a search on an index.
 *
 * The text query is a Unicode fold on both sides: SQLite's BINARY collation and ASCII-only
 * `lower()` used to miss "Éclair" from "éclair" and rank "Zebra" before "apple".
 */
export function libraryEntryFilter(filter: LibraryFilter | undefined): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter?.favoritesOnly === true) {
    conditions.push(sql`${libraryEntries.favorite} = 1`);
  }
  if (filter?.statuses !== undefined && filter.statuses.length > 0) {
    conditions.push(sql`${libraryEntries.status} IN ${idList(filter.statuses)}`);
  }
  if (filter?.categoryIds !== undefined && filter.categoryIds.length > 0) {
    // A membership set, not a per-row probe: the page searches entries by their primary key.
    conditions.push(sql`${libraryEntries.id} IN (
      SELECT membership.library_entry_id FROM library_category_memberships membership
      WHERE membership.category_id IN ${idList(filter.categoryIds)}
    )`);
  }
  if (filter?.providerIds !== undefined && filter.providerIds.length > 0) {
    conditions.push(sql`${libraryEntries.mangaId} IN (
      SELECT mapping.manga_id FROM manga_provider_mappings mapping
      WHERE mapping.provider_id IN ${idList(filter.providerIds)}
    )`);
  }
  const query = filter?.query?.trim() ?? '';
  if (query.length > 0) {
    const needle = foldTitleForSearch(query);
    conditions.push(sql`(
      instr(${foldedTitle(sql`${mangaIdentities.canonicalTitle}`)}, ${needle}) > 0
      OR EXISTS (
        SELECT 1 FROM manga_titles title
        WHERE title.manga_id = ${libraryEntries.mangaId}
          AND instr(${foldedTitle(sql`title.value`)}, ${needle}) > 0
      )
    )`);
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

/** The join every library query needs so the title filter and sort can see the identity. */
export const libraryIdentityJoin = eq(mangaIdentities.id, libraryEntries.mangaId);
