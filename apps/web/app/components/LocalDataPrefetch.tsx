import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchCoreLocalData } from '../queries/prefetch-core-local-data.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

/** Warm library, search, and settings caches after the local database opens. */
export function LocalDataPrefetch() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  useEffect(() => {
    if (dbStatus !== 'ready' || db === null) {
      return;
    }

    void prefetchCoreLocalData(queryClient, db);
  }, [db, dbStatus, queryClient]);

  return null;
}
