// @app/db — server/test entry. Browser clients must use `@app/db/browser`.
export const PACKAGE_NAME = '@app/db' as const;

export type { AppDrizzleDb } from './adapter.js';
export { createDrizzleFromSqlJs } from './client.js';
export {
  migrateDatabaseFromBundled,
  parseBundledMigrationFiles,
  type BundledMigrationFile,
  type BundledMigrationJournal,
  type BundledMigrationJournalEntry,
} from './bundled-migrations.js';
export { withTransaction } from './transactions.js';

export * from './repositories/identities.js';
export * from './repositories/library.js';
export * from './repositories/chapters.js';
export * from './repositories/read-state.js';
export * from './repositories/settings.js';
export * from './repositories/extensions.js';
export * from './repositories/search-history.js';
export * from './repositories/migration-history.js';
export * from './repositories/cache.js';
export * from './repositories/diagnostics.js';

export { exportBackupDocumentV1 } from './backup/export.js';
export { applyBackupRestore } from './backup/restore-apply.js';
export * from './backup/restore-preview.js';
export * from './migration/provider-migration.js';
