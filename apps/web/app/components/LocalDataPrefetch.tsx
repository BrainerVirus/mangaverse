import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchCoreLocalData } from '../queries/prefetch-core-local-data.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

/** Warm library and search caches after the local database opens, on idle. */
export function LocalDataPrefetch() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-prefetch: warming the caches is a fire-and-forget side effect gated on the DB opening; there is no event to hang it off and the queries already own the data once it lands.
  useEffect(() => {
    if (dbStatus !== 'ready' || db === null) {
      return;
    }

    let cancelled = false;
    const run = () => {
      if (!cancelled) void prefetchCoreLocalData(queryClient, db);
    };
    // The open route already fetches what it needs. Warming two other routes
    // must not compete with its first paint.
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(run, { timeout: 2000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idle);
      };
    }

    const timer = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [db, dbStatus, queryClient]);

  return null;
}
