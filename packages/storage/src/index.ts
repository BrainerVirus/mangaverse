export { clearStorageData, requestPersistentStorage } from './clear-storage-data.js';
export { StoragePage, type StoragePageProps } from './components/StoragePage.js';
export { fetchStorageSummary, type FetchStorageSummaryInput } from './fetch-storage-summary.js';
export { formatStorageBytes } from './format-storage-bytes.js';
export { storageQueryKeys } from './query-keys.js';
export type {
  ClearStorageResult,
  StorageClearTarget,
  StorageSummary,
} from './types.js';

export const PACKAGE_NAME = '@app/storage' as const;
