// Browser-safe @app/db entry — no Node fs/url migration path.
// Callers name `AppDrizzleDb` for the `db` they pass around: a local database or a host handle.
export type { AppDb as AppDrizzleDb, DataHostHandle } from './data-host-handle.js';
export type { AppDrizzleDb as SqliteDrizzleDb } from './adapter.js';
export { createDrizzleFromSqlJs } from './client.js';
export {
  migrateDatabaseFromBundled,
  parseBundledMigrationFiles,
  type BundledMigrationFile,
  type BundledMigrationJournal,
  type BundledMigrationJournalEntry,
} from './bundled-migrations.js';
export { withTransaction } from './transactions.js';
export {
  createDataHostClient,
  type DataHostClient,
  type DataHostClientPort,
} from './data-host-client.js';
export {
  DATA_HOST_ERROR,
  DataHostError,
  type DataHostChangeEvent,
  type DataHostOpenResult,
  type DataHostStatus,
  type RowChange,
  type SnapshotImportReport,
} from './data-host-protocol.js';
export {
  openPersistentDatabase,
  type FlushResult,
  type OpenPersistentDatabaseInput,
  type PersistentDatabase,
  type PersistentDatabaseMigrations,
} from './persistent-database.js';
export {
  createMemoryPersistedBytesStore,
  type PersistedBytesStore,
  type PersistedSnapshot,
} from './persisted-bytes-store.js';

export * from './routed.gen.js';
