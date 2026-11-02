import { DatabaseSync, type StatementSync } from 'node:sqlite';

type Params = Parameters<StatementSync['all']>;

/** Array-mode reads for one call; the statement goes back to object rows afterwards. */
class RawStatement {
  constructor(private readonly statement: StatementSync) {}

  private arrays<T>(read: () => T): T {
    this.statement.setReturnArrays(true);
    try {
      return read();
    } finally {
      this.statement.setReturnArrays(false);
    }
  }

  all(...params: Params): unknown[] {
    return this.arrays(() => this.statement.all(...params));
  }

  get(...params: Params): unknown {
    return this.arrays(() => this.statement.get(...params));
  }
}

class Statement {
  constructor(private readonly statement: StatementSync) {}

  run(...params: Params): { changes: number; lastInsertRowid: number | bigint } {
    const { changes, lastInsertRowid } = this.statement.run(...params);
    return { changes: Number(changes), lastInsertRowid };
  }

  all(...params: Params): unknown[] {
    return this.statement.all(...params);
  }

  get(...params: Params): unknown {
    return this.statement.get(...params);
  }

  raw(): RawStatement {
    return new RawStatement(this.statement);
  }
}

type TransactionBehavior = 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';

/**
 * The part of the `better-sqlite3` surface Drizzle's `BetterSQLiteSession` calls, on
 * `node:sqlite` (ADR 0001, decision 2). Drizzle is never told which driver it runs on.
 */
export class NodeSqliteClient {
  readonly database: DatabaseSync;
  private savepoints = 0;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  prepare(sql: string): Statement {
    return new Statement(this.database.prepare(sql));
  }

  exec(sql: string): this {
    this.database.exec(sql);
    return this;
  }

  close(): void {
    this.database.close();
  }

  transaction<A extends unknown[], R>(
    fn: (...args: A) => R,
  ): Record<'deferred' | 'immediate' | 'exclusive', (...args: A) => R> {
    const run =
      (behavior: TransactionBehavior) =>
      (...args: A): R => {
        const nested = this.database.isTransaction;
        const savepoint = `adapter_sp_${this.savepoints++}`;
        this.database.exec(nested ? `SAVEPOINT ${savepoint}` : `BEGIN ${behavior}`);
        let settled = false;
        try {
          const result = fn(...args);
          // sql.js would commit before a promise settles; a native transaction refuses instead.
          if (
            result !== null &&
            typeof (result as { then?: unknown } | undefined)?.then === 'function'
          ) {
            throw new TypeError('Transaction function cannot return a promise');
          }
          this.database.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
          settled = true;
          return result;
        } finally {
          if (!settled && this.database.isTransaction) {
            this.database.exec(
              nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK',
            );
          }
        }
      };
    return { deferred: run('DEFERRED'), immediate: run('IMMEDIATE'), exclusive: run('EXCLUSIVE') };
  }
}
