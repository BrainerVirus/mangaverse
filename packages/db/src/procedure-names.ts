import type { AppDrizzleDb } from './adapter.js';
import type * as procedures from './procedure-sources.js';

type Sources = typeof procedures;

/** Every export of the procedure sources whose first parameter is the database. */
export type ProcedureName = {
  [K in keyof Sources]: Sources[K] extends (...args: infer P) => unknown
    ? P extends [AppDrizzleDb, ...unknown[]]
      ? K
      : never
    : never;
}[keyof Sources];
