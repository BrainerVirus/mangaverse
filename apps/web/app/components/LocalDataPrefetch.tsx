import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchCoreLocalData } from '../queries/prefetch-core-local-data.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

/** Warm library, search, and settings caches after the local database opens. */
export function LocalDataPrefetch() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-prefetch: warming the caches is a fire-and-forget side effect gated on the DB opening; there is no event to hang it off and the queries already own the data once it lands.
  useEffect(() => {
    if (dbStatus !== 'ready' || db === null) {
      return;
    }

    void prefetchCoreLocalData(queryClient, db);
  }, [db, dbStatus, queryClient]);

  return null;
}
