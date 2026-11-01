// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  StoragePage,
  clearStorageData,
  fetchStorageSummary,
  formatStorageBytes,
  storageQueryKeys,
} from './index.js';

describe('storage exports', () => {
  it('exports the storage feature surface', () => {
    expect(typeof StoragePage).toBe('function');
    expect(typeof fetchStorageSummary).toBe('function');
    expect(typeof clearStorageData).toBe('function');
    expect(formatStorageBytes(2048)).toBe('2.0 KB');
    expect(storageQueryKeys.summary()).toEqual(['storage', 'summary']);
  });
});
