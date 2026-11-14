import type { AppDrizzleDb } from '@app/db';
import type { EnsureQueryDataOptions, QueryClient, QueryKey } from '@tanstack/react-query';

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
 * Warms one query for a route loader, tied to the loader's lifetime. Once the router abandons the
 * loader (a newer navigation, a dropped preload) nothing new starts, and the query is cancelled
 * while no page observes it, so its provider request stops and it reverts to its earlier state.
 * A query a mounted page already observes carries on: the page needs it. Query options that a
 * loader warms set `retryOnMount: false`, so a failure here reaches the page as its inline error
 * (with Retry) rather than being fetched a second time when the page mounts.
 */
export function warmRouteQuery<TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: EnsureQueryDataOptions<TData, Error, TData, TKey>,
  signal: AbortSignal | undefined,
): Promise<TData> {
  if (signal?.aborted === true) return Promise.reject(signal.reason);
  const cancelUnobserved = () => {
    void queryClient.cancelQueries({
      queryKey: options.queryKey,
      exact: true,
      predicate: (query) => query.getObserversCount() === 0,
    });
  };
  signal?.addEventListener('abort', cancelUnobserved, { once: true });
  const warm = queryClient.ensureQueryData(options);
  void warm.then(
    () => signal?.removeEventListener('abort', cancelUnobserved),
    () => signal?.removeEventListener('abort', cancelUnobserved),
  );
  return warm;
}

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
