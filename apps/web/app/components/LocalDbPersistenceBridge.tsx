import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { flushLocalDb, watchLocalDbForExternalChanges } from '../lib/local-db.js';
import { useLocalDbStatus } from '../providers/local-db-provider.js';

/**
 * Bridges the local database session to the app lifetime:
 * - flushes pending snapshot writes when the page is hidden or closed
 * - re-syncs and refetches when another tab commits a snapshot
 */
export function LocalDbPersistenceBridge() {
  const status = useLocalDbStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'ready') return;

    const unsubscribe = watchLocalDbForExternalChanges(() => {
      void queryClient.invalidateQueries();
    });

    const handlePageHide = () => {
      void flushLocalDb();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', handlePageHide);
      void flushLocalDb();
    };
  }, [queryClient, status]);

  return null;
}
