import type { AppDrizzleDb } from './adapter.js';

/**
 * Runs `fn` inside a synchronous SQLite transaction.
 *
 * The callback must not return a Promise; Drizzle's `sql.js` driver runs
 * transactions synchronously. If the callback throws, the transaction is
 * rolled back automatically.
 */
export function withTransaction<T>(db: AppDrizzleDb, fn: (tx: AppDrizzleDb) => T): T {
  return db.transaction((tx) => fn(tx as AppDrizzleDb));
}
