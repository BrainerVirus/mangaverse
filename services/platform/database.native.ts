import * as SQLite from 'expo-sqlite';
import type { DatabaseAdapter } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function openDatabase(name: string): Promise<DatabaseAdapter> {
	if (!dbPromise) {
		dbPromise = SQLite.openDatabaseAsync(name);
	}
	const db = await dbPromise;
	return {
		exec: async (sql: string) => {
			await db.execAsync(sql);
		},
		getAll: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> => {
			return params ? db.getAllAsync<T>(sql, params as never[]) : db.getAllAsync<T>(sql);
		},
		run: async (sql: string, params?: unknown[]) => {
			await (params ? db.runAsync(sql, params as never[]) : db.runAsync(sql));
		},
		close: async () => {
			await db.closeAsync();
			dbPromise = null;
		},
	};
}
