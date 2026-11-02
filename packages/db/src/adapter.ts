import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { AppSchema } from './schema.js';

/**
 * Synchronous Drizzle database bound to the MangaVerse SQLite schema, on any driver.
 *
 * `sql.js` (the web renderer) and `node:sqlite` (the Electron data host) both satisfy it
 * (ADR 0001, decision 3). Repositories take this type; callers outside `@app/db` take
 * `AppDb`, which also admits a data-host handle.
 */
export type AppDrizzleDb = BaseSQLiteDatabase<'sync', unknown, AppSchema>;
