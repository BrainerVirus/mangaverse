import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import type { AppDrizzleDb } from '@app/db';
import type { PlatformAdapter } from '@app/platform';
import { DEFAULT_IMAGE_CACHE_LIMIT_BYTES } from '@app/shared';

import { runCoverCacheMaintenance } from '../cover-cache-store.js';

export interface CoverCacheContextValue {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly cacheLimitBytes: number;
}

const CoverCacheContext = createContext<CoverCacheContextValue | null>(null);

export interface CoverCacheProviderProps {
  readonly db: AppDrizzleDb | null;
  readonly adapter: PlatformAdapter;
  readonly cacheLimitBytes?: number;
  readonly children: ReactNode;
}

export function CoverCacheProvider({
  db,
  adapter,
  cacheLimitBytes = DEFAULT_IMAGE_CACHE_LIMIT_BYTES,
  children,
}: CoverCacheProviderProps) {
  const value = useMemo(
    () => (db !== null ? { db, adapter, cacheLimitBytes } : null),
    [adapter, cacheLimitBytes, db],
  );

  useEffect(() => {
    if (value === null) {
      return;
    }
    void runCoverCacheMaintenance(value.db, value.adapter, value.cacheLimitBytes);
  }, [value]);

  if (value === null) {
    return children;
  }

  return <CoverCacheContext value={value}>{children}</CoverCacheContext>;
}

export function useCoverCacheContext(): CoverCacheContextValue | null {
  return use(CoverCacheContext);
}
