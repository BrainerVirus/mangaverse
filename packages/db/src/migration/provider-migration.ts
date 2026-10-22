import { and, eq } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  toLibraryEntryId,
  toMangaId,
  toProviderMappingId,
  type LibraryEntryId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { chapters, libraryEntries, mangaIdentities, mangaProviderMappings } from '../schema.js';
import {
  addProviderMapping,
  getMangaIdentity,
  setDefaultProviderMapping,
} from '../repositories/identities.js';
import {
  getLibraryEntryForManga,
  setLibraryEntryActiveProviderMapping,
} from '../repositories/library.js';
import {
  recordMigrationHistory,
  findLatestMigrationHistoryForManga,
} from '../repositories/migration-history.js';

export type MigrationPreviewSeverity = 'info' | 'warning' | 'error';

export interface MigrationPreviewIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: MigrationPreviewSeverity;
}

export interface MigratableLibraryEntry {
  readonly libraryEntryId: LibraryEntryId;
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  readonly sourceProviderId: string;
  readonly sourceProviderMangaId: string;
  readonly sourceMappingId: ProviderMappingId;
  readonly isDefaultProvider: boolean;
  readonly isActiveProvider: boolean;
}

export interface MigrationTargetSelection {
  readonly mangaId: MangaId;
  readonly targetProviderMangaId: string;
  readonly targetProviderTitle?: string;
}

export interface MigrationPreviewItem {
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  readonly sourceProviderId: string;
  readonly sourceProviderMangaId: string;
  readonly targetProviderId: string;
  readonly targetProviderMangaId: string;
  readonly willAddMapping: boolean;
  readonly willUpdateDefault: boolean;
  readonly willUpdateActive: boolean;
  readonly blocked: boolean;
  readonly issues: readonly MigrationPreviewIssue[];
}

export interface MigrationPreviewReport {
  readonly sourceProviderId: string;
  readonly targetProviderId: string;
  readonly items: readonly MigrationPreviewItem[];
  readonly canApply: boolean;
}

export interface MigrationApplyItemResult {
  readonly mangaId: MangaId;
  readonly ok: boolean;
  readonly mappingId?: ProviderMappingId;
  readonly error?: string;
}

export interface MigrationApplyReport {
  readonly applied: readonly MigrationApplyItemResult[];
  readonly skipped: readonly MigrationApplyItemResult[];
}

export interface MigrationRollbackItemResult {
  readonly mangaId: MangaId;
  readonly ok: boolean;
  readonly error?: string;
}

export interface MigrationRollbackReport {
  readonly restored: readonly MigrationRollbackItemResult[];
  readonly skipped: readonly MigrationRollbackItemResult[];
}

export async function listMigratableLibraryEntries(
  db: AppDrizzleDb,
  sourceProviderId: string,
): Promise<MigratableLibraryEntry[]> {
  const rows = db.select().from(libraryEntries).all();
  const out: MigratableLibraryEntry[] = [];

  for (const row of rows) {
    const mangaId = toMangaId(row.mangaId);
    const identity = await getMangaIdentity(db, mangaId);
    if (identity === undefined) continue;

    const sourceMapping = identity.providerMappings.find((m) => m.providerId === sourceProviderId);
    if (sourceMapping === undefined) continue;

    out.push({
      libraryEntryId: toLibraryEntryId(row.id),
      mangaId,
      canonicalTitle: identity.canonicalTitle,
      sourceProviderId,
      sourceProviderMangaId: sourceMapping.providerMangaId,
      sourceMappingId: sourceMapping.id,
      isDefaultProvider: identity.defaultProviderMappingId === sourceMapping.id,
      isActiveProvider: row.activeProviderMappingId === sourceMapping.id,
    });
  }

  return [...out].sort((a, b) => a.canonicalTitle.localeCompare(b.canonicalTitle));
}

