// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Database, SqlValue } from 'sql.js';
import { toCategoryId, toProviderId, type LibrarySort } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { getLibraryChapterStats } from './library-activity.js';
import {
  listLibraryContinueReading,
  listLibraryEntryPage,
  listLibraryRecentlyUpdated,
} from './library.js';

// The query budget from docs/overhaul/06-local-data-and-downloads.md, on the seeded
// dataset: 1,000 library titles and 200,000 chapters. Every key page query is planned
// with `EXPLAIN QUERY PLAN` and fails on an unindexed scan of the two large tables.

const TITLES = 1_000;
const CHAPTERS_PER_TITLE = 200;

interface CapturedStatement {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

/** sql.js prepares each statement then binds its parameters; both are recorded here. */
function captureStatements(
  raw: Database,
  run: () => Promise<unknown>,
): Promise<CapturedStatement[]> {
  const captured: CapturedStatement[] = [];
  const prepare = raw.prepare.bind(raw);
  raw.prepare = ((sql: string) => {
    const statement = prepare(sql);
    const bind = statement.bind.bind(statement);
    (statement as unknown as { bind: (params?: SqlValue[]) => unknown }).bind = (
      params?: SqlValue[],
    ) => {
      if (/^(select|with)/i.test(sql.trim())) captured.push({ sql, params: params ?? [] });
      return bind(params);
    };
    return statement;
  }) as typeof raw.prepare;
  return run().then(() => {
    raw.prepare = prepare;
    return captured;
  });
}

interface PlanRow {
  readonly detail: string;
}

function explain(raw: Database, statement: CapturedStatement): PlanRow[] {
  const prepared = raw.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`);
  prepared.bind([...statement.params]);
  const rows: PlanRow[] = [];
  while (prepared.step()) rows.push({ detail: String(prepared.getAsObject().detail ?? '') });
  prepared.free();
  return rows;
}

function planText(plan: readonly PlanRow[]): string {
  return plan.map((row) => row.detail).join(' | ');
}

function seedDataset(raw: Database): void {
  const n = (count: number) =>
    `WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x < ${count - 1})`;
  raw.run(`
    ${n(TITLES)}
    INSERT INTO manga_identities
      (id, canonical_title, status, content_rating, merged, default_provider_mapping_id, created_at, updated_at)
    SELECT 'manga-' || printf('%04d', x), 'Title ' || printf('%04d', x), 'ongoing', 'safe', 0,
           'mapping-' || printf('%04d', x), '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
    FROM n;
    ${n(TITLES)}
    INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id)
    SELECT 'mapping-' || printf('%04d', x), 'manga-' || printf('%04d', x),
           CASE x % 3 WHEN 0 THEN 'prov-a' WHEN 1 THEN 'prov-b' ELSE 'prov-c' END,
           'remote-' || x
    FROM n;
    ${n(TITLES)}
    INSERT INTO library_entries
      (id, manga_id, favorite, status, unread_count, added_at, updated_at, progress_percent,
       last_read_chapter_id)
    SELECT 'entry-' || printf('%04d', x), 'manga-' || printf('%04d', x),
           CASE WHEN x % 5 = 0 THEN 1 ELSE 0 END,
           CASE x % 4 WHEN 0 THEN 'reading' WHEN 1 THEN 'completed' WHEN 2 THEN 'on_hold' ELSE 'planned' END,
           (x * 37) % ${CHAPTERS_PER_TITLE},
           printf('2026-01-%02dT%02d:00:00.000Z', (x % 28) + 1, x % 24),
           printf('2026-02-%02dT%02d:00:00.000Z', (x % 28) + 1, x % 24),
           CASE WHEN x % 7 = 0 THEN NULL ELSE x % 101 END,
           CASE WHEN x % 20 = 0 THEN 'chapter-' || (x * ${CHAPTERS_PER_TITLE}) ELSE NULL END
    FROM n;
    INSERT INTO categories (id, name) VALUES ('category-a', 'Action');
    ${n(TITLES)}
    INSERT INTO library_category_memberships (library_entry_id, category_id)
    SELECT 'entry-' || printf('%04d', x), 'category-a' FROM n WHERE x % 4 = 0;
    ${n(TITLES * CHAPTERS_PER_TITLE)}
    INSERT INTO chapters (id, manga_id, provider_mapping_id, title, chapter_index)
    SELECT 'chapter-' || x,
           'manga-' || printf('%04d', x / ${CHAPTERS_PER_TITLE}),
           'mapping-' || printf('%04d', x / ${CHAPTERS_PER_TITLE}),
           'Chapter ' || (x % ${CHAPTERS_PER_TITLE}),
           x % ${CHAPTERS_PER_TITLE}
    FROM n;
    ${n((TITLES * CHAPTERS_PER_TITLE) / 10)}
    INSERT INTO chapter_read_state
      (chapter_id, manga_id, read_percent, last_page_index, completed, updated_at)
    SELECT 'chapter-' || (x * 10),
           'manga-' || printf('%04d', (x * 10) / ${CHAPTERS_PER_TITLE}),
           1, 0, 1,
           printf('2026-03-%02dT%02d:00:00.000Z', (x % 28) + 1, x % 24)
    FROM n;
    ANALYZE;
  `);
}

const SORTS: LibrarySort[] = (
  ['title', 'date_added', 'last_updated', 'last_read', 'unread', 'progress', 'provider'] as const
).flatMap((key) => [
  { key, direction: 'asc' } as LibrarySort,
  { key, direction: 'desc' } as LibrarySort,
]);

describe('library page query plans', () => {
  it(
    'Given 1000 titles and 200000 chapters, Then every key page query uses an index',
    { timeout: 120_000 },
    async () => {
      const { db, raw } = await createSqlJsHarness();
      seedDataset(raw);

      const cases: {
        readonly name: string;
        readonly query: Parameters<typeof listLibraryEntryPage>[1];
      }[] = [
        ...SORTS.map((sort) => ({
          name: `${sort.key}:${sort.direction}`,
          query: { sort, limit: 200 },
        })),
        {
          name: 'favorites',
          query: { filter: { favoritesOnly: true }, limit: 200 },
        },
        {
          name: 'status',
          query: { filter: { statuses: ['reading', 'completed'] }, limit: 200 },
        },
        {
          name: 'category',
          query: { filter: { categoryIds: [toCategoryId('category-a')] }, limit: 200 },
        },
        {
          name: 'provider',
          query: { filter: { providerIds: [toProviderId('prov-b')] }, limit: 200 },
        },
        {
          name: 'query',
          query: { filter: { query: 'title 04' }, limit: 200 },
        },
        {
          name: 'page two',
          query: { sort: { key: 'date_added', direction: 'desc' }, limit: 200, offset: 200 },
        },
      ];

      for (const { name, query } of cases) {
        const captured = await captureStatements(raw, () => listLibraryEntryPage(db, query));
        const page = captured.find(
          (statement) =>
            /from "library_entries"/i.test(statement.sql) && /limit/i.test(statement.sql),
        );
        const count = captured.find(
          (statement) =>
            /count\(\*\)/i.test(statement.sql) && /from "library_entries"/i.test(statement.sql),
        );
        const chapterStats = captured.filter((statement) => /from "chapters"/i.test(statement.sql));

        expect({ name, page: page !== undefined, count: count !== undefined }).toEqual({
          name,
          page: true,
          count: true,
        });
        const pagePlan = planText(explain(raw, page!));
        const countPlan = planText(explain(raw, count!));

        // The 200,000-row table is never scanned: a page reads only its own titles.
        for (const statement of chapterStats) {
          const plan = planText(explain(raw, statement));
          expect({ name, plan, scansChapters: /SCAN chapters(?!\s+USING)/.test(plan) }).toEqual({
            name,
            plan,
            scansChapters: false,
          });
          console.log(`${name}: chapter stats: ${plan}`);
        }

        // A structured filter searches an index instead of walking library_entries. A text
        // query is a substring match, and an unfiltered list is read once by definition.
        const indexSearchRequired = query.filter !== undefined && query.filter.query === undefined;
        expect({
          name,
          pagePlan,
          searches: indexSearchRequired
            ? /SEARCH (le|library_entries)/.test(pagePlan) &&
              /SEARCH (le|library_entries)/.test(countPlan)
            : true,
        }).toEqual({ name, pagePlan, searches: true });

        console.log(`${name}: ${pagePlan}`);
      }
    },
  );

  it(
    'Given 1000 titles, Then pages are stable, gap-free and bounded',
    { timeout: 120_000 },
    async () => {
      const { db, raw } = await createSqlJsHarness();
      seedDataset(raw);

      for (const sort of [
        { key: 'date_added', direction: 'desc' },
        { key: 'title', direction: 'asc' },
      ] as LibrarySort[]) {
        const started = performance.now();
        const first = await listLibraryEntryPage(db, { sort, limit: 200 });
        const firstPageMs = performance.now() - started;
        expect(first.total).toBe(TITLES);
        expect(first.items).toHaveLength(200);
        // The first page never loads the library: 200 rows, not 1,000.
        expect(first.items.length).toBeLessThan(first.total);
        console.log(`${sort.key}: first page ${firstPageMs.toFixed(1)}ms`);

        const collected = first.items.map((entry) => entry.id);
        for (let offset = 200; offset < TITLES; offset += 200) {
          const page = await listLibraryEntryPage(db, { sort, limit: 200, offset });
          collected.push(...page.items.map((entry) => entry.id));
        }
        expect(collected).toHaveLength(TITLES);
        expect(new Set(collected).size).toBe(TITLES);
      }

      // A filtered total is the count query's answer, independent of the page size.
      const filtered = await listLibraryEntryPage(db, {
        filter: { favoritesOnly: true },
        limit: 7,
      });
      expect(filtered.items).toHaveLength(7);
      expect(filtered.total).toBe(TITLES / 5);
    },
  );

  it(
    'Given 1000 titles and 200000 chapters, Then the overview reads only the selected rows',
    { timeout: 120_000 },
    async () => {
      const { db, raw } = await createSqlJsHarness();
      seedDataset(raw);

      const load = async () => {
        const [continueReading, recentlyUpdated] = await Promise.all([
          listLibraryContinueReading(db, { limit: 6 }),
          listLibraryRecentlyUpdated(db, { limit: 8 }),
        ]);
        const unique = new Map(
          [...continueReading, ...recentlyUpdated].map((entry) => [entry.id, entry]),
        );
        await getLibraryChapterStats(db, [...unique.values()]);
        return { continueReading, recentlyUpdated };
      };

      const captured = await captureStatements(raw, load);
      const result = await load();
      expect(result.continueReading.length).toBeGreaterThan(0);
      expect(result.continueReading.length).toBeLessThanOrEqual(6);
      expect(result.recentlyUpdated.length).toBeGreaterThan(0);
      expect(result.recentlyUpdated.length).toBeLessThanOrEqual(8);

      const chapterReads = captured.filter((statement) =>
        /from\s+"?chapters"?/i.test(statement.sql),
      );
      expect(chapterReads.length).toBeGreaterThan(0);
      for (const statement of chapterReads) {
        // The whole-library pass passed chunked manga ids (up to 500); a bounded
        // overview asks for chapter stats on at most both shelves (14 rows).
        expect({ sql: statement.sql, bounded: statement.params.length <= 32 }).toEqual({
          sql: statement.sql,
          bounded: true,
        });
        const plan = planText(explain(raw, statement));
        expect({ plan, scans: /SCAN chapters(?!\s+USING)/.test(plan) }).toEqual({
          plan,
          scans: false,
        });
      }

      // A per-entry stats read would issue one statement per entry (14 here), not one.
      const shelfEntries = new Map(
        [...result.continueReading, ...result.recentlyUpdated].map((entry) => [entry.id, entry]),
      );
      const statsCapture = await captureStatements(raw, () =>
        getLibraryChapterStats(db, [...shelfEntries.values()]),
      );
      const statsChapterReads = statsCapture.filter((statement) =>
        /from\s+"?chapters"?/i.test(statement.sql),
      );
      expect(statsChapterReads).toHaveLength(1);

      const timings: number[] = [];
      for (let run = 0; run < 5; run += 1) {
        const started = performance.now();
        await load();
        timings.push(performance.now() - started);
      }
      timings.sort((a, b) => a - b);
      const median = timings[Math.floor(timings.length / 2)] ?? 0;
      // Report-only: spec 06 measures timing budgets on the reference machine and CI
      // records query plans only. On 2026-11-04 the same commit measured a 164.4 ms
      // median on an ubuntu-latest runner and 23.9 ms locally, with no code change.
      console.log(
        `overview median ${median.toFixed(1)}ms (${timings.map((t) => t.toFixed(1)).join(', ')})`,
      );
    },
  );
});
