import { and, desc, eq } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { mangaIdentities, migrationHistory } from '../schema.js';

export interface MigrationHistoryEntry {
  readonly id: string;
  readonly mangaId: string;
  readonly sourceProviderId: string;
  readonly sourceProviderMangaId: string;
  readonly targetProviderId: string;
  readonly targetProviderMangaId: string;
  readonly completedAt: string;
  readonly batchId?: string;
  readonly previousDefaultMappingId?: string;
  readonly previousActiveMappingId?: string;
  /** Readable title at read time; the manga row can outlive the migration form. */
  readonly canonicalTitle?: string;
  readonly notes?: string;
}

function newId(): string {
  return crypto.randomUUID();
}

type MigrationHistoryRow = typeof migrationHistory.$inferSelect;

function optionalText(value: string | null | undefined): string | undefined {
  return value !== null && value !== undefined && value !== '' ? value : undefined;
}

function toEntry(row: MigrationHistoryRow, canonicalTitle?: string): MigrationHistoryEntry {
  const batchId = optionalText(row.batchId);
  const previousDefaultMappingId = optionalText(row.previousDefaultMappingId);
  const previousActiveMappingId = optionalText(row.previousActiveMappingId);
  const notes = optionalText(row.notes);
  return {
    id: row.id,
    mangaId: row.mangaId,
    sourceProviderId: row.sourceProviderId,
    sourceProviderMangaId: row.sourceProviderMangaId,
    targetProviderId: row.targetProviderId,
    targetProviderMangaId: row.targetProviderMangaId,
    completedAt: row.completedAt,
    ...(batchId !== undefined ? { batchId } : {}),
    ...(previousDefaultMappingId !== undefined ? { previousDefaultMappingId } : {}),
    ...(previousActiveMappingId !== undefined ? { previousActiveMappingId } : {}),
    ...(canonicalTitle !== undefined && canonicalTitle !== '' ? { canonicalTitle } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

export async function recordMigrationHistory(
  db: AppDrizzleDb,
  input: {
    readonly mangaId: string;
    readonly sourceProviderId: string;
    readonly sourceProviderMangaId: string;
    readonly targetProviderId: string;
    readonly targetProviderMangaId: string;
    readonly batchId?: string;
    readonly previousDefaultMappingId?: string;
    readonly previousActiveMappingId?: string;
    readonly notes?: string;
  },
): Promise<void> {
  await db.insert(migrationHistory).values({
    id: newId(),
    mangaId: input.mangaId,
    sourceProviderId: input.sourceProviderId,
    sourceProviderMangaId: input.sourceProviderMangaId,
    targetProviderId: input.targetProviderId,
    targetProviderMangaId: input.targetProviderMangaId,
    completedAt: new Date().toISOString(),
    batchId: input.batchId,
    previousDefaultMappingId: input.previousDefaultMappingId,
    previousActiveMappingId: input.previousActiveMappingId,
    notes: input.notes,
  });
}

export async function findMigrationHistoryByProviders(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly sourceProviderMangaId: string;
    readonly targetProviderId: string;
    readonly targetProviderMangaId: string;
  },
): Promise<MigrationHistoryEntry | undefined> {
  const row = db
    .select()
    .from(migrationHistory)
    .where(
      and(
        eq(migrationHistory.sourceProviderId, input.sourceProviderId),
        eq(migrationHistory.sourceProviderMangaId, input.sourceProviderMangaId),
        eq(migrationHistory.targetProviderId, input.targetProviderId),
        eq(migrationHistory.targetProviderMangaId, input.targetProviderMangaId),
      ),
    )
    .get();

  if (row === undefined) return undefined;

  return toEntry(row);
}

/** Most recent migrations first, with the title the history list can show. */
export async function listMigrationHistory(
  db: AppDrizzleDb,
  limit = 10,
): Promise<MigrationHistoryEntry[]> {
  const rows = db
    .select({ history: migrationHistory, canonicalTitle: mangaIdentities.canonicalTitle })
    .from(migrationHistory)
    .leftJoin(mangaIdentities, eq(mangaIdentities.id, migrationHistory.mangaId))
    .orderBy(desc(migrationHistory.completedAt))
    .limit(limit)
    .all();

  return rows.map((row) => toEntry(row.history, row.canonicalTitle ?? undefined));
}

/** Every title recorded by one apply call, so undo restores exactly that batch. */
export async function listMigrationHistoryByBatch(
  db: AppDrizzleDb,
  batchId: string,
): Promise<MigrationHistoryEntry[]> {
  const rows = db
    .select()
    .from(migrationHistory)
    .where(eq(migrationHistory.batchId, batchId))
    .orderBy(desc(migrationHistory.completedAt))
    .all();

  return rows.map((row) => toEntry(row));
}