async function buildPreviewItem(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selection: MigrationTargetSelection;
  },
): Promise<MigrationPreviewItem> {
  const { sourceProviderId, targetProviderId, selection } = input;
  const issues: MigrationPreviewIssue[] = [];

  if (sourceProviderId === targetProviderId) {
    issues.push({
      code: 'migration.same_provider',
      message: 'Source and target providers must be different.',
      severity: 'error',
    });
  }

  const identity = await getMangaIdentity(db, selection.mangaId);
  if (identity === undefined) {
    issues.push({
      code: 'migration.manga_missing',
      message: 'Manga identity was not found.',
      severity: 'error',
    });
    return {
      mangaId: selection.mangaId,
      canonicalTitle: selection.targetProviderTitle ?? selection.targetProviderMangaId,
      sourceProviderId,
      sourceProviderMangaId: '',
      targetProviderId,
      targetProviderMangaId: selection.targetProviderMangaId,
      willAddMapping: false,
      willUpdateDefault: false,
      willUpdateActive: false,
      blocked: true,
      issues,
    };
  }

  const sourceMapping = identity.providerMappings.find((m) => m.providerId === sourceProviderId);
  if (sourceMapping === undefined) {
    issues.push({
      code: 'migration.source_mapping_missing',
      message: 'This title is not linked to the selected source provider.',
      severity: 'error',
    });
  }

  const existingTarget = db
    .select()
    .from(mangaProviderMappings)
    .where(
      and(
        eq(mangaProviderMappings.providerId, targetProviderId),
        eq(mangaProviderMappings.providerMangaId, selection.targetProviderMangaId),
      ),
    )
    .get();

  let willAddMapping = true;
  if (existingTarget !== undefined) {
    if (existingTarget.mangaId !== selection.mangaId) {
      issues.push({
        code: 'migration.target_collision',
        message: 'Target provider manga id is already linked to a different title.',
        severity: 'error',
      });
      willAddMapping = false;
    } else {
      willAddMapping = false;
      issues.push({
        code: 'migration.target_exists',
        message: 'Target provider mapping already exists for this title.',
        severity: 'info',
      });
    }
  }

  const sourceChapterCount =
    sourceMapping === undefined
      ? 0
      : db
          .select({ id: chapters.id })
          .from(chapters)
          .where(eq(chapters.providerMappingId, sourceMapping.id))
          .all().length;

  if (sourceChapterCount > 0) {
    issues.push({
      code: 'migration.source_chapters',
      message:
        'Downloaded or cached chapters from the source provider may not transfer automatically.',
      severity: 'warning',
    });
  }

  const libraryEntry = await getLibraryEntryForManga(db, selection.mangaId);
  const willUpdateDefault =
    sourceMapping !== undefined && identity.defaultProviderMappingId === sourceMapping.id;
  const willUpdateActive =
    sourceMapping !== undefined &&
    libraryEntry !== undefined &&
    libraryEntry.activeProviderMappingId === sourceMapping.id;

  const blocked = issues.some((issue) => issue.severity === 'error');

  return {
    mangaId: selection.mangaId,
    canonicalTitle: identity.canonicalTitle,
    sourceProviderId,
    sourceProviderMangaId: sourceMapping?.providerMangaId ?? '',
    targetProviderId,
    targetProviderMangaId: selection.targetProviderMangaId,
    willAddMapping: willAddMapping && !blocked,
    willUpdateDefault: willUpdateDefault && !blocked,
    willUpdateActive: willUpdateActive && !blocked,
    blocked,
    issues,
  };
}

export async function previewProviderMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selections: readonly MigrationTargetSelection[];
  },
): Promise<MigrationPreviewReport> {
  const items = await Promise.all(
    input.selections.map((selection) =>
      buildPreviewItem(db, {
        sourceProviderId: input.sourceProviderId,
        targetProviderId: input.targetProviderId,
        selection,
      }),
    ),
  );

  const canApply = items.some((item) => !item.blocked);

  return {
    sourceProviderId: input.sourceProviderId,
    targetProviderId: input.targetProviderId,
    items,
    canApply,
  };
}

