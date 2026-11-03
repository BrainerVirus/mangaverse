import { describe, expect, it } from 'vitest';

import { isStorageFullFailure, platformStorageFull } from './errors.js';

describe('isStorageFullFailure', () => {
  it('recognizes the shapes a full disk or an exhausted quota takes', () => {
    expect(isStorageFullFailure({ name: 'QuotaExceededError', message: 'quota' })).toBe(true);
    expect(isStorageFullFailure(Object.assign(new Error('write failed'), { code: 'ENOSPC' }))).toBe(
      true,
    );
    expect(isStorageFullFailure(Object.assign(new Error('write failed'), { code: 'EDQUOT' }))).toBe(
      true,
    );
    expect(isStorageFullFailure(new Error('No space left on device'))).toBe(true);
    expect(isStorageFullFailure(new Error('disk full'))).toBe(true);
    expect(isStorageFullFailure(new Error('insufficient storage'))).toBe(true);
  });

  it('walks a nested cause chain without treating ordinary failures as full', () => {
    const inner = Object.assign(new Error('inner write'), { code: 'ENOSPC' });
    const outer = Object.assign(new Error('outer wrapper'), { cause: inner });
    expect(isStorageFullFailure(outer)).toBe(true);
    expect(isStorageFullFailure(new Error('network request failed'))).toBe(false);
    expect(isStorageFullFailure(undefined)).toBe(false);
    expect(isStorageFullFailure({ code: 28 })).toBe(false);
  });

  it('keeps the typed code the notice depends on', () => {
    expect(platformStorageFull('This device is out of storage.').code).toBe(
      'platform.storage-full',
    );
  });
});
