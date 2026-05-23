import { describe, expect, it } from 'vitest';

import {
  PACKAGE_NAME,
  StoragePage,
  clearStorageData,
  fetchStorageSummary,
  formatStorageBytes,
  storageQueryKeys,
} from './index.js';

describe('@app/storage exports', () => {
  it('exports the storage feature surface', () => {
    expect(PACKAGE_NAME).toBe('@app/storage');
    expect(typeof StoragePage).toBe('function');
    expect(typeof fetchStorageSummary).toBe('function');
    expect(typeof clearStorageData).toBe('function');
    expect(formatStorageBytes(2048)).toBe('2.0 KB');
    expect(storageQueryKeys.summary()).toEqual(['storage', 'summary']);
  });
});
