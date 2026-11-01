import type { AppDrizzleDb, MigrationPreviewReport, MigrationTargetSelection } from '@app/db';

export async function previewMigration(
  db: AppDrizzleDb,
  input: {
    readonly sourceProviderId: string;
    readonly targetProviderId: string;
    readonly selections: readonly MigrationTargetSelection[];
  },
): Promise<MigrationPreviewReport> {
  const { previewProviderMigration } = await import('@app/db');
  return previewProviderMigration(db, input);
}
