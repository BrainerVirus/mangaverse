import type { AppDrizzleDb, MigrationApplyReport } from '@app/db';

type MigrationMangaId = MigrationApplyReport['applied'][number]['mangaId'];

/** Undo the mapping pointers of the last applied batch. */
export async function rollbackMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly mangaIds: readonly MigrationMangaId[];
  },
) {
  const { rollbackProviderMigration } = await import('@app/db');
  return rollbackProviderMigration(db, input);
}
