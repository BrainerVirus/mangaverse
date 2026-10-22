import { describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import {
  toChapterId,
  toLibraryEntryId,
  toMangaId,
  toProviderMappingId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import { createSqlJsHarness, type SqlJsHarness } from '../testing/sqljs-harness.js';
import {
  addProviderMapping,
  createMangaIdentityWithInitialMapping,
  getMangaIdentity,
  setPreferredChapterSource,
} from './identities.js';
import {
  listIdentityMatchProfiles,
  mergeMangaIdentities,
  previewMergeMangaIdentities,
  previewUnmergeProviderMapping,
  unmergeProviderMapping,
} from './identity-merge.js';
import {
  addLibraryEntry,
  getLibraryEntryForManga,
  setLibraryEntryActiveProviderMapping,
} from './library.js';
import { upsertChapterWithPages } from './chapters.js';
import {
  appendReadingHistory,
  listChapterReadStatesForManga,
  listReadingHistory,
  upsertChapterReadState,
} from './read-state.js';

interface SeedIdentity {
  readonly id: string;
  readonly mappingId: string;
  readonly providerId: string;
  readonly providerMangaId: string;
  readonly title: string;
  readonly providerTitle?: string;
  readonly merged?: boolean;
  readonly mergedFromIds?: readonly string[];
  readonly userOverrides?: Record<string, unknown>;
  readonly description?: string;
  readonly coverImageUrl?: string;
  readonly createdAt?: string;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function seedIdentity(raw: Database, seed: SeedIdentity): void {
  raw.run(
    `INSERT INTO manga_identities
      (id, canonical_title, status, content_rating, description, cover_image_url, merged,
       merged_from_ids_json, user_overrides_json, default_provider_mapping_id, created_at, updated_at)
     VALUES (?, ?, 'ongoing', 'safe', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      seed.id,
      seed.title,
      seed.description ?? null,
      seed.coverImageUrl ?? null,
      seed.merged === true ? 1 : 0,
      seed.mergedFromIds === undefined ? null : JSON.stringify(seed.mergedFromIds),
      seed.userOverrides === undefined ? null : JSON.stringify(seed.userOverrides),
      seed.mappingId,
      seed.createdAt ?? '2026-01-01T00:00:00.000Z',
      seed.createdAt ?? '2026-01-01T00:00:00.000Z',
    ],
  );
  raw.run(
    `INSERT INTO manga_provider_mappings
      (id, manga_id, provider_id, provider_manga_id, provider_title)
     VALUES (?, ?, ?, ?, ?)`,
    [seed.mappingId, seed.id, seed.providerId, seed.providerMangaId, seed.providerTitle ?? null],
  );
}

function seedChapter(
  raw: Database,
  input: {
    readonly id: string;
    readonly mangaId: string;
    readonly mappingId: string;
    readonly providerId: string;
    readonly index: number;
    readonly title?: string;
    readonly updatedAt?: string;
  },
): void {
  raw.run(
    `INSERT INTO chapters
      (id, manga_id, provider_mapping_id, provider_id, provider_chapter_id, title,
       chapter_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.mangaId,
      input.mappingId,
      input.providerId,
      `${input.providerId}-${input.index}`,
      input.title ?? `Chapter ${input.index}`,
      input.index,
      '2026-01-01T00:00:00.000Z',
      input.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ],
  );
}

function seedReadState(
  raw: Database,
  input: {
    readonly chapterId: string;
    readonly mangaId: string;
    readonly mappingId: string;
    readonly completed: boolean;
    readonly readPercent?: number;
    readonly lastPageIndex?: number;
    readonly updatedAt: string;
  },
): void {
  raw.run(
    `INSERT INTO chapter_read_state
      (chapter_id, manga_id, provider_mapping_id, read_percent, last_page_index, completed, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.chapterId,
      input.mangaId,
      input.mappingId,
      input.readPercent ?? (input.completed ? 100 : 20),
      input.lastPageIndex ?? (input.completed ? 9 : 2),
      input.completed ? 1 : 0,
      '2026-01-01T00:00:00.000Z',
      input.updatedAt,
    ],
  );
}

function seedPage(raw: Database, chapterId: string, pageIndex: number): void {
  raw.run(
    `INSERT INTO chapter_pages (id, chapter_id, page_index, image_url)
     VALUES (?, ?, ?, ?)`,
    [
      `${chapterId}-page-${pageIndex}`,
      chapterId,
      pageIndex,
      `https://img/${chapterId}-${pageIndex}`,
    ],
  );
}

function seedCategory(raw: Database, id: string, name: string): void {
  raw.run('INSERT INTO categories (id, name) VALUES (?, ?)', [id, name]);
}

function seedMembership(raw: Database, entryId: string, categoryId: string): void {
  raw.run(
    'INSERT INTO library_category_memberships (library_entry_id, category_id) VALUES (?, ?)',
    [entryId, categoryId],
  );
}

function seedLibraryEntry(
  raw: Database,
  input: {
    readonly id: string;
    readonly mangaId: string;
    readonly favorite?: boolean;
    readonly status: string;
    readonly lastReadChapterId?: string;
    readonly activeMappingId?: string;
    readonly progressPercent?: number;
    readonly addedAt?: string;
    readonly updatedAt?: string;
  },
): void {
  raw.run(
    `INSERT INTO library_entries
      (id, manga_id, favorite, status, unread_count, last_read_chapter_id,
       active_provider_mapping_id, progress_percent, added_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.mangaId,
      input.favorite === true ? 1 : 0,
      input.status,
      input.lastReadChapterId ?? null,
      input.activeMappingId ?? null,
      input.progressPercent ?? null,
      input.addedAt ?? '2026-01-01T00:00:00.000Z',
      input.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ],
  );
}

function seedTracking(
  raw: Database,
  input: {
    readonly id: string;
    readonly mangaId: string;
    readonly service: string;
    readonly externalId: string;
  },
): void {
  raw.run(
    `INSERT INTO tracking_links (id, manga_id, service, external_id, external_url)
     VALUES (?, ?, ?, ?, ?)`,
    [input.id, input.mangaId, input.service, input.externalId, `https://track/${input.service}`],
  );
}

function seedTitle(raw: Database, mangaId: string, id: string, value: string): void {
  raw.run('INSERT INTO manga_titles (id, manga_id, value) VALUES (?, ?, ?)', [id, mangaId, value]);
}

function seedPerson(
  raw: Database,
  mangaId: string,
  id: string,
  kind: 'author' | 'artist',
  name: string,
): void {
  raw.run('INSERT INTO manga_people (id, manga_id, name, kind) VALUES (?, ?, ?, ?)', [
    id,
    mangaId,
    name,
    kind,
  ]);
}

function seedTag(raw: Database, mangaId: string, tagId: string, label: string): void {
  raw.run('INSERT INTO manga_tags (id, label) VALUES (?, ?) ON CONFLICT DO NOTHING', [
    tagId,
    label,
  ]);
  raw.run('INSERT INTO manga_tag_memberships (manga_id, tag_id) VALUES (?, ?)', [mangaId, tagId]);
}

async function bothIdentities(
  harness: SqlJsHarness,
): Promise<{ target: MangaId; source: MangaId }> {
  seedIdentity(harness.raw, {
    id: 'target',
    mappingId: 'target-mapping',
    providerId: 'alpha',
    providerMangaId: 'alpha-1',
    title: 'Kuro no Shoukanshi',
    coverImageUrl: 'https://covers/target.jpg',
    userOverrides: { coverImageUrl: 'https://covers/custom.jpg' },
  });
  seedIdentity(harness.raw, {
    id: 'source',
    mappingId: 'source-mapping',
    providerId: 'beta',
    providerMangaId: 'beta-1',
    title: 'Kuro no Shoukanshi',
    providerTitle: 'Kuro no Shoukanshi (Beta)',
    coverImageUrl: 'https://covers/source.jpg',
    userOverrides: { rating: 9 },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  return { target: toMangaId('target'), source: toMangaId('source') };
}

describe('mergeMangaIdentities', () => {
  it('Given two identities with library, chapters, read state, tracking and metadata, When merging, Then every child row lands on the target without loss', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);

    seedTitle(raw, 'target', 'title-target', 'Kuro no Shoukanshi (Alt)');
    seedTitle(raw, 'source', 'title-source', 'Dark Summoner');
    seedPerson(raw, 'target', 'person-t-author', 'author', 'Author One');
    seedPerson(raw, 'target', 'person-t-artist', 'artist', 'Artist One');
    seedPerson(raw, 'source', 'person-s-author-dup', 'author', 'Author One');
    seedPerson(raw, 'source', 'person-s-author-new', 'author', 'Author Two');
    seedPerson(raw, 'source', 'person-s-artist-dup', 'artist', 'Artist One');
    seedTag(raw, 'target', 'tag-1', 'Action');
    seedTag(raw, 'source', 'tag-1', 'Action');
    seedTag(raw, 'source', 'tag-2', 'Fantasy');
    seedTracking(raw, { id: 'track-t', mangaId: 'target', service: 'AniList', externalId: '1' });
    seedTracking(raw, {
      id: 'track-s-dup',
      mangaId: 'source',
      service: 'AniList',
      externalId: '1',
    });
    seedTracking(raw, { id: 'track-s-new', mangaId: 'source', service: 'MAL', externalId: '2' });

    seedChapter(raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
      title: 'Alpha chapter',
    });
    seedChapter(raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
      title: 'Beta chapter',
    });
    seedChapter(raw, {
      id: 'source-chapter-2',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 2,
      title: 'Beta chapter 2',
    });
    seedReadState(raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    seedCategory(raw, 'cat-a', 'Favorites');
    seedCategory(raw, 'cat-b', 'Ongoing');
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter-1',
      activeMappingId: 'target-mapping',
      progressPercent: 20,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      favorite: true,
      status: 'completed',
      lastReadChapterId: 'source-chapter-1',
      activeMappingId: 'source-mapping',
      progressPercent: 100,
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    seedMembership(raw, 'entry-target', 'cat-a');
    seedMembership(raw, 'entry-source', 'cat-b');

    raw.run(
      `INSERT INTO migration_history
        (id, source_provider_id, source_provider_manga_id, target_provider_id,
         target_provider_manga_id, manga_id, completed_at, previous_default_mapping_id)
       VALUES ('history-1', 'beta', 'beta-1', 'alpha', 'alpha-1', 'source', '2026-02-01T00:00:00.000Z', 'source-mapping')`,
    );
    raw.run(
      `INSERT INTO reading_history (id, manga_id, chapter_id, read_at, provider_mapping_id)
       VALUES ('history-read-1', 'source', 'source-chapter-1', '2026-03-01T00:00:00.000Z', 'source-mapping')`,
    );
    raw.run(
      `INSERT INTO cache_entries (id, provider_id, manga_id, chapter_id, cache_kind, last_access_at, byte_size)
       VALUES ('cache-1', 'beta', 'source', 'source-chapter-1', 'page', '2026-03-01T00:00:00.000Z', 10)`,
    );

    const result = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      movedMappings: 1,
      dedupedMappings: 0,
      movedChapters: 2,
      dedupedChapters: 0,
      libraryEntryAction: 'merged',
    });

    expect(await getMangaIdentity(db, source)).toBeUndefined();
    const merged = await getMangaIdentity(db, target);
    expect(merged).toBeDefined();
    if (merged === undefined) return;

    expect(merged.merged).toBe(true);
    expect(merged.mergedFromIds).toEqual([source]);
    expect(merged.defaultProviderMappingId).toBe('target-mapping');
    expect(sorted(merged.providerMappings.map((mapping) => mapping.providerId))).toEqual([
      'alpha',
      'beta',
    ]);
    expect(merged.alternativeTitles.map((title) => title.value)).toEqual(
      expect.arrayContaining(['Kuro no Shoukanshi (Alt)', 'Dark Summoner']),
    );
    expect(sorted(merged.authors.map((person) => person.name))).toEqual([
      'Author One',
      'Author Two',
    ]);
    expect(merged.artists.map((person) => person.name)).toEqual(['Artist One']);
    expect(sorted(merged.tags.map((tag) => tag.label))).toEqual(['Action', 'Fantasy']);
    expect(
      sorted((merged.trackingLinks ?? []).map((link) => `${link.service}:${link.externalId}`)),
    ).toEqual(['AniList:1', 'MAL:2']);
    expect(merged.userOverrides).toEqual({
      coverImageUrl: 'https://covers/custom.jpg',
      rating: 9,
    });
    expect(merged.coverImageUrl).toBe('https://covers/target.jpg');
    expect(merged.description).toBeUndefined();

    const entry = await getLibraryEntryForManga(db, target);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      favorite: true,
      status: 'completed',
      progressPercent: 100,
      lastReadChapterId: 'source-chapter-1',
      activeProviderMappingId: 'target-mapping',
    });
    expect(sorted(entry?.categoryIds ?? [])).toEqual(['cat-a', 'cat-b']);
    // Two chapters have no read state; the target's stored badge is recomputed.
    expect(entry?.unreadCount).toBe(2);

    const readStates = await listChapterReadStatesForManga(db, target);
    expect(readStates.map((state) => state.chapterId)).toEqual(['source-chapter-1']);
    expect(
      readStates.find((state) => state.chapterId === 'source-chapter-1')?.progress,
    ).toMatchObject({ completed: true, readPercent: 100 });
    const history = await listReadingHistory(db);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      mangaId: target,
      chapterId: 'source-chapter-1',
      providerMappingId: 'source-mapping',
    });
    const migrationRows = raw.exec('SELECT manga_id FROM migration_history')[0]?.values.flat();
    expect(migrationRows).toEqual(['target']);
    const cacheRows = raw.exec('SELECT manga_id FROM cache_entries')[0]?.values.flat();
    expect(cacheRows).toEqual(['target']);
    raw.close();
  });

  it('Given a duplicated provider mapping with colliding chapters, When merging, Then mappings and chapters dedupe while the newest read state and page data survive', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    // Unique remote ids normally stop this shape; legacy/restored rows may not.
    raw.run('DROP INDEX manga_provider_mappings_provider_remote_uidx');
    seedIdentity(raw, {
      id: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedIdentity(raw, {
      id: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedChapter(raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedPage(raw, 'target-chapter-1', 0);
    seedPage(raw, 'target-chapter-1', 1);
    seedReadState(raw, {
      chapterId: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      completed: false,
      readPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedChapter(raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedPage(raw, 'source-chapter-1', 0);
    seedPage(raw, 'source-chapter-1', 1);
    seedPage(raw, 'source-chapter-1', 2);
    seedReadState(raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    seedChapter(raw, {
      id: 'source-chapter-2',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      index: 2,
    });
    raw.run(
      `INSERT INTO reading_history (id, manga_id, chapter_id, read_at, provider_mapping_id)
       VALUES ('history-keep', 'target', 'target-chapter-1', '2026-01-01T00:00:00.000Z', 'target-mapping'),
              ('history-dup', 'source', 'source-chapter-1', '2026-01-01T00:00:00.000Z', 'source-mapping'),
              ('history-new', 'source', 'source-chapter-1', '2026-04-01T00:00:00.000Z', 'source-mapping')`,
    );

    const result = await mergeMangaIdentities(db, {
      targetId: toMangaId('target'),
      sourceId: toMangaId('source'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      movedMappings: 0,
      dedupedMappings: 1,
      movedChapters: 1,
      dedupedChapters: 1,
    });

    const merged = await getMangaIdentity(db, toMangaId('target'));
    expect(merged?.providerMappings).toHaveLength(1);
    expect(merged?.providerMappings[0]?.id).toBe('target-mapping');
    const chapterRows = raw.exec('SELECT id, provider_mapping_id FROM chapters ORDER BY id')[0]
      ?.values;
    expect(chapterRows).toEqual([
      ['source-chapter-2', 'target-mapping'],
      ['target-chapter-1', 'target-mapping'],
    ]);
    const state = raw.exec(
      "SELECT completed, read_percent FROM chapter_read_state WHERE chapter_id = 'target-chapter-1'",
    )[0]?.values[0];
    expect(state).toEqual([1, 100]);
    // The target already had pages, so the source copy is dropped with its chapter.
    const pageChapterIds = raw
      .exec('SELECT DISTINCT chapter_id FROM chapter_pages')[0]
      ?.values.flat();
    expect(pageChapterIds).toEqual(['target-chapter-1']);
    const history = raw.exec('SELECT id, manga_id, chapter_id FROM reading_history ORDER BY id')[0]
      ?.values;
    expect(history).toEqual([
      ['history-keep', 'target', 'target-chapter-1'],
      ['history-new', 'target', 'target-chapter-1'],
    ]);
    raw.close();
  });

  it('Given a collapsed duplicate chapter, When the target has no pages, Then pages and cache rows follow the kept chapter and cache duplicates are dropped', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    raw.run('DROP INDEX manga_provider_mappings_provider_remote_uidx');
    seedIdentity(raw, {
      id: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedIdentity(raw, {
      id: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedChapter(raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedReadState(raw, {
      chapterId: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      completed: false,
      readPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedChapter(raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedReadState(raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    seedPage(raw, 'source-chapter-1', 0);
    seedPage(raw, 'source-chapter-1', 1);
    raw.run(
      `INSERT INTO cache_entries
        (id, provider_id, manga_id, chapter_id, cache_kind, last_access_at, source_url, blob_key, byte_size)
       VALUES
        ('cache-keep', 'alpha', 'target', 'target-chapter-1', 'page', '2026-01-01T00:00:00.000Z', 'https://img/1', 'blob-1', 10),
        ('cache-dup', 'alpha', 'source', 'source-chapter-1', 'page', '2026-02-01T00:00:00.000Z', 'https://img/1', 'blob-1', 10),
        ('cache-extra', 'alpha', 'source', 'source-chapter-1', 'page', '2026-03-01T00:00:00.000Z', 'https://img/2', 'blob-2', 20),
        ('cache-meta', 'alpha', 'source', 'source-chapter-1', 'meta', '2026-03-01T00:00:00.000Z', NULL, NULL, 1)`,
    );

    const result = await mergeMangaIdentities(db, {
      targetId: toMangaId('target'),
      sourceId: toMangaId('source'),
    });
    expect(result.ok).toBe(true);

    // The target had no pages, so the source copy is adopted instead of deleted.
    const pageChapterIds = raw
      .exec('SELECT chapter_id FROM chapter_pages ORDER BY chapter_id')[0]
      ?.values.flat();
    expect(pageChapterIds).toEqual(['target-chapter-1', 'target-chapter-1']);
    // The newest real read event wins over the older target row.
    const state = raw.exec(
      "SELECT completed, read_percent FROM chapter_read_state WHERE chapter_id = 'target-chapter-1'",
    )[0]?.values[0];
    expect(state).toEqual([1, 100]);

    const cacheRows = raw.exec('SELECT id, manga_id, chapter_id FROM cache_entries ORDER BY id')[0]
      ?.values;
    expect(cacheRows).toEqual([
      ['cache-extra', 'target', 'target-chapter-1'],
      ['cache-keep', 'target', 'target-chapter-1'],
      ['cache-meta', 'target', 'target-chapter-1'],
    ]);
    const orphanCount = raw.exec(
      `SELECT count(*) FROM cache_entries
       LEFT JOIN chapters ON chapters.id = cache_entries.chapter_id
       WHERE cache_entries.chapter_id IS NOT NULL AND chapters.id IS NULL`,
    )[0]?.values[0]?.[0];
    expect(orphanCount).toBe(0);
    raw.close();
  });

  it('Given the source last read a chapter that collapses, When merging, Then the merged entry resumes the kept chapter', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    raw.run('DROP INDEX manga_provider_mappings_provider_remote_uidx');
    seedIdentity(raw, {
      id: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedIdentity(raw, {
      id: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      providerMangaId: 'same-remote',
      title: 'Duplicate series',
    });
    seedChapter(raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedReadState(raw, {
      chapterId: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      completed: false,
      readPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedChapter(raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedReadState(raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter-1',
      activeMappingId: 'target-mapping',
      progressPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      status: 'reading',
      lastReadChapterId: 'source-chapter-1',
      progressPercent: 100,
      updatedAt: '2026-04-01T00:00:00.000Z',
    });

    const result = await mergeMangaIdentities(db, {
      targetId: toMangaId('target'),
      sourceId: toMangaId('source'),
    });
    expect(result.ok).toBe(true);

    const entry = await getLibraryEntryForManga(db, toMangaId('target'));
    expect(entry).toMatchObject({
      lastReadChapterId: 'target-chapter-1',
      progressPercent: 100,
      activeProviderMappingId: 'target-mapping',
    });
    raw.close();
  });

  it('Given only one side read, When the other side was only edited more recently, Then the read progress survives in both directions', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedChapter(raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
    });
    seedReadState(raw, {
      chapterId: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      completed: false,
      readPercent: 35,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    seedReadState(raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    // Favorite/status edits bump updatedAt without reading anything.
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter-1',
      progressPercent: 35,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      favorite: true,
      status: 'completed',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const targetReads = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
    expect(targetReads.ok).toBe(true);
    const merged = await getLibraryEntryForManga(db, target);
    expect(merged).toMatchObject({
      lastReadChapterId: 'target-chapter-1',
      progressPercent: 35,
      favorite: true,
      status: 'completed',
    });
    raw.close();

    // Reverse direction: the source read, the target was only edited recently.
    const reverse = await createSqlJsHarness();
    const reverseIds = await bothIdentities(reverse);
    seedChapter(reverse.raw, {
      id: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(reverse.raw, {
      id: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
    });
    seedReadState(reverse.raw, {
      chapterId: 'target-chapter-1',
      mangaId: 'target',
      mappingId: 'target-mapping',
      completed: false,
      readPercent: 35,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    seedReadState(reverse.raw, {
      chapterId: 'source-chapter-1',
      mangaId: 'source',
      mappingId: 'source-mapping',
      completed: true,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    seedLibraryEntry(reverse.raw, {
      id: 'entry-target',
      mangaId: 'target',
      favorite: true,
      status: 'completed',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    seedLibraryEntry(reverse.raw, {
      id: 'entry-source',
      mangaId: 'source',
      status: 'reading',
      lastReadChapterId: 'source-chapter-1',
      progressPercent: 100,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    const sourceReads = await mergeMangaIdentities(reverse.db, {
      targetId: reverseIds.target,
      sourceId: reverseIds.source,
    });
    expect(sourceReads.ok).toBe(true);
    const reversed = await getLibraryEntryForManga(reverse.db, reverseIds.target);
    expect(reversed).toMatchObject({
      lastReadChapterId: 'source-chapter-1',
      progressPercent: 100,
      favorite: true,
      status: 'completed',
    });
    reverse.raw.close();
  });

  it('Given neither side read, When merging, Then the merged entry keeps no resume progress', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'planned',
      progressPercent: 40,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      status: 'completed',
      progressPercent: 60,
      updatedAt: '2026-05-01T00:00:00.000Z',
    });

    const result = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
    expect(result.ok).toBe(true);
    const entry = await getLibraryEntryForManga(db, target);
    expect(entry?.status).toBe('completed');
    expect(entry?.lastReadChapterId).toBeUndefined();
    expect(entry?.progressPercent).toBeUndefined();
    raw.close();
  });

  it('Given a write fails mid-merge, When the transaction rolls back, Then both identities and their children are untouched', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedChapter(raw, {
      id: 'target-chapter',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(raw, {
      id: 'source-chapter',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
    });
    seedLibraryEntry(raw, { id: 'entry-target', mangaId: 'target', status: 'reading' });
    seedLibraryEntry(raw, { id: 'entry-source', mangaId: 'source', status: 'completed' });
    raw.run(`CREATE TRIGGER fail_library_update BEFORE UPDATE ON library_entries
             BEGIN SELECT RAISE(ABORT, 'forced merge failure'); END`);

    const result = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
    expect(result).toMatchObject({ ok: false, error: { code: 'db.identity.merge_failed' } });

    expect((await getMangaIdentity(db, target))?.merged).toBe(false);
    expect(await getMangaIdentity(db, source)).toBeDefined();
    const mappingRows = raw.exec('SELECT id, manga_id FROM manga_provider_mappings ORDER BY id')[0]
      ?.values;
    expect(mappingRows).toEqual([
      ['source-mapping', 'source'],
      ['target-mapping', 'target'],
    ]);
    const chapterRows = raw.exec('SELECT id, manga_id FROM chapters ORDER BY id')[0]?.values;
    expect(chapterRows).toEqual([
      ['source-chapter', 'source'],
      ['target-chapter', 'target'],
    ]);
    const entryRows = raw.exec('SELECT id FROM library_entries ORDER BY id')[0]?.values.flat();
    expect(entryRows).toEqual(['entry-source', 'entry-target']);
    raw.close();
  });

  it('Given one identity already absorbed another, When merging a third, Then mergedFromIds appends without duplicates', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    raw.run(
      "UPDATE manga_identities SET merged = 1, merged_from_ids_json = '[\"old\"]' WHERE id = 'target'",
    );
    raw.run(
      'UPDATE manga_identities SET merged_from_ids_json = \'["old","older"]\' WHERE id = \'source\'',
    );

    const result = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
    expect(result.ok).toBe(true);
    const merged = await getMangaIdentity(db, target);
    expect(merged?.mergedFromIds).toEqual(['old', 'older', 'source']);
    raw.close();
  });
});

describe('previewMergeMangaIdentities', () => {
  it('Given two library titles on the same provider with different progress, When previewing, Then conflicts are warnings and merging stays possible', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    raw.run('DROP INDEX manga_provider_mappings_provider_remote_uidx');
    raw.run(
      "INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id) VALUES ('source-alpha', 'source', 'alpha', 'alpha-2')",
    );
    raw.run(
      "INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id) VALUES ('source-alpha-dup', 'source', 'alpha', 'alpha-1')",
    );
    seedChapter(raw, {
      id: 'target-chapter',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(raw, {
      id: 'source-chapter',
      mangaId: 'source',
      mappingId: 'source-alpha',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(raw, {
      id: 'source-chapter-dup',
      mangaId: 'source',
      mappingId: 'source-alpha-dup',
      providerId: 'alpha',
      index: 1,
    });
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter',
      progressPercent: 20,
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      status: 'completed',
      lastReadChapterId: 'source-chapter-dup',
      progressPercent: 100,
    });

    const preview = await previewMergeMangaIdentities(db, target, source);
    expect(preview.canMerge).toBe(true);
    expect(preview.duplicateMappingCount).toBe(1);
    expect(preview.duplicateChapterCount).toBe(1);
    expect(preview.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'identity.merge.both_in_library',
        'identity.merge.progress_differs',
        'identity.merge.same_provider',
        'identity.merge.duplicate_chapters',
      ]),
    );
    expect(preview.mappings.filter((mapping) => mapping.side === 'source')).toHaveLength(3);
    expect(preview.target.libraryEntry?.status).toBe('reading');
    expect(preview.source.libraryEntry?.favorite).toBe(false);

    const same = await previewMergeMangaIdentities(db, target, target);
    expect(same.canMerge).toBe(false);
    expect(same.issues.map((issue) => issue.code)).toContain('identity.merge.same_identity');
    raw.close();
  });

  it('Given both titles read different chapters, When previewing either direction, Then both warn that progress changes', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedChapter(raw, {
      id: 'target-chapter',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedChapter(raw, {
      id: 'source-chapter',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
    });
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter',
      progressPercent: 20,
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      status: 'reading',
      lastReadChapterId: 'source-chapter',
      progressPercent: 100,
    });

    const forward = await previewMergeMangaIdentities(db, target, source);
    const reverse = await previewMergeMangaIdentities(db, source, target);
    expect(forward.issues.map((issue) => issue.code)).toContain('identity.merge.progress_differs');
    expect(reverse.issues.map((issue) => issue.code)).toContain('identity.merge.progress_differs');
    raw.close();
  });

  it('Given only one title read, When the other was edited more recently, Then the preview does not warn about progress', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedChapter(raw, {
      id: 'target-chapter',
      mangaId: 'target',
      mappingId: 'target-mapping',
      providerId: 'alpha',
      index: 1,
    });
    seedLibraryEntry(raw, {
      id: 'entry-target',
      mangaId: 'target',
      status: 'reading',
      lastReadChapterId: 'target-chapter',
      progressPercent: 20,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedLibraryEntry(raw, {
      id: 'entry-source',
      mangaId: 'source',
      favorite: true,
      status: 'completed',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const forward = await previewMergeMangaIdentities(db, target, source);
    const reverse = await previewMergeMangaIdentities(db, source, target);
    expect(forward.issues.map((issue) => issue.code)).toContain('identity.merge.both_in_library');
    expect(forward.issues.map((issue) => issue.code)).not.toContain(
      'identity.merge.progress_differs',
    );
    expect(reverse.issues.map((issue) => issue.code)).not.toContain(
      'identity.merge.progress_differs',
    );
    raw.close();
  });
});

describe('unmergeProviderMapping', () => {
  async function mergedHarness(): Promise<{
    harness: SqlJsHarness;
    mangaId: MangaId;
    firstMapping: ProviderMappingId;
    secondMapping: ProviderMappingId;
  }> {
    const harness = await createSqlJsHarness();
    const { db } = harness;
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Split Me',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'alpha',
      providerMangaId: 'alpha-7',
    });
    if (!created.ok) throw new Error(created.error.message);
    const second = await addProviderMapping(db, {
      mangaId: created.value.mangaId,
      providerId: 'beta',
      providerMangaId: 'beta-7',
      providerTitle: 'Split Me (Beta)',
    });
    if (!second.ok) throw new Error(second.error.message);
    await setPreferredChapterSource(db, created.value.mangaId, second.value);
    harness.raw.run(
      'UPDATE manga_identities SET merged = 1, merged_from_ids_json = \'["source"]\' WHERE id = ?',
      [created.value.mangaId],
    );
    return {
      harness,
      mangaId: created.value.mangaId,
      firstMapping: created.value.mappingId,
      secondMapping: second.value,
    };
  }

  it('Given a merged title, When splitting one mapping, Then its chapters and read state move to a restored identity and the target keeps the rest', async () => {
    const { harness, mangaId, firstMapping, secondMapping } = await mergedHarness();
    const { db, raw } = harness;
    const first = await upsertChapterWithPages(db, {
      chapterId: toChapterId('first-chapter'),
      mangaId,
      providerMappingId: firstMapping,
      providerId: 'alpha',
      title: 'Alpha 1',
      index: 1,
      pages: [],
    });
    expect(first.ok).toBe(true);
    const second = await upsertChapterWithPages(db, {
      chapterId: toChapterId('second-chapter'),
      mangaId,
      providerMappingId: secondMapping,
      providerId: 'beta',
      title: 'Beta 1',
      index: 1,
      pages: [],
    });
    expect(second.ok).toBe(true);
    await upsertChapterReadState(db, {
      chapterId: toChapterId('first-chapter'),
      mangaId,
      providerMappingId: firstMapping,
      progress: {
        completed: true,
        readPercent: 100,
        lastPageIndex: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await upsertChapterReadState(db, {
      chapterId: toChapterId('second-chapter'),
      mangaId,
      providerMappingId: secondMapping,
      progress: {
        completed: false,
        readPercent: 40,
        lastPageIndex: 2,
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    });
    await appendReadingHistory(db, {
      mangaId,
      chapterId: toChapterId('second-chapter'),
      providerMappingId: secondMapping,
    });
    await addLibraryEntry(db, {
      mangaId,
      status: 'reading',
      id: toLibraryEntryId('entry'),
    });
    await setLibraryEntryActiveProviderMapping(db, toLibraryEntryId('entry'), secondMapping);
    raw.run(
      "UPDATE library_entries SET last_read_chapter_id = 'second-chapter', progress_percent = 40 WHERE id = 'entry'",
    );
    raw.run(
      "INSERT INTO tracking_links (id, manga_id, service, external_id) VALUES ('track', ?, 'AniList', '9')",
      [mangaId],
    );
    raw.run(
      `INSERT INTO cache_entries (id, provider_id, manga_id, chapter_id, cache_kind, last_access_at, byte_size)
       VALUES ('cache-split', 'beta', ?, 'second-chapter', 'page', '2026-03-01T00:00:00.000Z', 10)`,
      [mangaId],
    );

    const preview = await previewUnmergeProviderMapping(db, mangaId, secondMapping);
    expect(preview).toMatchObject({
      canUnmerge: true,
      chapterCount: 1,
      readChapterCount: 1,
      remainingMappingCount: 1,
      libraryActiveMappingWillChange: true,
      libraryLastReadWillChange: true,
    });
    expect(preview?.issues.map((issue) => issue.code)).toContain(
      'identity.unmerge.tracking_retained',
    );

    const result = await unmergeProviderMapping(db, { mangaId, mappingId: secondMapping });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      targetId: mangaId,
      newMangaId: 'source',
      movedChapters: 1,
      movedReadStates: 1,
      movedHistoryRows: 1,
      mergedCleared: true,
    });

    const target = await getMangaIdentity(db, mangaId);
    expect(target).toMatchObject({
      merged: false,
      defaultProviderMappingId: firstMapping,
      providerMappings: [{ id: firstMapping, providerId: 'alpha' }],
    });
    expect(target?.preferredChapterSourceId).toBeUndefined();
    expect(target?.mergedFromIds).toBeUndefined();

    const split = await getMangaIdentity(db, toMangaId('source'));
    expect(split).toMatchObject({
      canonicalTitle: 'Split Me (Beta)',
      merged: false,
      defaultProviderMappingId: secondMapping,
      providerMappings: [{ providerId: 'beta', providerMangaId: 'beta-7' }],
    });
    expect(split?.trackingLinks).toBeUndefined();
    expect(split?.userOverrides).toBeUndefined();
    expect(await getLibraryEntryForManga(db, toMangaId('source'))).toBeUndefined();

    const splitStates = await listChapterReadStatesForManga(db, toMangaId('source'));
    expect(splitStates.map((state) => state.chapterId)).toEqual(['second-chapter']);
    const splitHistory = await listReadingHistory(db);
    expect(splitHistory).toHaveLength(1);
    expect(splitHistory[0]).toMatchObject({
      mangaId: toMangaId('source'),
      chapterId: 'second-chapter',
    });

    const entry = await getLibraryEntryForManga(db, mangaId);
    expect(entry).toMatchObject({
      activeProviderMappingId: firstMapping,
      lastReadChapterId: 'first-chapter',
      progressPercent: 100,
      unreadCount: 0,
    });
    const targetStates = await listChapterReadStatesForManga(db, mangaId);
    expect(targetStates.map((state) => state.chapterId)).toEqual(['first-chapter']);
    const trackingRows = raw.exec('SELECT manga_id FROM tracking_links')[0]?.values.flat();
    expect(trackingRows).toEqual([mangaId]);
    const cacheRows = raw.exec('SELECT manga_id FROM cache_entries')[0]?.values.flat();
    expect(cacheRows).toEqual(['source']);
    raw.close();
  });

  it('Given the default source is split off, When unmerging, Then the kept title re-points default and active source at the remaining mapping', async () => {
    const { harness, mangaId, firstMapping, secondMapping } = await mergedHarness();
    const { db, raw } = harness;
    await addLibraryEntry(db, {
      mangaId,
      status: 'reading',
      id: toLibraryEntryId('entry'),
    });
    await setLibraryEntryActiveProviderMapping(db, toLibraryEntryId('entry'), firstMapping);

    expect((await getMangaIdentity(db, mangaId))?.defaultProviderMappingId).toBe(firstMapping);
    const preview = await previewUnmergeProviderMapping(db, mangaId, firstMapping);
    expect(preview?.canUnmerge).toBe(true);
    expect(preview?.libraryActiveMappingWillChange).toBe(true);

    const result = await unmergeProviderMapping(db, { mangaId, mappingId: firstMapping });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.newMangaId).toBe('source');

    const kept = await getMangaIdentity(db, mangaId);
    expect(kept?.defaultProviderMappingId).toBe(secondMapping);
    expect(kept?.preferredChapterSourceId).toBe(secondMapping);
    expect(kept?.providerMappings.map((mappingRow) => mappingRow.id)).toEqual([secondMapping]);

    const split = await getMangaIdentity(db, toMangaId('source'));
    expect(split?.defaultProviderMappingId).toBe(firstMapping);
    expect(split?.providerMappings.map((mappingRow) => mappingRow.id)).toEqual([firstMapping]);

    const entry = await getLibraryEntryForManga(db, mangaId);
    expect(entry?.activeProviderMappingId).toBe(secondMapping);
    raw.close();
  });

  it('Given two mappings joined by a merge, When merging and unmerging repeatedly, Then state round-trips without duplicate rows', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target, source } = await bothIdentities(harness);
    seedChapter(raw, {
      id: 'source-chapter',
      mangaId: 'source',
      mappingId: 'source-mapping',
      providerId: 'beta',
      index: 1,
    });

    for (let round = 0; round < 2; round += 1) {
      const merged = await mergeMangaIdentities(db, { targetId: target, sourceId: source });
      expect(merged.ok).toBe(true);
      const mergedIdentity = await getMangaIdentity(db, target);
      expect(mergedIdentity?.providerMappings).toHaveLength(2);
      expect(mergedIdentity?.mergedFromIds).toEqual([source]);

      const unmerged = await unmergeProviderMapping(db, {
        mangaId: target,
        mappingId: toProviderMappingId('source-mapping'),
      });
      expect(unmerged.ok).toBe(true);
      if (!unmerged.ok) return;
      expect(unmerged.value.newMangaId).toBe(source);
      const splitIdentity = await getMangaIdentity(db, source);
      expect(splitIdentity?.providerMappings).toHaveLength(1);
    }

    const rows = raw.exec('SELECT id, manga_id FROM manga_provider_mappings ORDER BY id')[0]
      ?.values;
    expect(rows).toEqual([
      ['source-mapping', 'source'],
      ['target-mapping', 'target'],
    ]);
    const chapters = raw.exec('SELECT id, manga_id FROM chapters')[0]?.values;
    expect(chapters).toEqual([['source-chapter', 'source']]);
    raw.close();
  });

  it('Given only one provider mapping, When unmerging it, Then both preview and write refuse', async () => {
    const harness = await createSqlJsHarness();
    const { db } = harness;
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Single',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'alpha',
      providerMangaId: 'single-1',
    });
    if (!created.ok) return;

    const preview = await previewUnmergeProviderMapping(
      db,
      created.value.mangaId,
      created.value.mappingId,
    );
    expect(preview?.canUnmerge).toBe(false);
    expect(preview?.issues.map((issue) => issue.code)).toContain('identity.unmerge.last_mapping');
    const result = await unmergeProviderMapping(db, {
      mangaId: created.value.mangaId,
      mappingId: created.value.mappingId,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'db.identity.unmerge_last_mapping' },
    });
  });
});

describe('listIdentityMatchProfiles', () => {
  it('Given identities with titles, people and mappings, When listing profiles, Then every relation is attached and no provider call is made', async () => {
    const harness = await createSqlJsHarness();
    const { raw, db } = harness;
    const { target } = await bothIdentities(harness);
    seedTitle(raw, 'target', 'title-target', 'Alt Title');
    seedPerson(raw, 'target', 'person-1', 'author', 'Author One');
    seedPerson(raw, 'target', 'person-2', 'artist', 'Artist One');

    const profiles = await listIdentityMatchProfiles(db);
    expect(profiles).toHaveLength(2);
    const profile = profiles.find((item) => item.mangaId === target);
    expect(profile).toEqual({
      mangaId: target,
      canonicalTitle: 'Kuro no Shoukanshi',
      titles: ['Kuro no Shoukanshi', 'Alt Title'],
      authors: ['Author One'],
      artists: ['Artist One'],
      providerIds: ['alpha'],
      merged: false,
    });
    raw.close();
  });
});
