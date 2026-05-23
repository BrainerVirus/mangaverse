import { describe, expect, it } from 'vitest';
import {
  PACKAGE_NAME,
  createAppError,
  getDefaultReaderSettings,
  ok,
  validateProviderManifest,
} from './index';

describe('@app/shared public exports', () => {
  it('exports PACKAGE_NAME', () => {
    expect(PACKAGE_NAME).toBe('@app/shared');
  });

  it('exports core domain helpers', () => {
    expect(typeof ok).toBe('function');
    expect(typeof createAppError).toBe('function');
    expect(typeof getDefaultReaderSettings).toBe('function');
    expect(typeof validateProviderManifest).toBe('function');
  });
});
