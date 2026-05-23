import type { AppDrizzleDb } from '@app/db';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';
import type { AppResult } from '@app/shared';
import { createAppError, err } from '@app/shared';

import type { ClearStorageResult, StorageClearTarget } from './types.js';

export async function clearStorageData(
  db: AppDrizzleDb,
  target: StorageClearTarget,
): Promise<ClearStorageResult> {
  const { clearAllCacheEntries, clearSearchHistory } = await import('@app/db');

  if (target === 'provider_cache') {
    const clearedCount = await clearAllCacheEntries(db);
    return { target, clearedCount };
  }

  const clearedCount = await clearSearchHistory(db);
  return { target, clearedCount };
}

export async function requestPersistentStorage(
  adapter: PlatformAdapter,
  capabilities: PlatformCapabilities,
): Promise<AppResult<boolean>> {
  if (!capabilities.storageEstimate) {
    return err(
      createAppError({
        code: 'storage.unsupported',
        message: 'Persistent storage is not available on this runtime.',
      }),
    );
  }

  return adapter.storage.persist();
}
