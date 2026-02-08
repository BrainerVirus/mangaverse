import * as SQLite from "expo-sqlite"

import { schemaStatements } from "@services/db/schema"

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

export async function getDatabase() {
	if (!dbPromise) {
		dbPromise = SQLite.openDatabaseAsync("mangaverse.db")
	}
	return dbPromise
}

export async function initializeDatabase() {
	const db = await getDatabase()
	for (const statement of schemaStatements) {
		await db.execAsync(statement)
	}
	return db
}
