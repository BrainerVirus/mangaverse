import { and, eq, inArray } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  normalizeTitleForMatch,
  ok,
  toChapterId,
  toMangaId,
  toProviderMappingId,
  type ChapterId,
  type LibraryStatus,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { withTransaction } from '../transactions.js';
import {
  cacheEntries,
  chapterPages,
  chapterReadState,
  chapters,
  libraryCategoryMemberships,
  libraryEntries,
  mangaIdentities,
  mangaPeople,
  mangaProviderMappings,
  mangaTagMemberships,
  mangaTitles,
  migrationHistory,
  readingHistory,
  trackingLinks,
} from '../schema.js';
import { getMangaIdentity } from './identities.js';

function newId(): string {
  return crypto.randomUUID();
}

function optionalText(value: string | null | undefined): string | undefined {
  return value !== null && value !== undefined && value !== '' ? value : undefined;
}

function mappingKey(providerId: string, providerMangaId: string): string {
  return `${providerId}\u0000${providerMangaId}`;
}

function chapterKey(mappingId: string, index: number): string {
  return `${mappingId}\u0000${index}`;
}

/** Identity of a cached artifact on a chapter, used to collapse duplicate rows. */
function cacheEntryKey(row: {
  readonly providerId: string;
  readonly cacheKind: string;
  readonly sourceUrl: string | null;
  readonly blobKey: string | null;
}): string {
  return `${row.providerId}\u0000${row.cacheKind}\u0000${row.sourceUrl ?? ''}\u0000${row.blobKey ?? ''}`;
}

function mergedFromIdsOf(row: typeof mangaIdentities.$inferSelect): string[] {
  return row.mergedFromIdsJson === null ? [] : [...row.mergedFromIdsJson];
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Duplicate candidates (local reads only; providers are never called)
// ---------------------------------------------------------------------------

export interface IdentityMatchProfile {
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  readonly titles: readonly string[];
  readonly authors: readonly string[];
  readonly artists: readonly string[];
  readonly providerIds: readonly string[];
  readonly merged: boolean;
}

/** Lightweight identity read for duplicate scoring, four queries for the whole DB. */
export async function listIdentityMatchProfiles(db: AppDrizzleDb): Promise<IdentityMatchProfile[]> {
  const rows = db
    .select({
      id: mangaIdentities.id,
      canonicalTitle: mangaIdentities.canonicalTitle,
      merged: mangaIdentities.merged,
    })
    .from(mangaIdentities)
    .all();
  if (rows.length === 0) return [];

  const titles = db
    .select({ mangaId: mangaTitles.mangaId, value: mangaTitles.value })
    .from(mangaTitles)
    .all();
  const people = db
    .select({ mangaId: mangaPeople.mangaId, name: mangaPeople.name, kind: mangaPeople.kind })
    .from(mangaPeople)
    .all();
  const mappings = db
    .select({
      mangaId: mangaProviderMappings.mangaId,
      providerId: mangaProviderMappings.providerId,
    })
    .from(mangaProviderMappings)
    .all();

  const titlesByManga = new Map<string, string[]>();
  for (const row of titles) {
    const list = titlesByManga.get(row.mangaId);
    if (list === undefined) titlesByManga.set(row.mangaId, [row.value]);
    else list.push(row.value);
  }
  const authorsByManga = new Map<string, string[]>();
  const artistsByManga = new Map<string, string[]>();
  for (const row of people) {
    const target = row.kind === 'author' ? authorsByManga : artistsByManga;
    const list = target.get(row.mangaId);
    if (list === undefined) target.set(row.mangaId, [row.name]);
    else list.push(row.name);
  }
  const providersByManga = new Map<string, string[]>();
  for (const row of mappings) {
    const list = providersByManga.get(row.mangaId);
    if (list === undefined) providersByManga.set(row.mangaId, [row.providerId]);
    else list.push(row.providerId);
  }

  return rows.map((row) => ({
    mangaId: toMangaId(row.id),
    canonicalTitle: row.canonicalTitle,
    titles: [row.canonicalTitle, ...(titlesByManga.get(row.id) ?? [])],
    authors: authorsByManga.get(row.id) ?? [],
    artists: artistsByManga.get(row.id) ?? [],
    providerIds: [...new Set(providersByManga.get(row.id) ?? [])],
    merged: row.merged,
  }));
}

// ---------------------------------------------------------------------------
// Merge preview
// ---------------------------------------------------------------------------

export type MergePreviewSeverity = 'info' | 'warning' | 'error';

export interface MergePreviewIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: MergePreviewSeverity;
}

export interface MergeSideLibraryEntry {
  readonly id: string;
  readonly status: LibraryStatus;
  readonly favorite: boolean;
  readonly categoryIds: readonly string[];
  readonly unreadCount: number;
  readonly progressPercent?: number;
  readonly lastReadChapterId?: ChapterId;
  readonly updatedAt?: string;
}

export interface MergeSidePreview {
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  readonly merged: boolean;
  readonly providerIds: readonly string[];
  readonly mappingCount: number;
  readonly chapterCount: number;
  readonly readChapterCount: number;
  readonly trackingLinkCount: number;
  readonly trackingLinks?: readonly string[];
  readonly hasUserOverrides: boolean;
  readonly coverImageUrl?: string;
  readonly defaultProviderMappingId: ProviderMappingId;
  readonly preferredChapterSourceId?: ProviderMappingId;
  readonly libraryEntry?: MergeSideLibraryEntry;
}

export interface MergeMappingPreview {
  readonly id: ProviderMappingId;
  readonly providerId: string;
  readonly providerMangaId: string;
  readonly providerTitle?: string;
  readonly side: 'target' | 'source';
  readonly action: 'keep' | 'move' | 'dedupe';
  readonly isTargetDefault: boolean;
  readonly isSourceDefault: boolean;
  readonly isTargetPreferred: boolean;
  readonly isSourcePreferred: boolean;
}

export interface MergePreview {
  readonly target: MergeSidePreview;
  readonly source: MergeSidePreview;
  readonly mappings: readonly MergeMappingPreview[];
  readonly duplicateMappingCount: number;
  readonly duplicateChapterCount: number;
  readonly resultDefaultMappingId?: ProviderMappingId;
  readonly resultPreferredMappingId?: ProviderMappingId;
  readonly canMerge: boolean;
  readonly issues: readonly MergePreviewIssue[];
}

