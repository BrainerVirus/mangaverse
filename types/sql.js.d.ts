declare module 'sql.js' {
	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase;
	}

	export interface SqlJsDatabase {
		run(sql: string, params?: unknown[]): void;
		exec(sql: string): SqlJsQueryExecResult[];
		prepare(sql: string): SqlJsStatement;
		close(): void;
	}

	export interface SqlJsStatement {
		bind(params?: unknown[]): boolean;
		step(): boolean;
		getAsObject<T = Record<string, unknown>>(): T;
		free(): boolean;
	}

	export interface SqlJsQueryExecResult {
		columns: string[];
		values: unknown[][];
	}

	function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;

	export default initSqlJs;
}
