import type { AppDrizzleDb } from './adapter.js';

/** Brands a handle so a routed procedure can tell it from a Drizzle database. */
export const DATA_HOST_HANDLE: unique symbol = Symbol.for('mangaverse.data-host-handle');

/**
 * What a window holds as `db` when SQLite lives in the data host (ADR 0001, decision 4).
 * Every repository call made with it runs in the host instead of in this process.
 */
export interface DataHostHandle {
  readonly [DATA_HOST_HANDLE]: true;
  call(method: string, args: readonly unknown[]): Promise<unknown>;
}

/** The `db` a feature passes to a repository: a local Drizzle database or a host handle. */
export type AppDb = AppDrizzleDb | DataHostHandle;

export function isDataHostHandle(db: AppDb): db is DataHostHandle {
  return (db as Partial<DataHostHandle>)[DATA_HOST_HANDLE] === true;
}

/** A repository procedure re-typed to accept either kind of `db`. */
export type Routed<F> = F extends (db: AppDrizzleDb, ...args: infer A) => infer R
  ? (db: AppDb, ...args: A) => R
  : never;

/** Wraps a repository so a host handle sends the call to the host and a database runs it here. */
export function route<F extends (db: AppDrizzleDb, ...args: never[]) => Promise<unknown>>(
  name: string,
  procedure: F,
): Routed<F> {
  const local = procedure as unknown as (db: AppDrizzleDb, ...args: unknown[]) => Promise<unknown>;
  const routed = (db: AppDb, ...args: unknown[]): Promise<unknown> =>
    isDataHostHandle(db) ? db.call(name, args) : local(db, ...args);
  return routed as Routed<F>;
}
