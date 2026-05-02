import { schemaStatements } from '@services/db/schema';
import { openDatabase } from '@services/platform/database';

import type { DatabaseAdapter } from '@services/platform/types';

let dbAdapter: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
	if (!dbAdapter) {
		dbAdapter = await openDatabase('mangaverse.db');
	}
	return dbAdapter;
}

export async function initializeDatabase(): Promise<DatabaseAdapter> {
	const db = await getDatabase();
	for (const statement of schemaStatements) {
		await db.exec(statement);
	}
	return db;
}