async function readMergeSide(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<MergeSidePreview | undefined> {
  const manga = await getMangaIdentity(db, mangaId);
  if (manga === undefined) return undefined;

  const chapterRows = db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.mangaId, mangaId))
    .all();
  const readChapterCount =
    chapterRows.length === 0
      ? 0
      : db
          .select({ completed: chapterReadState.completed })
          .from(chapterReadState)
          .where(eq(chapterReadState.mangaId, mangaId))
          .all()
          .filter((row) => row.completed).length;

  const entryRow = db
    .select()
    .from(libraryEntries)
    .where(eq(libraryEntries.mangaId, mangaId))
    .get();
  const categoryIds =
    entryRow === undefined
      ? []
      : db
          .select({ categoryId: libraryCategoryMemberships.categoryId })
          .from(libraryCategoryMemberships)
          .where(eq(libraryCategoryMemberships.libraryEntryId, entryRow.id))
          .all()
          .map((row) => row.categoryId);

  const libraryEntry: MergeSideLibraryEntry | undefined =
    entryRow === undefined
      ? undefined
      : {
          id: entryRow.id,
          status: entryRow.status as LibraryStatus,
          favorite: entryRow.favorite,
          categoryIds,
          unreadCount: entryRow.unreadCount,
          ...(entryRow.progressPercent !== null && entryRow.progressPercent !== undefined
            ? { progressPercent: entryRow.progressPercent }
            : {}),
          ...(optionalText(entryRow.lastReadChapterId) !== undefined
            ? { lastReadChapterId: toChapterId(entryRow.lastReadChapterId as string) }
            : {}),
          ...(optionalText(entryRow.updatedAt) !== undefined
            ? { updatedAt: entryRow.updatedAt as string }
            : {}),
        };

  return {
    mangaId,
    canonicalTitle: manga.canonicalTitle,
    merged: manga.merged,
    providerIds: [...new Set(manga.providerMappings.map((mapping) => mapping.providerId))],
    mappingCount: manga.providerMappings.length,
    chapterCount: chapterRows.length,
    readChapterCount,
    trackingLinkCount: manga.trackingLinks?.length ?? 0,
    ...(manga.trackingLinks !== undefined && manga.trackingLinks.length > 0
      ? {
          trackingLinks: manga.trackingLinks.map((link) => `${link.service}:${link.externalId}`),
        }
      : {}),
    hasUserOverrides: manga.userOverrides !== undefined,
    ...(manga.coverImageUrl !== undefined ? { coverImageUrl: manga.coverImageUrl } : {}),
    defaultProviderMappingId: manga.defaultProviderMappingId,
    ...(manga.preferredChapterSourceId !== undefined
      ? { preferredChapterSourceId: manga.preferredChapterSourceId }
      : {}),
    ...(libraryEntry !== undefined ? { libraryEntry } : {}),
  };
}

function emptySide(mangaId: MangaId): MergeSidePreview {
  return {
    mangaId,
    canonicalTitle: '',
    merged: false,
    providerIds: [],
    mappingCount: 0,
    chapterCount: 0,
    readChapterCount: 0,
    trackingLinkCount: 0,
    hasUserOverrides: false,
    defaultProviderMappingId: toProviderMappingId(''),
  };
}

/** Stored progress that a merge could keep or discard; undefined means none. */
function progressSignature(entry: MergeSideLibraryEntry | undefined): string | undefined {
  if (entry === undefined) return undefined;
  const chapterId = optionalText(entry.lastReadChapterId);
  if (chapterId === undefined && entry.progressPercent === undefined) return undefined;
  return `${chapterId ?? ''}\u0000${entry.progressPercent ?? ''}`;
}