async function applySingleMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selection: MigrationTargetSelection;
  },
): Promise<AppResult<ProviderMappingId>> {
  const preview = await buildPreviewItem(db, input);
  if (preview.blocked) {
    const message =
      preview.issues.find((issue) => issue.severity === 'error')?.message ?? 'Migration blocked.';
    return err(createAppError({ code: 'migration.blocked', message }));
  }

  const identity = await getMangaIdentity(db, input.selection.mangaId);
  if (identity === undefined) {
    return err(
      createAppError({ code: 'migration.manga_missing', message: 'Manga identity was not found.' }),
    );
  }

  const sourceMapping = identity.providerMappings.find(
    (m) => m.providerId === input.sourceProviderId,
  );
  if (sourceMapping === undefined) {
    return err(
      createAppError({
        code: 'migration.source_mapping_missing',
        message: 'Source provider mapping was not found.',
      }),
    );
  }

  let targetMappingId: ProviderMappingId;
  const existingTarget = db
    .select()
    .from(mangaProviderMappings)
    .where(
      and(
        eq(mangaProviderMappings.providerId, input.targetProviderId),
        eq(mangaProviderMappings.providerMangaId, input.selection.targetProviderMangaId),
      ),
    )
    .get();

  if (existingTarget !== undefined) {
    targetMappingId = toProviderMappingId(existingTarget.id);
  } else {
    const added = await addProviderMapping(db, {
      mangaId: input.selection.mangaId,
      providerId: input.targetProviderId,
      providerMangaId: input.selection.targetProviderMangaId,
      ...(input.selection.targetProviderTitle !== undefined
        ? { providerTitle: input.selection.targetProviderTitle }
        : {}),
    });
    if (!added.ok) return added;
    targetMappingId = added.value;
  }

  if (identity.defaultProviderMappingId === sourceMapping.id) {
    const updated = await setDefaultProviderMapping(db, input.selection.mangaId, targetMappingId);
    if (!updated.ok) return updated;
  }

  const libraryEntry = await getLibraryEntryForManga(db, input.selection.mangaId);
  if (libraryEntry !== undefined && libraryEntry.activeProviderMappingId === sourceMapping.id) {
    const updated = await setLibraryEntryActiveProviderMapping(
      db,
      libraryEntry.id,
      targetMappingId,
    );
    if (!updated.ok) return updated;
  }

  await recordMigrationHistory(db, {
    mangaId: input.selection.mangaId,
    sourceProviderId: input.sourceProviderId,
    sourceProviderMangaId: sourceMapping.providerMangaId,
    targetProviderId: input.targetProviderId,
    targetProviderMangaId: input.selection.targetProviderMangaId,
  });

  await db
    .update(mangaIdentities)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(mangaIdentities.id, input.selection.mangaId));

  return ok(targetMappingId);
}

export async function applyProviderMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selections: readonly MigrationTargetSelection[];
  },
): Promise<AppResult<MigrationApplyReport>> {
  if (input.sourceProviderId === input.targetProviderId) {
    return err(
      createAppError({
        code: 'migration.same_provider',
        message: 'Source and target providers must be different.',
      }),
    );
  }

  const preview = await previewProviderMigration(db, input);
  if (!preview.canApply) {
    return err(
      createAppError({
        code: 'migration.nothing_to_apply',
        message: 'No valid migration selections to apply.',
      }),
    );
  }

  const applied: MigrationApplyItemResult[] = [];
  const skipped: MigrationApplyItemResult[] = [];

  for (const selection of input.selections) {
    const itemPreview = preview.items.find((item) => item.mangaId === selection.mangaId);
    if (itemPreview === undefined || itemPreview.blocked) {
      skipped.push({
        mangaId: selection.mangaId,
        ok: false,
        error:
          itemPreview?.issues.find((issue) => issue.severity === 'error')?.message ?? 'Skipped.',
      });
      continue;
    }

    const result = await applySingleMigration(db, {
      sourceProviderId: input.sourceProviderId,
      targetProviderId: input.targetProviderId,
      selection,
    });

    if (!result.ok) {
      skipped.push({ mangaId: selection.mangaId, ok: false, error: result.error.message });
      continue;
    }

    applied.push({ mangaId: selection.mangaId, ok: true, mappingId: result.value });
  }

  if (applied.length === 0) {
    return err(
      createAppError({
        code: 'migration.apply_failed',
        message: 'Migration did not apply any titles.',
      }),
    );
  }

  return ok({ applied, skipped });
}

