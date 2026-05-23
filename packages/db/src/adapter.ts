import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import type { AppSchema } from './schema.js';

/**
 * Drizzle database bound to the MangaVerse SQLite schema.
 *
 * Phase 4 should construct this type from platform-selected drivers; Phase 3 uses `sql.js` only.
 */
export type AppDrizzleDb = SQLJsDatabase<AppSchema>;
