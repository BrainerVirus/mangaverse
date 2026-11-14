import type { AppDrizzleDb } from '@app/db';

/**
 * The local database once `LocalDbProvider` reports it ready (first-party providers installed,
 * the network allowlist synced), and `null` before that or after a failure. Route loaders read it
 * to warm a page's queries; while it is `null` they do nothing and the page loads as it always has.
 */
let readyDb: AppDrizzleDb | null = null;

export function setRouteDataDb(db: AppDrizzleDb | null): void {
  readyDb = db;
}

export function getRouteDataDb(): AppDrizzleDb | null {
  return readyDb;
}

/**
 * How long a navigation waits for its page's data. Quick data (local reads, a warm cache, a fast
 * source) opens the page complete instead of as a skeleton; slower data opens the page at once
 * with its skeleton while the query carries on.
 */
const ROUTE_DATA_WAIT_MS = 400;

/**
 * Keeps a query a loader started alive long enough for the page that opens next to pick it up,
 * when the query's own `gcTime` is zero.
 */
export const ROUTE_DATA_HANDOFF_GC_MS = 5_000;

/**
 * Resolves when `warm` settles or `ms` passes, whichever is first, and never rejects: a failed
 * read is the page's to show, inline and with its Retry, not the router's error page.
 */
export function waitForRouteData(
  warm: Promise<unknown>,
  ms: number = ROUTE_DATA_WAIT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  const settled = warm.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([settled, timeout]).then(() => clearTimeout(timer));
}