async function rollbackSingleMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly mangaId: MangaId;
  },
): Promise<AppResult<void>> {
  const history = await findLatestMigrationHistoryForManga(db, {
    mangaId: input.mangaId,
    sourceProviderId: input.sourceProviderId,
    targetProviderId: input.targetProviderId,
  });
  if (history === undefined) {
    return err(
      createAppError({
        code: 'migration.rollback_history_missing',
        message: 'No migration history exists for this title.',
      }),
    );
  }

  const identity = await getMangaIdentity(db, input.mangaId);
  if (identity === undefined) {
    return err(
      createAppError({ code: 'migration.manga_missing', message: 'Manga identity was not found.' }),
    );
  }

  const sourceMapping = identity.providerMappings.find(
    (mapping) =>
      mapping.providerId === input.sourceProviderId &&
      mapping.providerMangaId === history.sourceProviderMangaId,
  );
  const targetMapping = identity.providerMappings.find(
    (mapping) =>
      mapping.providerId === input.targetProviderId &&
      mapping.providerMangaId === history.targetProviderMangaId,
  );
  if (sourceMapping === undefined || targetMapping === undefined) {
    return err(
      createAppError({
        code: 'migration.rollback_mapping_missing',
        message: 'The source or target mapping no longer exists.',
      }),
    );
  }

  const defaultIsTarget = identity.defaultProviderMappingId === targetMapping.id;
  const defaultIsSource = identity.defaultProviderMappingId === sourceMapping.id;
  if (!defaultIsTarget && !defaultIsSource) {
    return err(
      createAppError({
        code: 'migration.rollback_not_feasible',
        message: 'The default provider changed after this migration.',
      }),
    );
  }

  const libraryEntry = await getLibraryEntryForManga(db, input.mangaId);
  const active = libraryEntry?.activeProviderMappingId;
  const activeIsTarget = active !== undefined && active === targetMapping.id;
  const activeIsSource = active !== undefined && active === sourceMapping.id;
  // No active mapping is a valid pre-migration state; only a mapping the user
  // pointed elsewhere makes the undo unsafe.
  if (libraryEntry !== undefined && active !== undefined && !activeIsTarget && !activeIsSource) {
    return err(
      createAppError({
        code: 'migration.rollback_not_feasible',
        message: 'The active provider changed after this migration.',
      }),
    );
  }

  if (!defaultIsTarget && !activeIsTarget) {
    return err(
      createAppError({
        code: 'migration.rollback_not_feasible',
        message: 'This title is already on the source provider.',
      }),
    );
  }

  if (defaultIsTarget) {
    const restored = await setDefaultProviderMapping(db, input.mangaId, sourceMapping.id);
    if (!restored.ok) return restored;
  }

  if (activeIsTarget && libraryEntry !== undefined) {
    const restored = await setLibraryEntryActiveProviderMapping(
      db,
      libraryEntry.id,
      sourceMapping.id,
    );
    if (!restored.ok) return restored;
  }

  await db
    .update(mangaIdentities)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(mangaIdentities.id, input.mangaId));

  return ok(undefined);
}

/**
 * Undo the mapping pointers a migration changed for an explicit set of titles.
 * Added target mappings stay: deleting them would discard library state the
 * user may already be reading from.
 */
export async function rollbackProviderMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly mangaIds: readonly MangaId[];
  },
): Promise<AppResult<MigrationRollbackReport>> {
  if (input.mangaIds.length === 0) {
    return err(
      createAppError({
        code: 'migration.rollback_empty',
        message: 'No titles to roll back.',
      }),
    );
  }

  const restored: MigrationRollbackItemResult[] = [];
  const skipped: MigrationRollbackItemResult[] = [];

  for (const mangaId of input.mangaIds) {
    const result = await rollbackSingleMigration(db, {
      sourceProviderId: input.sourceProviderId,
      targetProviderId: input.targetProviderId,
      mangaId,
    });

    if (result.ok) {
      restored.push({ mangaId, ok: true });
      continue;
    }

    skipped.push({ mangaId, ok: false, error: result.error.message });
  }

  if (restored.length === 0) {
    return err(
      createAppError({
        code: 'migration.rollback_unavailable',
        message: skipped[0]?.error ?? 'Rollback is not available for these titles.',
      }),
    );
  }

  return ok({ restored, skipped });
}