export async function previewMergeMangaIdentities(
  db: AppDrizzleDb,
  targetId: MangaId,
  sourceId: MangaId,
): Promise<MergePreview> {
  const issues: MergePreviewIssue[] = [];
  const target = await readMergeSide(db, targetId);
  const source = await readMergeSide(db, sourceId);

  if (target === undefined || source === undefined) {
    issues.push({
      code: 'identity.merge.missing',
      message: 'One of the selected titles no longer exists.',
      severity: 'error',
    });
  }
  if (targetId === sourceId) {
    issues.push({
      code: 'identity.merge.same_identity',
      message: 'A title cannot be merged with itself.',
      severity: 'error',
    });
  }
  if (source !== undefined && source.mappingCount === 0) {
    issues.push({
      code: 'identity.merge.source_has_no_mappings',
      message: 'The title being merged has no provider source to move.',
      severity: 'error',
    });
  }

  const targetMappings =
    target === undefined
      ? []
      : db
          .select()
          .from(mangaProviderMappings)
          .where(eq(mangaProviderMappings.mangaId, targetId))
          .all();
  const sourceMappings =
    source === undefined
      ? []
      : db
          .select()
          .from(mangaProviderMappings)
          .where(eq(mangaProviderMappings.mangaId, sourceId))
          .all();
  const targetByKey = new Map(
    targetMappings.map((mapping) => [
      mappingKey(mapping.providerId, mapping.providerMangaId),
      mapping,
    ]),
  );
  const dedupeRemap = new Map<string, string>();
  for (const mapping of sourceMappings) {
    const existing = targetByKey.get(mappingKey(mapping.providerId, mapping.providerMangaId));
    if (existing !== undefined) dedupeRemap.set(mapping.id, existing.id);
  }

  const mappings: MergeMappingPreview[] = [
    ...targetMappings.map((mapping) => ({
      id: toProviderMappingId(mapping.id),
      providerId: mapping.providerId,
      providerMangaId: mapping.providerMangaId,
      ...(optionalText(mapping.providerTitle) !== undefined
        ? { providerTitle: mapping.providerTitle as string }
        : {}),
      side: 'target' as const,
      action: 'keep' as const,
      isTargetDefault: mapping.id === target?.defaultProviderMappingId,
      isSourceDefault: false,
      isTargetPreferred: mapping.id === target?.preferredChapterSourceId,
      isSourcePreferred: false,
    })),
    ...sourceMappings.map((mapping) => ({
      id: toProviderMappingId(mapping.id),
      providerId: mapping.providerId,
      providerMangaId: mapping.providerMangaId,
      ...(optionalText(mapping.providerTitle) !== undefined
        ? { providerTitle: mapping.providerTitle as string }
        : {}),
      side: 'source' as const,
      action: dedupeRemap.has(mapping.id) ? ('dedupe' as const) : ('move' as const),
      isTargetDefault: false,
      isSourceDefault: mapping.id === source?.defaultProviderMappingId,
      isTargetPreferred: false,
      isSourcePreferred: mapping.id === source?.preferredChapterSourceId,
    })),
  ];

  const targetChapterKeys = new Set(
    target === undefined
      ? []
      : db
          .select({ providerMappingId: chapters.providerMappingId, index: chapters.chapterIndex })
          .from(chapters)
          .where(eq(chapters.mangaId, targetId))
          .all()
          .map((row) => chapterKey(row.providerMappingId, row.index)),
  );
  const duplicateChapterCount =
    source === undefined
      ? 0
      : db
          .select({ providerMappingId: chapters.providerMappingId, index: chapters.chapterIndex })
          .from(chapters)
          .where(eq(chapters.mangaId, sourceId))
          .all()
          .filter((row) =>
            targetChapterKeys.has(
              chapterKey(
                dedupeRemap.get(row.providerMappingId) ?? row.providerMappingId,
                row.index,
              ),
            ),
          ).length;

  if (target?.libraryEntry !== undefined && source?.libraryEntry !== undefined) {
    issues.push({
      code: 'identity.merge.both_in_library',
      message: 'Both titles are in your library. Their categories and favorite are combined.',
      severity: 'warning',
    });
    const targetProgress = progressSignature(target.libraryEntry);
    const sourceProgress = progressSignature(source.libraryEntry);
    const targetHasRead = optionalText(target.libraryEntry.lastReadChapterId) !== undefined;
    const sourceHasRead = optionalText(source.libraryEntry.lastReadChapterId) !== undefined;
    // Warn whenever stored progress is discarded: differing values, or a
    // percentage with no chapter to resume from (the merged entry drops it).
    const progressDiffers =
      (targetProgress !== undefined &&
        sourceProgress !== undefined &&
        targetProgress !== sourceProgress) ||
      (!targetHasRead &&
        !sourceHasRead &&
        (targetProgress !== undefined || sourceProgress !== undefined));
    if (progressDiffers) {
      issues.push({
        code: 'identity.merge.progress_differs',
        message:
          'Reading progress differs between these titles. The most recent read event is kept.',
        severity: 'warning',
      });
    }
  }

  const sharedProviders = (target?.providerIds ?? []).filter((providerId) =>
    (source?.providerIds ?? []).includes(providerId),
  );
  if (sharedProviders.length > 0) {
    issues.push({
      code: 'identity.merge.same_provider',
      message: `Both titles have a source on ${sharedProviders.join(', ')}. Both sources are kept.`,
      severity: 'warning',
    });
  }
  if (duplicateChapterCount > 0) {
    issues.push({
      code: 'identity.merge.duplicate_chapters',
      message: `${duplicateChapterCount} chapter${duplicateChapterCount === 1 ? '' : 's'} exist under both sources. The existing copy is kept and read state is merged.`,
      severity: 'warning',
    });
  }
  if (target?.hasUserOverrides === true && source?.hasUserOverrides === true) {
    issues.push({
      code: 'identity.merge.user_overrides',
      message: "This title's custom cover and overrides win over the other title's.",
      severity: 'info',
    });
  }

  const sourcePreferred = source?.preferredChapterSourceId;
  const resolvedSourcePreferred =
    sourcePreferred === undefined
      ? undefined
      : toProviderMappingId(dedupeRemap.get(sourcePreferred) ?? sourcePreferred);
  const resultPreferredMappingId = target?.preferredChapterSourceId ?? resolvedSourcePreferred;

  return {
    target: target ?? emptySide(targetId),
    source: source ?? emptySide(sourceId),
    mappings,
    duplicateMappingCount: dedupeRemap.size,
    duplicateChapterCount,
    ...(target !== undefined ? { resultDefaultMappingId: target.defaultProviderMappingId } : {}),
    ...(resultPreferredMappingId !== undefined ? { resultPreferredMappingId } : {}),
    canMerge: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeIdentityResult {
  readonly targetId: MangaId;
  readonly sourceId: MangaId;
  readonly movedMappings: number;
  readonly dedupedMappings: number;
  readonly movedChapters: number;
  readonly dedupedChapters: number;
  readonly libraryEntryAction: 'none' | 'kept' | 'merged' | 'moved';
}

function readStateWins(
  candidate: typeof chapterReadState.$inferSelect,
  existing: typeof chapterReadState.$inferSelect | undefined,
): boolean {
  if (existing === undefined) return true;
  const candidateAt = candidate.updatedAt ?? '';
  const existingAt = existing.updatedAt ?? '';
  if (candidateAt !== existingAt) return candidateAt > existingAt;
  if (candidate.completed !== existing.completed) return candidate.completed;
  if (candidate.readPercent !== existing.readPercent) {
    return candidate.readPercent > existing.readPercent;
  }
  return candidate.lastPageIndex > existing.lastPageIndex;
}

function earlierText(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = optionalText(a);
  const right = optionalText(b);
  if (left === undefined) return right ?? null;
  if (right === undefined) return left;
  return left < right ? left : right;
}

function newerText(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = optionalText(a);
  const right = optionalText(b);
  if (left === undefined) return right ?? null;
  if (right === undefined) return left;
  return left > right ? left : right;
}

/** When the chapter was last read; empty when no read state row exists. */
function readEventAt(tx: AppDrizzleDb, chapterId: string | null | undefined): string {
  if (optionalText(chapterId) === undefined) return '';
  const row = tx
    .select({ updatedAt: chapterReadState.updatedAt })
    .from(chapterReadState)
    .where(eq(chapterReadState.chapterId, chapterId as string))
    .get();
  return optionalText(row?.updatedAt) ?? '';
}

export async function mergeMangaIdentities(
  db: AppDrizzleDb,
  input: { readonly targetId: MangaId; readonly sourceId: MangaId },
): Promise<AppResult<MergeIdentityResult>> {
  const { targetId, sourceId } = input;
  if (targetId === sourceId) {
    return err(
      createAppError({
        code: 'db.identity.merge_same_identity',
        message: 'A title cannot be merged with itself.',
      }),
    );
  }

  try {
    return withTransaction(db, (tx) => {
      const target = tx
        .select()
        .from(mangaIdentities)
        .where(eq(mangaIdentities.id, targetId))
        .get();
      const source = tx
        .select()
        .from(mangaIdentities)
        .where(eq(mangaIdentities.id, sourceId))
        .get();
      if (target === undefined || source === undefined) {
        return err(
          createAppError({
            code: 'db.identity.merge_missing',
            message: 'One of the selected titles no longer exists.',
          }),
        );
      }

      const targetMappings = tx
        .select()
        .from(mangaProviderMappings)
        .where(eq(mangaProviderMappings.mangaId, targetId))
        .all();
      const sourceMappings = tx
        .select()
        .from(mangaProviderMappings)
        .where(eq(mangaProviderMappings.mangaId, sourceId))
        .all();
      if (sourceMappings.length === 0) {
        return err(
          createAppError({
            code: 'db.identity.merge_source_has_no_mappings',
            message: 'The title being merged has no provider source to move.',
          }),
        );
      }

      const targetByKey = new Map(
        targetMappings.map((mapping) => [
          mappingKey(mapping.providerId, mapping.providerMangaId),
          mapping,
        ]),
      );
      const mappingRemap = new Map<string, string>();
      const duplicateMappingIds: string[] = [];
      let movedMappings = 0;
      let dedupedMappings = 0;
      for (const mapping of sourceMappings) {
        const existing = targetByKey.get(mappingKey(mapping.providerId, mapping.providerMangaId));
        if (existing !== undefined) {
          mappingRemap.set(mapping.id, existing.id);
          duplicateMappingIds.push(mapping.id);
          dedupedMappings += 1;
          continue;
        }
        mappingRemap.set(mapping.id, mapping.id);
        tx.update(mangaProviderMappings)
          .set({ mangaId: targetId })
          .where(eq(mangaProviderMappings.id, mapping.id))
          .run();
        movedMappings += 1;
      }
      const resolveMapping = (mappingId: string): string =>
        mappingRemap.get(mappingId) ?? mappingId;

      // Read the library entries before chapter dedupe rewrites read states:
      // the progress winner must be decided from the events as they were.
      const targetEntry = tx
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.mangaId, targetId))
        .get();
      const sourceEntry = tx
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.mangaId, sourceId))
        .get();
      const targetHasRead = optionalText(targetEntry?.lastReadChapterId) !== undefined;
      const sourceHasRead = optionalText(sourceEntry?.lastReadChapterId) !== undefined;
      // A favorite, status or category edit bumps `updatedAt` without reading,
      // so it must never outrank a real read event. Only two sides that both
      // read are ordered by time; a side that never read cannot win progress.
      const sourceReadsLater =
        sourceHasRead &&
        (!targetHasRead ||
          readEventAt(tx, sourceEntry?.lastReadChapterId) >
            readEventAt(tx, targetEntry?.lastReadChapterId));
      const progressSide =
        !targetHasRead && !sourceHasRead ? undefined : sourceReadsLater ? sourceEntry : targetEntry;

      // Chapters: keep one row per mapping + index; when a copy collides, the
      // target row survives and the source read state moves only if it is newer.
      const targetChapters = tx.select().from(chapters).where(eq(chapters.mangaId, targetId)).all();
      const targetChapterByKey = new Map(
        targetChapters.map((row) => [chapterKey(row.providerMappingId, row.chapterIndex), row]),
      );
      const chapterRemap = new Map<string, string>();
      let movedChapters = 0;
      let dedupedChapters = 0;

      for (const row of tx.select().from(chapters).where(eq(chapters.mangaId, sourceId)).all()) {
        const mappedMappingId = resolveMapping(row.providerMappingId);
        const existing = targetChapterByKey.get(chapterKey(mappedMappingId, row.chapterIndex));
        if (existing === undefined) {
          tx.update(chapters)
            .set({ mangaId: targetId, providerMappingId: mappedMappingId })
            .where(eq(chapters.id, row.id))
            .run();
          tx.update(chapterReadState)
            .set({ mangaId: targetId, providerMappingId: mappedMappingId })
            .where(eq(chapterReadState.chapterId, row.id))
            .run();
          tx.update(readingHistory)
            .set({ mangaId: targetId, providerMappingId: mappedMappingId })
            .where(eq(readingHistory.chapterId, row.id))
            .run();
          targetChapterByKey.set(chapterKey(mappedMappingId, row.chapterIndex), {
            ...row,
            mangaId: targetId,
            providerMappingId: mappedMappingId,
          });
          movedChapters += 1;
          continue;
        }

        chapterRemap.set(row.id, existing.id);
        const sourceState = tx
          .select()
          .from(chapterReadState)
          .where(eq(chapterReadState.chapterId, row.id))
          .get();
        const targetState = tx
          .select()
          .from(chapterReadState)
          .where(eq(chapterReadState.chapterId, existing.id))
          .get();
        if (sourceState !== undefined && readStateWins(sourceState, targetState)) {
          tx.insert(chapterReadState)
            .values({
              chapterId: existing.id,
              mangaId: targetId,
              providerMappingId: mappedMappingId,
              readPercent: sourceState.readPercent,
              lastPageIndex: sourceState.lastPageIndex,
              completed: sourceState.completed,
              startedAt: sourceState.startedAt,
              updatedAt: sourceState.updatedAt,
            })
            .onConflictDoUpdate({
              target: chapterReadState.chapterId,
              set: {
                mangaId: targetId,
                providerMappingId: mappedMappingId,
                readPercent: sourceState.readPercent,
                lastPageIndex: sourceState.lastPageIndex,
                completed: sourceState.completed,
                startedAt: sourceState.startedAt,
                updatedAt: sourceState.updatedAt,
              },
            })
            .run();
        }

        const existingPageCount = tx
          .select({ id: chapterPages.id })
          .from(chapterPages)
          .where(eq(chapterPages.chapterId, existing.id))
          .all().length;
        const sourcePageCount = tx
          .select({ id: chapterPages.id })
          .from(chapterPages)
          .where(eq(chapterPages.chapterId, row.id))
          .all().length;
        if (existingPageCount === 0 && sourcePageCount > 0) {
          tx.update(chapterPages)
            .set({ chapterId: existing.id })
            .where(eq(chapterPages.chapterId, row.id))
            .run();
        }

        // Cache rows point at a chapter id. Repoint them at the kept copy (or
        // drop a duplicate of a row it already has) before the chapter goes,
        // so a collapsed chapter never leaves a dangling chapter_id.
        const keptCacheKeys = new Set(
          tx
            .select({
              providerId: cacheEntries.providerId,
              cacheKind: cacheEntries.cacheKind,
              sourceUrl: cacheEntries.sourceUrl,
              blobKey: cacheEntries.blobKey,
            })
            .from(cacheEntries)
            .where(eq(cacheEntries.chapterId, existing.id))
            .all()
            .map(cacheEntryKey),
        );
        for (const cache of tx
          .select()
          .from(cacheEntries)
          .where(eq(cacheEntries.chapterId, row.id))
          .all()) {
          const key = cacheEntryKey(cache);
          if (keptCacheKeys.has(key)) {
            tx.delete(cacheEntries).where(eq(cacheEntries.id, cache.id)).run();
            continue;
          }
          keptCacheKeys.add(key);
          tx.update(cacheEntries)
            .set({ chapterId: existing.id })
            .where(eq(cacheEntries.id, cache.id))
            .run();
        }

        const keptHistoryKeys = new Set(
          tx
            .select({ chapterId: readingHistory.chapterId, readAt: readingHistory.readAt })
            .from(readingHistory)
            .where(eq(readingHistory.chapterId, existing.id))
            .all()
            .map((history) => `${history.chapterId}\u0000${history.readAt}`),
        );
        for (const history of tx
          .select()
          .from(readingHistory)
          .where(eq(readingHistory.chapterId, row.id))
          .all()) {
          const key = `${existing.id}\u0000${history.readAt}`;
          if (keptHistoryKeys.has(key)) {
            tx.delete(readingHistory).where(eq(readingHistory.id, history.id)).run();
          } else {
            keptHistoryKeys.add(key);
            tx.update(readingHistory)
              .set({
                mangaId: targetId,
                chapterId: existing.id,
                providerMappingId: mappedMappingId,
              })
              .where(eq(readingHistory.id, history.id))
              .run();
          }
        }

        tx.delete(chapters).where(eq(chapters.id, row.id)).run();
        dedupedChapters += 1;
      }

      for (const mapping of sourceMappings) {
        const resolved = resolveMapping(mapping.id);
        if (resolved !== mapping.id) {
          // Leftover history rows for a mapping whose chapters no longer exist.
          tx.update(readingHistory)
            .set({ mangaId: targetId, providerMappingId: resolved })
            .where(
              and(
                eq(readingHistory.mangaId, sourceId),
                eq(readingHistory.providerMappingId, mapping.id),
              ),
            )
            .run();
        }
      }
      for (const mappingId of duplicateMappingIds) {
        tx.delete(mangaProviderMappings).where(eq(mangaProviderMappings.id, mappingId)).run();
      }

      // Migration history rows belong to the surviving title; their undo
      // pointers must name a mapping that still exists.
      for (const row of tx
        .select()
        .from(migrationHistory)
        .where(eq(migrationHistory.mangaId, sourceId))
        .all()) {
        tx.update(migrationHistory)
          .set({
            mangaId: targetId,
            previousDefaultMappingId:
              row.previousDefaultMappingId === null || row.previousDefaultMappingId === ''
                ? null
                : resolveMapping(row.previousDefaultMappingId),
            previousActiveMappingId:
              row.previousActiveMappingId === null || row.previousActiveMappingId === ''
                ? null
                : resolveMapping(row.previousActiveMappingId),
          })
          .where(eq(migrationHistory.id, row.id))
          .run();
      }

      // Library entry: one row; categories and favorite union, reading progress
      // follows the latest read event, status the newest edit.
      let libraryEntryAction: MergeIdentityResult['libraryEntryAction'] = 'none';
      if (sourceEntry !== undefined && targetEntry === undefined) {
        tx.update(libraryEntries)
          .set({
            mangaId: targetId,
            ...(optionalText(sourceEntry.activeProviderMappingId) !== undefined
              ? {
                  activeProviderMappingId: resolveMapping(
                    sourceEntry.activeProviderMappingId as string,
                  ),
                }
              : {}),
            ...(optionalText(sourceEntry.lastReadChapterId) !== undefined
              ? {
                  lastReadChapterId:
                    chapterRemap.get(sourceEntry.lastReadChapterId as string) ??
                    sourceEntry.lastReadChapterId,
                }
              : {}),
          })
          .where(eq(libraryEntries.id, sourceEntry.id))
          .run();
        libraryEntryAction = 'moved';
      } else if (sourceEntry !== undefined && targetEntry !== undefined) {
        const sourceCategories = tx
          .select({ categoryId: libraryCategoryMemberships.categoryId })
          .from(libraryCategoryMemberships)
          .where(eq(libraryCategoryMemberships.libraryEntryId, sourceEntry.id))
          .all();
        if (sourceCategories.length > 0) {
          tx.insert(libraryCategoryMemberships)
            .values(
              sourceCategories.map((row) => ({
                libraryEntryId: targetEntry.id,
                categoryId: row.categoryId,
              })),
            )
            .onConflictDoNothing()
            .run();
        }

        const statusSource = (sourceEntry.updatedAt ?? '') > (targetEntry.updatedAt ?? '');
        const lastReadChapterId =
          progressSide === undefined
            ? null
            : (chapterRemap.get(progressSide.lastReadChapterId as string) ??
              optionalText(progressSide.lastReadChapterId) ??
              null);

        tx.update(libraryEntries)
          .set({
            favorite: targetEntry.favorite || sourceEntry.favorite,
            status: statusSource ? sourceEntry.status : targetEntry.status,
            notes: optionalText(targetEntry.notes) ?? sourceEntry.notes,
            addedAt: earlierText(targetEntry.addedAt, sourceEntry.addedAt),
            updatedAt: newerText(targetEntry.updatedAt, sourceEntry.updatedAt),
            lastReadChapterId,
            progressPercent: progressSide?.progressPercent ?? null,
            activeProviderMappingId:
              optionalText(targetEntry.activeProviderMappingId) !== undefined
                ? targetEntry.activeProviderMappingId
                : optionalText(sourceEntry.activeProviderMappingId) !== undefined
                  ? resolveMapping(sourceEntry.activeProviderMappingId as string)
                  : null,
          })
          .where(eq(libraryEntries.id, targetEntry.id))
          .run();
        tx.delete(libraryEntries).where(eq(libraryEntries.id, sourceEntry.id)).run();
        libraryEntryAction = 'merged';
      } else if (targetEntry !== undefined) {
        libraryEntryAction = 'kept';
      }

      // Supporting metadata: titles, people and tags move without duplicates.
      const targetTitles = tx
        .select({ value: mangaTitles.value })
        .from(mangaTitles)
        .where(eq(mangaTitles.mangaId, targetId))
        .all();
      const knownTitles = new Set([
        normalizeTitleForMatch(target.canonicalTitle),
        ...targetTitles.map((row) => normalizeTitleForMatch(row.value)),
      ]);
      const addTitle = (value: string, locale?: string | null) => {
        const normalized = normalizeTitleForMatch(value);
        if (normalized.length === 0 || knownTitles.has(normalized)) return;
        knownTitles.add(normalized);
        tx.insert(mangaTitles)
          .values({
            id: newId(),
            mangaId: targetId,
            value,
            ...(optionalText(locale) !== undefined ? { locale: locale as string } : {}),
          })
          .run();
      };
      addTitle(source.canonicalTitle);
      for (const row of tx
        .select()
        .from(mangaTitles)
        .where(eq(mangaTitles.mangaId, sourceId))
        .all()) {
        addTitle(row.value, row.locale);
      }

      const knownPeople = new Set(
        tx
          .select()
          .from(mangaPeople)
          .where(eq(mangaPeople.mangaId, targetId))
          .all()
          .map(
            (row) =>
              `${row.kind}\u0000${normalizeTitleForMatch(row.name)}\u0000${normalizeTitleForMatch(row.role ?? '')}`,
          ),
      );
      for (const row of tx
        .select()
        .from(mangaPeople)
        .where(eq(mangaPeople.mangaId, sourceId))
        .all()) {
        const key = `${row.kind}\u0000${normalizeTitleForMatch(row.name)}\u0000${normalizeTitleForMatch(row.role ?? '')}`;
        if (knownPeople.has(key)) continue;
        knownPeople.add(key);
        tx.insert(mangaPeople)
          .values({
            id: newId(),
            mangaId: targetId,
            name: row.name,
            kind: row.kind,
            ...(optionalText(row.role) !== undefined ? { role: row.role } : {}),
          })
          .run();
      }

      const sourceTags = tx
        .select({ tagId: mangaTagMemberships.tagId })
        .from(mangaTagMemberships)
        .where(eq(mangaTagMemberships.mangaId, sourceId))
        .all();
      if (sourceTags.length > 0) {
        tx.insert(mangaTagMemberships)
          .values(sourceTags.map((row) => ({ mangaId: targetId, tagId: row.tagId })))
          .onConflictDoNothing()
          .run();
      }

      const targetTrackingKeys = new Set(
        tx
          .select()
          .from(trackingLinks)
          .where(eq(trackingLinks.mangaId, targetId))
          .all()
          .map((row) => `${row.service}\u0000${row.externalId}`),
      );
      for (const row of tx
        .select()
        .from(trackingLinks)
        .where(eq(trackingLinks.mangaId, sourceId))
        .all()) {
        const key = `${row.service}\u0000${row.externalId}`;
        if (targetTrackingKeys.has(key)) {
          tx.delete(trackingLinks).where(eq(trackingLinks.id, row.id)).run();
          continue;
        }
        targetTrackingKeys.add(key);
        tx.update(trackingLinks)
          .set({ mangaId: targetId })
          .where(eq(trackingLinks.id, row.id))
          .run();
      }

      const targetOverrides =
        target.userOverridesJson === null || target.userOverridesJson === undefined
          ? undefined
          : target.userOverridesJson;
      const sourceOverrides =
        source.userOverridesJson === null || source.userOverridesJson === undefined
          ? undefined
          : source.userOverridesJson;
      const mergedOverrides =
        sourceOverrides === undefined && targetOverrides === undefined
          ? undefined
          : { ...(sourceOverrides ?? {}), ...(targetOverrides ?? {}) };

      const mergedFromIds = uniqueIds([
        ...mergedFromIdsOf(target),
        ...mergedFromIdsOf(source),
        sourceId,
      ]);
      const sourcePreferred =
        source.preferredChapterSourceId === null || source.preferredChapterSourceId === ''
          ? undefined
          : resolveMapping(source.preferredChapterSourceId);
      const preferredChapterSourceId =
        optionalText(target.preferredChapterSourceId) !== undefined
          ? target.preferredChapterSourceId
          : sourcePreferred;

      tx.update(mangaIdentities)
        .set({
          merged: true,
          mergedFromIdsJson: mergedFromIds,
          description: optionalText(target.description) ?? source.description,
          language: optionalText(target.language) ?? source.language,
          coverImageUrl: optionalText(target.coverImageUrl) ?? source.coverImageUrl,
          ...(optionalText(preferredChapterSourceId) !== undefined
            ? { preferredChapterSourceId }
            : {}),
          ...(mergedOverrides !== undefined ? { userOverridesJson: mergedOverrides } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mangaIdentities.id, targetId))
        .run();

      // Every reference is moved, so the source row can go.
      tx.update(cacheEntries)
        .set({ mangaId: targetId })
        .where(eq(cacheEntries.mangaId, sourceId))
        .run();
      tx.delete(mangaIdentities).where(eq(mangaIdentities.id, sourceId)).run();

      const unreadRows = tx
        .select({ completed: chapterReadState.completed })
        .from(chapters)
        .leftJoin(chapterReadState, eq(chapterReadState.chapterId, chapters.id))
        .where(eq(chapters.mangaId, targetId))
        .all();
      tx.update(libraryEntries)
        .set({ unreadCount: unreadRows.filter((row) => row.completed !== true).length })
        .where(eq(libraryEntries.mangaId, targetId))
        .run();

      return ok({
        targetId,
        sourceId,
        movedMappings,
        dedupedMappings,
        movedChapters,
        dedupedChapters,
        libraryEntryAction,
      });
    });
  } catch (error) {
    return err(
      createAppError({
        code: 'db.identity.merge_failed',
        message:
          error instanceof Error
            ? `Could not merge the titles: ${error.message}`
            : 'Could not merge the titles.',
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Unmerge
// ---------------------------------------------------------------------------

export interface UnmergeMappingPreview {
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  readonly mapping: {
    readonly id: ProviderMappingId;
    readonly providerId: string;
    readonly providerMangaId: string;
    readonly providerTitle?: string;
    readonly providerUrl?: string;
  };
  readonly chapterCount: number;
  readonly readChapterCount: number;
  readonly historyCount: number;
  readonly remainingMappingCount: number;
  readonly trackingLinkCount: number;
  readonly libraryActiveMappingWillChange: boolean;
  readonly libraryLastReadWillChange: boolean;
  readonly canUnmerge: boolean;
  readonly issues: readonly MergePreviewIssue[];
}

export async function previewUnmergeProviderMapping(
  db: AppDrizzleDb,
  mangaId: MangaId,
  mappingId: ProviderMappingId,
): Promise<UnmergeMappingPreview | undefined> {
  const identity = await getMangaIdentity(db, mangaId);
  if (identity === undefined) return undefined;
  const mapping = identity.providerMappings.find((item) => item.id === mappingId);
  const issues: MergePreviewIssue[] = [];
  if (mapping === undefined) {
    issues.push({
      code: 'identity.unmerge.mapping_missing',
      message: 'That provider source is no longer attached to this title.',
      severity: 'error',
    });
  }
  if (identity.providerMappings.length <= 1) {
    issues.push({
      code: 'identity.unmerge.last_mapping',
      message: 'A title must keep at least one provider source.',
      severity: 'error',
    });
  }

  const chapterRows =
    mapping === undefined
      ? []
      : db
          .select({ id: chapters.id })
          .from(chapters)
          .where(and(eq(chapters.mangaId, mangaId), eq(chapters.providerMappingId, mappingId)))
          .all();
  const chapterIds = chapterRows.map((row) => row.id);
  const readChapterCount =
    chapterIds.length === 0
      ? 0
      : db
          .select({ chapterId: chapterReadState.chapterId })
          .from(chapterReadState)
          .where(inArray(chapterReadState.chapterId, chapterIds))
          .all().length;
  const historyCount =
    chapterIds.length === 0
      ? 0
      : db
          .select({ id: readingHistory.id })
          .from(readingHistory)
          .where(inArray(readingHistory.chapterId, chapterIds))
          .all().length;
  const entry = db.select().from(libraryEntries).where(eq(libraryEntries.mangaId, mangaId)).get();
  const activeMappingWillChange = entry?.activeProviderMappingId === mappingId;
  const lastReadWillChange =
    optionalText(entry?.lastReadChapterId) !== undefined &&
    chapterIds.includes(entry?.lastReadChapterId as string);
  if (identity.trackingLinks !== undefined && identity.trackingLinks.length > 0) {
    issues.push({
      code: 'identity.unmerge.tracking_retained',
      message: 'Tracking links stay on this title. Move them manually if needed.',
      severity: 'warning',
    });
  }
  if (identity.userOverrides !== undefined) {
    issues.push({
      code: 'identity.unmerge.overrides_retained',
      message: 'Your custom title and cover stay on this title.',
      severity: 'info',
    });
  }
  if (activeMappingWillChange || lastReadWillChange) {
    issues.push({
      code: 'identity.unmerge.library_progress',
      message: 'Reading progress for the moved chapters follows the new title.',
      severity: 'warning',
    });
  }

  if (mapping === undefined) {
    return {
      mangaId,
      canonicalTitle: identity.canonicalTitle,
      mapping: { id: mappingId, providerId: '', providerMangaId: '' },
      chapterCount: 0,
      readChapterCount: 0,
      historyCount: 0,
      remainingMappingCount: identity.providerMappings.length,
      trackingLinkCount: identity.trackingLinks?.length ?? 0,
      libraryActiveMappingWillChange: false,
      libraryLastReadWillChange: false,
      canUnmerge: false,
      issues,
    };
  }

  return {
    mangaId,
    canonicalTitle: identity.canonicalTitle,
    mapping: {
      id: mapping.id,
      providerId: mapping.providerId,
      providerMangaId: mapping.providerMangaId,
      ...(mapping.providerTitle !== undefined ? { providerTitle: mapping.providerTitle } : {}),
      ...(mapping.providerUrl !== undefined ? { providerUrl: mapping.providerUrl } : {}),
    },
    chapterCount: chapterRows.length,
    readChapterCount,
    historyCount,
    remainingMappingCount: identity.providerMappings.length - 1,
    trackingLinkCount: identity.trackingLinks?.length ?? 0,
    libraryActiveMappingWillChange: activeMappingWillChange,
    libraryLastReadWillChange: lastReadWillChange,
    canUnmerge: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

export interface UnmergeMappingResult {
  readonly targetId: MangaId;
  readonly newMangaId: MangaId;
  readonly movedChapters: number;
  readonly movedReadStates: number;
  readonly movedHistoryRows: number;
  readonly mergedCleared: boolean;
}

export async function unmergeProviderMapping(
  db: AppDrizzleDb,
  input: { readonly mangaId: MangaId; readonly mappingId: ProviderMappingId },
): Promise<AppResult<UnmergeMappingResult>> {
  const { mangaId, mappingId } = input;
  try {
    return withTransaction(db, (tx) => {
      const identity = tx
        .select()
        .from(mangaIdentities)
        .where(eq(mangaIdentities.id, mangaId))
        .get();
      if (identity === undefined) {
        return err(
          createAppError({
            code: 'db.identity.unmerge_missing',
            message: 'Manga identity was not found.',
          }),
        );
      }

      const mappings = tx
        .select()
        .from(mangaProviderMappings)
        .where(eq(mangaProviderMappings.mangaId, mangaId))
        .all();
      const mapping = mappings.find((row) => row.id === mappingId);
      if (mapping === undefined) {
        return err(
          createAppError({
            code: 'db.identity.unmerge_mapping_missing',
            message: 'Provider mapping does not belong to this title.',
          }),
        );
      }
      if (mappings.length <= 1) {
        return err(
          createAppError({
            code: 'db.identity.unmerge_last_mapping',
            message: 'A title must keep at least one provider source.',
          }),
        );
      }

      // Reuse an absorbed identity id when one is available: `mergedFromIds`
      // exists for exactly this round-trip, and consuming it keeps the count
      // truthful across repeated unmerges.
      const absorbed = mergedFromIdsOf(identity);
      const reusableId = absorbed.find(
        (id) =>
          tx
            .select({ id: mangaIdentities.id })
            .from(mangaIdentities)
            .where(eq(mangaIdentities.id, id))
            .get() === undefined,
      );
      const newMangaId = reusableId === undefined ? newId() : reusableId;
      const remainingMergedFromIds =
        reusableId === undefined ? absorbed : absorbed.filter((id) => id !== reusableId);

      const chapterRows = tx
        .select()
        .from(chapters)
        .where(and(eq(chapters.mangaId, mangaId), eq(chapters.providerMappingId, mappingId)))
        .all();
      const chapterIds = chapterRows.map((row) => row.id);
      const historyIds = new Set<string>(
        chapterIds.length === 0
          ? []
          : tx
              .select({ id: readingHistory.id })
              .from(readingHistory)
              .where(inArray(readingHistory.chapterId, chapterIds))
              .all()
              .map((row) => row.id),
      );
      for (const row of tx
        .select({ id: readingHistory.id })
        .from(readingHistory)
        .where(
          and(eq(readingHistory.mangaId, mangaId), eq(readingHistory.providerMappingId, mappingId)),
        )
        .all()) {
        historyIds.add(row.id);
      }
      const now = new Date().toISOString();

      tx.insert(mangaIdentities)
        .values({
          id: newMangaId,
          canonicalTitle: optionalText(mapping.providerTitle) ?? identity.canonicalTitle,
          status: identity.status,
          contentRating: identity.contentRating,
          merged: false,
          defaultProviderMappingId: mappingId,
          ...(optionalText(identity.language) !== undefined ? { language: identity.language } : {}),
          ...(optionalText(identity.description) !== undefined
            ? { description: identity.description }
            : {}),
          ...(optionalText(identity.coverImageUrl) !== undefined
            ? { coverImageUrl: identity.coverImageUrl }
            : {}),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      tx.update(mangaProviderMappings)
        .set({ mangaId: newMangaId })
        .where(eq(mangaProviderMappings.id, mappingId))
        .run();

      let movedReadStates = 0;
      if (chapterRows.length > 0) {
        movedReadStates = tx
          .select({ chapterId: chapterReadState.chapterId })
          .from(chapterReadState)
          .where(inArray(chapterReadState.chapterId, chapterIds))
          .all().length;
        tx.update(chapters)
          .set({ mangaId: newMangaId })
          .where(inArray(chapters.id, chapterIds))
          .run();
        tx.update(chapterReadState)
          .set({ mangaId: newMangaId })
          .where(inArray(chapterReadState.chapterId, chapterIds))
          .run();
        tx.update(readingHistory)
          .set({ mangaId: newMangaId })
          .where(inArray(readingHistory.chapterId, chapterIds))
          .run();
        tx.update(cacheEntries)
          .set({ mangaId: newMangaId })
          .where(inArray(cacheEntries.chapterId, chapterIds))
          .run();
      }
      if (historyIds.size > 0) {
        const ids = [...historyIds];
        for (let offset = 0; offset < ids.length; offset += 500) {
          tx.update(readingHistory)
            .set({ mangaId: newMangaId })
            .where(inArray(readingHistory.id, ids.slice(offset, offset + 500)))
            .run();
        }
      }

      const remainingMappings = mappings.filter((row) => row.id !== mappingId);
      const nextDefaultId =
        identity.defaultProviderMappingId === mappingId
          ? (remainingMappings[0]?.id ?? mappingId)
          : identity.defaultProviderMappingId;

      tx.update(mangaIdentities)
        .set({
          defaultProviderMappingId: nextDefaultId,
          preferredChapterSourceId:
            identity.preferredChapterSourceId === mappingId
              ? null
              : identity.preferredChapterSourceId,
          merged: remainingMergedFromIds.length > 0,
          mergedFromIdsJson: remainingMergedFromIds.length > 0 ? remainingMergedFromIds : null,
          updatedAt: now,
        })
        .where(eq(mangaIdentities.id, mangaId))
        .run();

      // Migration undo pointers must not name a mapping that now lives elsewhere.
      for (const row of tx
        .select()
        .from(migrationHistory)
        .where(eq(migrationHistory.mangaId, mangaId))
        .all()) {
        if (
          row.previousDefaultMappingId !== mappingId &&
          row.previousActiveMappingId !== mappingId
        ) {
          continue;
        }
        tx.update(migrationHistory)
          .set({
            previousDefaultMappingId:
              row.previousDefaultMappingId === mappingId ? null : row.previousDefaultMappingId,
            previousActiveMappingId:
              row.previousActiveMappingId === mappingId ? null : row.previousActiveMappingId,
          })
          .where(eq(migrationHistory.id, row.id))
          .run();
      }

      const entry = tx
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.mangaId, mangaId))
        .get();
      if (entry !== undefined) {
        const activeMappingIdWouldMove = entry.activeProviderMappingId === mappingId;
        const lastReadWouldMove = chapterIds.includes(entry.lastReadChapterId ?? '');
        let lastReadChapterId = entry.lastReadChapterId;
        let progressPercent = entry.progressPercent;
        if (lastReadWouldMove) {
          const fallback = tx
            .select({
              chapterId: chapterReadState.chapterId,
              readPercent: chapterReadState.readPercent,
              updatedAt: chapterReadState.updatedAt,
            })
            .from(chapterReadState)
            .innerJoin(chapters, eq(chapters.id, chapterReadState.chapterId))
            .where(eq(chapters.mangaId, mangaId))
            .all()
            .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
          lastReadChapterId = fallback?.chapterId ?? null;
          progressPercent = fallback?.readPercent ?? null;
        }
        if (activeMappingIdWouldMove || lastReadWouldMove) {
          tx.update(libraryEntries)
            .set({
              activeProviderMappingId: activeMappingIdWouldMove
                ? nextDefaultId
                : entry.activeProviderMappingId,
              lastReadChapterId,
              progressPercent,
              updatedAt: now,
            })
            .where(eq(libraryEntries.id, entry.id))
            .run();
        }

        const unreadRows = tx
          .select({ completed: chapterReadState.completed })
          .from(chapters)
          .leftJoin(chapterReadState, eq(chapterReadState.chapterId, chapters.id))
          .where(eq(chapters.mangaId, mangaId))
          .all();
        tx.update(libraryEntries)
          .set({ unreadCount: unreadRows.filter((row) => row.completed !== true).length })
          .where(eq(libraryEntries.id, entry.id))
          .run();
      }

      return ok({
        targetId: mangaId,
        newMangaId: toMangaId(newMangaId),
        movedChapters: chapterRows.length,
        movedReadStates,
        movedHistoryRows: historyIds.size,
        mergedCleared: remainingMergedFromIds.length === 0,
      });
    });
  } catch (error) {
    return err(
      createAppError({
        code: 'db.identity.unmerge_failed',
        message:
          error instanceof Error
            ? `Could not split the provider source: ${error.message}`
            : 'Could not split the provider source.',
      }),
    );
  }
}
