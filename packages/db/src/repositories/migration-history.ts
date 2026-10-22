import { and, desc, eq } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { migrationHistory } from '../schema.js';

export interface MigrationHistoryEntry {
  readonly id: string;
  readonly mangaId: string;
  readonly sourceProviderId: string;
  readonly sourceProviderMangaId: string;
  readonly targetProviderId: string;
  readonly targetProviderMangaId: string;
  readonly completedAt: string;
  readonly notes?: string;
}

function newId(): string {
  return crypto.randomUUID();
}

type MigrationHistoryRow = typeof migrationHistory.$inferSelect;

function toEntry(row: MigrationHistoryRow): MigrationHistoryEntry {
  return {
    id: row.id,
    mangaId: row.mangaId,
    sourceProviderId: row.sourceProviderId,
    sourceProviderMangaId: row.sourceProviderMangaId,
    targetProviderId: row.targetProviderId,
    targetProviderMangaId: row.targetProviderMangaId,
    completedAt: row.completedAt,
    ...(row.notes !== null && row.notes !== undefined && row.notes !== ''
      ? { notes: row.notes }
      : {}),
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

/** Most recent migrations first, for the post-apply report and undo surface. */
export async function listMigrationHistory(
  db: AppDrizzleDb,
  limit = 10,
): Promise<MigrationHistoryEntry[]> {
  const rows = db
    .select()
    .from(migrationHistory)
    .orderBy(desc(migrationHistory.completedAt))
    .limit(limit)
    .all();

  return rows.map(toEntry);
}

/** The latest migration of one title between two providers, used to undo a batch. */
export async function findLatestMigrationHistoryForManga(
  db: AppDrizzleDb,
  input: {
    readonly mangaId: string;
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
  },
): Promise<MigrationHistoryEntry | undefined> {
  const row = db
    .select()
    .from(migrationHistory)
    .where(
      and(
        eq(migrationHistory.mangaId, input.mangaId),
        eq(migrationHistory.sourceProviderId, input.sourceProviderId),
        eq(migrationHistory.targetProviderId, input.targetProviderId),
      ),
    )
    .orderBy(desc(migrationHistory.completedAt))
    .limit(1)
    .get();

  return row === undefined ? undefined : toEntry(row);
}
