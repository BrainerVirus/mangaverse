import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CoverCacheProvider } from '@app/cache';
import { createWebPlatformAdapter } from '@app/platform';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { DEFAULT_IMAGE_CACHE_LIMIT_BYTES } from '@app/shared';

import { useLocalDb, useLocalDbStatus } from './local-db-provider.js';

interface CoverCacheBridgeProps {
  readonly children: ReactNode;
}

export function CoverCacheBridge({ children }: CoverCacheBridgeProps) {
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const adapter = useMemo(() => createWebPlatformAdapter(), []);

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const cacheLimitBytes =
    appSettingsQuery.data?.settings.imageCacheLimitBytes ?? DEFAULT_IMAGE_CACHE_LIMIT_BYTES;

  return (
    <CoverCacheProvider db={db} adapter={adapter} cacheLimitBytes={cacheLimitBytes}>
      {children}
    </CoverCacheProvider>
  );
}
