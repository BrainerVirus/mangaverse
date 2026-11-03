// Every module whose `db`-first exports are repository procedures. The data host serves them
// (host/procedures.ts) and routed.gen.ts re-exports them under the same names.
export * from './repositories/identities.js';
export * from './repositories/identity-merge.js';
export * from './repositories/library.js';
export * from './repositories/library-activity.js';
export * from './repositories/chapters.js';
export * from './repositories/read-state.js';
export * from './repositories/progress-ordering.js';
export * from './repositories/settings.js';
export * from './repositories/themes.js';
export * from './repositories/extensions.js';
export * from './repositories/extension-logs.js';
export * from './repositories/search-history.js';
export * from './repositories/migration-history.js';
export * from './repositories/cache.js';
export * from './repositories/downloads.js';
export * from './repositories/diagnostics.js';

export { exportBackupDocumentV1 } from './backup/export.js';
export { applyBackupRestore } from './backup/restore-apply.js';
export * from './backup/restore-preview.js';
export * from './migration/provider-migration.js';
