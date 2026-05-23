import type { PlatformStorageEstimate } from '@app/platform';

export interface StorageSummary {
  readonly generatedAt: string;
  readonly platformEstimate: PlatformStorageEstimate | null;
  readonly cacheEntryCount: number;
  readonly cacheByProvider: readonly {
    readonly providerId: string;
    readonly count: number;
  }[];
  readonly searchHistoryCount: number;
  readonly savedSearchCount: number;
}

export type StorageClearTarget = 'provider_cache' | 'search_history';

export interface ClearStorageResult {
  readonly target: StorageClearTarget;
  readonly clearedCount: number;
}
