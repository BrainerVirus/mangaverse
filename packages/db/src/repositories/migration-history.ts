import { and, eq } from 'drizzle-orm';
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
  const row = await db
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

  return {
    id: row.id,
    mangaId: row.mangaId,
    sourceProviderId: row.sourceProviderId,
    sourceProviderMangaId: row.sourceProviderMangaId,
    targetProviderId: row.targetProviderId,
    targetProviderMangaId: row.targetProviderMangaId,
    completedAt: row.completedAt,
    ...(row.notes !== null && row.notes !== undefined && row.notes !== '' ? { notes: row.notes } : {}),
  };
}
