import type { DatabaseAdapter } from './types';

let dbInstance: import('sql.js').SqlJsDatabase | null = null;
let sqlJsPromise: Promise<import('sql.js').SqlJsStatic> | null = null;

async function getSqlJs(): Promise<import('sql.js').SqlJsStatic> {
	if (!sqlJsPromise) {
		sqlJsPromise = import('sql.js').then((mod) => {
			const initFn = (mod as { default?: (config?: { locateFile?: (file: string) => string }) => Promise<import('sql.js').SqlJsStatic> }).default;
			if (initFn) {
				return initFn({
					locateFile: (file: string) => {
						if (typeof window !== 'undefined') {
							return `/${file}`;
						}
						return file;
					},
				});
			}
			throw new Error('sql.js: could not find init function');
		});
	}
	return sqlJsPromise;
}

export async function openDatabase(_name: string): Promise<DatabaseAdapter> {
	const SQL = await getSqlJs();
	if (!dbInstance) {
		dbInstance = new SQL.Database();
	}
	const db = dbInstance;

	return {
		exec: async (sql: string) => {
			db.run(sql);
		},
		getAll: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
			const stmt = db.prepare(sql);
			if (params.length > 0) {
				stmt.bind(params);
			}
			const results: T[] = [];
			while (stmt.step()) {
				const row = stmt.getAsObject<T>();
				results.push(row);
			}
			stmt.free();
			return results;
		},
		run: async (sql: string, params: unknown[] = []) => {
			db.run(sql, params);
		},
		close: async () => {
			db.close();
			dbInstance = null;
		},
	};
}
