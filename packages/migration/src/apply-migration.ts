import type { AppDrizzleDb, MigrationApplyReport, MigrationTargetSelection } from '@app/db';

export async function applyMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selections: readonly MigrationTargetSelection[];
  },
) {
  const { applyProviderMigration } = await import('@app/db');
  return applyProviderMigration(db, input);
}

export type { MigrationApplyReport };
