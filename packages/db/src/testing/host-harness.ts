// Stands in for `sqljs-harness` when vitest.host.config.ts runs the repository suite over the
// data host. `db` is branded as a host handle, so every routed repository call a test makes
// crosses a real MessageChannel into a host on node:sqlite. The same `db` is also a Drizzle
// database on a second connection to the host's file, which serves the tests' own direct
// reads and writes, as `raw` does with the sql.js API the tests use.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQLInputValue } from 'node:sqlite';
import type { AppDrizzleDb } from '../adapter.js';
import { createDataHostClient } from '../data-host-client.js';
import { DATA_HOST_HANDLE, type DataHostHandle } from '../data-host-handle.js';
import { openNativeDatabase } from '../host/open-native.js';
import { createDataHost } from '../host/serve.js';

interface QueryResult {
  readonly columns: string[];
  readonly values: unknown[][];
}

interface HostHarnessRaw {
  run(sql: string, params?: readonly SQLInputValue[]): void;
  exec(sql: string): QueryResult[];
  close(): void;
}

interface HostHarness {
  readonly raw: HostHarnessRaw;
  readonly db: AppDrizzleDb & DataHostHandle;
  /** Calls that crossed the port, for the suite's reach check. */
  readonly calls: () => number;
}

let totalCalls = 0;
let harnesses = 0;

/** Every routed call made through any host harness in this test file. */
export const hostCallCount = (): number => totalCalls;
/** Harnesses opened in this test file. */
export const hostHarnessCount = (): number => harnesses;

/** @public Reached through vitest.host.config.ts, which swaps it in for sqljs-harness. */
export async function createSqlJsHarness(): Promise<HostHarness> {
  harnesses += 1;
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-host-harness-'));
  const databasePath = join(directory, 'host.sqlite');
  const host = createDataHost({ databasePath });
  const { port1, port2 } = new MessageChannel();
  host.attach({
    postMessage: (reply) => port1.postMessage(reply),
    onMessage: (listener) => {
      port1.onmessage = (event) => listener(event.data);
    },
  });
  const client = createDataHostClient({
    postMessage: (request) => port2.postMessage(request),
    onMessage: (listener) => {
      port2.onmessage = (event) => listener(event.data);
    },
  });
  const opened = await client.open(null);
  if (!opened.ok) throw new Error(opened.error.message);

  const side = openNativeDatabase(databasePath);
  let calls = 0;
  const db = Object.assign(side.db, {
    [DATA_HOST_HANDLE]: true as const,
    call: (method: string, args: readonly unknown[]) => {
      calls += 1;
      totalCalls += 1;
      return client.handle.call(method, args);
    },
  });

  const database = side.client.database;
  const raw: HostHarnessRaw = {
    // Like sql.js: without parameters the text may hold several statements.
    run: (sql, params = []) => {
      if (params.length === 0) database.exec(sql);
      else database.prepare(sql).run(...params);
    },
    exec: (sql) => {
      const statement = database.prepare(sql);
      const columns = statement.columns().map((column) => column.name);
      if (columns.length === 0) {
        statement.run();
        return [];
      }
      statement.setReturnArrays(true);
      const values = statement.all() as unknown as unknown[][];
      return values.length === 0 ? [] : [{ columns, values }];
    },
    close: () => {
      side.close();
      host.close();
      port1.close();
      port2.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };

  return { raw, db, calls: () => calls };
}
